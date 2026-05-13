'use strict';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * CONFIG - مركز إعدادات نظام الشارت (النسخة الكاملة المُصححة)
 * ═══════════════════════════════════════════════════════════════════════
 * ✅ ملاحظة: تم إزالة تعريف EventBus/bus لتجنب التعارض مع event-bus.js
 * ✅ استخدم `bus` المستورد من event-bus.js في جميع الملفات الأخرى
 * ═══════════════════════════════════════════════════════════════════════
 */

// ─────────────────────────────────────────────────────────────────────
// كائن الإعدادات المركزي (CFG) - المصدر الوحيد للحقيقة
// ─────────────────────────────────────────────────────────────────────
const CFG = {
  
  // ═══════════════════════════════════════════════════════════════════
  // 🔹 إعدادات البيانات والأداء (متوافقة مع data-feed.js)
  // ═══════════════════════════════════════════════════════════════════
  maxCandles: 2000,              // أقصى عدد شموع يتم تخزينها في الذاكرة
  bufferSize: 500,               // حجم الدفعة الأولية من البيانات التاريخية
  wsReconnectDelay: 1500,        // تأخير إعادة الاتصال بـ WebSocket (مللي ثانية)
  wsMaxReconnect: 10,            // أقصى محاولات إعادة الاتصال
  heartbeatInterval: 25000,      // فترة إرسال نبضات الاتصال لـ WebSocket
  
  // ═══════════════════════════════════════════════════════════════════
  // 🔹 إعدادات الرسم والمسافات
  // ═══════════════════════════════════════════════════════════════════
  defaultSpacing: 8,             // المسافة الافتراضية بين الشموع (بكسل)
  minSpacing: 1.5,               // أقل مسافة مسموحة للتكبير
  maxSpacing: 60,                // أكبر مسافة مسموحة للتصغير
  candleBodyRatio: 0.62,         // نسبة عرض جسم الشمعة إلى المسافة الكلية
  priceMargin: 0.04,             // هامش السعر أعلى وأسفل لأغراض العرض (4%)
  
  // ═══════════════════════════════════════════════════════════════════
  // 🔹 إعدادات الجهاز والعرض
  // ═══════════════════════════════════════════════════════════════════
  isMobile: /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) 
            || (typeof window !== 'undefined' && window.innerWidth <= 768),
  dpr: typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1,
  
  // ═══════════════════════════════════════════════════════════════════
  // 🔹 لوحة الألوان الموحدة - المصدر الوحيد لألوان الرسم
  // ═══════════════════════════════════════════════════════════════════
  colors: {
    // ── الخلفيات والشبكات ─────────────────────────────────────────
    bg: '#060a12',
    grid: '#0f1c2e',
    gridBright: '#172438',
    
    // ── ألوان الشموع العامة ───────────────────────────────────────
    up: '#00e676',
    upDim: 'rgba(0,230,118,0.18)',
    down: '#ff1744',
    downDim: 'rgba(255,23,68,0.18)',
    wick: null,
    
    // ── ألوان الشموع المفصلة ──────────────────────────────────────
    candle: {
      up: { body: '#00e676', wick: '#00c853', border: '#00a142', alpha: 1.0 },
      down: { body: '#ff1744', wick: '#d50000', border: '#aa0000', alpha: 1.0 }
    },
    globalAlpha: 1.0,
    
    // ── ألوان الإشارات ────────────────────────────────────────────
    signalBuy: '#2196f3',
    signalSell: '#ffd740',
    signalCounter: '#ff5252',
    
    // ── النصوص والعناصر التفاعلية ────────────────────────────────
    text: '#4a6a8a',
    textBright: '#8aaccc',
    textWhite: '#e0ecff',
    accent: '#2196f3',
    
    // ── المؤشرات الفنية ──────────────────────────────────────────
    ma20: '#f9a825',
    ma50: '#7c4dff',
    bbUp: 'rgba(100,181,246,0.5)',
    bbMid: 'rgba(100,181,246,0.8)',
    bbLow: 'rgba(100,181,246,0.5)',
    bbFill: 'rgba(33,150,243,0.04)',
    
    // ── الحجم (Volume) ───────────────────────────────────────────
    volUp: 'rgba(0,230,118,0.3)',
    volDown: 'rgba(255,23,68,0.3)',
    
    // ── عناصر خاصة ───────────────────────────────────────────────
    priceLine: '#2196f3',
    crosshair: 'rgba(150,180,220,0.5)',
    timerText: '#ffd740',
    timerTextBg: 'rgba(0,0,0,0.6)',
    
    // ── إعدادات جديدة ────────────────────────────────────────────
    timerShadow: 'rgba(0,15,40,0.4)',
    minZoomAlpha: 0.9,
    maxZoomAlpha: 1.0,
    
    // ── خلفية الصورة ─────────────────────────────────────────────
    backgroundImage: null,
    backgroundAlpha: 0.15,
    backgroundSize: 'cover'
  },
  
  // ═══════════════════════════════════════════════════════════════════
  // 🔹 إعدادات الواجهة
  // ═══════════════════════════════════════════════════════════════════
  ui: {
    axisPriceWidth: 72,
    axisTimeHeight: 28,
    toolbarHeight: 48,
    crosshairBoxPadding: 8,
    alertDuration: 3700,
    
    // تحكم دقيق في العداد التنازلي
    timerOffsetX: 45,
    timerOffsetY: 25,
    enableTimerShadow: true,
    timerFontSize: 11,
    
    // خطوط الدليل التلقائية
    showGuideLines: {
      time5m: true,
      time1h: true,
      priceLevels: []
    }
  },
  
  // ═══════════════════════════════════════════════════════════════════
  // 🔹 إعدادات التمرير والقصور الذاتي
  // ═══════════════════════════════════════════════════════════════════
  inertia: {
    friction: 0.96,
    minVelocity: 0.2,
    maxHistory: 6,
    velocityMultiplier: 1.6,
  },
  
  // ═══════════════════════════════════════════════════════════════════
  // 🔹 إعدادات الزوم باللمس (للموبايل)
  // ═══════════════════════════════════════════════════════════════════
  zoom: {
    pinchDamping: 0.7,
    maxScalePerFrame: 0.15,
    disableInertiaDuringZoom: true,
    minZoomAlpha: 0.9,
    maxZoomAlpha: 1.0
  },
  
  // ═══════════════════════════════════════════════════════════════════
  // 🔹 إعدادات المؤشرات والحسابات
  // ═══════════════════════════════════════════════════════════════════
  indicators: {
    smaPeriods: [20, 50],
    bbPeriod: 20,
    bbMultiplier: 2,
    rsiPeriod: 14,
    updateRate: 100,
    cacheTTL: 5000,
  },
  
  // ═══════════════════════════════════════════════════════════════════
  // 🔹 إعدادات الوقت والجلسات
  // ═══════════════════════════════════════════════════════════════════
  timeframes: {
    '1s': 1000, '5s': 5000, '15s': 15000, '30s': 30000,
    '1m': 60000, '2m': 120000, '3m': 180000, '5m': 300000,
    '15m': 900000, '30m': 1800000, '1h': 3600000, '2h': 7200000,
    '4h': 14400000, '6h': 21600000, '12h': 43200000, '1d': 86400000,
    '3d': 259200000, '1w': 604800000
  },
  
  // ═══════════════════════════════════════════════════════════════════
  // 🔹 دوال مساعدة داخل الإعدادات
  // ═══════════════════════════════════════════════════════════════════
  
  /**
   * دالة موحدة لجلب الألوان مع قيمة افتراضية
   */
  getColor: function(key, fallback) {
    return this.colors?.[key] || fallback || '#ffffff';
  },
  
  /**
   * الحصول على مدة الإطار الزمني بالمللي ثانية
   */
  getIntervalMs: function(tf) {
    return this.timeframes[tf] || this.timeframes['1m'];
  },
  
  /**
   * تقييد قيمة بين حدين
   */
  clamp: function(val, min, max) {
    return Math.max(min, Math.min(max, val));
  },
  
  /**
   * التحقق من دعم اللمس المتعدد
   */
  supportsMultiTouch: function() {
    return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  },
  
  /**
   * التحقق مما إذا كان الجهاز لوحي
   */
  isTablet: function() {
    return /iPad|Android(?!.*Mobile)/i.test(navigator.userAgent) || 
           (typeof window !== 'undefined' && window.innerWidth >= 768 && window.innerWidth <= 1024);
  },
  
  /**
   * الحصول على إعدادات الرسم حسب مستوى التكبير
   */
  getRenderSettings: function(spacing) {
    if (spacing >= 8) {
      return { mode: 'full', bodyRatio: 0.72, alpha: 1.0, showWick: true };
    } else if (spacing >= 4) {
      return { mode: 'thin', bodyRatio: 0.65, alpha: 0.95, showWick: true };
    } else if (spacing >= 2.5) {
      return { mode: 'line', bodyRatio: 0.5, alpha: 0.9, showWick: false };
    } else {
      return { mode: 'line-only', bodyRatio: 0.3, alpha: this.colors?.minZoomAlpha ?? 0.9, showWick: false };
    }
  }
};

