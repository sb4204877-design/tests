'use strict';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * CONFIG - مركز إعدادات نظام الشارت (النسخة المحسّنة)
 * ═══════════════════════════════════════════════════════════════════════
 * ✅ جميع الإعدادات الجديدة لدعم:
 *    • نظام كاش المؤشرات مع معدل تحديث قابل للضبط
 *    • توحيد نظام الألوان عبر جميع المكونات
 *    • تحسين وضوح الشموع عند التصغير
 *    • تحكم دقيق في موضع العداد التنازلي
 *    • تحسين استقرار الزوم على الموبايل
 *    • تنعيم حركة النوافذ المنفصلة
 * ═══════════════════════════════════════════════════════════════════════
 */

const CFG = {
  // ───────────────────────────────────────────────────────────────────
  // إعدادات البيانات والأداء
  // ───────────────────────────────────────────────────────────────────
  maxCandles: 2000,              // أقصى عدد شموع يتم تخزينها في الذاكرة
  bufferSize: 500,               // حجم الدفعة الأولية من البيانات التاريخية
  wsReconnectDelay: 1500,        // تأخير إعادة الاتصال بـ WebSocket (مللي ثانية)
  wsMaxReconnect: 10,            // أقصى محاولات إعادة الاتصال
  heartbeatInterval: 25000,      // فترة إرسال نبضات الاتصال لـ WebSocket
  
  // ───────────────────────────────────────────────────────────────────
  // إعدادات الرسم والمسافات
  // ───────────────────────────────────────────────────────────────────
  defaultSpacing: 8,             // المسافة الافتراضية بين الشموع (بكسل)
  minSpacing: 1.5,               // ✅ أقل مسافة مسموحة للتكبير (تم خفضها لدعم الموبايل)
  maxSpacing: 60,                // أكبر مسافة مسموحة للتصغير
  candleBodyRatio: 0.62,         // نسبة عرض جسم الشمعة إلى المسافة الكلية
  priceMargin: 0.04,             // هامش السعر أعلى وأسفل لأغراض العرض (4%)
  
  // ───────────────────────────────────────────────────────────────────
  // إعدادات الجهاز والعرض
  // ───────────────────────────────────────────────────────────────────
  isMobile: /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent),
  dpr: Math.min(window.devicePixelRatio || 1, 2),  // Device Pixel Ratio (محدود بـ 2 للأداء)
  
  // ───────────────────────────────────────────────────────────────────
  // ✅ لوحة الألوان الموحدة - للرسم على Canvas فقط
  // ⚠️ جميع مكونات الرسم تقرأ الألوان من هنا عبر دالة getColor()
  // ───────────────────────────────────────────────────────────────────
  colors: {
    // ── الخلفيات والشبكات ─────────────────────────────────────────
    bg: '#060a12',               // ✅ خلفية الشارت الرئيسية (مطابقة لـ CSS)
    grid: '#0f1c2e',             // خطوط الشبكة الخافتة
    gridBright: '#172438',       // خطوط الشبكة البارزة
    
    // ── ألوان الشموع ──────────────────────────────────────────────
    up: '#2ee600',               // ✅ لون الشمعة الصاعدة (أخضر نيون)
    upDim: 'rgba(0,230,118,0.18)', // خلفية خافتة للشمعة الصاعدة
    down: '#ff0000',             // ✅ لون الشمعة الهابطة (أحمر نقي - تم إصلاح #ff0000fb)
    downDim: 'rgba(255,23,68,0.18)', // خلفية خافتة للشمعة الهابطة
    wick: null,                  // ✅ لون فتيل الشمعة (null = يستخدم لون الجسم)
    
    // ── النصوص والعناصر التفاعلية ─────────────────────────────────
    text: '#4a6a8a',             // نص عادي (محاور، شبكة)
    textBright: '#8aaccc',       // نص بارز (تحديد، خطوط مساعدة)
    textWhite: '#e0ecff',        // نص أبيض للعناوين والقيم المحددة
    accent: '#2196f3',           // لون التمييز (أزرار، تحديد)
    
    // ── المؤشرات الفنية ──────────────────────────────────────────
    ma20: '#f9a825',             // لون المتوسط المتحرك 20 (أصفر ذهبي)
    ma50: '#7c4dff',             // لون المتوسط المتحرك 50 (بنفسجي)
    bbUp: 'rgba(100,181,246,0.5)',   // الحد العلوي لبولينجر
    bbMid: 'rgba(100,181,246,0.8)',  // الخط المتوسط لبولينجر
    bbLow: 'rgba(100,181,246,0.5)',  // الحد السفلي لبولينجر
    bbFill: 'rgba(33,150,243,0.04)', // تعبئة منطقة بولينجر
    
    // ── الحجم (Volume) ───────────────────────────────────────────
    volUp: 'rgba(0,230,118,0.3)',    // أعمدة الحجم الصاعدة
    volDown: 'rgba(255,23,68,0.3)',  // أعمدة الحجم الهابطة
    
    // ── عناصر خاصة ───────────────────────────────────────────────
    priceLine: '#2196f3',        // خط السعر الحالي
    crosshair: 'rgba(150,180,220,0.5)', // خط التقاطع
    timerText: '#ffd740',        // نص العداد التنازلي للشمعة
    timerTextBg: 'rgba(0,0,0,0.6)', // خلفية نص العداد
    
    // ── ✅ إعدادات جديدة للتحكم الدقيق ───────────────────────────
    timerShadow: 'rgba(0,15,40,0.4)', // ✅ توهج نص العداد (أفتح وأقل وضوحاً)
    minZoomAlpha: 0.9,           // ✅ شفافية الشموع عند التصغير الشديد (أعلى = أوضح)
  },
  
  // ───────────────────────────────────────────────────────────────────
  // ✅ إعدادات الواجهة (تؤثر على الرسم والـ UI معاً)
  // ───────────────────────────────────────────────────────────────────
  ui: {
    axisPriceWidth: 72,          // عرض محور السعر (بكسل)
    axisTimeHeight: 28,          // ارتفاع محور الوقت (بكسل)
    toolbarHeight: 48,           // ارتفاع شريط الأدوات
    crosshairBoxPadding: 8,      // حشو صندوق معلومات التقاطع
    alertDuration: 3700,         // مدة ظهور التنبيهات (مللي ثانية)
    
    // ✅ ✅ جديد: تحكم دقيق في العداد التنازلي
    timerOffsetX: 45,            // ✅ المسافة الأفقية للعداد من آخر شمعة
    timerOffsetY: 25,            // ✅ المسافة العمودية للعداد من سعر الشمعة
    enableTimerShadow: true,     // ✅ تفعيل/إلغاء توهج خلفية العداد
    timerFontSize: 11,           // ✅ حجم خط العداد
  },
  
  // ───────────────────────────────────────────────────────────────────
  // ✅ إعدادات التمرير والقصور الذاتي (محسّنة للموبايل)
  // ───────────────────────────────────────────────────────────────────
  inertia: {
    friction: 0.96,              // معامل الاحتكاك للتمرير بالقصور الذاتي
    minVelocity: 0.2,            // أقل سرعة لبدء تأثير القصور الذاتي
    maxHistory: 6,               // عدد النقاط التاريخية لحساب سرعة التمرير
    velocityMultiplier: 1.6,     // مضاعف سرعة التمرير للتجربة السلسة
  },
  
  // ───────────────────────────────────────────────────────────────────
  // ✅ ✅ جديد: إعدادات الزوم باللمس (Pinch Zoom) - للموبايل فقط
  // ───────────────────────────────────────────────────────────────────
  zoom: {
    pinchDamping: 0.7,           // ✅ تخفيف حركة الزوم (0.5=بطيء، 0.9=سريع)
    maxScalePerFrame: 0.15,      // ✅ أقصى تغيير في المقياس لكل إطار (15%)
    disableInertiaDuringZoom: true, // ✅ إيقاف القصور الذاتي أثناء الزوم لمنع التداخل
  },
  
  // ───────────────────────────────────────────────────────────────────
  // إعدادات المؤشرات والحسابات
  // ───────────────────────────────────────────────────────────────────
  indicators: {
    smaPeriods: [20, 50],        // فترات المتوسطات المتحركة البسيطة الافتراضية
    bbPeriod: 20,                // فترة بولينجر باندر
    bbMultiplier: 2,             // مضاعف الانحراف المعياري لبولينجر
    rsiPeriod: 14,               // فترة مؤشر RSI
    
    // ✅ جديد: معدل تحديث المؤشرات الديناميكية (مللي ثانية)
    updateRate: 100,             // ✅ تحديث كل 100مللي (قابل للتعديل عبر ChartControls)
    cacheTTL: 5000,              // ✅ صلاحية كاش المؤشرات: 5 ثواني
  },
  
  // ───────────────────────────────────────────────────────────────────
  // إعدادات الوقت والجلسات
  // ───────────────────────────────────────────────────────────────────
  timeframes: {
    '1s': 1000,
    '5s': 5000,
    '15s': 15000,
    '30s': 30000,
    '1m': 60000,
    '2m': 120000,
    '3m': 180000,
    '5m': 300000,
    '15m': 900000,
    '30m': 1800000,
    '1h': 3600000,
    '2h': 7200000,
    '4h': 14400000,
    '6h': 21600000,
    '12h': 43200000,
    '1d': 86400000,
    '3d': 259200000,
    '1w': 604800000
  },
  
  // ───────────────────────────────────────────────────────────────────
  // دوال مساعدة داخل الإعدادات (للاستخدام الداخلي)
  // ───────────────────────────────────────────────────────────────────
  
  /**
   * ✅ دالة موحدة لجلب الألوان مع قيمة افتراضية
   * @param {string} key - مفتاح اللون في CFG.colors
   * @param {string} fallback - القيمة الافتراضية إذا لم يوجد اللون
   * @returns {string} قيمة اللون
   */
  getColor: function(key, fallback) {
    return this.colors?.[key] || fallback || '#ffffff';
  },
  
  getIntervalMs: function(tf) {
    return this.timeframes[tf] || this.timeframes['1m'];
  },
  
  clamp: function(val, min, max) {
    return Math.max(min, Math.min(max, val));
  },
  
  // ✅ جديد: دالة للتحقق مما إذا كان الجهاز يدعم اللمس المتعدد
  supportsMultiTouch: function() {
    return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  }
};

