'use strict';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * APP - المحرك الرئيسي (النسخة المحسّنة والأكثر استقراراً)
 * ✅ نظام كاش ذكي للمؤشرات مع معدل تحديث قابل للضبط
 * ✅ توحيد نظام الألوان عبر CFG.colors في كل مكان
 * ✅ تنعيم حركة النوافذ المنفصلة (Smoothing)
 * ✅ تحسينات الموبايل: بطاقات أصغر، زوم أكثر استقراراً
 * ✅ تحكم دقيق في موضع العداد التنازلي وإزالة التوهج
 * ✅ تحسين وضوح الشموع عند التصغير الشديد
 * ═══════════════════════════════════════════════════════════════════════
 */

const AppHelpers = {
  fmtPrice: (p) => {
    if (typeof Utils !== 'undefined' && Utils.fmtPrice) return Utils.fmtPrice(p);
    if (typeof p !== 'number' || isNaN(p)) return '—';
    return p >= 10000 ? p.toFixed(0) : p >= 1 ? p.toFixed(2) : p.toFixed(5);
  },
  clamp: (v, min, max) => Math.max(min, Math.min(max, v))
};

if (typeof CFG === 'undefined') window.CFG = {};
CFG.colors = CFG.colors || {};
CFG.colors.timer = '#0072e4';
CFG.colors.timerShadow = 'rgba(0, 0, 0, 0.7)';

// ✅ إعدادات افتراضية إضافية للتحكم الدقيق
if (!CFG.ui) CFG.ui = {};
CFG.ui.timerOffsetX = CFG.ui.timerOffsetX || 45;
CFG.ui.timerOffsetY = CFG.ui.timerOffsetY || 25;
CFG.ui.enableTimerShadow = CFG.ui.enableTimerShadow !== false;
CFG.ui.minZoomAlpha = CFG.ui.minZoomAlpha || 0.9;

if (!CFG.zoom) CFG.zoom = {};
CFG.zoom.pinchDamping = CFG.zoom.pinchDamping || 0.7;
CFG.zoom.maxScalePerFrame = CFG.zoom.maxScalePerFrame || 0.15;
CFG.zoom.disableInertiaDuringZoom = CFG.zoom.disableInertiaDuringZoom !== false;