// ═══════════════════════════════════════════════════════════════════════
// UTILITIES - دوال مساعدة (مُحسّنة وموثقة)
// ═══════════════════════════════════════════════════════════════════════
const Utils = {
  fmtPrice(p) {
    if (typeof p !== 'number' || isNaN(p)) return '—';
    if (p >= 10000) return p.toFixed(0);
    if (p >= 1) return p.toFixed(2);
    return p.toFixed(5);
  },
  
  fmtVol(v) {
    if (!v) return '0';
    if (v > 1e9) return (v / 1e9).toFixed(2) + 'B';
    if (v > 1e6) return (v / 1e6).toFixed(2) + 'M';
    if (v > 1e3) return (v / 1e3).toFixed(2) + 'K';
    return v.toFixed(0);
  },
  
  formatTimeLeft(ms) {
    const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  },
  
  getIntervalMs(str) {
    return CFG.timeframes[str] || CFG.timeframes['1m'];
  },
  
  hexToRgba(hex, alpha = 1) {
    if (!hex || typeof hex !== 'string') return `rgba(255,255,255,${alpha})`;
    hex = hex.replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  },
  
  rgbaToHex(rgba) {
    if (!rgba || typeof rgba !== 'string') return '#ffffff';
    const match = rgba.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*[\d.]+)?\)/);
    if (!match) return '#ffffff';
    const r = parseInt(match[1]).toString(16).padStart(2, '0');
    const g = parseInt(match[2]).toString(16).padStart(2, '0');
    const b = parseInt(match[3]).toString(16).padStart(2, '0');
    return `#${r}${g}${b}`;
  },
  
  blendColors(color1, color2, ratio) {
    ratio = Math.max(0, Math.min(1, ratio));
    const c1 = color1.replace('#', '');
    const c2 = color2.replace('#', '');
    const r = Math.round(parseInt(c1.slice(0, 2), 16) * (1 - ratio) + parseInt(c2.slice(0, 2), 16) * ratio);
    const g = Math.round(parseInt(c1.slice(2, 4), 16) * (1 - ratio) + parseInt(c2.slice(2, 4), 16) * ratio);
    const b = Math.round(parseInt(c1.slice(4, 6), 16) * (1 - ratio) + parseInt(c2.slice(4, 6), 16) * ratio);
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  },
  
  generateGradient(startColor, endColor, steps = 10) {
    const gradient = [];
    for (let i = 0; i < steps; i++) {
      const ratio = i / (steps - 1);
      gradient.push(Utils.blendColors(startColor, endColor, ratio));
    }
    return gradient;
  },
  
  isValidColor(color) {
    if (!color || typeof color !== 'string') return false;
    if (/^#([0-9A-F]{3}){1,2}$/i.test(color)) return true;
    if (/^rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*(,\s*[\d.]+\s*)?\)$/i.test(color)) return true;
    const namedColors = ['red', 'green', 'blue', 'white', 'black', 'yellow', 'orange', 'purple', 'cyan', 'pink', 'gray', 'grey'];
    if (namedColors.includes(color.toLowerCase())) return true;
    return false;
  }
};