// ─────────────────────────────────────────────────────────────────────
// Event Bus مركزي للاتصال بين المكونات (بدون اعتماديات خارجية)
// ─────────────────────────────────────────────────────────────────────
class EventBus {
  constructor() {
    this._listeners = Object.create(null);
  }
  
  /**
   * الاشتراك في حدث
   * @param {string} event - اسم الحدث
   * @param {Function} callback - الدالة المستمعة
   * @returns {Function} دالة لإلغاء الاشتراك
   */
  on(event, callback) {
    if (!this._listeners[event]) {
      this._listeners[event] = [];
    }
    this._listeners[event].push(callback);
    return () => this.off(event, callback);
  }
  
  /**
   * إلغاء الاشتراك من حدث
   * @param {string} event - اسم الحدث
   * @param {Function} callback - الدالة المراد إلغاء اشتراكها
   */
  off(event, callback) {
    if (!this._listeners[event]) return;
    this._listeners[event] = this._listeners[event].filter(cb => cb !== callback);
    if (this._listeners[event].length === 0) {
      delete this._listeners[event];
    }
  }
  
  /**
   * إطلاق حدث
   * @param {string} event - اسم الحدث
   * @param {...any} args - المعطيات المرسلة للمستمعين
   */
  emit(event, ...args) {
    if (!this._listeners[event]) return;
    const listeners = this._listeners[event].slice();
    for (const cb of listeners) {
      try {
        cb.apply(null, args);
      } catch (err) {
        console.error(`[EventBus] Error in listener for "${event}":`, err);
      }
    }
  }
  
