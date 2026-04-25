'use strict';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * APP - المحرك الرئيسي (مصحح: محاذاة تامة لخط السعر والبطاقة)
 * ═══════════════════════════════════════════════════════════════════════
 * ✅ تم إصلاح اختلال المحاور: جميع العناصر تستخدم chartH المنطقي ثم تحول للفيزيائي
 */

// دوال مساعدة آمنة
const AppHelpers = {
  fmtPrice: (p) => {
    if (typeof Utils !== 'undefined' && Utils.fmtPrice) return Utils.fmtPrice(p);
    if (typeof p !== 'number' || isNaN(p)) return '—';
    return p >= 10000 ? p.toFixed(0) : p >= 1 ? p.toFixed(2) : p.toFixed(5);
  },
  clamp: (v, min, max) => Math.max(min, Math.min(max, v))
};
// ✅ إعدادات الألوان المخصصة
if (typeof CFG === 'undefined') window.CFG = {};
CFG.colors = CFG.colors || {};
CFG.colors.timer = '#0072e4';        // أزرق نيون جميل
CFG.colors.timerShadow = 'rgba(0,15,40,0.7)'; // ظل للتباين

class App {
  constructor() {
    try {
      this._initDOM();
      this._initComponents();
      this._initState();
      this._initEventBus();
      this._initEvents();
      this._initToolbar();
      
      requestAnimationFrame(() => {
        this._resize();
        this._startDataFeed();
        this._startRenderLoop();
      });
    } catch (err) {
      console.error('[App] Init failed:', err);
      this._showToast('فشل في التهيئة', 'down');
    }
  }

  _initDOM() {
    this.mainCanvas = document.getElementById('main-canvas');
    this.priceAxisCanvas = document.getElementById('price-axis-canvas');
    this.timeAxisCanvas = document.getElementById('time-axis-canvas');
    
    this.priceLabel = document.getElementById('price-label');
    this.xhairBox = document.getElementById('xhair-box');
    this.indicatorValues = document.getElementById('indicator-values');
    this.alertContainer = document.getElementById('alert-container');
    this.loadingOverlay = document.getElementById('loading-overlay');
    this.loadingText = document.getElementById('loading-text');
    this.timerBadge = document.getElementById('timer-badge');
    this.priceDisplay = document.getElementById('current-price');
    this.priceChange = document.getElementById('price-change');
    this.liveDot = document.getElementById('live-dot');
    this.connText = document.getElementById('conn-text');
    this.tfButtons = document.querySelectorAll('[data-tf]');
    this.btnMA = document.getElementById('btn-ma');
    this.btnBB = document.getElementById('btn-bb');
    this.btnVOL = document.getElementById('btn-vol');
  }

  _initComponents() {
    this.ts = new TimeScale();
    this.ps = new PriceScale();
    this.feed = new DataFeed();
    this.inertia = new InertiaScroller(this.ts);
    this.mainR = new ChartRenderer(this.mainCanvas);
    this.priceR = new PriceAxisRenderer(this.priceAxisCanvas);
    this.timeR = new TimeAxisRenderer(this.timeAxisCanvas);
  }

  _initState() {
    this.candles = [];
    this.indicators = { ma: false, bb: false, vol: false };
    this.crosshair = { x: -1, y: -1, active: false };
    this.drag = { active: false, lastX: 0 };
    this.pinch = { active: false, dist: 0, cx: 0, sp: 0 };
    this.firstLoad = true;
    this.dirty = true;
    this.rafId = null;
    this.resizeTimer = null;
    this._cachedIndicators = null;
    this.chartW = 0;
    this.chartH = 0; // ✅ هذا هو المرجع المنطقي الموحد
    this._glRefsSet = false;
    this._lastTimerUpdate = 0;
  }

