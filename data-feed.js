'use strict';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * DATA FEED - إدارة تدفق البيانات (تاريخي + لحظي) - إصدار الدفعات
 * ═══════════════════════════════════════════════════════════════════════
 * ✅ التعديلات الجديدة:
 * - دعم استقبال البيانات التاريخية على دفعات (batch mode)
 * - طلب الدفعة التالية تلقائياً بعد معالجة الدفعة الحالية
 * - الحفاظ على ترتيب الشموع ومنع التكرار/الفجوات
 * - إشعار النظام عند اكتمال التحميل التاريخي
 */

// ═══════════════════════════════════════════════════════════════════════
// CANDLE BUFFER - مخزن ذكي للشموع مع فحوصات السلامة
// ═══════════════════════════════════════════════════════════════════════
class CandleBuffer {
  constructor(maxCandles = CFG.maxCandles) {
    this.maxCandles = maxCandles;
    this.candles = [];           // مصفوفة الشموع الرئيسية
    this.pendingQueue = [];      // طابور الانتظار للتحديثات السريعة
    this.lastRestTime = 0;       // وقت آخر شمعة مغلقة (للفحص)
    this.processing = false;     // هل نعالج التحديثات حالياً؟
    this._integrityChecks = true; // تفعيل فحوصات السلامة
    
    // ✅ دعم وضع الدفعات التاريخية
    this._historicalLoading = false;
    this._lastHistoricalTime = 0; // آخر وقت تم استلامه في الوضع التاريخي
  }

  /**
   * تعيين البيانات التاريخية الأولية (للدفعات)
   * @param {Array} data - مصفوفة الشموع من API
   * @param {boolean} isBatch - هل هذه دفعة ضمن سلسلة؟
   * @param {boolean} isLast - هل هذه آخر دفعة؟
   */
  setHistorical(data, { isBatch = false, isLast = false } = {}) {
    const newCandles = data.map(k => ({
      time: +k.time || +k[0],
      open: +k.open || +k[1],
      high: +k.high || +k[2],
      low: +k.low || +k[3],
      close: +k.close || +k[4],
      volume: +k.volume || +k[5],
      closed: k.closed !== undefined ? k.closed : true
    }));

    if (isBatch) {
      // ✅ وضع الدفعات: دمج ذكي مع الحفاظ على الترتيب
      this._mergeHistoricalBatch(newCandles, isLast);
    } else {
      // الوضع الأصلي: استبدال كامل
      this.candles = newCandles.slice(-this.maxCandles);
      if (this.candles.length) {
        const last = this.candles[this.candles.length - 1];
        this.lastRestTime = last.closed ? last.time : 0;
      }
    }
    
    this.pendingQueue = [];
    this.processing = false;
    
    // إشعار النظام بالبيانات الجديدة
    bus.emit('candles:updated', this.candles);
    
    // ✅ إشعار عند اكتمال التحميل التاريخي
    if (isBatch && isLast) {
      this._historicalLoading = false;
      bus.emit('historical:complete', { count: this.candles.length });
    }
  }

  /**
   * دمج دفعة تاريخية جديدة مع الحفاظ على الترتيب ومنع التكرار
   * @private
   */
  _mergeHistoricalBatch(newCandles, isLast) {
    if (!newCandles.length) return;
    
    // فرز الدفعة الجديدة حسب الوقت (لضمان الترتيب)
    newCandles.sort((a, b) => a.time - b.time);
    
    // تحديد نقطة البداية للدمج
    const lastExistingTime = this.candles.length ? this.candles[this.candles.length - 1].time : 0;
    
    // تصفية الشموع الجديدة: فقط الأحدث مما لدينا أو التي تكمل الفجوات
    const validCandles = newCandles.filter(c => {
      // تجاهل التكرار
      if (this.candles.some(existing => existing.time === c.time)) return false;
      // في الوضع التاريخي: نقبل الشموع الأقدم أيضاً لملء التاريخ
      return true;
    });
    
    if (!validCandles.length) return;
    
    // دمج الشموع الجديدة
    this.candles.push(...validCandles);
    
    // فرز الكل حسب الوقت (لضمان الترتيب الزمني الصحيح)
    this.candles.sort((a, b) => a.time - b.time);
    
    // الحفاظ على الحد الأقصى للشموع
    if (this.candles.length > this.maxCandles) {
      this.candles = this.candles.slice(-this.maxCandles);
    }
    
    // تحديث وقت آخر شمعة مغلقة
    const last = this.candles[this.candles.length - 1];
    if (last.closed) {
      this.lastRestTime = last.time;
    }
    
    // ✅ طلب الدفعة التالية إذا لم ننتهِ
    if (!isLast) {
      const oldestTime = this.candles[0]?.time;
      const newestTime = this.candles[this.candles.length - 1]?.time;
      bus.emit('historical:next_batch_requested', {
        fromTime: oldestTime,
        toTime: newestTime,
        currentCount: this.candles.length
      });
    }
  }