// ═══════════════════════════════════════════════════════════════════════
// ✅ Indicator Plugin Registry - نظام تسجيل المؤشرات المستقلة
// ═══════════════════════════════════════════════════════════════════════
if (typeof window !== 'undefined' && typeof window.IndicatorRegistry === 'undefined') {
  window.IndicatorRegistry = new (class {
    constructor() {
      this.plugins = {};
      this._initialized = false;
      this._pendingRegistrations = [];
      this._version = '1.0.0';
    }

    register(id, plugin) {
      if (!id || typeof plugin !== 'object' || !plugin.calculate) {
        console.error(`[IndicatorRegistry] Invalid plugin registration for "${id}"`);
        return false;
      }
      if (this.plugins[id]) {
        console.warn(`[IndicatorRegistry] Plugin "${id}" already registered, overwriting`);
      }
      this.plugins[id] = { id, enabled: false, hidden: false, ...plugin, registeredAt: Date.now() };
      console.log(`[IndicatorRegistry] ✓ Registered: ${plugin.name || id}`);
      if (this._initialized && typeof window.chartApp !== 'undefined' && typeof bus !== 'undefined') {
        bus.emit('indicator:registered', { id, plugin: this.plugins[id] });
      } else {
        this._pendingRegistrations.push({ id, plugin: this.plugins[id] });
      }
      return true;
    }

    get(id) { return this.plugins[id] || null; }
    getAll() { return Object.values(this.plugins); }
    getEnabled() { return Object.values(this.plugins).filter(p => p.enabled && !p.hidden); }
    has(id) { return id in this.plugins; }
    
    unregister(id) {
      const plugin = this.plugins[id];
      if (plugin?.destroy && typeof plugin.destroy === 'function') {
        try { plugin.destroy(); } catch(e) { console.warn(`[IndicatorRegistry] Error destroying "${id}":`, e); }
      }
      delete this.plugins[id];
      console.log(`[IndicatorRegistry] ✓ Unregistered: ${id}`);
      return true;
    }
    
    markInitialized() { 
      this._initialized = true;
      for (const { id, plugin } of this._pendingRegistrations) {
        if (typeof window.chartApp !== 'undefined' && typeof bus !== 'undefined') {
          bus.emit('indicator:registered', { id, plugin });
        }
      }
      this._pendingRegistrations = [];
      console.log(`[IndicatorRegistry] ✓ Initialized with ${Object.keys(this.plugins).length} plugins`);
    }
    
    reset() {
      for (const [id, plugin] of Object.entries(this.plugins)) {
        if (plugin?.destroy) { try { plugin.destroy(); } catch(e) {} }
      }
      this.plugins = {};
      this._pendingRegistrations = [];
      console.log('[IndicatorRegistry] ✓ All plugins reset');
    }
    
    getStats() {
      const all = Object.values(this.plugins);
      return {
        total: all.length,
        enabled: all.filter(p => p.enabled).length,
        hidden: all.filter(p => p.hidden).length,
        version: this._version,
        initialized: this._initialized
      };
    }
    
    export() {
      const exportable = {};
      for (const [id, plugin] of Object.entries(this.plugins)) {
        exportable[id] = { enabled: plugin.enabled, hidden: plugin.hidden, settings: plugin.settings || {} };
      }
      return exportable;
    }
    
    import(imported) {
      if (!imported || typeof imported !== 'object') return;
      for (const [id, config] of Object.entries(imported)) {
        if (this.plugins[id]) {
          if (config.enabled !== undefined) this.plugins[id].enabled = config.enabled;
          if (config.hidden !== undefined) this.plugins[id].hidden = config.hidden;
          if (config.settings) this.plugins[id].settings = { ...this.plugins[id].settings, ...config.settings };
        }
      }
      console.log('[IndicatorRegistry] ✓ Imported settings');
    }
  })();
}