  _initEventBus() {
    const safe = fn => { try { return fn(); } catch(e) { console.error('[App] EventBus:', e); } };

    bus.on('candles:updated', c => safe(() => {
      this.candles = c; this.ts.setData(c);
      if (this.firstLoad && c.length) { this.ts.scrollToEnd(this.chartW); this.firstLoad = false; }
      this._cachedIndicators = null; this.dirty = true;
    }));

    bus.on('price', p => safe(() => { this._updatePriceUI(p); this.dirty = true; }));

    bus.on('ticker24h', d => safe(() => {
      const pct = d.change || 0; const up = pct >= 0;
      this.priceChange.textContent = `${up?'+':''}${pct.toFixed(2)}%`;
      this.priceChange.style.color = up ? (CFG?.colors?.up||'#00e676') : (CFG?.colors?.down||'#ff1744');
      this.priceChange.style.background = up ? (CFG?.colors?.upDim||'rgba(0,230,118,0.18)') : (CFG?.colors?.downDim||'rgba(255,23,68,0.18)');
    }));

    bus.on('status', s => safe(() => {
      if (s === 'loading') { this.loadingOverlay?.style && (this.loadingOverlay.style.display='flex'); this.liveDot.className='live-dot'; this.connText.textContent='...'; }
      else if (s === 'connecting') { this.liveDot.className='live-dot'; this.connText.textContent='ربط...'; }
      else if (s === 'connected') { this.loadingOverlay?.classList?.add('hidden'); this.liveDot.className='live-dot ok'; this.connText.textContent='LIVE'; }
      else if (s === 'disconnected') { this.liveDot.className='live-dot'; this.connText.textContent='Reconnect...'; }
      else if (s === 'error') { if(this.loadingOverlay) this.loadingOverlay.style.display='none'; this._showToast('فشل الاتصال', 'down'); }
    }));

    bus.on('feed:reset', () => safe(() => { this.candles=[]; this.firstLoad=true; this.dirty=true; if(this.loadingOverlay) this.loadingOverlay.style.display='flex'; }));
  }

  _initEvents() {
    const mc = this.mainCanvas; if (!mc) return;
    mc.addEventListener('mousedown', e => { if(e.button!==0)return; this.drag={active:true,lastX:e.clientX}; this.inertia.stop(); mc.style.cursor='grabbing'; e.preventDefault(); });
    window.addEventListener('mousemove', e => {
      const r = this.mainCanvas.getBoundingClientRect();
      this.crosshair = { x:e.clientX-r.left, y:e.clientY-r.top, active:true };
      if(this.drag.active){ this.ts.scroll(e.clientX-this.drag.lastX, this.chartW); this.drag.lastX=e.clientX; }
      this.dirty = true;
    });
    window.addEventListener('mouseup', () => { if(this.drag.active){ this.drag.active=false; this.mainCanvas.style.cursor='crosshair'; } });
    mc.addEventListener('mouseleave', () => { this.crosshair.active=false; this.dirty=true; });
    mc.addEventListener('wheel', e => { e.preventDefault(); this.inertia.stop(); this.ts.zoom(e.deltaY>0?0.9:1.1, this.crosshair.x, this.chartW); this.dirty=true; }, {passive:false});

    mc.addEventListener('touchstart', e => {
      e.preventDefault(); this.inertia.stop(); const t=e.touches, r=mc.getBoundingClientRect();
      if(t.length===1){ this.drag={active:true,lastX:t[0].clientX}; this.crosshair={x:t[0].clientX-r.left,y:t[0].clientY-r.top,active:true}; this.inertia.startTracking(); }
      else if(t.length===2){ this.drag.active=false; this.pinch={active:true,dist:Math.hypot(t[1].clientX-t[0].clientX,t[1].clientY-t[0].clientY),cx:(t[0].clientX+t[1].clientX)/2-r.left,sp:this.ts.spacing}; }
      this.dirty=true;
    }, {passive:false});

    mc.addEventListener('touchmove', e => {
      e.preventDefault(); const t=e.touches, r=mc.getBoundingClientRect(), now=performance.now();
      if(t.length===1 && this.drag.active){ this.ts.scroll(t[0].clientX-this.drag.lastX, this.chartW); this.inertia.track(t[0].clientX-this.drag.lastX, now); this.drag.lastX=t[0].clientX; this.crosshair.x=t[0].clientX-r.left; this.crosshair.y=t[0].clientY-r.top; }
      else if(t.length===2 && this.pinch.active){ const nd=Math.hypot(t[1].clientX-t[0].clientX,t[1].clientY-t[0].clientY), sc=nd/this.pinch.dist, ns=Math.max(1.5,Math.min(60,this.pinch.sp*sc)), cx=(t[0].clientX+t[1].clientX)/2-r.left, ci=this.ts.xToIndex(this.pinch.cx); this.ts.spacing=ns; this.ts.offset=cx-ci*ns; this.pinch.dist=nd; this.pinch.sp=ns; }
      this.dirty=true;
    }, {passive:false});

    mc.addEventListener('touchend', e => {
      e.preventDefault();
      if(e.touches.length===0){ if(this.drag.active)this.inertia.release(); this.drag.active=false; this.pinch.active=false; this.crosshair.active=false; }
      else if(e.touches.length===1){ this.pinch.active=false; this.drag={active:true,lastX:e.touches[0].clientX}; this.inertia.startTracking(); }
      this.dirty=true;
    }, {passive:false});

    window.addEventListener('resize', () => { clearTimeout(this.resizeTimer); this.resizeTimer=setTimeout(()=>{this._resize();this.dirty=true;},150); });
    document.body.addEventListener('touchmove', e=>e.preventDefault(), {passive:false});
  }