  /**
   * إضافة تحديث جديد إلى طابور المعالجة (للبيانات اللحظية)
   * @param {Object} update - كائن الشمعة المحدثة
   */
  enqueue(update) {
    // ✅ تجاهل التحديثات اللحظية إذا كنا لا نزال نحمل البيانات التاريخية
    if (this._historicalLoading) {
      this.pendingQueue.push(update);
      return;
    }
    
    const candle = {
      time: +update.time || +update.t,
      open: +update.open || +update.o,
      high: +update.high || +update.h,
      low: +update.low || +update.l,
      close: +update.close || +update.c,
      volume: +update.volume || +update.v,
      closed: update.closed !== undefined ? update.closed : (update.x === true)
    };
    
    this.pendingQueue.push(candle);
    
    if (this.pendingQueue.length <= 3 && !this.processing) {
      this.flush();
    }
  }

  /**
   * معالجة جميع التحديثات المعلقة في الطابور
   * @returns {boolean} هل تغيرت البيانات فعلياً؟
   */
  flush() {
    if (!this.pendingQueue.length || this.processing) return false;
    
    this.processing = true;
    const updates = this.pendingQueue.splice(0);
    let changed = false;
    
    for (const upd of updates) {
      const result = this._applyUpdate(upd);
      if (result) changed = true;
    }
    
    this.processing = false;
    
    if (changed) {
      bus.emit('candles:updated', this.candles);
    }
    
    return changed;
  }

  /**
   * تطبيق تحديث واحد على مخزن الشموع
   * @private
   */
  _applyUpdate(upd) {
    if (!this.candles.length) return false;
    
    if (this._integrityChecks) {
      if (upd.time < this.lastRestTime && !upd.closed) {
        return false;
      }
    }
    
    const last = this.candles[this.candles.length - 1];
    
    if (last.time === upd.time) {
      last.high = Math.max(last.high, upd.high);
      last.low = Math.min(last.low, upd.low);
      last.close = upd.close;
      last.volume = upd.volume;
      last.closed = upd.closed;
      
      if (upd.closed && !last.closed) {
        this.lastRestTime = upd.time;
      }
      return true;
    }
    else if (upd.time > last.time) {
      if (this._integrityChecks) {
        const expectedInterval = CFG.getIntervalMs(App?.currentInterval || '1m');
        const timeGap = upd.time - last.time;
        
        if (timeGap > expectedInterval * 1.5) {
          console.warn(`[CandleBuffer] Time gap detected: ${timeGap}ms expected ~${expectedInterval}ms`);
          bus.emit('data:gap', { 
            from: last.time, 
            to: upd.time, 
            expected: expectedInterval 
          });
        }
      }
      
      if (!last.closed) {
        last.closed = true;
        this.lastRestTime = last.time;
      }
      
      this.candles.push({ ...upd });
      
      if (this.candles.length > this.maxCandles) {
        this.candles.shift();
      }
      
      return true;
    }
    else {
      const index = this.candles.findIndex(c => c.time === upd.time);
      
      if (index !== -1 && index > this.candles.length - 100) {
        const target = this.candles[index];
        target.high = Math.max(target.high, upd.high);
        target.low = Math.min(target.low, upd.low);
        target.close = upd.close;
        target.volume = upd.volume;
        if (upd.closed) target.closed = true;
        return true;
      }
      return false;
    }
  }