class App {
  constructor() {
    try {
      this._initDOM(); 
      this._initComponents(); 
      this._initState(); 
      this._initEventBus();
      this._initEvents(); 
      this._initToolbar();
      this._initRegisteredIndicators();
      requestAnimationFrame(() => { 
        this._resize(); 
        this._startDataFeed(); 
        this._startRenderLoop(); 
      });
      // ✅ تسجيل واجهة التحكم العالمية
      this._registerGlobalControls();
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
    this.btnLOWESS = document.getElementById('btn-lowess');
    this.btnSR = document.getElementById('btn-sr');
  }

  _initComponents() {
    this.ts = new TimeScale(); 
    this.ps = new PriceScale(); 
    this.feed = new DataFeed();
    this.inertia = new InertiaScroller(this.ts); 
    
    const overlayCanvas = document.getElementById('overlay-canvas');
    this.mainR = new ChartRenderer(this.mainCanvas, overlayCanvas);
    
    this.priceR = new PriceAxisRenderer(this.priceAxisCanvas); 
    this.timeR = new TimeAxisRenderer(this.timeAxisCanvas);
  }

  _initState() {
    this.candles = [];
    this.indicators = { ma: false, bb: false, vol: false, lowess: false, sr: false };
    this.registeredIndicators = {};
    this.paneIndicators = {};
    this.draggablePanes = {};
    this.activeDragPaneId = null;
    this.dragStartY = 0;
    this.dragStartHeight = 0;
    
    this.crosshair = { x: -1, y: -1, active: false };
    this.drag = { active: false, lastX: 0 };
    this.pinch = { active: false, dist: 0, cx: 0, sp: 0 };
    this.firstLoad = true; 
    this.dirty = true; 
    this.rafId = null; 
    this.resizeTimer = null;
    this._cachedIndicators = null; 
    this.chartW = 0; 
    this.chartH = 0;
    this._glRefsSet = false; 
    this._lastTimerUpdate = 0;
    this.psLowess = new PriceScale();
    this._lowessPaneH = 150; 
    this._isDraggingPane = false;
    this._eventUnsubs = [];
    
    // ✅ جديد: نظام كاش المؤشرات مع معدل تحديث قابل للضبط
    this.indicatorUpdateRate = 100; // مللي ثانية بين كل تحديث
    this._lastIndicatorUpdate = 0;
    this._indicatorCache = new Map();
    this._indicatorCacheTTL = 5000; // صلاحية الكاش: 5 ثواني
    
    // ✅ جديد: قيم مُنعَّمة لارتفاعات النوافذ
    this._smoothedLowessHeight = 150;
    this._smoothedPaneHeights = new Map();
  }

  // ✅ جديد: تسجيل واجهة التحكم العالمية
  _registerGlobalControls() {
    window.ChartControls = {
      setIndicatorRate: (ms) => {
        if (window.chartApp?.setIndicatorUpdateRate) {
          window.chartApp.setIndicatorUpdateRate(ms);
          return true;
        }
        return false;
      },
      setColors: (newColors) => {
        if (CFG.colors) {
          Object.assign(CFG.colors, newColors);
          if (window.chartApp) window.chartApp.dirty = true;
          return true;
        }
        return false;
      },
      setZoomLimits: (min, max) => {
        CFG.minSpacing = min;
        CFG.maxSpacing = max;
        return true;
      },
      toggleTimerShadow: (enable) => {
        CFG.ui.enableTimerShadow = enable;
        if (window.chartApp) window.chartApp.dirty = true;
        return true;
      },
      setTimerOffset: (x, y) => {
        CFG.ui.timerOffsetX = x;
        CFG.ui.timerOffsetY = y;
        if (window.chartApp) window.chartApp.dirty = true;
        return true;
      }
    };
    console.log('[App] ✓ Global controls registered: window.ChartControls');
  }

  _initRegisteredIndicators() {
    if (typeof window.IndicatorRegistry === 'undefined') {
      console.log('[App] IndicatorRegistry not found, dynamic indicators disabled');
      return;
    }
    
    for (const [id, plugin] of Object.entries(window.IndicatorRegistry.plugins)) {
      this.registeredIndicators[id] = { enabled: false, ...plugin };
      if (plugin.button?.label) {
        this._createIndicatorButton(id, plugin);
      }
    }
    
    window.IndicatorRegistry.markInitialized();
    console.log(`[App] Loaded ${Object.keys(this.registeredIndicators).length} dynamic indicators`);
  }

  _initEventBus() {
    const safe = fn => { try { return fn(); } catch(e) { console.error('[App] EventBus:', e); } };
    
    this._eventUnsubs.push(bus.on('candles:updated', c => safe(() => { 
      this.candles = c; 
      this.ts.setData(c); 
      if (this.firstLoad && c.length) { 
        this.ts.scrollToEnd(this.chartW); 
        this.firstLoad = false; 
      } 
      this._cachedIndicators = null;
      this._indicatorCache.clear(); // ✅ مسح كاش المؤشرات عند تحديث البيانات
      this.dirty = true; 
    })));
    
    this._eventUnsubs.push(bus.on('price', p => safe(() => { 
      this._updatePriceUI(p); 
      this.dirty = true; 
    })));
    
    this._eventUnsubs.push(bus.on('ticker24h', d => safe(() => { 
      const pct = d.change || 0; 
      const up = pct >= 0; 
      this.priceChange.textContent = `${up?'+':''}${pct.toFixed(2)}%`; 
      this.priceChange.style.color = up ? (CFG?.colors?.up||'#00fd0d') : (CFG?.colors?.down||'#ff0101'); 
      this.priceChange.style.background = up ? (CFG?.colors?.upDim||'rgba(0,230,118,0.18)') : (CFG?.colors?.downDim||'rgba(255,23,68,0.18)'); 
    })));
    
    this._eventUnsubs.push(bus.on('status', s => safe(() => { 
      if (s === 'loading') { 
        this.loadingOverlay?.style && (this.loadingOverlay.style.display='flex'); 
        this.liveDot.className='live-dot'; 
        this.connText.textContent='...'; 
      } else if (s === 'connecting') { 
        this.liveDot.className='live-dot'; 
        this.connText.textContent='ربط...'; 
      } else if (s === 'connected') { 
        this.loadingOverlay?.classList?.add('hidden'); 
        this.liveDot.className='live-dot ok'; 
        this.connText.textContent='LIVE'; 
      } else if (s === 'disconnected') { 
        this.liveDot.className='live-dot'; 
        this.connText.textContent='Reconnect...'; 
      } else if (s === 'error') { 
        if(this.loadingOverlay) this.loadingOverlay.style.display='none'; 
        this._showToast('فشل الاتصال', 'down'); 
      } 
    })));
    
    this._eventUnsubs.push(bus.on('feed:reset', () => safe(() => { 
      this.candles=[]; 
      this.firstLoad=true; 
      this.dirty=true; 
      this._cachedIndicators = null;
      this._indicatorCache.clear(); // ✅ مسح الكاش عند إعادة التعيين
      if(this.loadingOverlay) this.loadingOverlay.style.display='flex'; 
    })));
    
    this._eventUnsubs.push(bus.on('indicator:registered', ({ id, plugin }) => {
      this.registeredIndicators[id] = { enabled: false, ...plugin };
      this._createIndicatorButton(id, plugin);
      this._cachedIndicators = null;
      this._indicatorCache.delete(id); // ✅ مسح كاش هذا المؤشر فقط
      this.dirty = true;
      console.log(`[App] ✓ Dynamic indicator registered: ${plugin.name || id}`);
    }));
  }

  _createIndicatorButton(id, plugin) {
    if (!plugin?.button?.label) {
      console.warn(`[App] Indicator "${id}" missing button config, skipping UI`);
      return;
    }
    
    const existingBtn = document.getElementById(`btn-${id}`);
    if (existingBtn) return;
    
    const btn = document.createElement('button');
    btn.id = `btn-${id}`;
    btn.className = 'tb-btn indicator';
    btn.textContent = plugin.button.label;
    btn.title = plugin.button.title || plugin.name || id;
    
    btn.addEventListener('click', () => {
      if (this.registeredIndicators[id]) {
        this.registeredIndicators[id].enabled = !this.registeredIndicators[id].enabled;
        btn.classList.toggle('active', this.registeredIndicators[id].enabled);
        this._cachedIndicators = null;
        this._indicatorCache.delete(id); // ✅ مسح كاش هذا المؤشر عند التبديل
        this.dirty = true;
        console.log(`[App] ${this.registeredIndicators[id].enabled ? '✓ Enabled' : '✗ Disabled'}: ${id}`);
      }
    });
    
    const toolbarGroup = document.querySelector('.toolbar-group:nth-child(2)');
    if (toolbarGroup) {
      if (plugin.button.position === 'end') {
        toolbarGroup.appendChild(btn);
      } else if (plugin.button.position === 'after-vol' && this.btnVOL) {
        this.btnVOL.after(btn);
      } else if (plugin.button.position === 'after-sr' && this.btnSR) {
        this.btnSR.after(btn);
      } else {
        const sep = toolbarGroup.querySelector('.tb-sep');
        if (sep) {
          sep.before(btn);
        } else {
          toolbarGroup.appendChild(btn);
        }
      }
    }
    
    console.log(`[App] ✓ Button created for indicator: ${id}`);
  }

  _initEvents() {
    const mc = this.mainCanvas; if (!mc) return;
    
    const isOverPaneDivider = (mouseY) => {
      if (this.indicators.lowess) {
        const lowessTop = this.chartH - this._smoothedLowessHeight;
        if (Math.abs(mouseY - lowessTop) <= 8) return { type: 'lowess', topY: lowessTop };
      }
      for (const [id, pane] of Object.entries(this.paneIndicators)) {
        const plugin = this.registeredIndicators[id];
        if (plugin?.enabled && plugin.settings?.separatePane) {
          const paneTop = pane.yOffset;
          if (Math.abs(mouseY - paneTop) <= 8) {
            return { type: 'dynamic', id, topY: paneTop, plugin };
          }
        }
      }
      return null;
    };
    
    mc.addEventListener('mousedown', e => { 
      if(e.button!==0) return; 
      const r = mc.getBoundingClientRect(); 
      const mouseY = e.clientY - r.top;
      
      const divider = isOverPaneDivider(mouseY);
      if (divider) {
        this._isDraggingPane = true;
        this.activeDragPaneId = divider.id || 'lowess';
        this.dragStartY = mouseY;
        this.dragStartHeight = divider.id 
          ? this.paneIndicators[divider.id]?.height 
          : this._lowessPaneH;
        mc.style.cursor = 'row-resize'; 
        e.preventDefault(); 
        return; 
      }
      
      this.drag = { active: true, lastX: e.clientX }; 
      this.inertia.stop(); 
      mc.style.cursor = 'grabbing'; 
      e.preventDefault(); 
    });
    
    window.addEventListener('mousemove', e => {
      const r = this.mainCanvas.getBoundingClientRect(); 
      const mouseY = e.clientY - r.top;
      const mouseX = e.clientX - r.left;
      
      if (this._isDraggingPane && this.activeDragPaneId) {
        const dy = mouseY - this.dragStartY;
        
        if (this.activeDragPaneId === 'lowess') {
          let newH = this.dragStartHeight - dy;
          newH = Math.max(50, Math.min(newH, this.chartH * 0.5));
          this._lowessPaneH = newH;
        } else {
          const pane = this.paneIndicators[this.activeDragPaneId];
          if (pane) {
            let newH = this.dragStartHeight - dy;
            newH = Math.max(50, Math.min(newH, this.chartH * 0.5));
            pane.height = newH;
            if (this.registeredIndicators[this.activeDragPaneId]?.settings?.paneHeight) {
              this.registeredIndicators[this.activeDragPaneId].settings.paneHeight.value = newH;
            }
          }
        }
        this.dirty = true;
        return;
      }
      
      const divider = isOverPaneDivider(mouseY);
      if (divider && !this.drag.active) {
        mc.style.cursor = 'row-resize';
      } else if (!this.drag.active) {
        mc.style.cursor = 'crosshair';
      }
      
      this.crosshair = { x: mouseX, y: mouseY, active: true };
      
      if (this.drag.active) { 
        this.ts.scroll(e.clientX - this.drag.lastX, this.chartW); 
        this.drag.lastX = e.clientX; 
      }
      this.dirty = true;
    });
    
    window.addEventListener('mouseup', () => { 
      if (this._isDraggingPane) { 
        this._isDraggingPane = false; 
        this.activeDragPaneId = null;
        mc.style.cursor = 'crosshair'; 
        return; 
      }
      if (this.drag.active) { 
        this.drag.active = false; 
        mc.style.cursor = 'crosshair'; 
      } 
    });
    
    mc.addEventListener('mouseleave', () => { 
      this.crosshair.active = false; 
      if (!this._isDraggingPane) mc.style.cursor = 'default';
      this.dirty = true; 
    });
    
    mc.addEventListener('wheel', e => { 
      e.preventDefault(); 
      this.inertia.stop(); 
      this.ts.zoom(e.deltaY>0?0.9:1.1, this.crosshair.x, this.chartW); 
      this.dirty = true; 
    }, {passive: false});

    mc.addEventListener('touchstart', e => {
      e.preventDefault(); 
      this.inertia.stop(); 
      const t = e.touches, r = mc.getBoundingClientRect();
      
      if (t.length === 1) {
        const touchY = t[0].clientY - r.top;
        const touchX = t[0].clientX - r.left;
        
        const divider = isOverPaneDivider(touchY);
        if (divider) {
          this._isDraggingPane = true;
          this.activeDragPaneId = divider.id || 'lowess';
          this.dragStartY = touchY;
          this.dragStartHeight = divider.id 
            ? this.paneIndicators[divider.id]?.height 
            : this._lowessPaneH;
          this.dirty = true;
          return;
        }
        
        this.drag = { active: true, lastX: touchX }; 
        this.crosshair = { x: touchX, y: touchY, active: true }; 
        this.inertia.startTracking(); 
      }
      else if (t.length === 2) { 
        this.drag.active = false; 
        this.pinch = {
          active: true,
          dist: Math.hypot(t[1].clientX - t[0].clientX, t[1].clientY - t[0].clientY),
          cx: (t[0].clientX + t[1].clientX)/2 - r.left,
          sp: this.ts.spacing
        }; 
      }
      this.dirty = true;
    }, {passive: false});

    mc.addEventListener('touchmove', e => {
      e.preventDefault(); 
      const t = e.touches, r = mc.getBoundingClientRect(), now = performance.now();
      
      if (t.length === 1 && this._isDraggingPane && this.activeDragPaneId) {
        const touchY = t[0].clientY - r.top;
        const dy = touchY - this.dragStartY;
        
        if (this.activeDragPaneId === 'lowess') {
          let newH = this.dragStartHeight - dy;
          newH = Math.max(50, Math.min(newH, this.chartH * 0.5));
          this._lowessPaneH = newH;
        } else {
          const pane = this.paneIndicators[this.activeDragPaneId];
          if (pane) {
            let newH = this.dragStartHeight - dy;
            newH = Math.max(50, Math.min(newH, this.chartH * 0.5));
            pane.height = newH;
            if (this.registeredIndicators[this.activeDragPaneId]?.settings?.paneHeight) {
              this.registeredIndicators[this.activeDragPaneId].settings.paneHeight.value = newH;
            }
          }
        }
        this.dirty = true;
        return;
      }
      
      if (t.length === 1) {
        if (this.drag.active) { 
          this.ts.scroll(t[0].clientX - this.drag.lastX, this.chartW); 
          this.inertia.track(t[0].clientX - this.drag.lastX, now); 
          this.drag.lastX = t[0].clientX; 
          this.crosshair.x = t[0].clientX - r.left; 
          this.crosshair.y = t[0].clientY - r.top; 
        }
      }
      else if (t.length === 2 && this.pinch.active) { 
        const nd = Math.hypot(t[1].clientX - t[0].clientX, t[1].clientY - t[0].clientY);
        
        // ✅ جديد: حدود للتغير في المقياس + تخفيف (Damping)
        const maxScaleChange = CFG.zoom?.maxScalePerFrame || 0.15;
        let rawScale = nd / this.pinch.dist;
        rawScale = Math.max(1 - maxScaleChange, Math.min(1 + maxScaleChange, rawScale));
        
        const damping = CFG.zoom?.pinchDamping || 0.7;
        const smoothedScale = 1 + (rawScale - 1) * damping;
        
        const ns = Math.max(CFG.minSpacing || 1.5, Math.min(CFG.maxSpacing || 60, this.pinch.sp * smoothedScale));
        const cx = (t[0].clientX + t[1].clientX)/2 - r.left;
        const ci = this.ts.xToIndex(this.pinch.cx);
        
        this.ts.spacing = ns;
        this.ts.offset = cx - ci * ns;
        
        this.pinch.dist = nd;
        this.pinch.sp = ns;
        
        // ✅ جديد: إيقاف القصور الذاتي أثناء الزوم
        if (CFG.zoom?.disableInertiaDuringZoom && this.inertia?.isActive?.()) {
          this.inertia.stop();
        }
      }
      this.dirty = true;
    }, {passive: false});

    mc.addEventListener('touchend', e => {
      e.preventDefault();
      if (this._isDraggingPane) { 
        this._isDraggingPane = false; 
        this.activeDragPaneId = null;
      }
      if (e.touches.length === 0) { 
        // ✅ جديد: تفعيل القصور الذاتي فقط إذا لم يكن هناك زوم
        if (this.drag.active && !this.pinch.active) {
          this.inertia.release(); 
        }
        this.drag.active = false; 
        this.pinch.active = false; 
        this.crosshair.active = false; 
      }
      else if (e.touches.length === 1) { 
        this.pinch.active = false; 
        this.drag = { active: true, lastX: e.touches[0].clientX }; 
        this.inertia.startTracking(); 
      }
      this.dirty = true;
    }, {passive: false});

    window.addEventListener('resize', () => { 
      clearTimeout(this.resizeTimer); 
      this.resizeTimer = setTimeout(() => { this._resize(); this.dirty = true; }, 150); 
    });
    document.body.addEventListener('touchmove', e => e.preventDefault(), {passive: false});
  }

  _initToolbar() {
    this.tfButtons.forEach(b => b.addEventListener('click', () => { 
      this.tfButtons.forEach(x=>x.classList.remove('active')); 
      b.classList.add('active'); 
      this.feed?.changeConfig?.(this.feed.symbol, b.dataset.tf); 
      this._cachedIndicators = null;
      this._indicatorCache.clear(); // ✅ مسح الكاش عند تغيير الإطار الزمني
      this.dirty = true; 
    }));
    
    this.btnMA?.addEventListener('click', () => { 
      this.indicators.ma = !this.indicators.ma; 
      this.btnMA.classList.toggle('active', this.indicators.ma); 
      this._cachedIndicators = null; 
      this.dirty = true; 
    });
    
    this.btnBB?.addEventListener('click', () => { 
      this.indicators.bb = !this.indicators.bb; 
      this.btnBB.classList.toggle('active', this.indicators.bb); 
      this._cachedIndicators = null; 
      this.dirty = true; 
    });
    
    this.btnVOL?.addEventListener('click', () => { 
      this.indicators.vol = !this.indicators.vol; 
      this.btnVOL.classList.toggle('active', this.indicators.vol); 
      this.dirty = true; 
    });
    
    this.btnLOWESS?.addEventListener('click', () => { 
      this.indicators.lowess = !this.indicators.lowess; 
      this.btnLOWESS.classList.toggle('active', this.indicators.lowess); 
      this._cachedIndicators = null; 
      this.dirty = true; 
    });
    
    this.btnSR?.addEventListener('click', () => { 
      this.indicators.sr = !this.indicators.sr; 
      this.btnSR.classList.toggle('active', this.indicators.sr); 
      this._cachedIndicators = null; 
      this.dirty = true; 
    });
  }

  _resize() {
    try {
      const wr = document.getElementById('canvas-wrapper'); if(!wr) return;
      const rect = wr.getBoundingClientRect();
      const ap = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--axis-price-w'))||72;
      const at = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--axis-time-h'))||28;
      this.chartW = Math.max(200, rect.width - ap);
      this.chartH = Math.max(200, rect.height - at);
      if(this.mainR) { 
        this.mainR.resize(this.chartW, this.chartH); 
        if(this.mainR.setRefs && !this._glRefsSet){ 
          this.mainR.setRefs(this.ts,this.ps); 
          this._glRefsSet = true; 
        } 
      }
      this.priceR?.resize(ap, this.chartH);
      this.timeR?.resize(this.chartW, at);
      this.inertia?.setChartWidth(this.chartW);
      this.ts?.setBounds?.(this.chartW);
    } catch(e) { console.warn('[App] Resize:', e); }
  }

  // ✅ محسّن: نظام كاش ذكي + معدل تحديث قابل للضبط
  _getIndicators() {
    const len = this.candles?.length || 0; 
    if(!len) return null;
    
    const now = performance.now();
    const shouldRecalculate = (now - this._lastIndicatorUpdate) >= this.indicatorUpdateRate;
    
    // التحقق من الكاش العام
    if(!shouldRecalculate && this._cachedIndicators?.len === len && this._cachedIndicators.flags === this._indFlags()) {
      const cacheValid = Array.from(this._indicatorCache.entries()).every(([id, entry]) => 
        now - entry.timestamp < this._indicatorCacheTTL
      );
      if(cacheValid) return this._cachedIndicators.values;
    }
    
    try {
      const closes = this.candles.map(c=>c?.close??0), 
            vols = this.candles.map(c=>c?.volume??0), 
            vals = {};
      
      // حساب المؤشرات الثابتة
      if(typeof Indicators !== 'undefined') {
        if(this.indicators.ma) { 
          vals.ma20 = Indicators.sma(closes,20); 
          vals.ma50 = Indicators.ema(closes,50); 
        }
        if(this.indicators.bb) {
          vals.bb = Indicators.bollingerBands(closes,20,2);
        }
        if(this.indicators.vol) {
          vals.volMA = Indicators.volumeMA(vols,20);
        }
        if(this.indicators.lowess) {
          vals.lowess = Indicators.lowessRsi2Strategy(this.candles); 
        }
        if(this.indicators.sr) {
          vals.sr = Indicators.supportResistancePro(this.candles, { sensitivity: 10, maxLevels: 5 });
        }
      }
      
      // حساب المؤشرات الديناميكية مع الكاش الفردي
      if (Object.keys(this.registeredIndicators).length > 0) {
        for (const [id, plugin] of Object.entries(this.registeredIndicators)) {
          if (plugin.enabled && typeof plugin.calculate === 'function') {
            try {
              // التحقق من كاش هذا المؤشر
              const cached = this._indicatorCache.get(id);
              if(cached && cached.len === len && now - cached.timestamp < this._indicatorCacheTTL) {
                vals[id] = cached.data;
                continue;
              }
              
              // حساب جديد + تخزين
              const result = plugin.calculate(this.candles, plugin.settings || {});
              this._indicatorCache.set(id, { 
                data: result, 
                timestamp: now, 
                len: len 
              });
              vals[id] = result;
            } catch (err) {
              console.error(`[App] Error calculating indicator "${id}":`, err);
              vals[id] = null;
            }
          }
        }
      }
      
      // تحديث وقت آخر حساب
      if(shouldRecalculate) this._lastIndicatorUpdate = now;
      
      this._cachedIndicators = { 
        len, 
        flags: this._indFlags(), 
        values: vals 
      };
      return vals;
      
    } catch(e) { 
      console.error('[App] _getIndicators error:', e);
      return null; 
    }
  }
  
  _indFlags() { 
    let dynamicFlags = '';
    for (const [id, plugin] of Object.entries(this.registeredIndicators)) {
      dynamicFlags += `${id}:${plugin.enabled ? 1 : 0};`;
    }
    return `${this.indicators.ma}${this.indicators.bb}${this.indicators.vol}${this.indicators.lowess}${this.indicators.sr}|${dynamicFlags}`; 
  }

  // ✅ جديد: ضبط معدل تحديث المؤشرات
  setIndicatorUpdateRate(rateMs) {
    this.indicatorUpdateRate = Math.max(50, Math.min(1000, rateMs));
    console.log(`[App] Indicator update rate set to ${this.indicatorUpdateRate}ms`);
  }

  // ✅ جديد: تنظيف الكاش عند الحاجة
  _clearIndicatorCache() {
    this._indicatorCache.clear();
    this._cachedIndicators = null;
    this._lastIndicatorUpdate = 0;
  }

  // ✅ جديد: تنعيم ارتفاعات النوافذ
  _smoothPaneHeights() {
    const smoothFactor = 0.15;
    
    // تنعيم LOWESS
    if (this.indicators.lowess) {
      this._smoothedLowessHeight += (this._lowessPaneH - this._smoothedLowessHeight) * smoothFactor;
    }
    
    // تنعيم النوافذ الديناميكية
    for (const [id, plugin] of Object.entries(this.registeredIndicators)) {
      if (plugin.enabled && plugin.settings?.separatePane) {
        const targetH = plugin.settings.paneHeight?.value ?? plugin.settings.paneHeight ?? 120;
        if (!this._smoothedPaneHeights.has(id)) {
          this._smoothedPaneHeights.set(id, targetH);
        }
        const current = this._smoothedPaneHeights.get(id);
        this._smoothedPaneHeights.set(id, current + (targetH - current) * smoothFactor);
      }
    }
  }

  _updateTimer() {
    if (!this.candles?.length || !this.feed?.interval) return;
    const last = this.candles[this.candles.length - 1];
    const now = Date.now();
    const tfMap = { '1s': 1000, '5s': 5000, '15s': 15000, '30s': 30000, '1m': 60000, '2m': 120000, '3m': 180000, '5m': 300000, '15m': 900000, '30m': 1800000, '1h': 3600000, '2h': 7200000, '4h': 14400000, '6h': 21600000, '12h': 43200000, '1d': 86400000, '3d': 259200000, '1w': 604800000 };
    const duration = tfMap[this.feed.interval] || 60000;
    const candleStart = Math.floor(last.time / duration) * duration;
    const remaining = (candleStart + duration) - now;
    
    // ✅ استخدام القيم المُنعَّمة لارتفاعات النوافذ
    let totalPaneHeight = this.indicators.lowess ? this._smoothedLowessHeight : 0;
    for (const [id, plugin] of Object.entries(this.registeredIndicators)) {
      if (plugin.enabled && plugin.settings?.separatePane) {
        totalPaneHeight += this._smoothedPaneHeights.get(id) ?? (plugin.settings.paneHeight?.value ?? 120);
      }
    }
    const mainH = this.chartH - totalPaneHeight;
    
    let timeStr = '';
    if (remaining > 0) {
      const totalSec = Math.floor(remaining / 1000);
      if (duration <= 60000) { const m = Math.floor(totalSec / 60); const s = totalSec % 60; timeStr = `${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`; } 
      else if (duration <= 3600000) { const h = Math.floor(totalSec / 3600); const m = Math.floor((totalSec % 3600) / 60); const s = totalSec % 60; timeStr = `${h}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`; } 
      else { const h = Math.floor(totalSec / 3600); const m = Math.floor((totalSec % 3600) / 60); timeStr = `${h}h ${m.toString().padStart(2,'0')}m`; }
    }
    if (remaining <= 500 || !this.mainR?.drawTimer) { if (this.timerBadge) this.timerBadge.style.display = 'none'; return; }
    
    const lastIdx = this.candles.length - 1;
    const lastX = this.ts.indexToX(lastIdx);
    const lastY = this.ps.priceToY(last.close, mainH);
    
    // ✅ استخدام إعدادات المسافة القابلة للتخصيص
    const timerOffsetX = CFG.ui?.timerOffsetX || 45;
    const timerOffsetY = CFG.ui?.timerOffsetY || 25;
    let drawX = lastX + timerOffsetX; 
    let drawY = lastY - timerOffsetY;
    
    // حدود ذكية مع مسافات أكبر
    if (drawX + 70 > this.chartW - 10) drawX = lastX - 90;
    if (drawY < 30) drawY = lastY + 35;
    if (drawY > mainH - 30) drawY = mainH - 30;
    
    this.mainR.drawTimer(timeStr, drawX, drawY, CFG?.colors?.timer || '#4da6ff', 11);
    if (this.timerBadge) this.timerBadge.style.display = 'none';
  }

  // ✅ محسّن للأداء: _render() مع إصلاح استقرار المقياس للمؤشرات الـ Overlay
_render() {
  try {
    const bufferFlushed = this.feed?.flushBuffer?.() || false;
    const isAnimating = this.inertia?.isActive() || false;
    
    // لا نعيد الرسم إذا لم يتغير شيء والنظام غير متحرك
    if (!this.dirty && !bufferFlushed && !isAnimating) { 
      this._updateTimer(); 
      this.rafId = requestAnimationFrame(() => this._loop()); 
      return; 
    }
    
    // تنظيف حالة الشموع الفارغة بسرعة
    if (!this.candles?.length) { 
      this.mainR?.clear?.(); 
      this.rafId = requestAnimationFrame(() => this._loop()); 
      return; 
    }
    
    this.dirty = false;

    const { chartW: w, ts, ps, candles } = this;
    if (!ts || !ps) { 
      this.rafId = requestAnimationFrame(() => this._loop()); 
      return; 
    }
    
    const vr = ts.getVisibleRange(w); 
    
    // ✅ تطبيق التنعيم على ارتفاعات النوافذ
    this._smoothPaneHeights();
    
    let totalPaneHeight = 0;
    if (this.indicators.lowess) {
      totalPaneHeight += this._smoothedLowessHeight;
    }

    for (const [id, plugin] of Object.entries(this.registeredIndicators)) {
      if (plugin.enabled && plugin.settings?.separatePane) {
        const paneH = this._smoothedPaneHeights.get(id) ?? (plugin.settings.paneHeight?.value ?? 120);
        totalPaneHeight += paneH;
        if (!this.paneIndicators[id]) {
          this.paneIndicators[id] = { height: paneH, ps: new PriceScale(), yOffset: 0 };
        } else {
          this.paneIndicators[id].height = paneH;
        }
      }
    }

    const mainH = this.chartH - totalPaneHeight;
    let currentYOffset = mainH;

    for (const [id, pane] of Object.entries(this.paneIndicators)) {
      pane.yOffset = currentYOffset;
      currentYOffset += pane.height;
    }
    
    // ✅ حساب مقياس السعر الأساسي (على النطاق المرئي فقط)
    ps.calculateRange(candles, vr.start, vr.end);
    
    // ✅ ✅ إصلاح مشكلة "قفز المقياس" للمؤشرات الـ Overlay
    if (this._cachedIndicators?.values) {
      const ind = this._cachedIndicators.values;
      let hasOverlay = false;
      
      for (const pluginId in this.registeredIndicators) {
        const plugin = this.registeredIndicators[pluginId];
        const data = ind[pluginId];
        
        // ✅ فقط للمؤشرات المفعّلة التي تستخدم وضع Overlay ولديها نطاق
        if (plugin?.enabled && plugin.settings?.overlayMode && data?.range) {
          hasOverlay = true;
          
          // ✅ ✅ ميزة "النطاق المستقر": لا نغير المقياس إلا إذا تجاوز السعر حدوده
          if (data.range.stable) {
            const lastPrice = candles[candles.length - 1]?.close;
            if (lastPrice == null) continue;
            
            const currentRange = ps.max - ps.min;
            const buffer = currentRange * 0.05; // هامش 5%
            
            // نسمح بالتوسيع فقط إذا خرج السعر بشكل واضح عن النطاق
            if (lastPrice < data.range.min - buffer) {
              ps.min = data.range.min;
            }
            if (lastPrice > data.range.max + buffer) {
              ps.max = data.range.max;
            }
            // وإلا: نحتفظ بالمقياس الحالي لمنع القفز
          
          } else {
            // ✅ النطاق غير مستقر: نطبق تنعيماً تدريجياً للتغييرات
            const smoothFactor = plugin.settings?.rangeSmoothFactor?.value ?? 0.1;
            
            if (data.range.min < ps.min) {
              ps.min = ps.min + (data.range.min - ps.min) * smoothFactor;
            }
            if (data.range.max > ps.max) {
              ps.max = ps.max + (data.range.max - ps.max) * smoothFactor;
            }
          }
        }
      }
      
      // ✅ إضافة هامش 5% فقط (بدلاً من 10%) لمنع التصاق الخطوط بالحواف
      if (hasOverlay) {
        const range = ps.max - ps.min;
        if (range > 0 && range < 1e10) { // حماية من القيم غير المنطقية
          const margin = range * 0.05;
          ps.min -= margin;
          ps.max += margin;
        }
      }
    }
    
    if (this.mainR.setRefs && !this._glRefsSet) { 
      this.mainR.setRefs(ts, ps); 
      this._glRefsSet = true; 
    }

    this.mainR?.clear?.();
    this.mainR?.drawGrid?.(ps, ts, mainH);
    
    // ✅ رسم الحجم
    if (this.indicators.vol) {
      let mv = 0;
      for (let i = vr.start; i <= vr.end; i++) { 
        if (candles[i]?.volume > mv) mv = candles[i].volume; 
      }
      if (mv > 0) {
        const volRects = [];
        const vh = mainH * 0.15;
        for (let i = vr.start; i <= vr.end; i++) {
          const c = candles[i]; 
          if (!c) continue;
          const volH = Math.round((c.volume / mv) * vh);
          const topPrice = ps.yToPrice(mainH - volH, mainH);
          volRects.push({
            x1Idx: i - 0.35, y1Price: topPrice,
            x2Idx: i + 0.35, y2Price: ps.min,
            color: c.close >= c.open ? 'rgba(0,230,118,0.3)' : 'rgba(255,23,68,0.3)'
          });
        }
        this.mainR.drawRects(volRects, { ts, ps, chartH: mainH });
      }
    }
    
    const ind = this._getIndicators();
    if (ind) {
      // ✅ رسم المؤشرات الثابتة
      if (this.indicators.bb && ind.bb) {
        this.mainR.drawArea(ind.bb.upper, ind.bb.lower, 'rgba(33,150,243,0.04)', { 
          ts, ps, chartH: mainH, strokeColor: 'rgba(100,181,246,0.6)', lineWidth: 1 
        });
        this.mainR.drawLine(ind.bb.mid, 'rgba(100,181,246,0.8)', { ts, ps, chartH: mainH, lineWidth: 1 });
      }
      
      if (this.indicators.ma) { 
        if (ind.ma20) this.mainR.drawLine(ind.ma20, CFG?.colors?.ma20 || '#f9a825', { ts, ps, chartH: mainH });
        if (ind.ma50) this.mainR.drawLine(ind.ma50, CFG?.colors?.ma50 || '#7c4dff', { ts, ps, chartH: mainH });
      }
      
      if (this.indicators.sr && ind.sr) {
        const srRects = ind.sr.zones.map(z => ({
          x1Idx: z.x1, y1Price: z.y1, x2Idx: z.x2, y2Price: z.y2,
          color: z.color + '26', strokeColor: z.color + '80', dashed: true
        }));
        this.mainR.drawRects(srRects, { ts, ps, chartH: mainH });
        const srShapes = ind.sr.markers.map(m => ({ type: m.type, idx: m.x, price: m.y, color: m.color }));
        this.mainR.drawShapes(srShapes, { ts, ps, chartH: mainH });
      }
      
      // ✅ رسم المؤشرات الديناميكية
      if (Object.keys(this.registeredIndicators).length > 0) {
        for (const [id, plugin] of Object.entries(this.registeredIndicators)) {
          if (plugin.enabled && plugin.render && ind[id] && typeof plugin.render === 'function') {
            try {
              const isOverlayIndicator = plugin.settings?.overlayMode === true || 
                                         plugin.settings?.isOverlay === true ||
                                         !plugin.settings?.separatePane;
              
              if (plugin.settings?.separatePane && this.paneIndicators[id] && !isOverlayIndicator) {
                // --- رسم في نافذة منفصلة ---
                const pane = this.paneIndicators[id];
                const paneData = ind[id];
                
                if (paneData?.line) {
                  let minVal = Infinity, maxVal = -Infinity;
                  for (let i = vr.start; i <= vr.end; i++) {
                    if (paneData.line[i] != null) {
                      if (paneData.line[i] < minVal) minVal = paneData.line[i];
                      if (paneData.line[i] > maxVal) maxVal = paneData.line[i];
                    }
                  }
                  if (isFinite(minVal) && isFinite(maxVal)) {
                    const range = maxVal - minVal || 1;
                    if (Math.abs(pane.ps.min - minVal) > 0.01 || Math.abs(pane.ps.max - maxVal) > 0.01) {
                      pane.ps.min = minVal - range * 0.1;
                      pane.ps.max = maxVal + range * 0.1;
                      if (pane.ps.max === pane.ps.min) pane.ps.max = pane.ps.min + 1;
                    }
                  }
                }
                
                plugin.render(this.mainR, ts, pane.ps, pane.height, ind[id], plugin.settings || {}, {
                  yOffset: pane.yOffset,
                  isSeparatePane: true,
                  paneId: id,
                  crosshair: this.crosshair.active ? this.crosshair : null,
                  candles: this.candles
                });
              } else {
                // --- رسم كـ Overlay فوق الشموع ---
                plugin.render(this.mainR, ts, ps, mainH, ind[id], plugin.settings || {}, {
                  yOffset: 0,
                  isSeparatePane: false,
                  isOverlay: true,
                  clipY: mainH,
                  crosshair: this.crosshair.active ? this.crosshair : null,
                  candles: this.candles
                });
              }
            } catch (err) {
              console.error(`[App] Error rendering indicator "${id}":`, err);
            }
          }
        }
      }
    }
    
    // ✅ رسم الشموع (أخيراً، لضمان ظهورها فوق المؤشرات الخلفية)
    this.mainR?.drawCandles?.(candles, ts, ps, mainH);
    
    const last = candles[candles.length - 1]; 
    let isUp = false, priceStr = '';
    if (last) { 
      isUp = last.close >= last.open; 
      priceStr = Utils ? Utils.fmtPrice(last.close) : last.close.toFixed(2); 
      this.mainR?.drawPriceLine?.(last.close, isUp, ps, mainH); 
    }

    // ✅ رسم LOWESS الثابت (إذا مفعّل)
    if (this.indicators.lowess && ind?.lowess) {
      const lowessData = ind.lowess;
      let lo = Infinity, hi = -Infinity;
      for (let i = vr.start; i <= vr.end; i++) {
        const h2 = lowessData.channels.h2[i]; const l2 = lowessData.channels.l2[i];
        if (h2 != null) { if (h2 > hi) hi = h2; if (h2 < lo) lo = h2; }
        if (l2 != null) { if (l2 > hi) hi = l2; if (l2 < lo) lo = l2; }
      }
      if (isFinite(lo) && isFinite(hi)) {
        const range = hi - lo; 
        this.psLowess.min = lo - range * 0.05;
        this.psLowess.max = hi + range * 0.05;
        if (this.psLowess.max === this.psLowess.min) this.psLowess.max = this.psLowess.min + 1;
      }
      
      const lowessOpts = { ts, ps: this.psLowess, chartH: this._smoothedLowessHeight, yOffset: mainH };
      this.mainR.drawArea(lowessData.rsi.bounds.line90, lowessData.rsi.bounds.line10, 'rgba(192, 192, 192, 0.1)', lowessOpts);
      
      const staticL = [lowessData.channels.h2, lowessData.channels.h1, lowessData.channels.l1, lowessData.channels.l2];
      for (const l of staticL) this.mainR.drawLine(l, lowessData.channels.color, { ...lowessOpts, lineWidth: 1 });
      
      const boundsL = [lowessData.rsi.bounds.line100, lowessData.rsi.bounds.line0, lowessData.rsi.bounds.line90, lowessData.rsi.bounds.line10];
      for (const l of boundsL) this.mainR.drawLine(l, lowessData.rsi.bounds.color, { ...lowessOpts, lineWidth: 2 });

      const midColors = lowessData.channels.mid.map((v, i) => {
        if (i < 3 || v == null || lowessData.channels.mid[i-3] == null) return null;
        return v > lowessData.channels.mid[i-3] ? lowessData.channels.midColorUp : lowessData.channels.midColorDn;
      });
      this.mainR.drawLine(lowessData.channels.mid, midColors, { ...lowessOpts, lineWidth: 1, alpha: 0.9 });
      this.mainR.drawLine(lowessData.rsi.line, lowessData.rsi.colors, { ...lowessOpts, lineWidth: 1.5 });

      const diamonds = [];
      for (let i = 0; i < lowessData.markers.trendChanges.length; i++) {
        if (lowessData.markers.trendChanges[i] != null && lowessData.channels.mid[i] != null) {
          diamonds.push({ type: 'diamond', idx: i, price: lowessData.channels.mid[i], color: lowessData.markers.trendChanges[i] });
        }
      }
      this.mainR.drawShapes(diamonds, lowessOpts);

      const sepRect = [{
        x1Idx: vr.start, y1Price: this.psLowess.max,
        x2Idx: vr.end, y2Price: this.psLowess.max - (this.psLowess.max - this.psLowess.min) * 0.002,
        color: '#1e2d3d'
      }];
      this.mainR.drawRects(sepRect, lowessOpts);
    }

    // ✅ تحديث Crosshair UI
    if (this.crosshair.active && this.crosshair.x >= 0 && this.crosshair.y >= 0) { 
      this.mainR?.drawCrosshair?.(this.crosshair.x, this.crosshair.y); 
      this._updateCrosshairUI(ind); 
    } else { 
      if (this.xhairBox) this.xhairBox.style.display = 'none'; 
      if (this.indicatorValues) this.indicatorValues.style.display = 'none'; 
    }
    
    // ✅ تحديد مقياس السعر للمحور بناءً على موضع الماوس
    let axisPs = ps; 
    let axisChartH = mainH; 
    let relativeCrossY = -1;
    
    if (this.crosshair.active) {
      relativeCrossY = this.crosshair.y;
      if (this.indicators.lowess && this.crosshair.y > mainH && this.crosshair.y <= mainH + this._smoothedLowessHeight) {
        axisPs = this.psLowess; 
        axisChartH = this._smoothedLowessHeight; 
        relativeCrossY = this.crosshair.y - mainH; 
      } else {
        for (const [id, pane] of Object.entries(this.paneIndicators)) {
          const paneTop = pane.yOffset;
          const paneBottom = paneTop + pane.height;
          if (this.crosshair.y > paneTop && this.crosshair.y <= paneBottom) {
            axisPs = pane.ps;
            axisChartH = pane.height;
            relativeCrossY = this.crosshair.y - paneTop;
            break;
          }
        }
      }
    }
    
    const lastPriceForAxis = (this.indicators.lowess && this.crosshair.active && this.crosshair.y > mainH) ? -1 : (last?.close ?? -1);
    this.priceR?.render?.(axisPs, axisChartH, relativeCrossY, lastPriceForAxis, isUp, priceStr);
    this.timeR?.render?.(ts, candles, w, this.crosshair.active ? this.crosshair.x : -1);
    this._updateTimer();
    
    // ✅ رسم خطوط فاصل النوافذ المنفصلة
    if (Object.keys(this.paneIndicators).length > 0) {
      const ctx = this.mainCanvas.getContext('2d');
      if (ctx) {
        ctx.save();
        ctx.strokeStyle = 'rgba(100, 120, 150, 0.5)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        
        for (const [id, pane] of Object.entries(this.paneIndicators)) {
          const plugin = this.registeredIndicators[id];
          if (plugin?.enabled && plugin.settings?.separatePane) {
            const y = pane.yOffset + 0.5;
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(this.chartW, y);
            ctx.stroke();
          }
        }
        ctx.setLineDash([]);
        ctx.restore();
      }
    }
    
  } catch (e) { 
    console.error('[App] Render:', e); 
  }
  
  // ✅ حلقة الرسم التالية مع requestAnimationFrame
  this.rafId = requestAnimationFrame(() => this._loop());
  if (this.inertia?.isActive()) this.dirty = true;
}
  
  _startRenderLoop() { 
    this._loop = ()=>this._render(); 
    this._loop(); 
  }
  
  _updatePriceUI(p) { 
    if(!this.priceDisplay) return; 
    try{ 
      this.priceDisplay.textContent = AppHelpers.fmtPrice(p); 
      const pr = parseFloat(this.priceDisplay.dataset.last||0); 
      const up = p >= pr; 
      this.priceDisplay.style.color = up ? (CFG?.colors?.up||'#13e600') : (CFG?.colors?.down||'#ff0000'); 
      this.priceDisplay.dataset.last = p; 
    } catch(e) {} 
  }
  
  _updatePriceLabel(y, p, up) { 
    if(!this.priceLabel) return; 
    try{ 
      const lh = 20, cy = AppHelpers.clamp(y - lh/2, 0, this.chartH - lh); 
      this.priceLabel.textContent = AppHelpers.fmtPrice(p); 
      this.priceLabel.className = up ? 'up' : 'down'; 
      this.priceLabel.style.top = cy + 'px'; 
      this.priceLabel.style.height = lh + 'px'; 
      this.priceLabel.style.display = 'block'; 
    } catch(e) {} 
  }
  
  _updateCrosshairUI(ind) {
    if(!this.xhairBox || !this.ts) {
      if(this.xhairBox) this.xhairBox.style.display = 'none';
      return;
    }
    try {
      const idx = Math.round(this.ts.xToIndex(this.crosshair.x)); 
      if(idx < 0 || !this.candles || idx >= this.candles.length) {
        this.xhairBox.style.display = 'none';
        return;
      }
      const c = this.candles[idx]; 
      if(!c) {
        this.xhairBox.style.display = 'none';
        return;
      }
      const up = c.close >= c.open, 
            d = new Date(c.time), 
            ts = `${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`, 
            chg = ((c.close - c.open) / c.open * 100).toFixed(2);
      
      // ✅ تحسين عرض الموبايل: معلومات مختصرة
      if (CFG.isMobile) {
        this.xhairBox.innerHTML = `<div class="xh-row"><span>C: <b class="${up?'up':'down'}">${AppHelpers.fmtPrice(c.close)}</b></span><span style="margin-right:8px">${ts}</span></div>`;
        if (this.indicatorValues) this.indicatorValues.style.display = 'none';
      } else {
        this.xhairBox.innerHTML = `<div class="xh-row"><span>O: ${AppHelpers.fmtPrice(c.open)}</span><span>H: ${AppHelpers.fmtPrice(c.high)}</span></div><div class="xh-row"><span>L: ${AppHelpers.fmtPrice(c.low)}</span><span>C: <b class="${up?'up':'down'}">${AppHelpers.fmtPrice(c.close)}</b></span></div><div class="xh-row" style="margin-top:4px;color:var(--text-bright);font-size:10px;"><span>${up?'+':''}${chg}%</span><span style="margin-left:auto">${ts}</span></div>`;
        
        if(ind && this.indicatorValues) { 
          let h = ''; 
          if(ind.ma20?.[idx] != null) h += `<span style="color:${CFG?.colors?.ma20||'#f9a825'}">MA20: ${AppHelpers.fmtPrice(ind.ma20[idx])}</span> &nbsp; `; 
          if(ind.ma50?.[idx] != null) h += `<span style="color:${CFG?.colors?.ma50||'#7c4dff'}">MA50: ${AppHelpers.fmtPrice(ind.ma50[idx])}</span> &nbsp; `; 
          if(ind.bb?.upper?.[idx] != null) h += `<span style="color:#64b5f6">BB: ${AppHelpers.fmtPrice(ind.bb.upper[idx])} / ${AppHelpers.fmtPrice(ind.bb.lower[idx])}</span>`;
          
          if (Object.keys(this.registeredIndicators).length > 0) {
            for (const [id, plugin] of Object.entries(this.registeredIndicators)) {
              if (plugin.enabled && ind[id] && typeof plugin.getTooltip === 'function') {
                const tooltip = plugin.getTooltip(idx, ind[id], this.candles);
                if (tooltip) h += ` &nbsp; ${tooltip}`;
              }
            }
          }
          
          if(h) {
            this.indicatorValues.innerHTML = h;
            this.indicatorValues.style.display = 'block';
          } else {
            this.indicatorValues.style.display = 'none';
          } 
        }
      }
      this.xhairBox.style.display = 'block';
    } catch(e) {
      if(this.xhairBox) this.xhairBox.style.display = 'none';
    }
  }

  _showToast(msg, type='info') { 
    try {
      if(!this.alertContainer) return;
      const el = document.createElement('div');
      el.className = `alert-toast ${type}`;
      el.textContent = msg;
      this.alertContainer.appendChild(el);
      setTimeout(() => {
        if(el.parentNode) el.parentNode.removeChild(el);
      }, 3700);
    } catch(e) {} 
  }
  
  _startDataFeed() { 
    if(!this.feed?.configure) return; 
    try {
      this.feed.configure('btcusdt', '1m');
      this.feed.start();
    } catch(e) {
      this._showToast('فشل البدء', 'down');
    } 
  }
  
  destroy() { 
    try { 
      if(this.rafId) cancelAnimationFrame(this.rafId);
      this.inertia?.stop?.();
      this.mainR?.destroy?.();
      this.feed?.destroy?.();
      
      if (this._eventUnsubs) {
        this._eventUnsubs.forEach(unsub => {
          try { unsub?.(); } catch(e) {}
        });
        this._eventUnsubs = [];
      }
      
      for (const [id, plugin] of Object.entries(this.registeredIndicators)) {
        if (plugin.destroy && typeof plugin.destroy === 'function') {
          try { plugin.destroy(); } catch(e) {}
        }
      }
      this.registeredIndicators = {};
      this.paneIndicators = {};
      this.draggablePanes = {};
      this.activeDragPaneId = null;
      
      if(this.alertContainer) this.alertContainer.innerHTML = ''; 
      if(this.timerBadge) this.timerBadge.style.display = 'none'; 
      if(bus && bus._listeners) bus._listeners = {};
      
      console.log('[App] ✓ Destroyed cleanly');
    } catch(e) {
      console.error('[App] Destroy error:', e);
    } 
  }
}

// ═══════════════════════════════════════════════════════════════════════
// تهيئة التطبيق
// ═══════════════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => { 
  setTimeout(() => { 
    try { 
      window.chartApp = new App(); 
      window.addEventListener('beforeunload', () => window.chartApp?.destroy()); 
    } catch(e) { 
      document.body.innerHTML = `<div style="padding:20px;color:#ff1744;font-family:monospace"><h3>❌ فشل التحميل</h3><p>تأكد من ترتيب الملفات</p><p style="font-size:11px;opacity:0.7">${e.message}</p></div>`; 
    } 
  }, 100); 
});

document.addEventListener('contextmenu', e => { 
  if(e.target?.tagName === 'CANVAS') e.preventDefault(); 
});

document.body.addEventListener('gesturestart', e => e.preventDefault(), {passive: false});
document.body.addEventListener('gesturechange', e => e.preventDefault(), {passive: false});