  _initToolbar() {
    this.tfButtons.forEach(b => b.addEventListener('click', () => {
      this.tfButtons.forEach(x=>x.classList.remove('active')); b.classList.add('active');
      this.feed?.changeConfig?.(this.feed.symbol, b.dataset.tf);
      this._cachedIndicators=null; this.dirty=true;
    }));
    this.btnMA?.addEventListener('click', () => { this.indicators.ma=!this.indicators.ma; this.btnMA.classList.toggle('active',this.indicators.ma); this._cachedIndicators=null; this.dirty=true; });
    this.btnBB?.addEventListener('click', () => { this.indicators.bb=!this.indicators.bb; this.btnBB.classList.toggle('active',this.indicators.bb); this._cachedIndicators=null; this.dirty=true; });
    this.btnVOL?.addEventListener('click', () => { this.indicators.vol=!this.indicators.vol; this.btnVOL.classList.toggle('active',this.indicators.vol); this.dirty=true; });
  }

  // ✅ التعديل الجذري: حساب chartH وتخزينه كمرجع منطقي موحد
  _resize() {
    try {
      const wr = document.getElementById('canvas-wrapper'); if(!wr) return;
      const rect = wr.getBoundingClientRect();
      const ap = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--axis-price-w'))||72;
      const at = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--axis-time-h'))||28;
      
      // ✅ حساب الأبعاد المنطقية (بدون DPR)
      this.chartW = Math.max(200, rect.width - ap);
      this.chartH = Math.max(200, rect.height - at);
      
      // ✅ تمرير الأبعاد المنطقية للمحركات (هي تحسب DPR داخلياً)
      if(this.mainR) { 
        this.mainR.resize(this.chartW, this.chartH); 
        if(this.mainR.setRefs && !this._glRefsSet){ 
          this.mainR.setRefs(this.ts,this.ps); 
          this._glRefsSet=true; 
        } 
      }
      this.priceR?.resize(ap, this.chartH);
      this.timeR?.resize(this.chartW, at);
      this.inertia?.setChartWidth(this.chartW);
      this.ts?.setBounds?.(this.chartW);
    } catch(e) { console.warn('[App] Resize:', e); }
  }

  _getIndicators() {
    const len = this.candles?.length || 0; if(!len) return null;
    if(this._cachedIndicators?.len === len && this._cachedIndicators.flags === this._indFlags()) return this._cachedIndicators.values;
    try {
      const closes = this.candles.map(c=>c?.close??0), vols = this.candles.map(c=>c?.volume??0), vals = {};
      if(typeof Indicators !== 'undefined') {
        if(this.indicators.ma) { vals.ma20 = Indicators.sma(closes,20); vals.ma50 = Indicators.ema(closes,50); }
        if(this.indicators.bb) vals.bb = Indicators.bollingerBands(closes,20,2);
        if(this.indicators.vol) vals.volMA = Indicators.volumeMA(vols,20);
      }
      this._cachedIndicators = { len, flags: this._indFlags(), values: vals };
      return vals;
    } catch(e) { return null; }
  }
  _indFlags() { return `${this.indicators.ma}${this.indicators.bb}${this.indicators.vol}`; }

