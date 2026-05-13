'use strict';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * DATA FEED - إدارة تدفق البيانات (تاريخي + لحظي) - الإصدار المُصحح
 * ✅ المصدر: Binance API + WebSocket
 * ✅ متوافق مع: CFG من config.js و bus من event-bus.js
 * ✅ معالجة: تنظيف الرموز، فالبك CORS، تحسين الأداء
 * ═══════════════════════════════════════════════════════════════════════
 */

// ═══════════════════════════════════════════════════════════════════════
// ✅ ضمان توفر CFG و bus (من الملفات الأخرى)
// ═══════════════════════════════════════════════════════════════════════
const CFG_SAFE = typeof CFG !== 'undefined' ? CFG : {
  maxCandles: 500, bufferSize: 500, wsReconnectDelay: 1500,
  wsMaxReconnect: 10, heartbeatInterval: 25000,
  timeframes: { '1m': 60000, '5m': 300000, '15m': 900000, '1h': 3600000, '4h': 14400000 },
  getIntervalMs: function(tf) { return this.timeframes[tf] || 60000; },
  clamp: function(v, min, max) { return Math.max(min, Math.min(max, v)); }
};

const bus_SAFE = typeof bus !== 'undefined' && typeof bus.emit === 'function' ? bus : {
  emit: function() {}, on: function() { return function(){}; }, off: function() {}
};

// ═══════════════════════════════════════════════════════════════════════
// CANDLE BUFFER - مخزن ذكي للشموع
// ═══════════════════════════════════════════════════════════════════════
class CandleBuffer {
  constructor(maxCandles = CFG_SAFE.maxCandles) {
    this.maxCandles = maxCandles;
    this.candles = [];
    this.pendingQueue = [];
    this.lastRestTime = 0;
    this.processing = false;
    this._integrityChecks = true;
    this._historicalLoading = false;
    this._stats = { totalProcessed: 0, totalDropped: 0, lastUpdate: 0, avgProcessingTime: 0 };
  }

  setHistorical(data, { isBatch = false, isLast = false } = {}) {
    const startTime = performance.now();
    const newCandles = data.map(k => ({
      time: +k.time || +k[0], open: +k.open || +k[1], high: +k.high || +k[2],
      low: +k.low || +k[3], close: +k.close || +k[4], volume: +k.volume || +k[5],
      closed: k.closed !== undefined ? k.closed : true
    }));

    if (isBatch) {
      this._mergeHistoricalBatch(newCandles, isLast);
    } else {
      this.candles = newCandles.slice(-this.maxCandles);
      if (this.candles.length) {
        const last = this.candles[this.candles.length - 1];
        this.lastRestTime = last.closed ? last.time : 0;
      }
    }
    
    this.pendingQueue = [];
    this.processing = false;
    this._stats.totalProcessed += newCandles.length;
    this._stats.lastUpdate = Date.now();
    this._stats.avgProcessingTime = (this._stats.avgProcessingTime * 0.9) + ((performance.now() - startTime) * 0.1);
    
    bus_SAFE.emit('candles:updated', this.candles);
    
    if (isBatch && isLast) {
      this._historicalLoading = false;
      bus_SAFE.emit('historical:complete', { count: this.candles.length });
    }
  }

  _mergeHistoricalBatch(newCandles, isLast) {
    if (!newCandles.length) return;
    newCandles.sort((a, b) => a.time - b.time);
    
    const validCandles = newCandles.filter(c => !this.candles.some(existing => existing.time === c.time));
    if (!validCandles.length) { this._stats.totalDropped += newCandles.length; return; }
    
    this.candles.push(...validCandles);
    this.candles.sort((a, b) => a.time - b.time);
    if (this.candles.length > this.maxCandles) this.candles = this.candles.slice(-this.maxCandles);
    
    const last = this.candles[this.candles.length - 1];
    if (last.closed) this.lastRestTime = last.time;
    
    if (!isLast) {
      bus_SAFE.emit('historical:next_batch_requested', {
        fromTime: this.candles[0]?.time,
        toTime: this.candles[this.candles.length - 1]?.time,
        currentCount: this.candles.length
      });
    }
  }

