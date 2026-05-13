'use strict';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * APP - المحرك الرئيسي (النسخة عالية الدقة - High Precision Mode)
 * ✅ متوافق مع: config.js, event-bus.js, indicators.js, renderer.js, data-feed.js
 * ✅ الرمز الافتراضي: BTC/USDT (صالح في بايننس)
 * ✅ فالبك تلقائي للبيانات المحاكية عند فشل الاتصال
 * ✅ لا يعتمد على ملفات غير موجودة
 * ✅ إصلاح حاسم: إضافة timeToIndex لـ this.ts
 * ✅ سحب حر تماماً بدون قيود
 * ✅ أداء عالي مع كاش ذكي
 * ✅ 🎯 إضافات الدقة العالية: PrecisionUtils + Float Coordinates
 * ═══════════════════════════════════════════════════════════════════════
 */

// ─────────────────────────────────────────────────────────────────────
// مساعدات التطبيق
// ─────────────────────────────────────────────────────────────────────
const AppHelpers = {
  fmtPrice: (p) => {
    if (typeof Utils !== 'undefined' && Utils.fmtPrice) return Utils.fmtPrice(p);
    if (typeof p !== 'number' || isNaN(p)) return '—';
    return p >= 10000 ? p.toFixed(0) : p >= 1 ? p.toFixed(2) : p.toFixed(5);
  },
  clamp: (v, min, max) => Math.max(min, Math.min(max, v)),
  uid: (prefix = '') => `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
  savePrefs: (key, value) => {
    try { localStorage.setItem(`chart_prefs_${key}`, JSON.stringify(value)); } catch(e) {}
  },
  loadPrefs: (key, fallback) => {
    try {
      const v = localStorage.getItem(`chart_prefs_${key}`);
      return v ? JSON.parse(v) : fallback;
    } catch(e) { return fallback; }
  }
};

// ═══════════════════════════════════════════════════════════════════════
// 🎯 PrecisionUtils - مساعدات الدقة العالية للإحداثيات (جديد)
// ═══════════════════════════════════════════════════════════════════════
// يحافظ على القيم العشرية (float) حتى لحظة الرسم النهائية
// لمنع تراكم أخطاء التقريب عند التكبير/التصغير الشديد
// ═══════════════════════════════════════════════════════════════════════
const PrecisionUtils = {
  // ✅ تحويل مؤشر زمني → بكسل أفقي (بدون تقريب - يحافظ على الكسور)
  indexToXFloat(index, offset, spacing) {
    return offset + index * spacing; // float, NO Math.round
  },
  
  // ✅ تحويل سعر → بكسل عمودي (بدون تقريب - يحافظ على الكسور)
  priceToYFloat(price, min, max, height) {
    if (max === min) return height / 2;
    return height * (1 - (price - min) / (max - min)); // float
  },
  
  // ✅ تطبيق +0.5 للخطوط بسمك 1بكسل فقط (عند الرسم النهائي لمنع الضبابية)
  // للخطوط الأسمك أو الأشكال: نترك القيمة عشرية للرسم الناعم
  snapForStroke(value, lineWidth = 1) {
    return (lineWidth === 1 && Number.isInteger(lineWidth)) 
      ? Math.round(value) + 0.5  // Snap to pixel grid for crisp 1px lines
      : value;                    // Keep float for anti-aliased thick lines/shapes
  },
  
  // ✅ دالة مساعدة: تحويل إحداثيات الشكل للرسم بدقة
  prepareShapeForRender(shape, ts, ps, chartH, yOffset = 0) {
    const result = { ...shape };
    
    // تحويل idx → x (float)
    if (result.idx != null && ts?.indexToXFloat) {
      result.x = PrecisionUtils.indexToXFloat(result.idx, ts.offset, ts.spacing);
    }
    
    // تحويل price → y (float)
    if (result.price != null && ps?.priceToYFloat) {
      result.y = PrecisionUtils.priceToYFloat(result.price, ps.min, ps.max, chartH) + yOffset;
    }
    
    // تحويل النقاط للمسارات (polylines/polygons)
    if (Array.isArray(result.points) && ts && ps) {
      result.points = result.points.map(p => ({
        x: p.idx != null ? PrecisionUtils.indexToXFloat(p.idx, ts.offset, ts.spacing) : p.x,
        y: p.price != null ? PrecisionUtils.priceToYFloat(p.price, ps.min, ps.max, chartH) + yOffset : p.y
      }));
    }
    
    return result;
  }
};

// ─────────────────────────────────────────────────────────────────────
// تهيئة الإعدادات الافتراضية
// ─────────────────────────────────────────────────────────────────────
if (typeof CFG === 'undefined') window.CFG = {};

CFG.colors = CFG.colors || {};
Object.assign(CFG.colors, {
  timer: '#0072e4',
  timerShadow: 'rgba(0, 0, 0, 0.7)',
  up: '#00e676', down: '#ff1744',
  upDim: 'rgba(0,230,118,0.18)', downDim: 'rgba(255,23,68,0.18)',
  ma20: '#f9a825', ma50: '#7c4dff',
  candle: {
    up: { body: '#00e676', wick: '#00c853', border: '#00a142', alpha: 1.0 },
    down: { body: '#ff1744', wick: '#d50000', border: '#aa0000', alpha: 1.0 }
  },
  globalAlpha: 1.0,
  signalBuy: '#2196f3',
  signalSell: '#ffd740',
  signalCounter: '#ff5252',
  backgroundImage: null,
  backgroundAlpha: 0.15,
  backgroundSize: 'cover'
});

if (!CFG.ui) CFG.ui = {};
Object.assign(CFG.ui, {
  timerOffsetX: 45, timerOffsetY: 25,
  enableTimerShadow: true, minZoomAlpha: 0.9,
  showGuideLines: { time5m: true, time1h: true, priceLevels: [] }
});

if (!CFG.zoom) CFG.zoom = {};
Object.assign(CFG.zoom, {
  pinchDamping: 0.7, maxScalePerFrame: 0.15,
  disableInertiaDuringZoom: true
});

if (!CFG.timeframes) {
  CFG.timeframes = {
    '1s': 1000, '5s': 5000, '15s': 15000, '30s': 30000,
    '1m': 60000, '2m': 120000, '3m': 180000, '5m': 300000,
    '15m': 900000, '30m': 1800000, '1h': 3600000, '2h': 7200000,
    '4h': 14400000, '6h': 21600000, '12h': 43200000, '1d': 86400000
  };
}

CFG.defaultSymbol = AppHelpers.loadPrefs('defaultSymbol', 'btcusdt');
CFG.defaultTimeframe = AppHelpers.loadPrefs('defaultTimeframe', '1m');

// ═══════════════════════════════════════════════════════════════════════
// كلاس التطبيق الرئيسي
// ═══════════════════════════════════════════════════════════════════════
class App {
  constructor() {
    try {
      this._initDOM();
      this._initComponents();
      this._initState();
      this._loadPreferences();
      this._initEventBus();
      this._initEvents();
      this._initToolbar();
      this._initSettingsPanel();
      this._initSymbolSearch();
      this._initRegisteredIndicators();
      
      requestAnimationFrame(() => {
        this._resize();
        this._startDataFeed();
        this._startRenderLoop();
        this._drawBackgroundImage();
      });
      
      this._registerGlobalControls();
      console.log('[App] ✓ Initialized with symbol:', CFG.defaultSymbol, '@', CFG.defaultTimeframe);
      console.log('[App] ✓ High-Precision Mode: Active (PrecisionUtils loaded)');
    } catch (err) {
      console.error('[App] Init failed:', err);
      this._showToast('فشل في التهيئة', 'down');
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // تهيئة عناصر الواجهة
  // ─────────────────────────────────────────────────────────────────────
  _initDOM() {
    this.mainCanvas = document.getElementById('main-canvas');
    this.overlayCanvas = document.getElementById('overlay-canvas');
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
    
    this.symbolBtn = document.getElementById('symbol-btn');
    this.symbolSearchInput = document.getElementById('symbol-search-input');
    this.symbolList = document.getElementById('symbol-list');
    this.btnIndicators = document.getElementById('btn-indicators');
    this.indicatorsDropdown = document.getElementById('indicators-dropdown');
    this.btnSettings = document.getElementById('btn-settings');
    this.settingsPanel = document.getElementById('settings-panel');
    this.chartBackground = document.getElementById('chart-background');
    
    this.colorPickers = document.querySelectorAll('.color-picker');
    this.settingSliders = document.querySelectorAll('.setting-slider');
    this.toggleSwitches = document.querySelectorAll('.toggle-switch');
    this.bgImageInput = document.getElementById('bg-image-input');
  }

  // ─────────────────────────────────────────────────────────────────────
  // تهيئة المكونات (مصححة بالكامل + دعم الدقة العالية)
  // ─────────────────────────────────────────────────────────────────────
  _initComponents() {
    // ✅ مقياس الوقت - مع دعم الإحداثيات العشرية للدقة العالية
    // ✅ مقياس الوقت - مع دعم الإحداثيات العشرية للدقة العالية
this.ts = {
  data: [],  // ← ✅ التصحيح: إضافة مفتاح 'data'
  spacing: CFG.defaultSpacing || 8,
  offset: 0,
  
  setData: function(d) { 
    this.data = d || []; 
  },
  
  scroll: function(delta, width) {
    this.offset += delta;
  },
  
  zoom: function(factor, centerX, width) {
    const old = this.spacing;
    this.spacing = CFG.clamp(old * factor, CFG.minSpacing || 1.5, CFG.maxSpacing || 60);
    const idx = (centerX - this.offset) / old;
    this.offset = centerX - idx * this.spacing;
  },
  
  xToIndex: function(x) { 
    return (x - this.offset) / this.spacing; 
  },
  
  // ✅ الجديد: إرجاع إحداثي عشري (float) - للرسم عالي الدقة
  indexToXFloat: function(i) { 
    return PrecisionUtils.indexToXFloat(i, this.offset, this.spacing); 
  },
  
  // ✅ القديم: يبقى للتوافق مع الأجزاء التي لا تحتاج دقة عالية
  indexToX: function(i) { 
    return PrecisionUtils.snapForStroke(this.indexToXFloat(i), 1); 
  },
  
  timeToIndex: function(timestamp) {
    const data = this.data;
    if (!data || data.length === 0) return null;
    
    let lo = 0, hi = data.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >>> 1;
      const t = data[mid].time;
      if (t === timestamp) return mid;
      if (t < timestamp) lo = mid + 1;
      else hi = mid - 1;
    }
    return lo < data.length ? lo : data.length - 1;
  },
  
  getVisibleRange: function(width) {
    const len = this.data?.length || 0;
    if (!len) return { start: 0, end: 0 };
    const start = ( -this.spacing * 2 - this.offset) / this.spacing;
    const end = (width + this.spacing * 2 - this.offset) / this.spacing;
    return { 
      start: Math.max(0, Math.floor(start)), 
      end: Math.min(len - 1, Math.ceil(end)) 
    };
  },
  
  setBounds: function(w) {},
  
  scrollToEnd: function(w) {
    if (!this.data.length) return;
    this.offset = w - (this.data.length - 1) * this.spacing - this.spacing * 1.5;
  }
};

    // ✅ مقياس السعر - مع دعم الإحداثيات العشرية للدقة العالية
    this.ps = {
      min: 0, max: 0,
      
      calculateRange: function(candles, start, end) {
        if (!candles?.length) { this.min = 0; this.max = 100; return; }
        let min = Infinity, max = -Infinity;
        for (let i = Math.max(0, start); i <= Math.min(candles.length - 1, end); i++) {
          const c = candles[i];
          if (c) {
            if (typeof c.low === 'number') min = Math.min(min, c.low);
            if (typeof c.high === 'number') max = Math.max(max, c.high);
          }
        }
        if (!isFinite(min) || !isFinite(max)) { min = 0; max = 100; }
        const range = max - min || 1;
        const margin = range * (CFG.priceMargin || 0.04);
        this.min = min - margin;
        this.max = max + margin;
      },
      
      // ✅ الجديد: إرجاع إحداثي عمودي عشري (float) - للرسم عالي الدقة
      priceToYFloat: function(price, height) {
        return PrecisionUtils.priceToYFloat(price, this.min, this.max, height);
      },
      
      // ✅ القديم: يبقى للتوافق مع الأجزاء التي لا تحتاج دقة عالية
      // يطبق Math.round + 0.5 للخطوط 1بكسل
      priceToY: function(price, height) {
        return PrecisionUtils.snapForStroke(this.priceToYFloat(price, height), 1);
      },
      
      yToPrice: function(y, height) {
        const r = this.max - this.min || 1;
        return this.min + ((height - y) / height) * r;
      }
    };

    // ✅ تغذية البيانات
    this.feed = new DataFeed();

    // ✅ العارض الرئيسي (مع فالبك ذكي)
    if (typeof ChartRenderer !== 'undefined') {
      this.mainR = new ChartRenderer(this.mainCanvas, this.overlayCanvas);
    } else if (typeof Renderer !== 'undefined') {
      this.mainR = new Renderer(this.mainCanvas);
    } else {
      console.warn('[App] No renderer found, using fallback');
      this.mainR = {
        resize: () => {}, clear: () => {}, drawGrid: () => {},
        drawCandles: () => {}, drawLine: () => {}, drawPriceLine: () => {},
        drawCrosshair: () => {}, drawTimer: () => {}, drawShapes: () => {}, 
        drawRects: () => {}, drawArea: () => {},
        setRefs: () => { this._glRefsSet = true; }
      };
    }

    // ✅ عوارض المحاور (مع فالبك)
    this.priceR = typeof PriceAxisRenderer !== 'undefined' 
      ? new PriceAxisRenderer(this.priceAxisCanvas) 
      : { resize: () => {}, render: () => {} };
      
    this.timeR = typeof TimeAxisRenderer !== 'undefined' 
      ? new TimeAxisRenderer(this.timeAxisCanvas) 
      : { resize: () => {}, render: () => {} };

    // ✅ القصور الذاتي المبسط
    this.inertia = {
      _vx: 0, _active: false, _lastT: 0,
      stop: function() { this._active = false; this._vx = 0; },
      isActive: function() { return this._active && Math.abs(this._vx) > 0.1; },
      startTracking: function() { this._active = true; this._lastT = performance.now(); },
      track: function(dx, t) {
        const dt = (t - this._lastT) || 16;
        this._vx = dx / dt;
        this._lastT = t;
      },
      release: function() {
        this._active = true;
        const animate = () => {
          if (!this._active || Math.abs(this._vx) < 0.05) { this.stop(); return; }
          if (window.chartApp?.ts) {
            window.chartApp.ts.scroll(this._vx * 16, window.chartApp.chartW);
            window.chartApp.dirty = true;
          }
          this._vx *= (CFG.inertia?.friction || 0.96);
          requestAnimationFrame(animate);
        };
        animate();
      },
      setChartWidth: function(w) {}
    };

    // ✅ قائمة الرموز (صحيحة لبايننس)
    this.availableSymbols = [
      { symbol: 'btcusdt', display: 'BTC/USDT', tf: '1m' },
      { symbol: 'ethusdt', display: 'ETH/USDT', tf: '1m' },
      { symbol: 'bnbusdt', display: 'BNB/USDT', tf: '1m' },
      { symbol: 'xrpusdt', display: 'XRP/USDT', tf: '1m' },
      { symbol: 'solusdt', display: 'SOL/USDT', tf: '1m' },
      { symbol: 'adausdt', display: 'ADA/USDT', tf: '1m' },
      { symbol: 'dogeusdt', display: 'DOGE/USDT', tf: '1m' }
    ];
  }

  // ─────────────────────────────────────────────────────────────────────
  // تهيئة الحالة الداخلية
  // ─────────────────────────────────────────────────────────────────────
  _initState() {
    this.candles = [];
    this.indicators = { ma: false, bb: false, vol: false, lowess: false, sr: false };
    this.registeredIndicators = {};
    this.paneIndicators = {};
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
    this.psLowess = { min: 0, max: 100, priceToY: (p, h) => h - ((p - this.min) / (this.max - this.min || 1)) * h };
    this._lowessPaneH = 150;
    this._isDraggingPane = false;
    this._eventUnsubs = [];
    this.indicatorUpdateRate = 100;
    this._lastIndicatorUpdate = 0;
    this._indicatorCache = new Map();
    this._indicatorCacheTTL = 5000;
    this._smoothedLowessHeight = 150;
    this._smoothedPaneHeights = new Map();
    this._signals = [];
    this._gaps = [];
    this._lastSignalCheck = 0;
    this._signalCheckInterval = 500;
    this.prefs = {
      candleColors: { ...CFG.colors.candle },
      guideLines: { ...CFG.ui.showGuideLines },
      background: { image: CFG.colors.backgroundImage, alpha: CFG.colors.backgroundAlpha, size: CFG.colors.backgroundSize }
    };
    this._showSignals = true;
  }

  // ─────────────────────────────────────────────────────────────────────
  // تحميل تفضيلات المستخدم
  // ─────────────────────────────────────────────────────────────────────
  _loadPreferences() {
    const savedColors = AppHelpers.loadPrefs('candleColors');
    if (savedColors) { CFG.colors.candle = { ...CFG.colors.candle, ...savedColors }; this.prefs.candleColors = { ...CFG.colors.candle }; }
    const savedGuides = AppHelpers.loadPrefs('guideLines');
    if (savedGuides) { CFG.ui.showGuideLines = { ...CFG.ui.showGuideLines, ...savedGuides }; this.prefs.guideLines = { ...CFG.ui.showGuideLines }; }
    const savedBg = AppHelpers.loadPrefs('background');
    if (savedBg) { CFG.colors.backgroundImage = savedBg.image; CFG.colors.backgroundAlpha = savedBg.alpha; CFG.colors.backgroundSize = savedBg.size; this.prefs.background = { ...savedBg }; }
    if (CFG.defaultSymbol && CFG.defaultTimeframe) { this._updateSymbolDisplay(CFG.defaultSymbol); }
  }

  // ─────────────────────────────────────────────────────────────────────
  // تسجيل واجهة التحكم العالمية
  // ─────────────────────────────────────────────────────────────────────
  _registerGlobalControls() {
    window.ChartControls = {
      setIndicatorRate: (ms) => { if (window.chartApp?.setIndicatorUpdateRate) { window.chartApp.setIndicatorUpdateRate(ms); return true; } return false; },
      setColors: (newColors) => { if (CFG.colors) { Object.assign(CFG.colors, newColors); if (window.chartApp) { window.chartApp.dirty = true; window.chartApp._drawBackgroundImage(); } return true; } return false; },
      setZoomLimits: (min, max) => { CFG.minSpacing = min; CFG.maxSpacing = max; return true; },
      toggleTimerShadow: (enable) => { CFG.ui.enableTimerShadow = enable; if (window.chartApp) window.chartApp.dirty = true; return true; },
      setTimerOffset: (x, y) => { CFG.ui.timerOffsetX = x; CFG.ui.timerOffsetY = y; if (window.chartApp) window.chartApp.dirty = true; return true; },
      toggleSignals: (enabled) => { if (window.chartApp) { window.chartApp._showSignals = enabled; window.chartApp.dirty = true; return true; } return false; },
      setGuideLines: (config) => { if (CFG.ui.showGuideLines) { Object.assign(CFG.ui.showGuideLines, config); if (window.chartApp) window.chartApp.dirty = true; return true; } return false; }
    };
    console.log('[App] ✓ Global controls registered: window.ChartControls');
  }

  // ─────────────────────────────────────────────────────────────────────
  // تهيئة المؤشرات المسجلة ديناميكياً
  // ─────────────────────────────────────────────────────────────────────
  _initRegisteredIndicators() {
    if (typeof window.IndicatorRegistry === 'undefined') { console.log('[App] IndicatorRegistry not found'); return; }
    for (const [id, plugin] of Object.entries(window.IndicatorRegistry.plugins)) {
      this.registeredIndicators[id] = { enabled: AppHelpers.loadPrefs(`ind_${id}_enabled`, false), hidden: AppHelpers.loadPrefs(`ind_${id}_hidden`, false), ...plugin };
      if (plugin.button?.label) this._createIndicatorButton(id, plugin);
    }
    window.IndicatorRegistry.markInitialized();
    console.log(`[App] Loaded ${Object.keys(this.registeredIndicators).length} dynamic indicators`);
  }

  _createIndicatorButton(id, plugin) {
    if (!plugin?.button?.label) return;
    const existingBtn = document.getElementById(`btn-${id}`);
    if (existingBtn) return;
    const btn = document.createElement('button');
    btn.id = `btn-${id}`;
    btn.className = 'tb-btn indicator';
    btn.textContent = plugin.button.label;
    btn.title = plugin.button.title || plugin.name || id;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.registeredIndicators[id]) {
        this.registeredIndicators[id].enabled = !this.registeredIndicators[id].enabled;
        btn.classList.toggle('active', this.registeredIndicators[id].enabled);
        AppHelpers.savePrefs(`ind_${id}_enabled`, this.registeredIndicators[id].enabled);
        this._cachedIndicators = null;
        this._indicatorCache.delete(id);
        this.dirty = true;
      }
    });
    if (this.indicatorsDropdown) {
      const item = document.createElement('div');
      item.className = 'indicator-item';
      item.innerHTML = `<input type="checkbox" id="chk-${id}" ${this.registeredIndicators[id].enabled ? 'checked' : ''}><label for="chk-${id}">${plugin.button.label}</label><div class="indicator-controls"><button class="hide-btn" title="إخفاء/إظهار" data-action="toggle">${this.registeredIndicators[id].hidden ? '👁️' : '👁️‍🗨️'}</button><button class="delete-btn" title="حذف" data-action="delete">🗑️</button></div>`;
      item.querySelector(`#chk-${id}`).addEventListener('change', (e) => { this.registeredIndicators[id].enabled = e.target.checked; btn.classList.toggle('active', e.target.checked); AppHelpers.savePrefs(`ind_${id}_enabled`, e.target.checked); this._cachedIndicators = null; this._indicatorCache.delete(id); this.dirty = true; });
      item.querySelector('.hide-btn').addEventListener('click', (e) => { e.stopPropagation(); this.registeredIndicators[id].hidden = !this.registeredIndicators[id].hidden; e.target.textContent = this.registeredIndicators[id].hidden ? '👁️' : '👁️‍🗨️'; e.target.classList.toggle('active', this.registeredIndicators[id].hidden); AppHelpers.savePrefs(`ind_${id}_hidden`, this.registeredIndicators[id].hidden); this.dirty = true; });
      item.querySelector('.delete-btn').addEventListener('click', (e) => { e.stopPropagation(); if (confirm(`حذف المؤشر "${plugin.button.label}"؟`)) { btn.remove(); item.remove(); delete this.registeredIndicators[id]; this._indicatorCache.delete(id); this._cachedIndicators = null; this.dirty = true; } });
      this.indicatorsDropdown.appendChild(item);
    }
    const toolbarGroup = document.querySelector('.toolbar-group:nth-child(2)');
    if (toolbarGroup) {
      if (plugin.button.position === 'end') toolbarGroup.appendChild(btn);
      else if (plugin.button.position === 'after-vol' && this.btnVOL) this.btnVOL.after(btn);
      else if (plugin.button.position === 'after-sr' && this.btnSR) this.btnSR.after(btn);
      else { const sep = toolbarGroup.querySelector('.tb-sep'); if (sep) sep.before(btn); else toolbarGroup.appendChild(btn); }
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // نظام الأحداث
  // ─────────────────────────────────────────────────────────────────────
  _initEventBus() {
    const safe = fn => { try { return fn(); } catch(e) { console.error('[App] EventBus:', e); } };
    this._eventUnsubs.push(bus.on('candles:updated', c => safe(() => { this.candles = c; this.ts.setData(c); if (this.firstLoad && c.length) { this.ts.scrollToEnd(this.chartW); this.firstLoad = false; } this._cachedIndicators = null; this._indicatorCache.clear(); if (typeof Indicators !== 'undefined' && Indicators.clearCache) Indicators.clearCache(); this.dirty = true; this._checkForSignals(); })));
    this._eventUnsubs.push(bus.on('price', p => safe(() => { this._updatePriceUI(p); this.dirty = true; })));
    this._eventUnsubs.push(bus.on('ticker24h', d => safe(() => { const pct = d.change || 0; const up = pct >= 0; this.priceChange.textContent = `${up ? '+' : ''}${pct.toFixed(2)}%`; this.priceChange.style.color = up ? (CFG?.colors?.up || '#00e676') : (CFG?.colors?.down || '#ff1744'); this.priceChange.style.background = up ? (CFG?.colors?.upDim || 'rgba(0,230,118,0.18)') : (CFG?.colors?.downDim || 'rgba(255,23,68,0.18)'); })));
    this._eventUnsubs.push(bus.on('status', s => safe(() => { if (s === 'loading') { if (this.loadingOverlay) this.loadingOverlay.style.display = 'flex'; if (this.liveDot) this.liveDot.className = 'live-dot'; if (this.connText) this.connText.textContent = '...'; } else if (s === 'connecting') { if (this.liveDot) this.liveDot.className = 'live-dot'; if (this.connText) this.connText.textContent = 'ربط...'; } else if (s === 'connected') { if (this.loadingOverlay) this.loadingOverlay.classList.add('hidden'); if (this.liveDot) this.liveDot.className = 'live-dot ok'; if (this.connText) this.connText.textContent = 'LIVE'; } else if (s === 'disconnected') { if (this.liveDot) this.liveDot.className = 'live-dot'; if (this.connText) this.connText.textContent = 'Reconnect...'; } else if (s === 'error') { if (this.loadingOverlay) this.loadingOverlay.style.display = 'none'; this._showToast('فشل الاتصال', 'down'); } })));
    this._eventUnsubs.push(bus.on('feed:reset', () => safe(() => { this.candles = []; this.firstLoad = true; this.dirty = true; this._cachedIndicators = null; this._indicatorCache.clear(); this._signals = []; this._gaps = []; if (this.loadingOverlay) this.loadingOverlay.style.display = 'flex'; })));
    this._eventUnsubs.push(bus.on('indicator:registered', ({ id, plugin }) => { this.registeredIndicators[id] = { enabled: false, hidden: false, ...plugin }; this._createIndicatorButton(id, plugin); this._cachedIndicators = null; this._indicatorCache.delete(id); this.dirty = true; }));
  }

  // ─────────────────────────────────────────────────────────────────────
  // أحداث الواجهة
  // ─────────────────────────────────────────────────────────────────────
  _initEvents() {
    const mc = this.mainCanvas;
    if (!mc) return;
    const isOverPaneDivider = (mouseY) => {
      if (this.indicators.lowess) { const lowessTop = this.chartH - this._smoothedLowessHeight; if (Math.abs(mouseY - lowessTop) <= 8) return { type: 'lowess', topY: lowessTop }; }
      for (const [id, pane] of Object.entries(this.paneIndicators)) { const plugin = this.registeredIndicators[id]; if (plugin?.enabled && !plugin.hidden && plugin.settings?.separatePane) { const paneTop = pane.yOffset; if (Math.abs(mouseY - paneTop) <= 8) return { type: 'dynamic', id, topY: paneTop, plugin }; } }
      return null;
    };
    mc.addEventListener('mousedown', e => {
      if (e.button !== 0) return;
      const r = mc.getBoundingClientRect();
      const mouseY = e.clientY - r.top;
      const divider = isOverPaneDivider(mouseY);
      if (divider) { this._isDraggingPane = true; this.activeDragPaneId = divider.id || 'lowess'; this.dragStartY = mouseY; this.dragStartHeight = divider.id ? this.paneIndicators[divider.id]?.height : this._lowessPaneH; mc.style.cursor = 'row-resize'; e.preventDefault(); return; }
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
        if (this.activeDragPaneId === 'lowess') { let newH = this.dragStartHeight - dy; newH = Math.max(50, Math.min(newH, this.chartH * 0.5)); this._lowessPaneH = newH; }
        else { const pane = this.paneIndicators[this.activeDragPaneId]; if (pane) { let newH = this.dragStartHeight - dy; newH = Math.max(50, Math.min(newH, this.chartH * 0.5)); pane.height = newH; if (this.registeredIndicators[this.activeDragPaneId]?.settings?.paneHeight) this.registeredIndicators[this.activeDragPaneId].settings.paneHeight.value = newH; } }
        this.dirty = true;
        return;
      }
      const divider = isOverPaneDivider(mouseY);
      if (divider && !this.drag.active) mc.style.cursor = 'row-resize';
      else if (!this.drag.active) mc.style.cursor = 'crosshair';
      this.crosshair = { x: mouseX, y: mouseY, active: true };
      if (this.drag.active) { this.ts.scroll(e.clientX - this.drag.lastX, this.chartW); this.drag.lastX = e.clientX; }
      this.dirty = true;
    });
    window.addEventListener('mouseup', () => {
      if (this._isDraggingPane) { this._isDraggingPane = false; this.activeDragPaneId = null; if (mc) mc.style.cursor = 'crosshair'; return; }
      if (this.drag.active) { this.drag.active = false; if (mc) mc.style.cursor = 'crosshair'; }
    });
    mc.addEventListener('mouseleave', () => { this.crosshair.active = false; if (!this._isDraggingPane && mc) mc.style.cursor = 'default'; this.dirty = true; });
    mc.addEventListener('wheel', e => { e.preventDefault(); this.inertia.stop(); this.ts.zoom(e.deltaY > 0 ? 0.9 : 1.1, this.crosshair.x, this.chartW); this.dirty = true; }, { passive: false });
    mc.addEventListener('touchstart', e => {
      e.preventDefault();
      this.inertia.stop();
      const t = e.touches, r = mc.getBoundingClientRect();
      if (t.length === 1) {
        const touchY = t[0].clientY - r.top, touchX = t[0].clientX - r.left;
        const divider = isOverPaneDivider(touchY);
        if (divider) { this._isDraggingPane = true; this.activeDragPaneId = divider.id || 'lowess'; this.dragStartY = touchY; this.dragStartHeight = divider.id ? this.paneIndicators[divider.id]?.height : this._lowessPaneH; this.dirty = true; return; }
        this.drag = { active: true, lastX: touchX };
        this.crosshair = { x: touchX, y: touchY, active: true };
        this.inertia.startTracking();
      } else if (t.length === 2) {
        this.drag.active = false;
        this.pinch = { active: true, dist: Math.hypot(t[1].clientX - t[0].clientX, t[1].clientY - t[0].clientY), cx: (t[0].clientX + t[1].clientX) / 2 - r.left, sp: this.ts.spacing };
      }
      this.dirty = true;
    }, { passive: false });
    mc.addEventListener('touchmove', e => {
      e.preventDefault();
      const t = e.touches, r = mc.getBoundingClientRect();
      if (t.length === 1 && this._isDraggingPane && this.activeDragPaneId) {
        const touchY = t[0].clientY - r.top, dy = touchY - this.dragStartY;
        if (this.activeDragPaneId === 'lowess') { let newH = this.dragStartHeight - dy; newH = Math.max(50, Math.min(newH, this.chartH * 0.5)); this._lowessPaneH = newH; }
        else { const pane = this.paneIndicators[this.activeDragPaneId]; if (pane) { let newH = this.dragStartHeight - dy; newH = Math.max(50, Math.min(newH, this.chartH * 0.5)); pane.height = newH; if (this.registeredIndicators[this.activeDragPaneId]?.settings?.paneHeight) this.registeredIndicators[this.activeDragPaneId].settings.paneHeight.value = newH; } }
        this.dirty = true;
        return;
      }
      if (t.length === 1) { if (this.drag.active) { this.ts.scroll(t[0].clientX - this.drag.lastX, this.chartW); this.inertia.track(t[0].clientX - this.drag.lastX, performance.now()); this.drag.lastX = t[0].clientX; this.crosshair.x = t[0].clientX - r.left; this.crosshair.y = t[0].clientY - r.top; } }
      else if (t.length === 2 && this.pinch.active) {
        const nd = Math.hypot(t[1].clientX - t[0].clientX, t[1].clientY - t[0].clientY);
        const maxScaleChange = CFG.zoom?.maxScalePerFrame || 0.15;
        let rawScale = nd / this.pinch.dist;
        rawScale = Math.max(1 - maxScaleChange, Math.min(1 + maxScaleChange, rawScale));
        const damping = CFG.zoom?.pinchDamping || 0.7;
        const smoothedScale = 1 + (rawScale - 1) * damping;
        const ns = Math.max(CFG.minSpacing || 1.5, Math.min(CFG.maxSpacing || 60, this.pinch.sp * smoothedScale));
        const cx = (t[0].clientX + t[1].clientX) / 2 - r.left;
        const ci = this.ts.xToIndex(this.pinch.cx);
        this.ts.spacing = ns;
        this.ts.offset = cx - ci * ns;
        this.pinch.dist = nd;
        this.pinch.sp = ns;
        if (CFG.zoom?.disableInertiaDuringZoom && this.inertia?.isActive?.()) this.inertia.stop();
      }
      this.dirty = true;
    }, { passive: false });
    mc.addEventListener('touchend', e => {
      e.preventDefault();
      if (this._isDraggingPane) { this._isDraggingPane = false; this.activeDragPaneId = null; }
      if (e.touches.length === 0) { if (this.drag.active && !this.pinch.active) this.inertia.release(); this.drag.active = false; this.pinch.active = false; this.crosshair.active = false; }
      else if (e.touches.length === 1) { this.pinch.active = false; this.drag = { active: true, lastX: e.touches[0].clientX }; this.inertia.startTracking(); }
      this.dirty = true;
    }, { passive: false });
    window.addEventListener('resize', () => { clearTimeout(this.resizeTimer); this.resizeTimer = setTimeout(() => { this._resize(); this.dirty = true; }, 150); });
    document.body.addEventListener('touchmove', e => e.preventDefault(), { passive: false });
    document.addEventListener('click', (e) => {
      if (this.indicatorsDropdown?.classList.contains('show') && !this.btnIndicators?.contains(e.target) && !this.indicatorsDropdown.contains(e.target)) this.indicatorsDropdown.classList.remove('show');
      if (this.symbolList?.classList.contains('show') && !this.symbolSearchInput?.contains(e.target) && !this.symbolList.contains(e.target)) this.symbolList.classList.remove('show');
      if (this.settingsPanel?.classList.contains('show') && !this.btnSettings?.contains(e.target) && !this.settingsPanel.contains(e.target)) this.settingsPanel.classList.remove('show');
    });
  }

  // ─────────────────────────────────────────────────────────────────────
  // شريط الأدوات
  // ─────────────────────────────────────────────────────────────────────
  _initToolbar() {
    this.tfButtons.forEach(b => b.addEventListener('click', () => {
      this.tfButtons.forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      const tf = b.dataset.tf;
      this.feed?.changeConfig?.(this.feed.symbol, tf);
      AppHelpers.savePrefs('defaultTimeframe', tf);
      this._cachedIndicators = null;
      this._indicatorCache.clear();
      this.dirty = true;
    }));
    const toggleIndicator = (btn, key) => { btn?.addEventListener('click', () => { this.indicators[key] = !this.indicators[key]; btn.classList.toggle('active', this.indicators[key]); this._cachedIndicators = null; this.dirty = true; }); };
    toggleIndicator(this.btnMA, 'ma');
    toggleIndicator(this.btnBB, 'bb');
    toggleIndicator(this.btnVOL, 'vol');
    toggleIndicator(this.btnLOWESS, 'lowess');
    toggleIndicator(this.btnSR, 'sr');
    if (this.btnIndicators && this.indicatorsDropdown) {
      this.btnIndicators.replaceWith(this.btnIndicators.cloneNode(true));
      this.btnIndicators = document.getElementById('btn-indicators');
      this.btnIndicators.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); this._closeAllDropdowns(); const isShown = this.indicatorsDropdown.classList.toggle('show'); this.btnIndicators.classList.toggle('active', isShown); });
      document.addEventListener('click', (e) => { if (!this.btnIndicators.contains(e.target) && !this.indicatorsDropdown.contains(e.target)) { this.indicatorsDropdown.classList.remove('show'); this.btnIndicators.classList.remove('active'); } });
    }
    if (this.btnSettings && this.settingsPanel) {
      this.btnSettings.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); this._closeAllDropdowns(); this.settingsPanel.classList.toggle('show'); this.btnSettings.classList.toggle('active', this.settingsPanel.classList.contains('show')); });
    }
    if (this.symbolBtn && this.symbolList) {
      this.symbolBtn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); this._closeAllDropdowns(); this._populateSymbolList(); this.symbolList.classList.toggle('show'); this.symbolBtn.classList.toggle('active', this.symbolList.classList.contains('show')); });
    }
  }

  _closeAllDropdowns() {
    if (this.indicatorsDropdown?.classList.contains('show')) { this.indicatorsDropdown.classList.remove('show'); this.btnIndicators?.classList.remove('active'); }
    if (this.symbolList?.classList.contains('show')) { this.symbolList.classList.remove('show'); this.symbolBtn?.classList.remove('active'); }
    if (this.settingsPanel?.classList.contains('show')) { this.settingsPanel.classList.remove('show'); this.btnSettings?.classList.remove('active'); }
  }

  // ─────────────────────────────────────────────────────────────────────
  // شريط البحث والرموز
  // ─────────────────────────────────────────────────────────────────────
  _initSymbolSearch() {
    if (!this.symbolSearchInput || !this.symbolList) return;
    this.symbolSearchInput.addEventListener('input', (e) => {
      const query = e.target.value.toLowerCase();
      const items = this.symbolList.querySelectorAll('.symbol-item');
      items.forEach(item => { const text = item.textContent.toLowerCase(); item.style.display = text.includes(query) ? 'flex' : 'none'; });
    });
    this.symbolList.addEventListener('click', (e) => {
      const item = e.target.closest('.symbol-item');
      if (!item) return;
      const symbol = item.dataset.symbol, tf = item.dataset.tf || '1m';
      this._changeSymbol(symbol, tf);
      this.symbolList.classList.remove('show');
      this.symbolSearchInput.value = '';
    });
  }
  
  _populateSymbolList() {
    if (!this.symbolList) return;
    this.symbolList.innerHTML = '';
    this.availableSymbols.forEach(sym => {
      const item = document.createElement('div');
      item.className = `symbol-item${sym.symbol === this.feed?.symbol ? ' active' : ''}`;
      item.dataset.symbol = sym.symbol;
      item.dataset.tf = sym.tf;
      item.innerHTML = `<span>${sym.display}</span><span class="tf-badge">${sym.tf}</span>`;
      this.symbolList.appendChild(item);
    });
  }
  
  _changeSymbol(symbol, timeframe = '1m') {
    const binanceSymbol = symbol.replace('_otc', '').toLowerCase();
    this.feed?.changeConfig?.(binanceSymbol, timeframe);
    this._updateSymbolDisplay(symbol);
    AppHelpers.savePrefs('defaultSymbol', symbol);
    AppHelpers.savePrefs('defaultTimeframe', timeframe);
    this.tfButtons.forEach(b => b.classList.toggle('active', b.dataset.tf === timeframe));
    this._showToast(`تم التبديل إلى ${symbol}`, 'info');
  }
  
  _updateSymbolDisplay(symbol) {
    const display = symbol.toUpperCase().replace('USDT', '/USDT').replace('OTC', '/OTC');
    if (this.symbolBtn) this.symbolBtn.textContent = display;
  }

  // ─────────────────────────────────────────────────────────────────────
  // لوحة الإعدادات
  // ─────────────────────────────────────────────────────────────────────
  _initSettingsPanel() {
    if (!this.settingsPanel) return;
    this.colorPickers.forEach(picker => {
      const setting = picker.dataset.setting;
      if (!setting) return;
      const path = setting.split('.');
      let val = CFG.colors;
      for (const p of path) val = val?.[p];
      if (val) picker.value = val;
      picker.addEventListener('input', (e) => {
        let obj = CFG.colors;
        for (let i = 0; i < path.length - 1; i++) { if (!obj[path[i]]) obj[path[i]] = {}; obj = obj[path[i]]; }
        obj[path[path.length - 1]] = e.target.value;
        AppHelpers.savePrefs('candleColors', CFG.colors.candle);
        this.prefs.candleColors = { ...CFG.colors.candle };
        this.dirty = true;
      });
    });
    this.settingSliders.forEach(slider => {
      const setting = slider.dataset.setting;
      if (!setting) return;
      const valueEl = document.getElementById(`${setting.replace(/\./g, '-')}-value`);
      let val = CFG.colors;
      const path = setting.split('.');
      for (const p of path) val = val?.[p];
      if (val != null) { slider.value = val; if (valueEl) valueEl.textContent = `${Math.round(val * 100)}%`; }
      slider.addEventListener('input', (e) => {
        const numVal = parseFloat(e.target.value);
        let obj = CFG.colors;
        for (let i = 0; i < path.length - 1; i++) { if (!obj[path[i]]) obj[path[i]] = {}; obj = obj[path[i]]; }
        obj[path[path.length - 1]] = numVal;
        if (valueEl) valueEl.textContent = `${Math.round(numVal * 100)}%`;
        AppHelpers.savePrefs('background', this.prefs.background);
        this._drawBackgroundImage();
        this.dirty = true;
      });
    });
    this.toggleSwitches.forEach(toggle => {
      const setting = toggle.dataset.setting;
      if (!setting) return;
      const path = setting.split('.');
      let val = CFG.ui?.showGuideLines;
      for (const p of path) val = val?.[p];
      if (val != null) toggle.classList.toggle('active', val);
      toggle.addEventListener('click', () => {
        toggle.classList.toggle('active');
        const isActive = toggle.classList.contains('active');
        let obj = CFG.ui.showGuideLines;
        for (let i = 0; i < path.length - 1; i++) { if (!obj[path[i]]) obj[path[i]] = {}; obj = obj[path[i]]; }
        obj[path[path.length - 1]] = isActive;
        AppHelpers.savePrefs('guideLines', CFG.ui.showGuideLines);
        this.prefs.guideLines = { ...CFG.ui.showGuideLines };
        this.dirty = true;
      });
    });
    const toggleSignalsBtn = document.getElementById('toggle-signals');
    if (toggleSignalsBtn) {
      toggleSignalsBtn.classList.toggle('active', this._showSignals !== false);
      toggleSignalsBtn.addEventListener('click', () => { toggleSignalsBtn.classList.toggle('active'); this._showSignals = toggleSignalsBtn.classList.contains('active'); this.dirty = true; });
    }
    const bgSizeSelect = document.getElementById('bg-size-select');
    if (bgSizeSelect) {
      bgSizeSelect.value = CFG.colors?.backgroundSize || 'cover';
      bgSizeSelect.addEventListener('change', (e) => { CFG.colors.backgroundSize = e.target.value; this.prefs.background.size = e.target.value; AppHelpers.savePrefs('background', this.prefs.background); this._drawBackgroundImage(); this.dirty = true; });
    }
    this.bgImageInput?.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (evt) => { CFG.colors.backgroundImage = evt.target.result; this.prefs.background.image = evt.target.result; AppHelpers.savePrefs('background', this.prefs.background); this._drawBackgroundImage(); this.dirty = true; this._showToast('تم تحميل الخلفية', 'info'); };
      reader.readAsDataURL(file);
    });
  }

  _drawBackgroundImage() {
    if (!this.chartBackground) return;
    const url = CFG.colors?.backgroundImage, alpha = CFG.colors?.backgroundAlpha ?? 0.15, size = CFG.colors?.backgroundSize || 'cover';
    if (!url) { this.chartBackground.style.display = 'none'; return; }
    this.chartBackground.style.display = 'block';
    this.chartBackground.style.backgroundImage = `url(${url})`;
    this.chartBackground.style.opacity = alpha;
    this.chartBackground.style.backgroundSize = size;
    this.chartBackground.style.backgroundPosition = 'center';
    this.chartBackground.style.backgroundRepeat = 'no-repeat';
    this.chartBackground.classList.remove('contain', 'custom-size');
    if (size === 'contain') this.chartBackground.classList.add('contain');
    else if (typeof size === 'object') this.chartBackground.classList.add('custom-size');
  }

  // ─────────────────────────────────────────────────────────────────────
  // تغيير الحجم
  // ─────────────────────────────────────────────────────────────────────
  _resize() {
    try {
      const wr = document.getElementById('canvas-wrapper');
      if (!wr) return;
      const rect = wr.getBoundingClientRect();
      const ap = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--axis-price-w')) || 72;
      const at = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--axis-time-h')) || 28;
      this.chartW = Math.max(200, rect.width - ap);
      this.chartH = Math.max(200, rect.height - at);
      if (this.mainR) {
        this.mainR.resize(this.chartW, this.chartH);
        if (this.mainR.setRefs && !this._glRefsSet) { this.mainR.setRefs(this.ts, this.ps); this._glRefsSet = true; }
      }
      this.priceR?.resize?.(ap, this.chartH);
      this.timeR?.resize?.(this.chartW, at);
      this.inertia?.setChartWidth?.(this.chartW);
      this.ts?.setBounds?.(this.chartW);
      this._drawBackgroundImage();
    } catch (e) { console.warn('[App] Resize:', e); }
  }

  // ─────────────────────────────────────────────────────────────────────
  // حساب المؤشرات مع الكاش
  // ─────────────────────────────────────────────────────────────────────
  _getIndicators() {
    const len = this.candles?.length || 0;
    if (!len) return null;
    const now = performance.now();
    const shouldRecalculate = (now - this._lastIndicatorUpdate) >= this.indicatorUpdateRate;
    if (!shouldRecalculate && this._cachedIndicators?.len === len && this._cachedIndicators.flags === this._indFlags()) {
      const cacheValid = Array.from(this._indicatorCache.entries()).every(([id, entry]) => now - entry.timestamp < this._indicatorCacheTTL);
      if (cacheValid) return this._cachedIndicators.values;
    }
    try {
      const closes = this.candles.map(c => c?.close ?? 0), vols = this.candles.map(c => c?.volume ?? 0), vals = {};
      if (typeof Indicators !== 'undefined') {
        if (this.indicators.ma) { vals.ma20 = Indicators.sma?.(closes, 20); vals.ma50 = Indicators.ema?.(closes, 50); }
        if (this.indicators.bb) { vals.bb = Indicators.bollingerBands?.(closes, 20, 2); }
        if (this.indicators.vol) { vals.volMA = Indicators.volumeMA?.(vols, 20); }
        if (this.indicators.lowess) { vals.lowess = Indicators.lowessRsi2Strategy?.(this.candles); }
        if (this.indicators.sr) { vals.sr = Indicators.supportResistancePro?.(this.candles, { sensitivity: 10, maxLevels: 5 }); }
      }
      if (Object.keys(this.registeredIndicators).length > 0) {
        for (const [id, plugin] of Object.entries(this.registeredIndicators)) {
          if (plugin.enabled && !plugin.hidden && typeof plugin.calculate === 'function') {
            try {
              const cached = this._indicatorCache.get(id);
              if (cached && cached.len === len && now - cached.timestamp < this._indicatorCacheTTL) { vals[id] = cached.data; continue; }
              const result = plugin.calculate(this.candles, plugin.settings || {});
              this._indicatorCache.set(id, { data: result, timestamp: now, len });
              vals[id] = result;
            } catch (err) { console.error(`[App] Error calculating indicator "${id}":`, err); vals[id] = null; }
          }
        }
      }
      if (shouldRecalculate) this._lastIndicatorUpdate = now;
      this._cachedIndicators = { len, flags: this._indFlags(), values: vals };
      return vals;
    } catch (e) { console.error('[App] _getIndicators error:', e); return null; }
  }
  
  _indFlags() {
    let dynamicFlags = '';
    for (const [id, plugin] of Object.entries(this.registeredIndicators)) { dynamicFlags += `${id}:${plugin.enabled ? 1 : 0}:${plugin.hidden ? 1 : 0};`; }
    return `${this.indicators.ma}${this.indicators.bb}${this.indicators.vol}${this.indicators.lowess}${this.indicators.sr}|${dynamicFlags}`;
  }

  setIndicatorUpdateRate(rateMs) { this.indicatorUpdateRate = Math.max(50, Math.min(1000, rateMs)); }
  _clearIndicatorCache() { this._indicatorCache.clear(); this._cachedIndicators = null; this._lastIndicatorUpdate = 0; }
  _smoothPaneHeights() {
    const smoothFactor = 0.15;
    if (this.indicators.lowess) this._smoothedLowessHeight += (this._lowessPaneH - this._smoothedLowessHeight) * smoothFactor;
    for (const [id, plugin] of Object.entries(this.registeredIndicators)) {
      if (plugin.enabled && !plugin.hidden && plugin.settings?.separatePane) {
        const targetH = plugin.settings.paneHeight?.value ?? plugin.settings.paneHeight ?? 120;
        if (!this._smoothedPaneHeights.has(id)) this._smoothedPaneHeights.set(id, targetH);
        const current = this._smoothedPaneHeights.get(id);
        this._smoothedPaneHeights.set(id, current + (targetH - current) * smoothFactor);
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // فحص الإشارات
  // ─────────────────────────────────────────────────────────────────────
  _checkForSignals() {
    if (!this.candles?.length || typeof Indicators === 'undefined' || !Indicators.generateSignals) return;
    const now = performance.now();
    if (now - this._lastSignalCheck < this._signalCheckInterval) return;
    this._lastSignalCheck = now;
    const closes = this.candles.map(c => c?.close ?? 0);
    const hma = Indicators.hma?.(closes, 9);
    this._signals = Indicators.generateSignals?.(this.candles, { hma }, { hmaPeriod: 9, minConfidence: 0.65, requireGapTouch: true, gapOptions: { minGapPercent: 0.001 } }) || [];
    this._gaps = Indicators.detectGaps?.(this.candles, { minGapPercent: 0.001 }) || [];
    this.dirty = true;
  }

  // ─────────────────────────────────────────────────────────────────────
  // العداد التنازلي
  // ─────────────────────────────────────────────────────────────────────
  _updateTimer() {
    if (!this.candles?.length || !this.feed?.interval) return;
    const last = this.candles[this.candles.length - 1];
    const now = Date.now();
    const tfMap = CFG.timeframes;
    const duration = tfMap[this.feed.interval] || 60000;
    const candleStart = Math.floor(last.time / duration) * duration;
    const remaining = (candleStart + duration) - now;
    let totalPaneHeight = this.indicators.lowess ? this._smoothedLowessHeight : 0;
    for (const [id, plugin] of Object.entries(this.registeredIndicators)) { if (plugin.enabled && !plugin.hidden && plugin.settings?.separatePane) totalPaneHeight += this._smoothedPaneHeights.get(id) ?? (plugin.settings.paneHeight?.value ?? 120); }
    const mainH = this.chartH - totalPaneHeight;
    let timeStr = '';
    if (remaining > 0) {
      const totalSec = Math.floor(remaining / 1000);
      if (duration <= 60000) { const m = Math.floor(totalSec / 60), s = totalSec % 60; timeStr = `${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`; }
      else if (duration <= 3600000) { const h = Math.floor(totalSec / 3600), m = Math.floor((totalSec % 3600) / 60), s = totalSec % 60; timeStr = `${h}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`; }
      else { const h = Math.floor(totalSec / 3600), m = Math.floor((totalSec % 3600) / 60); timeStr = `${h}h ${m.toString().padStart(2,'0')}m`; }
    }
    if (remaining <= 500 || !this.mainR?.drawTimer) { if (this.timerBadge) this.timerBadge.style.display = 'none'; return; }
    
    // ✅ استخدام الإحداثيات العشرية للرسم الدقيق للعداد
    const lastIdx = this.candles.length - 1;
    const lastX = this.ts.indexToXFloat(lastIdx); // ← Float for precision
    const lastY = this.ps.priceToYFloat(last.close, mainH); // ← Float for precision
    
    const timerOffsetX = CFG.ui?.timerOffsetX || 45, timerOffsetY = CFG.ui?.timerOffsetY || 25;
    let drawX = lastX + timerOffsetX, drawY = lastY - timerOffsetY;
    
    // تطبيق التقريب فقط عند تحديد موضع الرسم النهائي (ليس عند الحساب)
    drawX = PrecisionUtils.snapForStroke(drawX, 1);
    drawY = PrecisionUtils.snapForStroke(drawY, 1);
    
    if (drawX + 70 > this.chartW - 10) drawX = lastX - 90;
    if (drawY < 30) drawY = lastY + 35;
    if (drawY > mainH - 30) drawY = mainH - 30;
    
    this.mainR.drawTimer?.(timeStr, drawX, drawY, CFG?.colors?.timer || '#4da6ff', 11);
    if (this.timerBadge) this.timerBadge.style.display = 'none';
  }

  // ─────────────────────────────────────────────────────────────────────
  // حلقة الرسم الرئيسية
  // ─────────────────────────────────────────────────────────────────────
  _render() {
    try {
      const bufferFlushed = this.feed?.flushBuffer?.() || false;
      const isAnimating = this.inertia?.isActive?.() || false;
      if (!this.dirty && !bufferFlushed && !isAnimating) { this._updateTimer(); this.rafId = requestAnimationFrame(() => this._loop()); return; }
      if (!this.candles?.length) { this.mainR?.clear?.(); this.rafId = requestAnimationFrame(() => this._loop()); return; }
      this.dirty = false;
      const { chartW: w, ts, ps, candles } = this;
      if (!ts || !ps) { this.rafId = requestAnimationFrame(() => this._loop()); return; }
      const vr = ts.getVisibleRange(w);
      this._smoothPaneHeights();
      let totalPaneHeight = 0;
      if (this.indicators.lowess) totalPaneHeight += this._smoothedLowessHeight;
      for (const [id, plugin] of Object.entries(this.registeredIndicators)) { if (plugin.enabled && !plugin.hidden && plugin.settings?.separatePane) { const paneH = this._smoothedPaneHeights.get(id) ?? (plugin.settings.paneHeight?.value ?? 120); totalPaneHeight += paneH; if (!this.paneIndicators[id]) this.paneIndicators[id] = { height: paneH, ps: { min: 0, max: 100, priceToY: (p, h) => h - ((p - this.min) / (this.max - this.min || 1)) * h }, yOffset: 0 }; else this.paneIndicators[id].height = paneH; } }
      const mainH = this.chartH - totalPaneHeight;
      let currentYOffset = mainH;
      for (const [id, pane] of Object.entries(this.paneIndicators)) { pane.yOffset = currentYOffset; currentYOffset += pane.height; }
      ps.calculateRange(candles, vr.start, vr.end);
      if (this._cachedIndicators?.values) {
        const ind = this._cachedIndicators.values;
        let hasOverlay = false;
        for (const pluginId in this.registeredIndicators) {
          const plugin = this.registeredIndicators[pluginId], data = ind[pluginId];
          if (plugin?.enabled && !plugin.hidden && plugin.settings?.overlayMode && data?.range) {
            hasOverlay = true;
            if (data.range.stable) {
              const lastPrice = candles[candles.length - 1]?.close;
              if (lastPrice != null) {
                const currentRange = ps.max - ps.min, buffer = currentRange * 0.05;
                if (lastPrice < data.range.min - buffer) ps.min = data.range.min;
                if (lastPrice > data.range.max + buffer) ps.max = data.range.max;
              }
            } else {
              const smoothFactor = plugin.settings?.rangeSmoothFactor?.value ?? 0.1;
              if (data.range.min < ps.min) ps.min = ps.min + (data.range.min - ps.min) * smoothFactor;
              if (data.range.max > ps.max) ps.max = ps.max + (data.range.max - ps.max) * smoothFactor;
            }
          }
        }
        if (hasOverlay) { const range = ps.max - ps.min; if (range > 0 && range < 1e10) { const margin = range * 0.05; ps.min -= margin; ps.max += margin; } }
      }
      if (this.mainR.setRefs && !this._glRefsSet) { this.mainR.setRefs(ts, ps); this._glRefsSet = true; }
      this.mainR?.clear?.();
      this.mainR?.drawGrid?.(ps, ts, mainH);
      if (CFG.ui?.showGuideLines) {
        const guideOpts = { ts, ps, chartH: mainH, timeIntervals: [], priceLevels: CFG.ui.showGuideLines.priceLevels || [], timeColor: 'rgba(100,150,200,0.25)', priceColor: 'rgba(200,150,100,0.25)' };
        if (CFG.ui.showGuideLines.time5m) guideOpts.timeIntervals.push(300000);
        if (CFG.ui.showGuideLines.time1h) guideOpts.timeIntervals.push(3600000);
        this.mainR?.drawGuideLines?.(guideOpts);
      }
      if (this.indicators.vol) {
        let mv = 0;
        for (let i = vr.start; i <= vr.end; i++) { if (candles[i]?.volume > mv) mv = candles[i].volume; }
        if (mv > 0) {
          const volRects = [], vh = mainH * 0.15;
          for (let i = vr.start; i <= vr.end; i++) {
            const c = candles[i]; if (!c) continue;
            // ✅ استخدام priceToYFloat لحساب دقيق لارتفاع حجم التداول
            const volH = (c.volume / mv) * vh; // float, no Math.round yet
            const topPrice = ps.yToPrice(mainH - volH, mainH);
            volRects.push({ 
              x1Idx: i - 0.35, 
              y1Price: topPrice, 
              x2Idx: i + 0.35, 
              y2Price: ps.min, 
              color: c.close >= c.open ? CFG.colors?.volUp || 'rgba(0,230,118,0.3)' : CFG.colors?.volDown || 'rgba(255,23,68,0.3)' 
            });
          }
          this.mainR.drawRects?.(volRects, { ts, ps, chartH: mainH });
        }
      }
      const ind = this._getIndicators();
      if (ind) {
        if (this.indicators.bb && ind.bb) {
          this.mainR.drawArea?.(ind.bb.upper, ind.bb.lower, CFG.colors?.bbFill || 'rgba(33,150,243,0.04)', { ts, ps, chartH: mainH, strokeColor: CFG.colors?.bbMid || 'rgba(100,181,246,0.6)', lineWidth: 1 });
          this.mainR.drawLine?.(ind.bb.mid, CFG.colors?.bbMid || 'rgba(100,181,246,0.8)', { ts, ps, chartH: mainH, lineWidth: 1 });
        }
        if (this.indicators.ma) { if (ind.ma20) this.mainR.drawLine?.(ind.ma20, CFG?.colors?.ma20 || '#f9a825', { ts, ps, chartH: mainH }); if (ind.ma50) this.mainR.drawLine?.(ind.ma50, CFG?.colors?.ma50 || '#7c4dff', { ts, ps, chartH: mainH }); }
        if (this.indicators.sr && ind.sr) {
          const srRects = ind.sr.zones.map(z => ({ x1Idx: z.x1, y1Price: z.y1, x2Idx: z.x2, y2Price: z.y2, color: z.color + '26', strokeColor: z.color + '80', dashed: true }));
          this.mainR.drawRects?.(srRects, { ts, ps, chartH: mainH });
          const srShapes = ind.sr.markers.map(m => ({ type: m.type, idx: m.x, price: m.y, color: m.color }));
          this.mainR.drawShapes?.(srShapes, { ts, ps, chartH: mainH });
        }
        if (Object.keys(this.registeredIndicators).length > 0) {
          for (const [id, plugin] of Object.entries(this.registeredIndicators)) {
            if (plugin.enabled && !plugin.hidden && plugin.render && ind[id] && typeof plugin.render === 'function') {
              try {
                const isOverlay = plugin.settings?.overlayMode || plugin.settings?.isOverlay || !plugin.settings?.separatePane;
                if (plugin.settings?.separatePane && this.paneIndicators[id] && !isOverlay) {
                  const pane = this.paneIndicators[id], paneData = ind[id];
                  if (paneData?.line) {
                    let minVal = Infinity, maxVal = -Infinity;
                    for (let i = vr.start; i <= vr.end; i++) { if (paneData.line[i] != null) { if (paneData.line[i] < minVal) minVal = paneData.line[i]; if (paneData.line[i] > maxVal) maxVal = paneData.line[i]; } }
                    if (isFinite(minVal) && isFinite(maxVal)) { const range = maxVal - minVal || 1; if (Math.abs(pane.ps.min - minVal) > 0.01 || Math.abs(pane.ps.max - maxVal) > 0.01) { pane.ps.min = minVal - range * 0.1; pane.ps.max = maxVal + range * 0.1; if (pane.ps.max === pane.ps.min) pane.ps.max = pane.ps.min + 1; } }
                  }
                  plugin.render(this.mainR, ts, pane.ps, pane.height, ind[id], plugin.settings || {}, { yOffset: pane.yOffset, isSeparatePane: true, paneId: id, crosshair: this.crosshair.active ? this.crosshair : null, candles: this.candles });
                } else {
                  plugin.render(this.mainR, ts, ps, mainH, ind[id], plugin.settings || {}, { yOffset: 0, isSeparatePane: false, isOverlay: true, clipY: mainH, crosshair: this.crosshair.active ? this.crosshair : null, candles: this.candles });
                }
              } catch (err) { console.error(`[App] Error rendering indicator "${id}":`, err); }
            }
          }
        }
      }
      this.mainR?.drawCandles?.(candles, ts, ps, mainH);
      if (this._showSignals && this._signals?.length && this.candles?.length && typeof Indicators !== 'undefined' && Indicators.signalsToDrawables) {
        const signalShapes = Indicators.signalsToDrawables(this._signals, { buyColor: CFG.colors?.signalBuy || '#2196f3', sellColor: CFG.colors?.signalSell || '#ffd740', counterColor: CFG.colors?.signalCounter || '#ff5252', showLabels: true });
        if (signalShapes.length) this.mainR.drawShapes?.(signalShapes, { ts, ps, chartH: mainH });
      }
      if (this._gaps?.length && typeof Indicators !== 'undefined' && Indicators.gapsToDrawables) {
        const gapShapes = Indicators.gapsToDrawables(this._gaps, { upColor: 'rgba(0,230,118,0.12)', downColor: 'rgba(255,23,68,0.12)', borderColor: '#ffd740' });
        if (gapShapes.length) this.mainR.drawShapes?.(gapShapes, { ts, ps, chartH: mainH });
      }
      const last = candles[candles.length - 1];
      let isUp = false, priceStr = '';
      if (last) { isUp = last.close >= last.open; priceStr = Utils ? Utils.fmtPrice(last.close) : last.close.toFixed(2); this.mainR?.drawPriceLine?.(last.close, isUp, ps, mainH); }
      if (this.indicators.lowess && ind?.lowess) {
        const lowessData = ind.lowess;
        let lo = Infinity, hi = -Infinity;
        for (let i = vr.start; i <= vr.end; i++) { const h2 = lowessData.channels.h2[i], l2 = lowessData.channels.l2[i]; if (h2 != null) { if (h2 > hi) hi = h2; if (h2 < lo) lo = h2; } if (l2 != null) { if (l2 > hi) hi = l2; if (l2 < lo) lo = l2; } }
        if (isFinite(lo) && isFinite(hi)) { const range = hi - lo; this.psLowess.min = lo - range * 0.05; this.psLowess.max = hi + range * 0.05; if (this.psLowess.max === this.psLowess.min) this.psLowess.max = this.psLowess.min + 1; }
        const lowessOpts = { ts, ps: this.psLowess, chartH: this._smoothedLowessHeight, yOffset: mainH };
        this.mainR.drawArea?.(lowessData.rsi.bounds.line90, lowessData.rsi.bounds.line10, 'rgba(192,192,192,0.1)', lowessOpts);
        [lowessData.channels.h2, lowessData.channels.h1, lowessData.channels.l1, lowessData.channels.l2].forEach(l => this.mainR.drawLine?.(l, lowessData.channels.color, { ...lowessOpts, lineWidth: 1 }));
        [lowessData.rsi.bounds.line100, lowessData.rsi.bounds.line0, lowessData.rsi.bounds.line90, lowessData.rsi.bounds.line10].forEach(l => this.mainR.drawLine?.(l, lowessData.rsi.bounds.color, { ...lowessOpts, lineWidth: 2 }));
        const midColors = lowessData.channels.mid.map((v, i) => { if (i < 3 || v == null || lowessData.channels.mid[i-3] == null) return null; return v > lowessData.channels.mid[i-3] ? lowessData.channels.midColorUp : lowessData.channels.midColorDn; });
        this.mainR.drawLine?.(lowessData.channels.mid, midColors, { ...lowessOpts, lineWidth: 1, alpha: 0.9 });
        this.mainR.drawLine?.(lowessData.rsi.line, lowessData.rsi.colors, { ...lowessOpts, lineWidth: 1.5 });
        const diamonds = [];
        for (let i = 0; i < lowessData.markers.trendChanges.length; i++) { if (lowessData.markers.trendChanges[i] != null && lowessData.channels.mid[i] != null) diamonds.push({ type: 'diamond', idx: i, price: lowessData.channels.mid[i], color: lowessData.markers.trendChanges[i] }); }
        this.mainR.drawShapes?.(diamonds, lowessOpts);
        const sepRect = [{ x1Idx: vr.start, y1Price: this.psLowess.max, x2Idx: vr.end, y2Price: this.psLowess.max - (this.psLowess.max - this.psLowess.min) * 0.002, color: '#1e2d3d' }];
        this.mainR.drawRects?.(sepRect, lowessOpts);
      }
      if (this.crosshair.active && this.crosshair.x >= 0 && this.crosshair.y >= 0) { this.mainR?.drawCrosshair?.(this.crosshair.x, this.crosshair.y); this._updateCrosshairUI(ind); }
      else { if (this.xhairBox) this.xhairBox.style.display = 'none'; if (this.indicatorValues) this.indicatorValues.style.display = 'none'; }
      let axisPs = ps, axisChartH = mainH, relativeCrossY = -1;
      if (this.crosshair.active) {
        relativeCrossY = this.crosshair.y;
        if (this.indicators.lowess && this.crosshair.y > mainH && this.crosshair.y <= mainH + this._smoothedLowessHeight) { axisPs = this.psLowess; axisChartH = this._smoothedLowessHeight; relativeCrossY = this.crosshair.y - mainH; }
        else { for (const [id, pane] of Object.entries(this.paneIndicators)) { const paneTop = pane.yOffset, paneBottom = paneTop + pane.height; if (this.crosshair.y > paneTop && this.crosshair.y <= paneBottom) { axisPs = pane.ps; axisChartH = pane.height; relativeCrossY = this.crosshair.y - paneTop; break; } } }
      }
      const lastPriceForAxis = (this.indicators.lowess && this.crosshair.active && this.crosshair.y > mainH) ? -1 : (last?.close ?? -1);
      this.priceR?.render?.(axisPs, axisChartH, relativeCrossY, lastPriceForAxis, isUp, priceStr);
      this.timeR?.render?.(ts, candles, w, this.crosshair.active ? this.crosshair.x : -1);
      this._updateTimer();
      if (Object.keys(this.paneIndicators).length > 0) {
        const ctx = this.mainCanvas.getContext('2d');
        if (ctx) {
          ctx.save();
          ctx.strokeStyle = 'rgba(100,120,150,0.5)'; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
          for (const [id, pane] of Object.entries(this.paneIndicators)) { const plugin = this.registeredIndicators[id]; if (plugin?.enabled && !plugin.hidden && plugin.settings?.separatePane) { 
            // ✅ استخدام priceToYFloat + snapForStroke لخط فاصل دقيق
            const y = PrecisionUtils.snapForStroke(pane.yOffset + 0.5, 1); 
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(this.chartW, y); ctx.stroke(); 
          } }
          ctx.setLineDash([]); ctx.restore();
        }
      }
    } catch (e) { console.error('[App] Render:', e); }
    this.rafId = requestAnimationFrame(() => this._loop());
    if (this.inertia?.isActive?.()) this.dirty = true;
  }
  
  _startRenderLoop() { this._loop = () => this._render(); this._loop(); }
  
  _updatePriceUI(p) {
    if (!this.priceDisplay) return;
    try {
      this.priceDisplay.textContent = AppHelpers.fmtPrice(p);
      const pr = parseFloat(this.priceDisplay.dataset.last || 0);
      const up = p >= pr;
      this.priceDisplay.style.color = up ? (CFG?.colors?.up || '#00e676') : (CFG?.colors?.down || '#ff1744');
      this.priceDisplay.dataset.last = p;
    } catch (e) {}
  }
  
  _updateCrosshairUI(ind) {
    if (!this.xhairBox || !this.ts) { if (this.xhairBox) this.xhairBox.style.display = 'none'; return; }
    try {
      // ✅ استخدام xToIndex بدون تقريب للفهرس الدقيق
      const idx = Math.round(this.ts.xToIndex(this.crosshair.x));
      if (idx < 0 || !this.candles || idx >= this.candles.length) { this.xhairBox.style.display = 'none'; return; }
      const c = this.candles[idx]; if (!c) { this.xhairBox.style.display = 'none'; return; }
      const up = c.close >= c.open, d = new Date(c.time);
      const ts = `${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`, chg = ((c.close - c.open) / c.open * 100).toFixed(2);
      if (CFG.isMobile) {
        this.xhairBox.innerHTML = `<div class="xh-row"><span>C: <b class="${up?'up':'down'}">${AppHelpers.fmtPrice(c.close)}</b></span><span style="margin-right:8px">${ts}</span></div>`;
        if (this.indicatorValues) this.indicatorValues.style.display = 'none';
      } else {
        this.xhairBox.innerHTML = `<div class="xh-row"><span>O: ${AppHelpers.fmtPrice(c.open)}</span><span>H: ${AppHelpers.fmtPrice(c.high)}</span></div><div class="xh-row"><span>L: ${AppHelpers.fmtPrice(c.low)}</span><span>C: <b class="${up?'up':'down'}">${AppHelpers.fmtPrice(c.close)}</b></span></div><div class="xh-row" style="margin-top:4px;color:var(--text-bright);font-size:10px;"><span>${up?'+':''}${chg}%</span><span style="margin-left:auto">${ts}</span></div>`;
        if (ind && this.indicatorValues) {
          let h = '';
          if (ind.ma20?.[idx] != null) h += `<span style="color:${CFG?.colors?.ma20||'#f9a825'}">MA20: ${AppHelpers.fmtPrice(ind.ma20[idx])}</span> &nbsp; `;
          if (ind.ma50?.[idx] != null) h += `<span style="color:${CFG?.colors?.ma50||'#7c4dff'}">MA50: ${AppHelpers.fmtPrice(ind.ma50[idx])}</span> &nbsp; `;
          if (ind.bb?.upper?.[idx] != null) h += `<span style="color:#64b5f6">BB: ${AppHelpers.fmtPrice(ind.bb.upper[idx])} / ${AppHelpers.fmtPrice(ind.bb.lower[idx])}</span>`;
          if (Object.keys(this.registeredIndicators).length > 0) { for (const [id, plugin] of Object.entries(this.registeredIndicators)) { if (plugin.enabled && !plugin.hidden && ind[id] && typeof plugin.getTooltip === 'function') { const tooltip = plugin.getTooltip(idx, ind[id], this.candles); if (tooltip) h += ` &nbsp; ${tooltip}`; } } }
          if (h) { this.indicatorValues.innerHTML = h; this.indicatorValues.style.display = 'block'; } else { this.indicatorValues.style.display = 'none'; }
        }
      }
      this.xhairBox.style.display = 'block';
    } catch (e) { if (this.xhairBox) this.xhairBox.style.display = 'none'; }
  }
  
  _showToast(msg, type = 'info') {
    try {
      if (!this.alertContainer) return;
      const el = document.createElement('div');
      el.className = `alert-toast ${type}`; el.textContent = msg;
      this.alertContainer.appendChild(el);
      setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 3700);
    } catch (e) {}
  }
  
  // ─────────────────────────────────────────────────────────────────────
  // بدء تغذية البيانات (مع فالبك للمحاكاة)
  // ─────────────────────────────────────────────────────────────────────
  _startDataFeed() {
    if (!this.feed?.configure) return;
    try {
      let symbol = CFG.defaultSymbol || 'btcusdt';
      let tf = CFG.defaultTimeframe || '1m';
      const binanceSymbol = symbol.replace('_otc', '').replace('_spot', '').toLowerCase();
      this.feed.configure(binanceSymbol, tf);
      this.feed.start().catch(err => {
        console.warn('[App] Feed start failed, using simulated ', err.message);
        this._useSimulatedData(binanceSymbol, tf);
      });
      this._updateSymbolDisplay(symbol);
      this.tfButtons.forEach(b => b.classList.toggle('active', b.dataset.tf === tf));
    } catch (e) {
      console.error('[App] _startDataFeed error:', e);
      this._useSimulatedData('btcusdt', '1m');
    }
  }

  // ✅ دالة البيانات المحاكية (فالبك)
  _useSimulatedData(symbol, interval) {
    console.log('[App] Using simulated data for', symbol);
    const candles = [];
    const now = Math.floor(Date.now() / 1000);
    const intervalSec = (CFG.timeframes?.[interval] || 60000) / 1000;
    let price = symbol.includes('btc') ? 65000 : symbol.includes('eth') ? 3500 : 100;
    for (let i = 499; i >= 0; i--) {
      const time = now - (i * intervalSec);
      const volatility = 0.003;
      const change = (Math.random() - 0.48) * volatility * price;
      const open = price, close = open + change;
      const high = Math.max(open, close) + Math.random() * volatility * price * 0.3;
      const low = Math.min(open, close) - Math.random() * volatility * price * 0.3;
      candles.push({ time: time * 1000, open: +open.toFixed(2), high: +high.toFixed(2), low: +low.toFixed(2), close: +close.toFixed(2), volume: +(Math.random() * 1000).toFixed(2) });
      price = close;
    }
    this.candles = candles;
    this.ts?.setData?.(candles);
    bus.emit('candles:updated', candles);
    bus.emit('price', price);
    bus.emit('status', 'connected');
    if (this.liveDot) this.liveDot.className = 'live-dot ok';
    if (this.connText) this.connText.textContent = 'محاكاة';
    this.dirty = true;
  }

  // ─────────────────────────────────────────────────────────────────────
  // التدمير والتنظيف
  // ─────────────────────────────────────────────────────────────────────
  destroy() {
    try {
      if (this.rafId) cancelAnimationFrame(this.rafId);
      this.inertia?.stop?.(); this.mainR?.destroy?.(); this.feed?.destroy?.();
      if (this._eventUnsubs) { this._eventUnsubs.forEach(unsub => { try { unsub?.(); } catch(e) {} }); this._eventUnsubs = []; }
      for (const [id, plugin] of Object.entries(this.registeredIndicators)) { if (plugin.destroy && typeof plugin.destroy === 'function') { try { plugin.destroy(); } catch(e) {} } }
      this.registeredIndicators = {}; this.paneIndicators = {}; this.activeDragPaneId = null;
      if (this.alertContainer) this.alertContainer.innerHTML = '';
      if (this.timerBadge) this.timerBadge.style.display = 'none';
      if (bus && bus._listeners) bus._listeners = {};
      console.log('[App] ✓ Destroyed cleanly');
    } catch (e) { console.error('[App] Destroy error:', e); }
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
    } catch (e) {
      document.body.innerHTML = `<div style="padding:20px;color:#ff1744;font-family:monospace"><h3>❌ فشل التحميل</h3><p>تأكد من ترتيب الملفات</p><p style="font-size:11px;opacity:0.7">${e.message}</p></div>`;
    }
  }, 100);
});

document.addEventListener('contextmenu', e => { if (e.target?.tagName === 'CANVAS') e.preventDefault(); });
document.body.addEventListener('gesturestart', e => e.preventDefault(), { passive: false });
document.body.addEventListener('gesturechange', e => e.preventDefault(), { passive: false });