  _updateTimer() {
    if (!this.candles?.length || !this.feed?.interval) return;
    
    const last = this.candles[this.candles.length - 1];
    const now = Date.now();
    
    // ✅ دعم جميع الفريمات: ثواني، دقائق، ساعات، أيام، أسابيع
    const tfMap = {
      '1s': 1000, '5s': 5000, '15s': 15000, '30s': 30000,
      '1m': 60000, '2m': 120000, '3m': 180000, '5m': 300000,
      '15m': 900000, '30m': 1800000, '1h': 3600000,
      '2h': 7200000, '4h': 14400000, '6h': 21600000,
      '12h': 43200000, '1d': 86400000, '3d': 259200000, '1w': 604800000
    };
    
    const duration = tfMap[this.feed.interval] || 60000;
    // حساب بداية الشمعة الحالية بدقة
    const candleStart = Math.floor(last.time / duration) * duration;
    const remaining = (candleStart + duration) - now;
    
    // ✅ تنسيق الوقت حسب نوع الفريم
    let timeStr = '';
    if (remaining > 0) {
      const totalSec = Math.floor(remaining / 1000);
      
      if (duration <= 60000) { // فريمات ثواني/دقائق
        const m = Math.floor(totalSec / 60);
        const s = totalSec % 60;
        timeStr = `${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
      } 
      else if (duration <= 3600000) { // فريمات أقل من ساعة
        const h = Math.floor(totalSec / 3600);
        const m = Math.floor((totalSec % 3600) / 60);
        const s = totalSec % 60;
        timeStr = `${h}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
      } 
      else { // فريمات كبيرة (ساعات/أيام)
        const h = Math.floor(totalSec / 3600);
        const m = Math.floor((totalSec % 3600) / 60);
        timeStr = `${h}h ${m.toString().padStart(2,'0')}m`;
      }
    }
    
    // ✅ إخفاء العداد إذا انتهى الوقت
    if (remaining <= 500 || !this.mainR?.drawTimer) {
      if (this.timerBadge) this.timerBadge.style.display = 'none';
      // تنظيف طبقة النصوص في WebGL
      if (this.mainR._engine?._textCtx) {
        this.mainR._engine._textCtx?.clearRect(0, 0, this.chartW, this.chartH);
      }
      return;
    }
    
    // ✅ حساب موضع العداد بجانب الشمعة الأخيرة
    const lastIdx = this.candles.length - 1;
    const lastX = this.ts.indexToX(lastIdx);
    const lastY = this.ps.priceToY(last.close, this.chartH);
    
    // ✅ موضع ذكي يتكيف مع حدود الشارت
    const timerW = 55, timerH = 18;
    let drawX = lastX + 20;  // بجانب الشمعة على اليمين
    let drawY = lastY - 12;  // فوق سعر الإغلاق مباشرة
    
    // تجنب الخروج من الحدود
    if (drawX + timerW > this.chartW - 8) drawX = lastX - 20 - timerW;
    if (drawY < 25) drawY = lastY + 25;
    if (drawY > this.chartH - 25) drawY = this.chartH - 25;
    
    // ✅ رسم العداد: أزرق جميل، بدون إطار، مع ظل خفيف
    const timerColor = CFG?.colors?.timer || '#4da6ff';
    this.mainR.drawTimer(timeStr, drawX, drawY, timerColor, 11);
    
    // ✅ إخفاء عنصر DOM القديم (إذا كان موجوداً)
    if (this.timerBadge) this.timerBadge.style.display = 'none';
  }