  enqueue(update) {
    if (this._historicalLoading) { this.pendingQueue.push(update); return; }
    
    const candle = {
      time: +update.time || +update.t, open: +update.open || +update.o,
      high: +update.high || +update.h, low: +update.low || +update.l,
      close: +update.close || +update.c, volume: +update.volume || +update.v,
      closed: update.closed !== undefined ? update.closed : (update.x === true)
    };
    
    this.pendingQueue.push(candle);
    if (this.pendingQueue.length <= 3 && !this.processing) this.flush();
  }

  flush() {
    if (!this.pendingQueue.length || this.processing) return false;
    this.processing = true;
    const startTime = performance.now();
    const updates = this.pendingQueue.splice(0);
    let changed = false;
    
    for (const upd of updates) { if (this._applyUpdate(upd)) changed = true; }
    
    this.processing = false;
    this._stats.avgProcessingTime = (this._stats.avgProcessingTime * 0.9) + ((performance.now() - startTime) * 0.1);
    
    if (changed) bus_SAFE.emit('candles:updated', this.candles);
    return changed;
  }

  _applyUpdate(upd, currentInterval = '1m') {
    if (!this.candles.length) return false;
    if (this._integrityChecks && upd.time < this.lastRestTime && !upd.closed) return false;
    
    const last = this.candles[this.candles.length - 1];
    
    if (last.time === upd.time) {
      // تحديث الشمعة الحالية
      last.high = Math.max(last.high, upd.high);
      last.low = Math.min(last.low, upd.low);
      last.close = upd.close;
      last.volume = upd.volume;
      last.closed = upd.closed;
      if (upd.closed && !last.closed) this.lastRestTime = upd.time;
      return true;
    }
    else if (upd.time > last.time) {
      // شمعة جديدة
      if (this._integrityChecks) {
        const expectedInterval = CFG_SAFE.getIntervalMs(currentInterval || '1m');
        const timeGap = upd.time - last.time;
        if (timeGap > expectedInterval * 1.5) {
          console.warn(`[CandleBuffer] Time gap: ${timeGap}ms expected ~${expectedInterval}ms`);
          bus_SAFE.emit('gap', { from: last.time, to: upd.time, expected: expectedInterval });
        }
      }
      if (!last.closed) { last.closed = true; this.lastRestTime = last.time; }
      this.candles.push({ ...upd });
      if (this.candles.length > this.maxCandles) this.candles.shift();
      return true;
    }
    else {
      // تحديث متأخر لشمعة قديمة
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

  // واجهات عامة
  get() { return this.candles.slice(); }
  getLastPrice() { return this.candles.length ? this.candles[this.candles.length - 1].close : null; }
  getLastCandle() { return this.candles.length ? this.candles[this.candles.length - 1] : null; }
  setIntegrityChecks(enabled) { this._integrityChecks = enabled; }
  startHistoricalBatchMode() { this._historicalLoading = true; }
  stopHistoricalBatchMode() { this._historicalLoading = false; if (this.pendingQueue.length) this.flush(); }
  
  clear() {
    this.candles = []; this.pendingQueue = []; this.lastRestTime = 0;
    this.processing = false; this._historicalLoading = false;
    this._stats = { totalProcessed: 0, totalDropped: 0, lastUpdate: 0, avgProcessingTime: 0 };
  }
  
  getStats() { return { ...this._stats, candleCount: this.candles.length, maxCandles: this.maxCandles }; }
  resetStats() { this._stats = { totalProcessed: 0, totalDropped: 0, lastUpdate: 0, avgProcessingTime: 0 }; }
}

// ═══════════════════════════════════════════════════════════════════════
// NETWORK MANAGER - إدارة الطلبات مع Rate Limiting و Retry
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
    this._stats = { totalRequests: 0, successfulRequests: 0, failedRequests: 0, totalRetries: 0, avgResponseTime: 0, lastRequest: 0 };
  }

  canRequest() {
    const now = Date.now();
    this.requestTimes = this.requestTimes.filter(t => now - t < this.rateLimitWindow);
    return this.requestTimes.length < this.maxRequests;
  }