  get() { return this.candles.slice(); }
  getLastPrice() { return this.candles.length ? this.candles[this.candles.length - 1].close : null; }
  getLastCandle() { return this.candles.length ? this.candles[this.candles.length - 1] : null; }
  
  setIntegrityChecks(enabled) { this._integrityChecks = enabled; }
  
  /**
   * ✅ تفعيل وضع التحميل التاريخي بالدفعات
   */
  startHistoricalBatchMode() {
    this._historicalLoading = true;
    this._lastHistoricalTime = 0;
  }
  
  /**
   * ✅ إيقاف وضع التحميل التاريخي
   */
  stopHistoricalBatchMode() {
    this._historicalLoading = false;
    // معالجة أي تحديثات معلقة من الفترة اللحظية
    if (this.pendingQueue.length) {
      this.flush();
    }
  }
  
  clear() {
    this.candles = [];
    this.pendingQueue = [];
    this.lastRestTime = 0;
    this.processing = false;
    this._historicalLoading = false;
    this._lastHistoricalTime = 0;
  }
}

// ═══════════════════════════════════════════════════════════════════════
// NETWORK MANAGER - (نفس الكود السابق - لم يتغير)
// ═══════════════════════════════════════════════════════════════════════
class NetworkManager {
  constructor(options = {}) {
    this.rateLimitWindow = options.rateLimitWindow || 60000;
    this.maxRequests = options.maxRequests || 1000;
    this.requestTimes = [];
    this.maxRetries = options.maxRetries || 3;
    this.baseRetryDelay = options.baseRetryDelay || 1000;
    this.maxRetryDelay = options.maxRetryDelay || 10000;
    this.requestTimeout = options.requestTimeout || 10000;
  }

  canRequest() {
    const now = Date.now();
    this.requestTimes = this.requestTimes.filter(t => now - t < this.rateLimitWindow);
    return this.requestTimes.length < this.maxRequests;
  }

  _recordRequest() { this.requestTimes.push(Date.now()); }