  // ✅ التعديل الجذري: تمرير chartH لجميع دوال الرسم
  _render() {
    try {
      if(this.feed?.flushBuffer?.()) this.dirty = true;
      if(!this.dirty && !this.inertia?.isActive()) { 
        this._updateTimer();
        this.rafId=requestAnimationFrame(()=>this._loop()); 
        return; 
      }
      this.dirty = false;
      if(!this.candles?.length) { this.mainR?.clear?.(); this.rafId=requestAnimationFrame(()=>this._loop()); return; }

      const {chartW:w, chartH:h, ts, ps, candles} = this;
      if(!ts||!ps) { this.rafId=requestAnimationFrame(()=>this._loop()); return; }
      const vr = ts.getVisibleRange(w); ps.calculateRange(candles, vr.start, vr.end);
      if(this.mainR.setRefs && !this._glRefsSet) { this.mainR.setRefs(ts,ps); this._glRefsSet=true; }

      this.mainR?.clear?.();
      // ✅ تمرير chartH (h) لجميع دوال الرسم
      this.mainR?.drawGrid?.(ps, ts, h);
      if(this.indicators.vol) this.mainR?.drawVolume?.(candles, ts, ps, 0.15, h);
      
      const ind = this._getIndicators();
      if(ind) {
        if(this.indicators.bb) this.mainR?.drawBollingerBands?.(ind.bb, ts, ps, h);
        if(this.indicators.ma) { 
          if(ind.ma20) this.mainR?.drawMA?.(ind.ma20, CFG?.colors?.ma20||'#f9a825', ts, ps, h);
          if(ind.ma50) this.mainR?.drawMA?.(ind.ma50, CFG?.colors?.ma50||'#7c4dff', ts, ps, h);
        }
      }
      this.mainR?.drawCandles?.(candles, ts, ps, h);
      
      // ✅ حساب ورسم خط السعر
      const last = candles[candles.length-1]; 
      let isUp = false, priceStr = '';
      
      if(last) { 
        isUp = last.close >= last.open; 
        priceStr = Utils ? Utils.fmtPrice(last.close) : last.close.toFixed(2);
        // ✅ تمرير السعر + isUp + ps + chartH
        this.mainR?.drawPriceLine?.(last.close, isUp, ps, h);
      }

      // Crosshair
      if(this.crosshair.active && this.crosshair.x>=0 && this.crosshair.y>=0) { 
        this.mainR?.drawCrosshair?.(this.crosshair.x, this.crosshair.y); 
        this._updateCrosshairUI(ind); 
      } else { 
        if(this.xhairBox) this.xhairBox.style.display='none'; 
        if(this.indicatorValues) this.indicatorValues.style.display='none'; 
      }
      
      // ✅ تمرير lastPrice + chartH لـ PriceAxisRenderer
      const crossY = this.crosshair.active ? this.crosshair.y : -1;
      this.priceR?.render?.(ps, h, crossY, last?.close ?? -1, isUp, priceStr);
      this.timeR?.render?.(ts, candles, w, this.crosshair.active ? this.crosshair.x : -1);
      
      this._updateTimer();
      
    } catch(e) { console.error('[App] Render:', e); }
    
    this.rafId = requestAnimationFrame(()=>this._loop());
    if(this.inertia?.isActive()) this.dirty=true;
  }
 
  _startRenderLoop() { this._loop = ()=>this._render(); this._loop(); }

  _updatePriceUI(p) { if(!this.priceDisplay)return; try{ this.priceDisplay.textContent=AppHelpers.fmtPrice(p); const pr=parseFloat(this.priceDisplay.dataset.last||0); const up=p>=pr; this.priceDisplay.style.color=up?(CFG?.colors?.up||'#00e676'):(CFG?.colors?.down||'#ff1744'); this.priceDisplay.dataset.last=p; }catch(e){} }
  
  _updatePriceLabel(y,p,up) { if(!this.priceLabel)return; try{ const lh=20, cy=AppHelpers.clamp(y-lh/2,0,this.chartH-lh); this.priceLabel.textContent=AppHelpers.fmtPrice(p); this.priceLabel.className=up?'up':'down'; this.priceLabel.style.top=cy+'px'; this.priceLabel.style.height=lh+'px'; this.priceLabel.style.display='block'; }catch(e){} }
  