  _recordRequest() { this.requestTimes.push(Date.now()); this._stats.totalRequests++; this._stats.lastRequest = Date.now(); }

  async fetch(url, options = {}, retries = this.maxRetries) {
    if (!this.canRequest()) throw new Error(`Rate limit: ${this.requestTimes.length}/${this.maxRequests}`);
    this._recordRequest();
    
    const fetchOptions = {
      ...options,
      signal: AbortSignal.timeout?.(this.requestTimeout),
      mode: 'cors',
      headers: { 'Accept': 'application/json', 'User-Agent': 'UltraProChart/1.0', ...options.headers }
    };
    
    let lastError;
    const startTime = performance.now();
    
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const response = await fetch(url, fetchOptions);
        const responseTime = performance.now() - startTime;
        this._stats.avgResponseTime = (this._stats.avgResponseTime * 0.9) + (responseTime * 0.1);
        
        if (!response.ok) {
          const error = new Error(`HTTP ${response.status}: ${response.statusText}`);
          error.status = response.status;
          this._stats.failedRequests++;
          throw error;
        }
        
        this._stats.successfulRequests++;
        const contentType = response.headers.get('content-type');
        return contentType?.includes('application/json') ? await response.json() : await response.text();
        
      } catch (error) {
        lastError = error;
        this._stats.failedRequests++;
        if (error.name === 'AbortError' || error.status === 404) throw error;
        if (attempt === retries) throw error;
        
        this._stats.totalRetries++;
        const delay = Math.min(this.baseRetryDelay * Math.pow(2, attempt) + Math.random() * 500, this.maxRetryDelay);
        await new Promise(resolve => setTimeout(resolve, delay));
        bus_SAFE.emit('network:retry', { attempt: attempt + 1, url, delay, error: error.message });
      }
    }
    throw lastError;
  }

  getStats() {
    const now = Date.now();
    const recent = this.requestTimes.filter(t => now - t < 1000);
    return {
      ...this._stats, requestsInWindow: this.requestTimes.length, requestsLastSecond: recent.length,
      limit: this.maxRequests, windowMs: this.rateLimitWindow,
      successRate: this._stats.totalRequests > 0 ? ((this._stats.successfulRequests / this._stats.totalRequests * 100).toFixed(1) + '%') : 'N/A'
    };
  }
  
  resetStats() {
    this._stats = { totalRequests: 0, successfulRequests: 0, failedRequests: 0, totalRetries: 0, avgResponseTime: 0, lastRequest: 0 };
  }
}

// ═══════════════════════════════════════════════════════════════════════
// DATA FEED - المحرك الرئيسي
// ═══════════════════════════════════════════════════════════════════════
class DataFeed {
  constructor() {
    this.symbol = 'BTCUSDT';
    this.interval = '1m';
    this.currentInterval = '1m';
    this.exchange = 'binance';
    
    this.buffer = new CandleBuffer(CFG_SAFE.maxCandles);
    this.network = new NetworkManager();
    
    this.ws = null; this.wsUrl = null; this.wsAlive = false;
    this.heartbeatTimer = null; this.reconnectAttempt = 0;
    this.maxReconnect = CFG_SAFE.wsMaxReconnect || 15;
    
    this.started = false; this.destroyed = false;
    this.lastPrice = null; this.ticker24h = null;
    
    this._fastUpdateMode = false; this._updateBatchSize = 10; this._pendingUpdates = 0;
    this._historicalBatchMode = false; this._historicalTargetDays = 0; this._historicalReceivedCount = 0;
    
    this._candlesPerDay = {
      '1s': 86400, '5s': 17280, '15s': 5760, '30s': 2880,
      '1m': 1440, '2m': 720, '3m': 480, '5m': 288,
      '15m': 96, '30m': 48, '1h': 24, '2h': 12, '4h': 6, '6h': 4, '12h': 2, '1d': 1, '3d': 1/3, '1w': 1/7
    };
    
    this._validEndings = ['usdt', 'btc', 'eth', 'bnb', 'busd', 'eur', 'gbp', 'try', 'usdc', 'fdusd'];
    this._commonSymbols = [
      'btc', 'eth', 'bnb', 'xrp', 'ada', 'sol', 'doge', 'dot', 'matic', 'ltc',
      'shib', 'trx', 'avax', 'uni', 'link', 'atom', 'etc', 'xlm', 'bch', 'algo',
      'eurusd', 'gbpusd', 'audusd', 'nzdusd', 'usdjpy', 'usdchf', 'usdcad'
    ];
    
    this._feedStats = { startTime: null, totalCandles: 0, wsMessages: 0, wsErrors: 0, reconnects: 0, lastMessage: null };
  }