  /**
   * إطلاق حدث مرة واحدة فقط
   * @param {string} event - اسم الحدث
   * @param {Function} callback - الدالة المستمعة
   */
  once(event, callback) {
    const wrapper = (...args) => {
      this.off(event, wrapper);
      callback.apply(null, args);
    };
    return this.on(event, wrapper);
  }
}

// إنشاء مثيل عالمي لاستخدامه في جميع الملفات
const bus = new EventBus();

// ═══════════════════════════════════════════════════════════════════════
// UTILITIES - دوال مساعدة (مُحسّنة وموثقة)
// ═══════════════════════════════════════════════════════════════════════
const Utils = {
  /**
   * تنسيق السعر حسب قيمته
   * @param {number} p - السعر
   * @returns {string} السعر مُنسّق
   */
  fmtPrice(p) {
    if (typeof p !== 'number' || isNaN(p)) return '—';
    return p >= 10000 ? p.toFixed(0) : p >= 1 ? p.toFixed(2) : p.toFixed(5);
  },
  
  /**
   * تنسيق الأرقام الكبيرة (حجم التداول)
   * @param {number} v - القيمة
   * @returns {string} القيمة مُنسّقة (K, M, B)
   */
  fmtVol(v) {
    if (!v) return '0';
    if (v > 1e9) return (v / 1e9).toFixed(2) + 'B';
    if (v > 1e6) return (v / 1e6).toFixed(2) + 'M';
    if (v > 1e3) return (v / 1e3).toFixed(2) + 'K';
    return v.toFixed(0);
  },
  
  /**
   * تنسيق الوقت المتبقي للشمعة الحالية
   * @param {number} ms - المللي ثانية المتبقية
   * @returns {string} الوقت مُنسّق (MM:SS أو H:MM:SS)
   */
  formatTimeLeft(ms) {
    const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  },
  
  /**
   * الحصول على مدة الإطار الزمني بالمللي ثانية
   * @param {string} str - رمز الإطار الزمني (1m, 5m, 1h...)
   * @returns {number} المدة بالمللي ثانية
   */
  getIntervalMs(str) {
    const map = { 
      '1s': 1000, '5s': 5000, '15s': 15000, '30s': 30000,
      '1m': 60000, '5m': 300000, '15m': 900000, '1h': 3600000, 
      '4h': 14400000, '1d': 86400000 
    };
    return map[str] || 60000;
  },
  
  /**
   * ✅ جديد: تحويل لون HEX إلى RGBA
   * @param {string} hex - اللون بصيغة #RRGGBB
   * @param {number} alpha - الشفافية (0-1)
   * @returns {string} اللون بصيغة rgba()
   */
  hexToRgba(hex, alpha = 1) {
    if (!hex || typeof hex !== 'string') return `rgba(255,255,255,${alpha})`;
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
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
    }

    /**
     * تسجيل مؤشر جديد في النظام
     * @param {string} id - معرف فريد للمؤشر
     * @param {Object} plugin - كائن المؤشر (يجب أن يحتوي على calculate)
     * @returns {boolean} نجاح/فشل التسجيل
     */
    register(id, plugin) {
      if (!id || typeof plugin !== 'object' || !plugin.calculate) {
        console.error(`[IndicatorRegistry] Invalid plugin registration for "${id}"`);
        return false;
      }
      if (this.plugins[id]) {
        console.warn(`[IndicatorRegistry] Plugin "${id}" already registered, overwriting`);
      }
      
      // دمج الإعدادات وحالة التشغيل الافتراضية
      this.plugins[id] = {
        id,
        enabled: false,
        ...plugin
      };
      
      console.log(`[IndicatorRegistry] ✓ Registered: ${plugin.name || id}`);

      // إذا كان التطبيق جاهزاً، أخطرِه فوراً
      if (this._initialized && typeof window.chartApp !== 'undefined' && typeof bus !== 'undefined') {
        bus.emit('indicator:registered', { id, plugin });
      } else {
        // تخزين للتسجيل لاحقاً إذا لم يكن التطبيق جاهزاً
        this._pendingRegistrations.push({ id, plugin });
      }
      return true;
    }

    /**
     * الحصول على مؤشر مسجّل
     * @param {string} id - معرف المؤشر
     * @returns {Object|null} كائن المؤشر أو null
     */
    get(id) { return this.plugins[id] || null; }
    
    /**
     * الحصول على جميع المؤشرات المسجّلة
     * @returns {Array} مصفوفة المؤشرات
     */
    getAll() { return Object.values(this.plugins); }
    
    /**
     * الحصول على المؤشرات المفعّلة فقط
     * @returns {Array} مصفوفة المؤشرات المفعّلة
     */
    getEnabled() { return Object.values(this.plugins).filter(p => p.enabled); }
    
    /**
     * التحقق من وجود مؤشر
     * @param {string} id - معرف المؤشر
     * @returns {boolean} موجود أم لا
     */
    has(id) { return id in this.plugins; }
    
    /**
     * إزالة مؤشر مسجّل
     * @param {string} id - معرف المؤشر
     * @returns {boolean} نجاح/فشل الإزالة
     */
    unregister(id) {
      const plugin = this.plugins[id];
      if (plugin?.destroy && typeof plugin.destroy === 'function') {
        try { plugin.destroy(); } catch(e) {}
      }
      delete this.plugins[id];
      return true;
    }
    
    /**
     * ✅ تعليم النظام بأنه جاهز (يُستدعى من app.js)
     */
    markInitialized() { 
      this._initialized = true;
      // معالجة التسجيلات المؤجلة
      for (const { id, plugin } of this._pendingRegistrations) {
        if (typeof window.chartApp !== 'undefined' && typeof bus !== 'undefined') {
          bus.emit('indicator:registered', { id, plugin });
        }
      }
      this._pendingRegistrations = [];
    }
    
    /**
     * ✅ جديد: إعادة تعيين جميع المؤشرات (لأغراض التطوير)
     */
    reset() {
      for (const [id, plugin] of Object.entries(this.plugins)) {
        if (plugin?.destroy) plugin.destroy();
      }
      this.plugins = {};
      this._pendingRegistrations = [];
      console.log('[IndicatorRegistry] ✓ All plugins reset');
    }
  })();
}