  _updateCrosshairUI(ind) {
    if(!this.xhairBox||!this.ts){if(this.xhairBox)this.xhairBox.style.display='none';return;}
    try{
      const idx=Math.round(this.ts.xToIndex(this.crosshair.x)); if(idx<0||!this.candles||idx>=this.candles.length){this.xhairBox.style.display='none';return;}
      const c=this.candles[idx]; if(!c){this.xhairBox.style.display='none';return;}
      const up=c.close>=c.open, d=new Date(c.time), ts=`${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`, chg=((c.close-c.open)/c.open*100).toFixed(2);
      this.xhairBox.innerHTML=`<div class="xh-row"><span>O: ${AppHelpers.fmtPrice(c.open)}</span><span>H: ${AppHelpers.fmtPrice(c.high)}</span></div><div class="xh-row"><span>L: ${AppHelpers.fmtPrice(c.low)}</span><span>C: <b class="${up?'up':'down'}">${AppHelpers.fmtPrice(c.close)}</b></span></div><div class="xh-row" style="margin-top:4px;color:var(--text-bright);font-size:10px;"><span>${up?'+':''}${chg}%</span><span style="margin-left:auto">${ts}</span></div>`;
      this.xhairBox.style.display='block';
      if(ind && this.indicatorValues){ let h=''; if(ind.ma20?.[idx]!=null)h+=`<span style="color:${CFG?.colors?.ma20||'#f9a825'}">MA20: ${AppHelpers.fmtPrice(ind.ma20[idx])}</span> &nbsp; `; if(ind.ma50?.[idx]!=null)h+=`<span style="color:${CFG?.colors?.ma50||'#7c4dff'}">MA50: ${AppHelpers.fmtPrice(ind.ma50[idx])}</span> &nbsp; `; if(ind.bb?.upper?.[idx]!=null)h+=`<span style="color:#64b5f6">BB: ${AppHelpers.fmtPrice(ind.bb.upper[idx])} / ${AppHelpers.fmtPrice(ind.bb.lower[idx])}</span>`; if(h){this.indicatorValues.innerHTML=h;this.indicatorValues.style.display='block';}else{this.indicatorValues.style.display='none';} }
    }catch(e){if(this.xhairBox)this.xhairBox.style.display='none';}
  }

  _showToast(msg,type='info'){ try{if(!this.alertContainer)return;const el=document.createElement('div');el.className=`alert-toast ${type}`;el.textContent=msg;this.alertContainer.appendChild(el);setTimeout(()=>{if(el.parentNode)el.parentNode.removeChild(el);},3700);}catch(e){} }

  _startDataFeed(){ if(!this.feed?.configure)return; try{this.feed.configure('btcusdt','1m');this.feed.start();}catch(e){this._showToast('فشل البدء','down');} }

  destroy(){ try{ this.feed?.destroy?.(); this.inertia?.stop?.(); this.mainR?.destroy?.(); if(this.rafId)cancelAnimationFrame(this.rafId); if(this.alertContainer)this.alertContainer.innerHTML=''; if(this.timerBadge)this.timerBadge.style.display='none'; if(bus&&bus._listeners)bus._listeners={}; }catch(e){} }
}

document.addEventListener('DOMContentLoaded', ()=>{
  setTimeout(()=>{ 
    try{ 
      window.chartApp=new App(); 
      window.addEventListener('beforeunload',()=>window.chartApp?.destroy()); 
    }catch(e){ 
      document.body.innerHTML=`<div style="padding:20px;color:#ff1744;font-family:monospace"><h3>❌ فشل التحميل</h3><p>تأكد من ترتيب الملفات</p><p style="font-size:11px;opacity:0.7">${e.message}</p></div>`; 
    } 
  }, 100);
});

document.addEventListener('contextmenu', e=>{ if(e.target?.tagName==='CANVAS')e.preventDefault(); });
document.body.addEventListener('gesturestart', e=>e.preventDefault(), {passive:false});
document.body.addEventListener('gesturechange', e=>e.preventDefault(), {passive:false});