  _normalizeSymbol(symbol) {
    if (!symbol) return 'BTCUSDT';
    let clean = symbol.toLowerCase().trim().replace('_otc', '').replace('_spot', '').replace('/', '').replace(/[\s\-_]/g, '');
    
    const hasValidEnding = this._validEndings.some(end => clean.endsWith(end));
    if (!hasValidEnding) clean = this._commonSymbols.includes(clean) ? clean + 'usdt' : clean + 'usdt';
    return clean.toUpperCase();
  }

  configure(symbol, interval) {
    this.symbol = this._normalizeSymbol(symbol);
    this.interval = interval;
    this.currentInterval = interval;
    this.reconnectAttempt = 0;
    console.log(`[DataFeed] Configured: ${symbol} → ${this.symbol} @ ${interval}`);
  }

  setFastUpdateMode(enabled) { this._fastUpdateMode = enabled; }

  async startHistoricalBatch(days, batchSize = 400) {
    this._historicalBatchMode = true;
    this._historicalTargetDays = days;
    this._historicalReceivedCount = 0;
    this.buffer.startHistoricalBatchMode();
    bus_SAFE.emit('status', 'loading_historical');
    bus_SAFE.emit('historical:batch_request', { symbol: this.symbol, interval: this.interval, days, batchSize, fromTime: null, isRetry: false });
  }

  onHistoricalBatchReceived(candles, { isLast = false, batchIndex = 0 } = {}) {
    if (!this._historicalBatchMode) return;
    this._historicalReceivedCount += candles.length;
    this.buffer.setHistorical(candles, { isBatch: true, isLast });
    
    const candlesPerDay = this._candlesPerDay[this.interval] || 1440;
    const expectedTotal = this._historicalTargetDays > 0 ? this._historicalTargetDays * candlesPerDay : this._historicalReceivedCount;
    const progress = expectedTotal > 0 ? Math.min(this._historicalReceivedCount / expectedTotal, 1) : 0;
    
    bus_SAFE.emit('historical:progress', { received: this._historicalReceivedCount, batchIndex, isLast, progress });
    if (isLast) this._onHistoricalComplete();
  }

  _onHistoricalComplete() {
    this._historicalBatchMode = false;
    this.buffer.stopHistoricalBatchMode();
    console.log(`[DataFeed] Historical complete: ${this._historicalReceivedCount} candles`);
    
    const lastPrice = this.buffer.getLastPrice();
    if (lastPrice !== null) { this.lastPrice = lastPrice; bus_SAFE.emit('price', this.lastPrice); }
    this._fetchTicker24h().catch(() => {});
    this._connectWebSocket();
    bus_SAFE.emit('status', 'connected');
  }

  async start() {
    if (this.destroyed) { console.error('[DataFeed] Cannot start: destroyed'); return; }
    this.started = true;
    this._feedStats.startTime = Date.now();
    if (this._historicalBatchMode) return;
    
    bus_SAFE.emit('status', 'loading');
    try {
      await this._fetchHistorical();
      this._connectWebSocket();
    } catch (error) {
      console.error('[DataFeed] Start failed:', error.message);
      
      // فالبك: تجربة BTCUSDT إذا فشل الرمز الحالي
      if (this.symbol !== 'BTCUSDT') {
        console.log('[DataFeed] Fallback to BTCUSDT...');
        this.symbol = 'BTCUSDT';
        if (typeof window !== 'undefined' && window.chartApp?._updateSymbolDisplay) {
          window.chartApp._updateSymbolDisplay('BTC/USDT');
        }
        try {
          await this._fetchHistorical();
          this._connectWebSocket();
          bus_SAFE.emit('status', 'connected');
          return;
        } catch (e) { console.error('[DataFeed] Fallback failed:', e.message); }
      }
      
      // فالبك نهائي: بيانات محاكاة + WebSocket
      console.warn('[DataFeed] Using simulated data fallback...');
      this._useSimulatedData();
      this._connectWebSocket();
      bus_SAFE.emit('status', 'connected');
      if (typeof window !== 'undefined' && window.chartApp?._showToast) {
        window.chartApp._showToast('عرض بيانات محاكاة', 'warning');
      }
    }
  }