// ═══════════════════════════════════════════════════════════════════════
// ✅ نظام التفضيلات - حفظ/استرجاع إعدادات المستخدم
// ═══════════════════════════════════════════════════════════════════════
const Prefs = {
  PREFIX: 'chart_prefs_',
  
  save(key, value) {
    try { localStorage.setItem(this.PREFIX + key, JSON.stringify(value)); return true; }
    catch(e) { console.warn('[Prefs] Save failed:', e.message); return false; }
  },
  
  load(key, fallback = null) {
    try {
      const v = localStorage.getItem(this.PREFIX + key);
      return v ? JSON.parse(v) : fallback;
    } catch(e) { console.warn('[Prefs] Load failed:', e.message); return fallback; }
  },
  
  delete(key) {
    try { localStorage.removeItem(this.PREFIX + key); return true; }
    catch(e) { console.warn('[Prefs] Delete failed:', e.message); return false; }
  },
  
  clear() {
    try {
      Object.keys(localStorage).forEach(k => { if (k.startsWith(this.PREFIX)) localStorage.removeItem(k); });
      console.log('[Prefs] ✓ All preferences cleared');
      return true;
    } catch(e) { console.warn('[Prefs] Clear failed:', e.message); return false; }
  },
  
  getAll() {
    const prefs = {};
    try {
      Object.keys(localStorage).forEach(k => {
        if (k.startsWith(this.PREFIX)) {
          const key = k.replace(this.PREFIX, '');
          try { prefs[key] = JSON.parse(localStorage.getItem(k)); } catch(e) {}
        }
      });
    } catch(e) {}
    return prefs;
  }
};