  async fetch(url, options = {}, retries = this.maxRetries) {
    if (!this.canRequest()) {
      throw new Error(`Rate limit reached: ${this.requestTimes.length}/${this.maxRequests} requests`);
    }
    this._recordRequest();
    const fetchOptions = { ...options, signal: AbortSignal.timeout(this.requestTimeout) };
    let lastError;
    
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const response = await fetch(url, fetchOptions);
        if (!response.ok) {
          const error = new Error(`HTTP ${response.status}: ${response.statusText}`);
          error.status = response.status;
          throw error;
        }
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          return await response.json();
        }
        return await response.text();
      } catch (error) {
        lastError = error;
        if (error.name === 'AbortError' || error.status === 404) throw error;
        if (attempt === retries) throw error;
        const delay = Math.min(
          this.baseRetryDelay * Math.pow(2, attempt) + Math.random() * 500,
          this.maxRetryDelay
        );
        await new Promise(resolve => setTimeout(resolve, delay));
        bus.emit('network:retry', { attempt: attempt + 1, url, delay });
      }
    }
    throw lastError;
  }

  async fetchAll(urls) {
    const results = [];
    for (const url of urls) {
      try {
        const result = await this.fetch(url);
        results.push({ success: true, data: result, url });
      } catch (error) {
        results.push({ success: false, error: error.message, url });
      }
    }
    return results;
  }

  getStats() {
    const now = Date.now();
    const recent = this.requestTimes.filter(t => now - t < 1000);
    return {
      requestsInWindow: this.requestTimes.length,
      requestsLastSecond: recent.length,
      limit: this.maxRequests,
      windowMs: this.rateLimitWindow
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════
// DATA FEED - المحرك الرئيسي (معدل لدعم الدفعات)
// ═══════════════════════════════════════════════════════════════════════
class DataFeed {
  constructor() {
    this.symbol = 'btcusdt';
    this.interval = '1m';
    this.exchange = 'binance';
    
    this.buffer = new CandleBuffer(CFG.maxCandles);
    this.network = new NetworkManager();
    
    this.ws = null;
    this.wsUrl = null;
    this.wsAlive = false;
    this.heartbeatTimer = null;
    this.reconnectAttempt = 0;
    this.maxReconnect = CFG.wsMaxReconnect || 15;
    
    this.started = false;
    this.destroyed = false;
    this.lastPrice = null;
    this.ticker24h = null;
    
    this._fastUpdateMode = false;
    this._updateBatchSize = 10;
    this._pendingUpdates = 0;
    
    // ✅ حالة التحميل التاريخي بالدفعات
    this._historicalBatchMode = false;
    this._historicalTargetDays = 0;
    this._historicalReceivedCount = 0;
  }

  configure(symbol, interval) {
    this.symbol = symbol.toLowerCase().replace('/', '');
    this.interval = interval;
    this.reconnectAttempt = 0;
  }

  setFastUpdateMode(enabled) {
    this._fastUpdateMode = enabled;
    if (enabled) console.log('[DataFeed] Fast update mode enabled for OTC');
  }

  // ✅ بدء التحميل التاريخي في وضع الدفعات
  async startHistoricalBatch(days, batchSize = 400) {
    this._historicalBatchMode = true;
    this._historicalTargetDays = days;
    this._historicalReceivedCount = 0;
    
    this.buffer.startHistoricalBatchMode();
    bus.emit('status', 'loading_historical');
    
    // ✅ طلب الدفعة الأولى من البايثون
    bus.emit('historical:batch_request', {
      symbol: this.symbol,
      interval: this.interval,
      days: days,
      batchSize: batchSize,
      fromTime: null, // نبدأ من الأحدث
      isRetry: false
    });
  }

  // ✅ معالجة دفعة تاريخية واردة من البايثون
  onHistoricalBatchReceived(candles, { isLast = false, batchIndex = 0 } = {}) {
    if (!this._historicalBatchMode) return;
    
    this._historicalReceivedCount += candles.length;
    
    // تحميل الدفعة في المخزن
    this.buffer.setHistorical(candles, { 
      isBatch: true, 
      isLast: isLast 
    });
    
    // تحديث شريط التقدم
    const progress = this._historicalTargetDays > 0 
      ? Math.min(this._historicalReceivedCount / (this._historicalTargetDays * 1440), 1) // افتراض 1440 شمعة/يوم للـ 1m
      : 0;
    
    bus.emit('historical:progress', {
      received: this._historicalReceivedCount,
      batchIndex: batchIndex,
      isLast: isLast,
      progress: progress
    });
    
    // ✅ إذا كانت آخر دفعة: الانتقال للوضع اللحظي
    if (isLast) {
      this._onHistoricalComplete();
    }
  }

  /**
   * معالجة اكتمال التحميل التاريخي
   * @private
   */
  _onHistoricalComplete() {
    this._historicalBatchMode = false;
    this.buffer.stopHistoricalBatchMode();
    
    console.log(`[DataFeed] Historical load complete: ${this._historicalReceivedCount} candles`);
    
    // تحديث آخر سعر
    const lastPrice = this.buffer.getLastPrice();
    if (lastPrice !== null) {
      this.lastPrice = lastPrice;
      bus.emit('price', this.lastPrice);
    }
    
    // جلب بيانات 24 ساعة
    this._fetchTicker24h().catch(() => {});
    
    // بدء WebSocket للبيانات اللحظية
    this._connectWebSocket();
    
    bus.emit('status', 'connected');
  }

  async start() {
    if (this.destroyed) {
      console.error('[DataFeed] Cannot start: already destroyed');
      return;
    }
    
    this.started = true;
    
    // ✅ إذا كنا في وضع الدفعات، ننتظر من البايثون
    if (this._historicalBatchMode) {
      return; // التحميل سيبدأ عبر onHistoricalBatchReceived
    }
    
    // الوضع الأصلي: جلب كل البيانات دفعة واحدة
    bus.emit('status', 'loading');
    try {
      await this._fetchHistorical();
      this._connectWebSocket();
    } catch (error) {
      console.error('[DataFeed] Start failed:', error);
      bus.emit('status', 'error');
      bus.emit('error', { type: 'start_failed', message: error.message });
    }
  }

  async changeConfig(symbol, interval) {
    this._cleanupWebSocket();
    this.configure(symbol, interval);
    bus.emit('feed:reset');
    
    // ✅ إعادة تعيين وضع الدفعات عند تغيير الإعدادات
    this._historicalBatchMode = false;
    this.buffer.clear();
    
    await this.start();
  }

  stop() {
    this.started = false;
    this._historicalBatchMode = false;
    this._cleanupWebSocket();
    this.buffer.stopHistoricalBatchMode();
    bus.emit('status', 'stopped');
  }

  destroy() {
    this.destroyed = true;
    this.stop();
    this.buffer.clear();
    bus.emit('feed:destroyed');
  }

  // ─────────────────────────────────────────────────────────────────────
  // جلب البيانات التاريخية (الوضع الأصلي - غير معدل)
  // ─────────────────────────────────────────────────────────────────────
  async _fetchHistorical() {
    const symbol = this.symbol.toUpperCase();
    const interval = this.interval;
    const baseUrl = this.exchange === 'binance' ? 'https://api.binance.com' : 'https://api.binance.com';
    const url = `${baseUrl}/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${CFG.bufferSize}`;
    
    try {
      const data = await this.network.fetch(url);
      const candles = data.map(k => ({
        time: +k[0], open: +k[1], high: +k[2], low: +k[3],
        close: +k[4], volume: +k[5], closed: true
      }));
      
      this.buffer.setHistorical(candles);
      
      if (candles.length) {
        this.lastPrice = candles[candles.length - 1].close;
        bus.emit('price', this.lastPrice);
        this._fetchTicker24h().catch(() => {});
      }
      bus.emit('status', 'connected');
    } catch (error) {
      console.error('[DataFeed] Historical fetch failed:', error);
      bus.emit('status', 'error');
      throw error;
    }
  }

  async _fetchTicker24h() {
    try {
      const url = `https://api.binance.com/api/v3/ticker/24hr?symbol=${this.symbol.toUpperCase()}`;
      const data = await this.network.fetch(url);
      this.ticker24h = {
        change: +data.priceChangePercent,
        high: +data.highPrice,
        low: +data.lowPrice,
        volume: +data.volume,
        quoteVolume: +data.quoteVolume
      };
      bus.emit('ticker24h', this.ticker24h);
    } catch (error) {
      console.warn('[DataFeed] Ticker24h fetch failed:', error.message);
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // إدارة WebSocket (نفس الكود السابق مع تعديلات طفيفة)
  // ─────────────────────────────────────────────────────────────────────
  _connectWebSocket() {
    if (this.destroyed || !this.started) return;
    this._cleanupWebSocket();
    
    const symbol = this.symbol.toLowerCase();
    const stream = `${symbol}@kline_${this.interval}`;
    this.wsUrl = `wss://stream.binance.com:9443/ws/${stream}`;
    
    bus.emit('status', 'connecting');
    
    try {
      this.ws = new WebSocket(this.wsUrl);
      this.ws.onopen = () => this._onWsOpen();
      this.ws.onmessage = (e) => this._onWsMessage(e);
      this.ws.onerror = (e) => this._onWsError(e);
      this.ws.onclose = (e) => this._onWsClose(e);
    } catch (error) {
      console.error('[DataFeed] WebSocket creation failed:', error);
      this._scheduleReconnect();
    }
  }

  _onWsOpen() {
    this.wsAlive = true;
    this.reconnectAttempt = 0;
    bus.emit('status', 'connected');
    bus.emit('ws:open', { url: this.wsUrl });
    this._startHeartbeat();
  }

  _onWsMessage(event) {
    try {
      const message = JSON.parse(event.data);
      const kline = message.k || message;
      if (!kline || !kline.t) return;
      
      const candle = {
        time: +kline.t, open: +kline.o, high: +kline.h, low: +kline.l,
        close: +kline.c, volume: +kline.v, closed: kline.x === true
      };
      
      this.lastPrice = candle.close;
      bus.emit('price', this.lastPrice);
      
      this.buffer.enqueue(candle);
      
      if (this._fastUpdateMode) {
        this._pendingUpdates++;
        if (this._pendingUpdates >= this._updateBatchSize) {
          this.buffer.flush();
          this._pendingUpdates = 0;
        }
      }
    } catch (error) {
      console.warn('[DataFeed] Message parse error:', error.message);
      bus.emit('ws:parse_error', { error: error.message, data: event.data });
    }
  }

  _onWsError(error) {
    console.error('[DataFeed] WebSocket error:', error);
    this.wsAlive = false;
    bus.emit('status', 'disconnected');
    bus.emit('ws:error', { error });
  }

  _onWsClose(event) {
    this.wsAlive = false;
    this._stopHeartbeat();
    bus.emit('status', 'disconnected');
    bus.emit('ws:close', { code: event?.code, reason: event?.reason });
    
    if (!this.destroyed && this.started) {
      this._scheduleReconnect();
    }
  }

  _scheduleReconnect() {
    if (this.reconnectAttempt >= this.maxReconnect) {
      console.error('[DataFeed] Max reconnection attempts reached');
      bus.emit('status', 'error');
      return;
    }
    const delay = Math.min(
      CFG.wsReconnectDelay * Math.pow(1.8, this.reconnectAttempt) + Math.random() * 400,
      45000
    );
    this.reconnectAttempt++;
    console.log(`[DataFeed] Reconnecting in ${Math.round(delay)}ms (attempt ${this.reconnectAttempt})`);
    bus.emit('ws:reconnect_scheduled', { attempt: this.reconnectAttempt, delay });
    
    setTimeout(() => {
      if (!this.destroyed && this.started) {
        this._connectWebSocket();
      }
    }, delay);
  }

  _startHeartbeat() {
    this._stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        this._stopHeartbeat();
        return;
      }
      if (!this.wsAlive) {
        console.warn('[DataFeed] Heartbeat timeout, reconnecting...');
        this.ws.close();
        return;
      }
      this.wsAlive = true;
    }, CFG.heartbeatInterval || 25000);
  }

  _stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  _cleanupWebSocket() {
    this._stopHeartbeat();
    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onerror = null;
      this.ws.onclose = null;
      try {
        if (this.ws.readyState === WebSocket.OPEN) {
          this.ws.close(1000, 'Cleanup');
        }
      } catch (e) {}
      this.ws = null;
    }
    this.wsAlive = false;
  }

  // ─────────────────────────────────────────────────────────────────────
  // واجهات عامة
  // ─────────────────────────────────────────────────────────────────────
  getCandles() { return this.buffer.get(); }
  getLastPrice() { return this.lastPrice; }
  getTicker24h() { return this.ticker24h; }
  flushBuffer() { return this.buffer.flush(); }
  
  getStatus() {
    return {
      symbol: this.symbol,
      interval: this.interval,
      exchange: this.exchange,
      connected: this.ws?.readyState === WebSocket.OPEN,
      wsAlive: this.wsAlive,
      candleCount: this.buffer.get().length,
      lastPrice: this.lastPrice,
      reconnectAttempt: this.reconnectAttempt,
      fastMode: this._fastUpdateMode,
      historicalBatchMode: this._historicalBatchMode,
      historicalReceived: this._historicalReceivedCount
    };
  }
  
  setIntegrityChecks(enabled) {
    this.buffer.setIntegrityChecks(enabled);
  }
}

// ═══════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { CandleBuffer, NetworkManager, DataFeed };
}