// ═══════════════════════════════════════════════════════════════════════
// ✅ ✅ جديد: واجهة تحكم عالمية موحدة (تُضاف تلقائياً بواسطة app.js)
// يمكن استخدامها من الكونسول للتحكم السريع في الإعدادات
// ═══════════════════════════════════════════════════════════════════════
// أمثلة للاستخدام:
//   ChartControls.setIndicatorRate(200);        // تحديث المؤشرات كل 200مللي
//   ChartControls.setColors({ up: '#00ff88' }); // تغيير لون الشموع الصاعدة
//   ChartControls.setZoomLimits(2, 50);         // ضبط حدود الزوم
//   ChartControls.toggleTimerShadow(false);     // إخفاء توهج العداد
//   ChartControls.setTimerOffset(60, 35);       // ضبط موضع العداد
// ═══════════════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────────────────
// تصدير الإعدادات (للتوافق مع وحدات ES6 إذا لزم الأمر لاحقاً)
// ─────────────────────────────────────────────────────────────────────
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { CFG, EventBus, bus, Utils };
}

// ─────────────────────────────────────────────────────────────────────
// ✅ تسجيل معلومات النسخة للتشخيص
// ─────────────────────────────────────────────────────────────────────
console.log(`[CFG] Loaded v2.0 | Mobile: ${CFG.isMobile} | DPR: ${CFG.dpr}`);