  /**
   * ✅ استخدام بيانات محاكاة عند فشل الاتصال الحقيقي
   */
  _useSimulatedData() {
    const candles = [];
    const now = Math.floor(Date.now() / 1000);
    const intervalSec = Math.floor(CFG_SAFE.getIntervalMs(this.interval) / 1000);
    let price = this.symbol.includes('BTC') ? 65000 : this.symbol.includes('ETH') ? 3500 : 100;
    
    for (let i = CFG_SAFE.bufferSize - 1; i >= 0; i--) {
      const time = now - (i * intervalSec);
      const volatility = 0.003;
      const change = (Math.random() - 0.48) * volatility * price;
      const open = price;
      const close = open + change;
      const high = Math.max(open, close) + Math.random() * volatility * price * 0.3;
      const low = Math.min(open, close) - Math.random() * volatility * price * 0.3;
      
      candles.push({ time: time * 1000, open: +open.toFixed(2), high: +high.toFixed(2), low: +low.toFixed(2), close: +close.toFixed(2), volume: +(Math.random() * 1000).toFixed(2), closed: true });
      price = close;
    }
    
    this.buffer.setHistorical(candles);
    if (candles.length) {
      this.lastPrice = candles[candles.length - 1].close;
      bus_SAFE.emit('price', this.lastPrice);
    }
    console.log(`[DataFeed] ✓ Simulated ${candles.length} candles for ${this.symbol}`);
  }

  async changeConfig(symbol, interval) {
    this._cleanupWebSocket();
    this.symbol = this._normalizeSymbol(symbol);
    this.interval = interval;
    this.currentInterval = interval;
    this.reconnectAttempt = 0;
    bus_SAFE.emit('feed:reset');
    this._historicalBatchMode = false;
    this.buffer.clear();
    await this.start();
  }

  stop() {
    this.started = false;
    this._historicalBatchMode = false;
    this._cleanupWebSocket();
    this.buffer.stopHistoricalBatchMode();
    bus_SAFE.emit('status', 'stopped');
  }

  destroy() {
    this.destroyed = true;
    this.stop();
    this.buffer.clear();
    this.network.resetStats();
    this.buffer.resetStats();
    bus_SAFE.emit('feed:destroyed');
  }