// ═══════════════════════════════════════════════════════════════════════
// ✅ نظام التشخيص
// ═══════════════════════════════════════════════════════════════════════
const Diagnostics = {
  getReport() {
    return {
      version: '2.0.0',
      timestamp: new Date().toISOString(),
      config: { isMobile: CFG.isMobile, dpr: CFG.dpr, timeframes: Object.keys(CFG.timeframes).length, colors: Object.keys(CFG.colors).length },
      bus: { listeners: (typeof bus !== 'undefined' && bus._listeners) ? Object.keys(bus._listeners).length : 0 },
      indicators: { registry: typeof window.IndicatorRegistry !== 'undefined', plugins: typeof window.IndicatorRegistry !== 'undefined' ? Object.keys(window.IndicatorRegistry.plugins).length : 0 },
      storage: { prefs: Object.keys(Prefs.getAll()).length }
    };
  },
  
  print() {
    const report = this.getReport();
    console.group('🔍 Chart Diagnostics Report');
    console.log('Version:', report.version);
    console.log('Timestamp:', report.timestamp);
    console.log('Config:', report.config);
    console.log('EventBus:', report.bus);
    console.log('Indicators:', report.indicators);
    console.log('Storage:', report.storage);
    console.groupEnd();
  }
};

// ═══════════════════════════════════════════════════════════════════════
// تصدير الإعدادات (للتوافق مع وحدات ES6)
// ═══════════════════════════════════════════════════════════════════════
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { CFG, Utils, Prefs, Diagnostics };
}

// ═══════════════════════════════════════════════════════════════════════
// تسجيل معلومات النسخة للتشخيص
// ═══════════════════════════════════════════════════════════════════════
console.log(`[CFG] Loaded v2.0 | Mobile: ${CFG.isMobile} | DPR: ${CFG.dpr} | Timeframes: ${Object.keys(CFG.timeframes).length}`);

// ═══════════════════════════════════════════════════════════════════════
// 📚 ملاحظة هامة للمطورين
// ═══════════════════════════════════════════════════════════════════════
/**
 * ⚠️ ملاحظة: تم إزالة تعريف EventBus و bus من هذا الملف
 * ✅ استخدم `bus` المستورد من event-bus.js في جميع الملفات الأخرى
 * 
 * @example
 * // في أي ملف آخر:
 * // تأكد أن هذا الملف يُحمّل بعد config.js و event-bus.js
 * // ثم استخدم:
 * bus.on('event', handler);
 * bus.emit('event', data);
 * 
 * @example
 * // استخدام الإعدادات:
 * const color = CFG.getColor('up', '#00e676');
 * const duration = CFG.getIntervalMs('5m');
 * const clamped = CFG.clamp(100, 0, 50);
 */