  async _fetchHistorical() {
    const symbol = this.symbol;
    const interval = this.interval;
    const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${CFG_SAFE.bufferSize}`;
    
    try {
      console.log(`[DataFeed] Fetching: ${url}`);
      const data = await this.network.fetch(url);
      
      if (!Array.isArray(data) || data.length === 0) throw new Error(`No data for ${symbol}`);
      
      const candles = data.map(k => ({
        time: +k[0], open: +k[1], high: +k[2], low: +k[3], close: +k[4], volume: +k[5], closed: true
      }));
      
      this.buffer.setHistorical(candles);
      if (candles.length) {
        this.lastPrice = candles[candles.length - 1].close;
        bus_SAFE.emit('price', this.lastPrice);
        this._fetchTicker24h().catch(() => {});
      }
      console.log(`[DataFeed] ✓ Loaded ${candles.length} candles for ${symbol}`);
      bus_SAFE.emit('status', 'connected');
      
    } catch (error) {
      console.error(`[DataFeed] Fetch failed ${symbol}:`, error.message);
      
      // محاولة بروكسي للتطوير فقط
      if (error.message.includes('Failed to fetch') || error.message.includes('CORS')) {
        console.warn('[DataFeed] CORS/Network error, trying proxy...');
        try {
          const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
          const data = await this.network.fetch(proxyUrl);
          if (Array.isArray(data) && data.length > 0) {
            const candles = data.map(k => ({ time: +k[0], open: +k[1], high: +k[2], low: +k[3], close: +k[4], volume: +k[5], closed: true }));
            this.buffer.setHistorical(candles);
            if (candles.length) { this.lastPrice = candles[candles.length - 1].close; bus_SAFE.emit('price', this.lastPrice); }
            console.log(`[DataFeed] ✓ Loaded via proxy: ${candles.length} candles`);
            bus_SAFE.emit('status', 'connected');
            return;
          }
        } catch (proxyError) { console.warn('[DataFeed] Proxy failed:', proxyError.message); }
      }
      throw error;
    }
  }

  async _fetchTicker24h() {
    try {
      const url = `https://api.binance.com/api/v3/ticker/24hr?symbol=${this.symbol}`;
      const data = await this.network.fetch(url);
      this.ticker24h = { change: +data.priceChangePercent, high: +data.highPrice, low: +data.lowPrice, volume: +data.volume, quoteVolume: +data.quoteVolume };
      bus_SAFE.emit('ticker24h', this.ticker24h);
    } catch (error) { console.warn('[DataFeed] Ticker24h failed:', error.message); }
  }

  _connectWebSocket() {
    if (this.destroyed || !this.started) return;
    this._cleanupWebSocket();
    
    const symbol = this.symbol.toLowerCase();
    const stream = `${symbol}@kline_${this.interval}`;
    this.wsUrl = `wss://stream.binance.com:9443/ws/${stream}`;
    
    console.log(`[DataFeed] WebSocket: ${this.wsUrl}`);
    bus_SAFE.emit('status', 'connecting');
    
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
    bus_SAFE.emit('status', 'connected');
    bus_SAFE.emit('ws:open', { url: this.wsUrl });
    this._startHeartbeat();
    console.log(`[DataFeed] ✓ WS connected: ${this.symbol}@${this.interval}`);
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
      bus_SAFE.emit('price', this.lastPrice);
      this.buffer.enqueue(candle);
      
      this._feedStats.wsMessages++;
      this._feedStats.lastMessage = Date.now();
      
      if (this._fastUpdateMode) {
        this._pendingUpdates++;
        if (this._pendingUpdates >= this._updateBatchSize) { this.buffer.flush(); this._pendingUpdates = 0; }
      }
    } catch (error) {
      console.warn('[DataFeed] Parse error:', error.message);
      this._feedStats.wsErrors++;
      bus_SAFE.emit('ws:parse_error', { error: error.message, data: event.data });
    }
  }

  _onWsError(error) {
    console.error('[DataFeed] WS error:', error);
    this.wsAlive = false;
    this._feedStats.wsErrors++;
    bus_SAFE.emit('status', 'disconnected');
    bus_SAFE.emit('ws:error', { error });
  }

  _onWsClose(event) {
    this.wsAlive = false;
    this._stopHeartbeat();
    bus_SAFE.emit('status', 'disconnected');
    bus_SAFE.emit('ws:close', { code: event?.code, reason: event?.reason });
    if (!this.destroyed && this.started) this._scheduleReconnect();
  }

  _scheduleReconnect() {
    if (this.reconnectAttempt >= this.maxReconnect) {
      console.error('[DataFeed] Max reconnects reached');
      bus_SAFE.emit('status', 'error');
      return;
    }
    const minDelay = 3000;
    const delay = Math.max(minDelay, Math.min(CFG_SAFE.wsReconnectDelay * Math.pow(1.8, this.reconnectAttempt) + Math.random() * 400, 45000));
    this.reconnectAttempt++;
    this._feedStats.reconnects++;
    console.log(`[DataFeed] Reconnect in ${Math.round(delay)}ms (attempt ${this.reconnectAttempt})`);
    bus_SAFE.emit('ws:reconnect_scheduled', { attempt: this.reconnectAttempt, delay });
    setTimeout(() => { if (!this.destroyed && this.started) this._connectWebSocket(); }, delay);
  }

  _startHeartbeat() {
    this._stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) { this._stopHeartbeat(); return; }
      if (!this.wsAlive) { console.warn('[DataFeed] Heartbeat timeout'); this.ws.close(); return; }
      this.wsAlive = true;
    }, CFG_SAFE.heartbeatInterval || 25000);
  }

  _stopHeartbeat() { if (this.heartbeatTimer) { clearInterval(this.heartbeatTimer); this.heartbeatTimer = null; } }

  _cleanupWebSocket() {
    this._stopHeartbeat();
    if (this.ws) {
      this.ws.onopen = null; this.ws.onmessage = null; this.ws.onerror = null; this.ws.onclose = null;
      try { if (this.ws.readyState === WebSocket.OPEN) this.ws.close(1000, 'Cleanup'); } catch (e) {}
      this.ws = null;
    }
    this.wsAlive = false;
  }

  // واجهات عامة
  getCandles() { return this.buffer.get(); }
  getLastPrice() { return this.lastPrice; }
  getTicker24h() { return this.ticker24h; }
  flushBuffer() { return this.buffer.flush(); }
  
  getStatus() {
    return {
      symbol: this.symbol, interval: this.interval, currentInterval: this.currentInterval, exchange: this.exchange,
      connected: this.ws?.readyState === WebSocket.OPEN, wsAlive: this.wsAlive,
      candleCount: this.buffer.get().length, lastPrice: this.lastPrice, reconnectAttempt: this.reconnectAttempt,
      fastMode: this._fastUpdateMode, historicalBatchMode: this._historicalBatchMode,
      historicalReceived: this._historicalReceivedCount, uptime: this._feedStats.startTime ? Date.now() - this._feedStats.startTime : 0
    };
  }
  
  getFeedStats() { return { ...this._feedStats, bufferStats: this.buffer.getStats(), networkStats: this.network.getStats() }; }
  resetFeedStats() {
    this._feedStats = { startTime: Date.now(), totalCandles: 0, wsMessages: 0, wsErrors: 0, reconnects: 0, lastMessage: null };
    this.buffer.resetStats(); this.network.resetStats();
  }
  setIntegrityChecks(enabled) { this.buffer.setIntegrityChecks(enabled); }
  applyUpdateWithInterval(update) { return this.buffer._applyUpdate(update, this.currentInterval); }
  isValidBinanceSymbol(symbol) { const n = this._normalizeSymbol(symbol); return n.length >= 6 && n.length <= 12; }
  getSuggestedSymbols(query = '') {
    const q = query.toLowerCase();
    return this._commonSymbols.filter(s => s.includes(q)).slice(0, 10).map(s => ({ symbol: s + 'usdt', display: s.toUpperCase() + '/USDT', tf: this.interval }));
  }
  getNormalizedSymbol(input) { return this._normalizeSymbol(input); }
  _validateCandle(candle) {
    if (!candle || typeof candle !== 'object') return false;
    if (typeof candle.time !== 'number' || isNaN(candle.time)) return false;
    if (typeof candle.open !== 'number' || isNaN(candle.open)) return false;
    if (typeof candle.high !== 'number' || isNaN(candle.high)) return false;
    if (typeof candle.low !== 'number' || isNaN(candle.low)) return false;
    if (typeof candle.close !== 'number' || isNaN(candle.close)) return false;
    if (candle.low > candle.high) return false;
    if (candle.close < candle.low || candle.close > candle.high) return false;
    if (candle.open < candle.low || candle.open > candle.high) return false;
    return true;
  }
}

// ═══════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { CandleBuffer, NetworkManager, DataFeed };
}

// ═══════════════════════════════════════════════════════════════════════
// توثيق الاستخدام
// ═══════════════════════════════════════════════════════════════════════
/**
 * @example
 * const feed = new DataFeed();
 * feed.configure('btcusdt', '1m');
 * feed.start();
 * 
 * bus.on('candles:updated', candles => { /* تحديث الشارت *\/ });
 * bus.on('price', price => { /* تحديث السعر *\/ });
 */
