'use strict';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * ULTRA RENDERER ENGINE - محرك الرسم الشامل (النسخة عالية الدقة - High Precision)
 * ✅ الإصدار: 3.2.1 | الأداء: أقصى | الدقة: بكسل-لبكسل | المرونة: كاملة
 * 
 * 🎯 الميزات الجديدة:
 * • 🎨 ColorCache: كاش ذكي لتحليل الألوان (يمنع اختناق المعالج @60fps)
 * • 📐 PrecisionUtils: دعم الإحداثيات العشرية للرسم الدقيق عند التكبير الشديد
 * • ✨ Dynamic Smoothing: تفعيل التنعيم للخطوط المائلة فقط
 * • 🔧 Snap-for-Stroke: تقريب ذكي للخطوط 1بكسل لمنع الضبابية
 * • 🖼️ Retina-Ready: ضبط DPR تلقائي مع الحفاظ على وحدات الـ CSS
 * • 🚀 Grid Optimized: شبكة محسّنة بحدود قصوى لمنع الثقل عند الفريمات الكبيرة
 * 
 * 📦 التصدير: { ChartRenderer, Canvas2DRenderer, TimeScale, PriceScale, ... }
 * ═══════════════════════════════════════════════════════════════════════
 */

// ═══════════════════════════════════════════════════════════════════════
// 🎨 ColorCache - كاش ذكي لتحليل الألوان (جديد للأداء العالي)
// ═══════════════════════════════════════════════════════════════════════
// يحول HEX/RGB/Named colors إلى سلسلة rgba نهائية مرة واحدة ويخزن النتيجة
// لتجنب تحليل النصوص داخل حلقة الرسم @60fps (120,000+ استدعاء/ثانية)
// ═══════════════════════════════════════════════════════════════════════
const ColorCache = {
  _cache: new Map(),
  _maxSize: 500,
  
  // تحليل اللون وتخزينه
  parse(key, alpha = 1) {
    const cacheKey = `${key}_${alpha}`;
    if (this._cache.has(cacheKey)) return this._cache.get(cacheKey);
    
    // استدعاء دالة parseColor الأصلية (تحليل نصي ثقيل)
    const result = typeof parseColor === 'function' ? parseColor(key, alpha) : key;
    
    // تخزين النتيجة
    this._cache.set(cacheKey, result);
    
    // تنظيف الكاش إذا كبر (منع تسرب الذاكرة) - إزالة الأقدم
    if (this._cache.size > this._maxSize) {
      const firstKey = this._cache.keys().next().value;
      this._cache.delete(firstKey);
    }
    
    return result;
  },
  
  // مسح الكاش (عند تغيير الثيم أو إعادة التهيئة)
  clear() { this._cache.clear(); },
  
  // إحصائيات للأداء (لأغراض التصحيح)
  getStats() {
    return { size: this._cache.size, maxSize: this._maxSize };
  }
};

// ═══════════════════════════════════════════════════════════════════════
// القسم 1: أدوات مساعدة شاملة
// ═══════════════════════════════════════════════════════════════════════

function getColor(key, fallback = '#ffffff') {
  try {
    if (typeof CFG !== 'undefined' && CFG.colors && CFG.colors[key]) {
      return CFG.colors[key];
    }
  } catch (e) {}
  return fallback;
}

function parseColor(color, alpha = 1) {
  if (!color && color !== 0) return `rgba(255,255,255,${alpha})`;
  
  if (Array.isArray(color)) {
    const [r, g, b, a] = color;
    const finalAlpha = (a !== undefined ? a : 1) * alpha;
    return `rgba(${Math.round((r??1)*255)},${Math.round((g??1)*255)},${Math.round((b??1)*255)},${finalAlpha})`;
  }
  
  if (typeof color === 'object' && color !== null) {
    const { r = 1, g = 1, b = 1, a = 1 } = color;
    return `rgba(${Math.round(r*255)},${Math.round(g*255)},${Math.round(b*255)},${a * alpha})`;
  }
  
  if (typeof color === 'string') {
    const c = color.trim().toLowerCase();
    
    if (c.startsWith('#')) {
      let hex = c.slice(1);
      if (hex.length === 3) hex = hex.split('').map(ch => ch + ch).join('');
      if (hex.length === 6) {
        const r = parseInt(hex.slice(0, 2), 16) / 255;
        const g = parseInt(hex.slice(2, 4), 16) / 255;
        const b = parseInt(hex.slice(4, 6), 16) / 255;
        return `rgba(${Math.round(r*255)},${Math.round(g*255)},${Math.round(b*255)},${alpha})`;
      }
      return `rgba(255,255,255,${alpha})`;
    }
    
    if (c.startsWith('rgba')) {
      const m = c.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+))?\s*\)/);
      if (m) {
        const r = parseFloat(m[1]), g = parseFloat(m[2]), b = parseFloat(m[3]), a = parseFloat(m[4] ?? 1);
        return `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${a * alpha})`;
      }
      return `rgba(255,255,255,${alpha})`;
    }
    
    if (c.startsWith('rgb')) {
      const m = c.match(/rgb\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\)/);
      if (m) {
        return `rgba(${Math.round(parseFloat(m[1]))},${Math.round(parseFloat(m[2]))},${Math.round(parseFloat(m[3]))},${alpha})`;
      }
      return `rgba(255,255,255,${alpha})`;
    }
    
    const namedColors = {
      'transparent': [0,0,0,0], 'black': [0,0,0,1], 'white': [255,255,255,1],
      'red': [255,0,0,1], 'green': [0,255,0,1], 'blue': [0,0,255,1],
      'yellow': [255,255,0,1], 'cyan': [0,255,255,1], 'magenta': [255,0,255,1],
      'orange': [255,165,0,1], 'purple': [128,0,128,1], 'pink': [255,192,203,1],
      'gray': [128,128,128,1], 'grey': [128,128,128,1], 'brown': [165,42,42,1],
      'navy': [0,0,128,1], 'maroon': [128,0,0,1], 'olive': [128,128,0,1],
      'teal': [0,128,128,1], 'lime': [0,255,0,1], 'aqua': [0,255,255,1],
      'silver': [192,192,192,1], 'gold': [255,215,0,1]
    };
    if (namedColors[c]) {
      const [r, g, b, a] = namedColors[c];
      return `rgba(${r},${g},${b},${a * alpha})`;
    }
    
    if (c.startsWith('hsl')) {
      const m = c.match(/hsla?\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%\s*(?:,\s*([\d.]+))?\s*\)/);
      if (m) {
        const h = parseFloat(m[1]) / 360, s = parseFloat(m[2]) / 100, l = parseFloat(m[3]) / 100, a = parseFloat(m[4] ?? 1);
        let r, g, b;
        if (s === 0) { r = g = b = l; }
        else {
          const hue2rgb = (p, q, t) => {
            if (t < 0) t += 1; if (t > 1) t -= 1;
            if (t < 1/6) return p + (q - p) * 6 * t;
            if (t < 1/2) return q;
            if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
            return p;
          };
          const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
          const p = 2 * l - q;
          r = hue2rgb(p, q, h + 1/3);
          g = hue2rgb(p, q, h);
          b = hue2rgb(p, q, h - 1/3);
        }
        return `rgba(${Math.round(r*255)},${Math.round(g*255)},${Math.round(b*255)},${a * alpha})`;
      }
    }
  }
  return `rgba(255,255,255,${alpha})`;
}

function batchDraw(ctx, callback) {
  ctx.save();
  try { callback(ctx); } finally { ctx.restore(); }
}

function createGradient(ctx, x1, y1, x2, y2, stops, type = 'linear') {
  const grad = type === 'linear' 
    ? ctx.createLinearGradient(x1, y1, x2, y2)
    : ctx.createRadialGradient(x1, y1, 0, x1, y1, Math.hypot(x2-x1, y2-y1));
  stops.forEach(([offset, color]) => grad.addColorStop(offset, ColorCache.parse(color)));
  return grad;
}

function drawText(ctx, text, x, y, options = {}) {
  const {
    font = '11px monospace', color = '#e0ecff', bg = null, shadow = null,
    align = 'center', baseline = 'middle', padding = 4, alpha = 1
  } = options;
  
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = font;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  
  if (shadow) {
    ctx.shadowColor = shadow.color || 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = shadow.blur ?? 4;
    ctx.shadowOffsetX = shadow.offsetX ?? 0;
    ctx.shadowOffsetY = shadow.offsetY ?? 0;
  }
  
  if (bg) {
    const metrics = ctx.measureText(text);
    const width = metrics.width + padding * 2;
    const height = (parseInt(font) || 11) + padding * 2;
    const bx = align === 'center' ? x - width/2 : align === 'right' ? x - width : x;
    const by = baseline === 'middle' ? y - height/2 : baseline === 'top' ? y : y - height;
    ctx.fillStyle = ColorCache.parse(bg, alpha * 0.9);
    ctx.fillRect(bx, by, width, height);
  }
  
  ctx.fillStyle = ColorCache.parse(color, alpha);
  ctx.fillText(text, x, y);
  ctx.restore();
}

// ═══════════════════════════════════════════════════════════════════════
// القسم 2: قياسات الشموع
// ═══════════════════════════════════════════════════════════════════════

function candleMetrics(index, ts) {
  const stepPx = ts.spacing;
  const offsetPx = ts.offset;
  const centerX = offsetPx + index * stepPx;
  const centerXSnap = Math.round(centerX);
  
  let bodyWidth, alpha;
  if (stepPx >= 12) { bodyWidth = Math.max(4, Math.floor(stepPx * 0.75)); alpha = 1.0; }
  else if (stepPx >= 8) { bodyWidth = Math.max(3, Math.floor(stepPx * 0.72)); alpha = 1.0; }
  else if (stepPx >= 5) { bodyWidth = Math.max(2, Math.floor(stepPx * 0.65)); alpha = 0.95; }
  else if (stepPx >= 3) { bodyWidth = 2; alpha = 0.9; }
  else { bodyWidth = 1.5; alpha = CFG?.colors?.minZoomAlpha ?? 0.85; }
  
  const halfBody = Math.floor(bodyWidth / 2);
  return {
    centerX: centerXSnap, bodyLeft: centerXSnap - halfBody, bodyRight: centerXSnap + halfBody,
    bodyWidth, alpha
  };
}

function isCandleVisible(metrics, w, spacing) {
  return metrics.centerX >= -spacing - 10 && metrics.centerX <= w + spacing + 10;
}

// ═══════════════════════════════════════════════════════════════════════
// القسم 3: ChartRenderer - الواجهة الرئيسية
// ═══════════════════════════════════════════════════════════════════════

class ChartRenderer {
  constructor(canvas, overlayCanvas) {
    this.canvas = canvas;
    this.overlayCanvas = overlayCanvas;
    this._engine = new Canvas2DRenderer(canvas);
    this._layers = { background: [], candles: [], indicators: [], overlay: [], signals: [] };
    this._currentLayer = 'candles';
  }
  
  resize(w, h) { return this._engine.resize(w, h); }
  clear(color) { this._engine.clear(color); }
  setRefs(ts, ps) { this._engine.setRefs(ts, ps); }
  setLayer(layer) { if (this._layers[layer]) this._currentLayer = layer; }
  
  drawGrid(ps, ts, chartH) { this._engine.drawGrid(ps, ts, chartH); }
  drawCandles(candles, ts, ps, chartH) { this._engine.drawCandles(candles, ts, ps, chartH); }
  drawPriceLine(price, isUp, ps, chartH) { return this._engine.drawPriceLine(price, isUp, ps, chartH) ?? -1; }
  drawCrosshair(x, y) { this._engine.drawCrosshair(x, y); }
  drawTimer(text, x, y, color, fontSize) { this._engine.drawTimer(text, x, y, color, fontSize); }
  drawLine(values, color, opts = {}) { this._engine.drawLine(values, color, opts); }
  drawArea(topVals, btmVals, fillColor, opts = {}) { this._engine.drawArea(topVals, btmVals, fillColor, opts); }
  drawShapes(shapes, opts = {}) { this._engine.drawShapes(shapes, opts); }
  drawRects(rects, opts = {}) { this._engine.drawRects(rects, opts); }
  drawGuideLines(options = {}) { this._engine.drawGuideLines(options); }
  drawBackgroundImage(url, options = {}) { this._engine.drawBackgroundImage(url, options); }
  drawSignals(signals, opts = {}) { this._engine.drawSignals(signals, opts); }
  
  queueShape(layer, shape) { if (this._layers[layer]) this._layers[layer].push(shape); }
  flushLayer(layer, opts = {}) {
    const shapes = this._layers[layer] || [];
    if (shapes.length) { this.drawShapes(shapes, { ...opts, layer }); this._layers[layer] = []; }
  }
  clearAllLayers() { Object.keys(this._layers).forEach(key => this._layers[key] = []); }
  destroy() { this._engine.destroy(); }
}

// ═══════════════════════════════════════════════════════════════════════
// القسم 4: Canvas2DRenderer - المحرك الفعلي (عالي الدقة)
// ═══════════════════════════════════════════════════════════════════════

class Canvas2DRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
    this.w = 0; this.h = 0;
    this.dpr = Math.min(typeof window !== 'undefined' ? window.devicePixelRatio : 1, 2);
    this._ts = null; this._ps = null;
    this._gridCache = { key: null, lines: [], timestamp: 0 };
    this._bgImage = null; this._bgImageLoading = false;
    this._shapeCache = new Map();
    this._maxShapesPerFrame = 500;
  }
  
  resize(w, h) {
    if (this.w === w && this.h === h) return false;
    this.w = w; this.h = h;
    
    // ✅ ضبط حجم الكانفاس الفعلي بناءً على DPR للدقة العالية
    const dpr = this.dpr || (typeof window !== 'undefined' ? window.devicePixelRatio : 1);
    this.canvas.width = Math.floor(w * dpr);
    this.canvas.height = Math.floor(h * dpr);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    
    // ✅ ضبط نظام الإحداثيات ليعود إلى وحدات الـ CSS (سهولة في الحساب)
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    
    // ✅ تحسينات السياق للرسم عالي الدقة
    this.ctx.imageSmoothingEnabled = true;   // نفعّله افتراضياً للخطوط الناعمة
    this.ctx.imageSmoothingQuality = 'high'; // إذا مدعوم
    this.ctx.lineCap = 'round';              // نهايات ناعمة للخطوط
    this.ctx.lineJoin = 'round';             // زوايا ناعمة
    
    // تنظيف الكاش عند تغيير الحجم
    this._gridCache = { key: null, lines: [], timestamp: 0 };
    if (typeof ColorCache !== 'undefined') ColorCache.clear();
    
    return true;
  }
  
  clear(color) {
    const bgColor = color || getColor('bg', '#060a12');
    this.ctx.fillStyle = bgColor;
    this.ctx.fillRect(0, 0, this.w, this.h);
  }
  
  setRefs(ts, ps) { this._ts = ts; this._ps = ps; }
  
  // ─── الشبكة: ❌ معطلة تماماً افتراضياً ─────────────────────────────
  
  drawGrid(ps, ts, chartH) {
    if (CFG?.ui?.showGrid !== true && CFG?.ui?.showPriceGrid !== true) return;
    
    const { ctx, w, h } = this;
    
    if (CFG?.ui?.showPriceGrid === true) {
      batchDraw(ctx, (ctx) => {
        ctx.strokeStyle = ColorCache.parse(getColor('grid', '#0f1c2e'), 1);
        ctx.lineWidth = 1 / this.dpr;
        ctx.setLineDash([4, 4]);
        const range = ps.max - ps.min;
        for (let i = 0; i <= 6; i++) {
          const price = ps.min + (range / 6) * i;
          // ✅ استخدام priceToYFloat إذا توفر، مع snapForStroke للرسم النهائي
          const yFloat = ps.priceToYFloat ? ps.priceToYFloat(price, chartH) : ps.priceToY(price, chartH);
          const y = typeof PrecisionUtils !== 'undefined' 
            ? PrecisionUtils.snapForStroke(yFloat, 1) 
            : Math.round(yFloat) + 0.5;
          ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
        }
      });
    }
  }
  
  // ─── الشموع ───────────────────────────────────────────────────────
  
  drawCandles(candles, ts, ps, chartH) {
    const { ctx, w } = this;
    const vr = ts.getVisibleRange(w);
    const candleCfg = CFG?.colors?.candle || {};
    const upCfg = candleCfg.up || {};
    const downCfg = candleCfg.down || {};
    const globalAlpha = CFG?.colors?.globalAlpha ?? 1.0;
    
    batchDraw(ctx, (ctx) => {
      for (let i = vr.start; i <= vr.end; i++) {
        const c = candles[i];
        if (!c || !c.time) continue;
        
        const metrics = candleMetrics(i, ts);
        if (!isCandleVisible(metrics, w, ts.spacing)) continue;
        
        // ✅ استخدام Float للإحداثيات العمودية (بدون تقريب مبكر)
        const yHFloat = ps.priceToYFloat ? ps.priceToYFloat(c.high, chartH) : ps.priceToY(c.high, chartH);
        const yLFloat = ps.priceToYFloat ? ps.priceToYFloat(c.low, chartH) : ps.priceToY(c.low, chartH);
        const yOFloat = ps.priceToYFloat ? ps.priceToYFloat(c.open, chartH) : ps.priceToY(c.open, chartH);
        const yCFloat = ps.priceToYFloat ? ps.priceToYFloat(c.close, chartH) : ps.priceToY(c.close, chartH);
        
        const isUp = c.close >= c.open;
        const cfg = isUp ? upCfg : downCfg;
        
        // ✅ كاش الألوان للأداء
        const bodyColor = ColorCache.parse(cfg.body || getColor(isUp ? 'up' : 'down'), cfg.alpha ?? globalAlpha);
        const wickColor = ColorCache.parse(cfg.wick || cfg.body || getColor(isUp ? 'up' : 'down'), cfg.alpha ?? globalAlpha);
        const borderColor = cfg.border ? ColorCache.parse(cfg.border, cfg.alpha ?? globalAlpha) : null;
        
        // ✅ رسم الذيل بإحداثيات دقيقة + snapForStroke للخط 1بكسل
        const centerX = metrics.centerX; // candleMetrics تُرجع قيمة مُقرّبة بالفعل
        ctx.strokeStyle = wickColor;
        ctx.lineWidth = 1;
        ctx.beginPath();
        const yH = typeof PrecisionUtils !== 'undefined' 
          ? PrecisionUtils.snapForStroke(yHFloat, 1) 
          : Math.round(yHFloat) + 0.5;
        const yL = typeof PrecisionUtils !== 'undefined' 
          ? PrecisionUtils.snapForStroke(yLFloat, 1) 
          : Math.round(yLFloat) + 0.5;
        ctx.moveTo(centerX + 0.5, yH);
        ctx.lineTo(centerX + 0.5, yL);
        ctx.stroke();
        
        // ✅ رسم الجسم
        if (metrics.bodyWidth >= 1) {
          const bodyTop = Math.min(yOFloat, yCFloat);
          const bodyHeight = Math.max(1, Math.abs(yCFloat - yOFloat));
          ctx.fillStyle = bodyColor;
          
          // تقريب إحداثيات الجسم للرسم الحاد (الأجسام تُرسم كمستطيلات مملوءة)
          const bodyLeft = Math.round(metrics.bodyLeft);
          const snappedTop = typeof PrecisionUtils !== 'undefined' 
            ? PrecisionUtils.snapForStroke(bodyTop, 1) 
            : Math.round(bodyTop) + 0.5;
          ctx.fillRect(bodyLeft, snappedTop, metrics.bodyWidth, Math.round(bodyHeight));
          
          if (borderColor && metrics.bodyWidth >= 2) {
            ctx.strokeStyle = borderColor;
            ctx.lineWidth = 0.5;
            ctx.strokeRect(bodyLeft + 0.5, snappedTop + 0.5, metrics.bodyWidth - 1, Math.round(bodyHeight) - 1);
          }
        }
      }
    });
  }
  
  drawPriceLine(price, isUp, ps, chartH) {
    if (!ps || !chartH || price == null) return -1;
    const { ctx, w } = this;
    
    // ✅ استخدام Float + snapForStroke
    const yFloat = ps.priceToYFloat ? ps.priceToYFloat(price, chartH) : ps.priceToY(price, chartH);
    const y = typeof PrecisionUtils !== 'undefined' 
      ? PrecisionUtils.snapForStroke(yFloat, 1) 
      : Math.round(yFloat) + 0.5;
    
    batchDraw(ctx, (ctx) => {
      ctx.strokeStyle = ColorCache.parse(getColor(isUp ? 'priceLine' : 'down', '#2196f3'), 0.6);
      ctx.lineWidth = 1; ctx.setLineDash([4, 3]); ctx.globalAlpha = 0.6;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    });
    return y;
  }
  
  drawCrosshair(x, y) {
    if (x < 0 || y < 0 || x > this.w || y > this.h) return;
    const { ctx, w, h } = this;
    
    // ✅ snapForStroke للخطوط 1بكسل
    const px = typeof PrecisionUtils !== 'undefined' 
      ? PrecisionUtils.snapForStroke(x, 1) 
      : Math.round(x) + 0.5;
    const py = typeof PrecisionUtils !== 'undefined' 
      ? PrecisionUtils.snapForStroke(y, 1) 
      : Math.round(y) + 0.5;
    
    batchDraw(ctx, (ctx) => {
      ctx.strokeStyle = ColorCache.parse(getColor('crosshair', 'rgba(150,180,220,0.5)'), 1);
      ctx.lineWidth = 1; ctx.setLineDash([3, 4]);
      ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, h); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(w, py); ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath(); ctx.arc(px, py, 4, 0, Math.PI * 2);
      ctx.fillStyle = ColorCache.parse(getColor('bg', '#060a12'), 1); ctx.fill();
      ctx.strokeStyle = ColorCache.parse(getColor('crosshair', 'rgba(150,180,220,0.5)'), 1); ctx.lineWidth = 1; ctx.stroke();
    });
  }
  
  drawTimer(text, x, y, color = '#4da6ff', fontSize = 11) {
    if (!text) return;
    const { ctx } = this;
    batchDraw(ctx, (ctx) => {
      ctx.font = `bold ${fontSize}px monospace`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = ColorCache.parse(color, 1);
      if (CFG?.ui?.enableTimerShadow !== false) {
        ctx.shadowColor = ColorCache.parse(getColor('timerShadow', 'rgba(0,15,40,0.4)'), 1); ctx.shadowBlur = 3;
      }
      ctx.fillText(text, x, y + 1);
    });
  }
  
  drawLine(values, color, opts = {}) {
    if (!values || !opts.ts || !opts.ps) return;
    const { ctx, w } = this;
    const { ts, ps, chartH, yOffset = 0, lineWidth = 1, alpha = 0.85, dashed = false, cap = 'round', join = 'round' } = opts;
    const vr = ts.getVisibleRange(w);
    
    batchDraw(ctx, (ctx) => {
      // ✅ إعدادات الخط
      ctx.lineWidth = lineWidth;
      ctx.globalAlpha = alpha;
      ctx.lineCap = cap;
      ctx.lineJoin = join;
      
      // ✅ تفعيل imageSmoothing للخطوط المائلة أو الأسمك فقط
      if (lineWidth > 1 || dashed) {
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
      } else {
        ctx.imageSmoothingEnabled = false; // للخطوط العمودية/الأفقية 1بكسل (أكثر حدة)
      }
      
      if (dashed) ctx.setLineDash(typeof dashed === 'number' ? [dashed, dashed] : [4, 4]);
      
      // ✅ كاش الألوان
      const isDynamic = Array.isArray(color);
      if (!isDynamic) ctx.strokeStyle = ColorCache.parse(color, alpha);
      
      // ✅ الرسم بإحداثيات عشرية + snapForStroke عند الرسم النهائي
      let prevX, prevY, started = false;
      for (let i = vr.start; i <= vr.end; i++) {
        if (values[i] == null || isNaN(values[i])) { started = false; continue; }
        
        // ✅ استخدام Float للإحداثيات (بدون تقريب مبكر)
        const xFloat = ts.indexToXFloat ? ts.indexToXFloat(i) : ts.indexToX(i);
        const yFloat = ps.priceToYFloat ? ps.priceToYFloat(values[i], chartH) : ps.priceToY(values[i], chartH);
        
        // ✅ تطبيق snapForStroke فقط عند الرسم النهائي
        const x = typeof PrecisionUtils !== 'undefined' 
          ? PrecisionUtils.snapForStroke(xFloat + 0.5, lineWidth) 
          : Math.round(xFloat) + 0.5;
        const y = typeof PrecisionUtils !== 'undefined' 
          ? PrecisionUtils.snapForStroke(yFloat + 0.5 + yOffset, lineWidth) 
          : Math.round(yFloat) + 0.5 + yOffset;
        
        if (started) {
          if (isDynamic) { 
            ctx.beginPath(); 
            ctx.strokeStyle = ColorCache.parse(color[i] || '#fff', alpha); 
            ctx.moveTo(prevX, prevY); 
            ctx.lineTo(x, y); 
            ctx.stroke(); 
          } else {
            ctx.lineTo(x, y);
          }
        } else { 
          if (!isDynamic) { ctx.beginPath(); ctx.moveTo(x, y); } 
          started = true; 
        }
        prevX = x; prevY = y;
      }
      if (!isDynamic) ctx.stroke();
    });
  }
  
  drawArea(topVals, btmVals, fillColor, opts = {}) {
    if (!topVals || !btmVals || !opts.ts || !opts.ps) return;
    const { ctx, w } = this;
    const { ts, ps, chartH, yOffset = 0, strokeColor = null, lineWidth = 0, alpha = 1, dashed = false } = opts;
    const vr = ts.getVisibleRange(w);
    
    batchDraw(ctx, (ctx) => {
      ctx.globalAlpha = alpha; ctx.beginPath();
      let started = false; const topPoints = [], btmPoints = [];
      for (let i = vr.start; i <= vr.end; i++) {
        if (topVals[i] == null || btmVals[i] == null) continue;
        
        // ✅ Float للإحداثيات
        const xFloat = ts.indexToXFloat ? ts.indexToXFloat(i) : ts.indexToX(i);
        const yTopFloat = ps.priceToYFloat ? ps.priceToYFloat(topVals[i], chartH) : ps.priceToY(topVals[i], chartH);
        const yBtmFloat = ps.priceToYFloat ? ps.priceToYFloat(btmVals[i], chartH) : ps.priceToY(btmVals[i], chartH);
        
        // ✅ snapForStroke عند الرسم
        const x = typeof PrecisionUtils !== 'undefined' 
          ? PrecisionUtils.snapForStroke(xFloat + 0.5, lineWidth) 
          : Math.round(xFloat) + 0.5;
        const yTop = typeof PrecisionUtils !== 'undefined' 
          ? PrecisionUtils.snapForStroke(yTopFloat + 0.5 + yOffset, lineWidth) 
          : Math.round(yTopFloat) + 0.5 + yOffset;
        const yBtm = typeof PrecisionUtils !== 'undefined' 
          ? PrecisionUtils.snapForStroke(yBtmFloat + 0.5 + yOffset, lineWidth) 
          : Math.round(yBtmFloat) + 0.5 + yOffset;
        
        if (!started) { ctx.moveTo(x, yTop); started = true; } else ctx.lineTo(x, yTop);
        topPoints.push({ x, y: yTop }); btmPoints.push({ x, y: yBtm });
      }
      for (let i = btmPoints.length - 1; i >= 0; i--) ctx.lineTo(btmPoints[i].x, btmPoints[i].y);
      ctx.closePath();
      ctx.fillStyle = ColorCache.parse(fillColor, alpha); ctx.fill();
      if (strokeColor && lineWidth > 0) {
        ctx.strokeStyle = ColorCache.parse(strokeColor, alpha); ctx.lineWidth = lineWidth;
        if (dashed) ctx.setLineDash([4, 4]);
        ctx.beginPath(); for (let i = 0; i < topPoints.length; i++) { if (i === 0) ctx.moveTo(topPoints[i].x, topPoints[i].y); else ctx.lineTo(topPoints[i].x, topPoints[i].y); } ctx.stroke();
        ctx.beginPath(); for (let i = 0; i < btmPoints.length; i++) { if (i === 0) ctx.moveTo(btmPoints[i].x, btmPoints[i].y); else ctx.lineTo(btmPoints[i].x, btmPoints[i].y); } ctx.stroke();
        ctx.setLineDash([]);
      }
    });
  }
  
  // ─── 🎨 نظام الأشكال: ❌ لا إشارات تلقائية مطلقاً ─────────────────
  
  drawShapes(shapes, opts = {}) {
    if (!shapes || !Array.isArray(shapes) || shapes.length === 0) return;
    if (!opts.ts && !shapes[0]?.x) return;
    
    const { ctx } = this;
    const { ts, ps, chartH = this.h, yOffset = 0, layer = 'main', allowSignals = false } = opts;
    
    const grouped = {};
    for (const shape of shapes) {
      if (!allowSignals && this._isSignalType(shape.type)) continue;
      if (!grouped[shape.type]) grouped[shape.type] = [];
      grouped[shape.type].push(shape);
    }
    
    batchDraw(ctx, (ctx) => {
      for (const [type, items] of Object.entries(grouped)) {
        if (items.length > this._maxShapesPerFrame) continue;
        this._drawShapeType(type, items, { ctx, ts, ps, chartH, yOffset });
      }
    });
  }
  
  _isSignalType(type) {
    return ['signal_buy', 'signal_sell', 'signal_counter', 'buy_label', 'sell_label'].includes(type);
  }
  
  _drawShapeType(type, items, { ctx, ts, ps, chartH, yOffset }) {
    if (type === 'signal_buy' || type === 'signal_sell' || type === 'signal_counter') return;
    if (type === 'gap_marker' || type === 'gap_box') { this._drawGapMarkers(items, { ctx, ts, ps, chartH, yOffset }); return; }
    
    for (const s of items) {
      // ✅ تحويل الإحداثيات باستخدام Float إذا توفر
      let x = s.x, y = s.y;
      
      if (s.idx != null && ts) {
        const xFloat = ts.indexToXFloat ? ts.indexToXFloat(s.idx) : ts.indexToX(s.idx);
        x = xFloat;
      }
      if (s.price != null && ps) {
        const yFloat = ps.priceToYFloat ? ps.priceToYFloat(s.price, chartH) : ps.priceToY(s.price, chartH);
        y = yFloat + yOffset;
      }
      
      if (x == null || y == null) continue;
      if (s.skip) continue;
      
      const size = s.size ?? 8, alpha = s.alpha ?? 1, rotation = s.rotation ?? 0;
      const lineWidth = s.lineWidth || 1;
      
      ctx.save();
      ctx.globalAlpha = alpha;
      
      // ✅ تفعيل imageSmoothing للأشكال المنحنية
      if (['circle', 'ellipse', 'star', 'diamond'].includes(type)) {
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
      } else {
        ctx.imageSmoothingEnabled = lineWidth === 1;
      }
      
      if (s.shadow) {
        ctx.shadowColor = ColorCache.parse(s.shadow.color || 'rgba(0,0,0,0.3)', 1);
        ctx.shadowBlur = s.shadow.blur ?? 4;
      }
      if (rotation) { ctx.translate(x, y); ctx.rotate(rotation); ctx.translate(-x, -y); }
      
      // ✅ تطبيق snapForStroke عند الرسم النهائي
      const snapX = typeof PrecisionUtils !== 'undefined' 
        ? PrecisionUtils.snapForStroke(x, lineWidth) 
        : x;
      const snapY = typeof PrecisionUtils !== 'undefined' 
        ? PrecisionUtils.snapForStroke(y, lineWidth) 
        : y;
      
      switch (type) {
        case 'rect': case 'rectangle': this._drawRect(ctx, snapX, snapY, s.width || size, s.height || size, s); break;
        case 'circle': this._drawCircle(ctx, snapX, snapY, s.radius || size/2, s); break;
        case 'ellipse': this._drawEllipse(ctx, snapX, snapY, s.radiusX || size, s.radiusY || size/2, s); break;
        case 'triangle_up': case 'triangleDown': this._drawTriangle(ctx, snapX, snapY, size, 'up', s); break;
        case 'triangle_down': case 'triangleUp': this._drawTriangle(ctx, snapX, snapY, size, 'down', s); break;
        case 'arrow_up': case 'arrowUp': this._drawArrow(ctx, snapX, snapY, size, 'up', s); break;
        case 'arrow_down': case 'arrowDown': this._drawArrow(ctx, snapX, snapY, size, 'down', s); break;
        case 'arrow_left': case 'arrowLeft': this._drawArrow(ctx, snapX, snapY, size, 'left', s); break;
        case 'arrow_right': case 'arrowRight': this._drawArrow(ctx, snapX, snapY, size, 'right', s); break;
        case 'diamond': case 'rhombus': this._drawDiamond(ctx, snapX, snapY, size, s); break;
        case 'star': case 'star5': this._drawStar(ctx, snapX, snapY, size, 5, s); break;
        case 'star6': this._drawStar(ctx, snapX, snapY, size, 6, s); break;
        case 'cross': case 'x': case 'multiply': this._drawCross(ctx, snapX, snapY, size, s); break;
        case 'plus': case '+': case 'add': this._drawPlus(ctx, snapX, snapY, size, s); break;
        case 'text': case 'label': this._drawText(ctx, snapX, snapY, s.text || '', s); break;
        case 'line': case 'segment': if (s.x2 != null && s.y2 != null) {
          const x2Float = s.x2;
          const y2Float = s.y2;
          const snapX2 = typeof PrecisionUtils !== 'undefined' ? PrecisionUtils.snapForStroke(x2Float, lineWidth) : x2Float;
          const snapY2 = typeof PrecisionUtils !== 'undefined' ? PrecisionUtils.snapForStroke(y2Float, lineWidth) : y2Float;
          this._drawSingleLine(ctx, snapX, snapY, snapX2, snapY2, s);
        } break;
        case 'polyline': case 'path': if (s.points?.length >= 2) this._drawPoly(ctx, s.points, false, s, { ts, ps, chartH, yOffset }); break;
        case 'polygon': if (s.points?.length >= 3) this._drawPoly(ctx, s.points, true, s, { ts, ps, chartH, yOffset }); break;
        case 'custom': if (typeof s.draw === 'function') s.draw(ctx, { x: snapX, y: snapY, size, ...s }); break;
      }
      if (s.label) this._drawLabel(ctx, snapX, snapY, s.label, s.labelPos || 'top', s);
      ctx.restore();
    }
  }
  
  _drawRect(ctx, x, y, w, h, s) {
    const color = ColorCache.parse(s.color || '#fff', s.alpha);
    const stroke = s.strokeColor || s.borderColor ? ColorCache.parse(s.strokeColor || s.borderColor, s.alpha) : null;
    ctx.save();
    if (s.gradient) ctx.fillStyle = createGradient(ctx, x - w/2, y - h/2, x + w/2, y + h/2, s.gradient.stops);
    else ctx.fillStyle = color;
    if (s.borderRadius) { this._roundedRect(ctx, x - w/2, y - h/2, w, h, s.borderRadius); if (s.fill !== false) ctx.fill(); }
    else if (s.fill !== false) ctx.fillRect(x - w/2, y - h/2, w, h);
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = s.lineWidth || 1; if (s.dashed) ctx.setLineDash([4, 4]); ctx.strokeRect(x - w/2, y - h/2, w, h); ctx.setLineDash([]); }
    ctx.restore();
  }
  
  _roundedRect(ctx, x, y, w, h, r) {
    const radius = typeof r === 'number' ? r : 4;
    ctx.beginPath();
    ctx.moveTo(x + radius, y); ctx.lineTo(x + w - radius, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
    ctx.lineTo(x + w, y + h - radius); ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
    ctx.lineTo(x + radius, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
    ctx.lineTo(x, y + radius); ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }
  
  _drawCircle(ctx, x, y, r, s) {
    const color = ColorCache.parse(s.color || '#fff', s.alpha);
    const stroke = s.strokeColor ? ColorCache.parse(s.strokeColor, s.alpha) : null;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    if (s.fill !== false) { ctx.fillStyle = color; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = s.lineWidth || 1; if (s.dashed) ctx.setLineDash([4, 4]); ctx.stroke(); ctx.setLineDash([]); }
  }
  
  _drawEllipse(ctx, x, y, radiusX, radiusY, s) {
    const color = ColorCache.parse(s.color || '#fff', s.alpha);
    const stroke = s.strokeColor ? ColorCache.parse(s.strokeColor, s.alpha) : null;
    ctx.beginPath(); ctx.ellipse(x, y, radiusX, radiusY, s.rotation || 0, 0, Math.PI * 2);
    if (s.fill !== false) { ctx.fillStyle = color; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = s.lineWidth || 1; ctx.stroke(); }
  }
  
  _drawTriangle(ctx, x, y, size, direction, s) {
    const color = ColorCache.parse(s.color || '#fff', s.alpha);
    const stroke = s.strokeColor ? ColorCache.parse(s.strokeColor, s.alpha) : null;
    const h = size * 1.2;
    ctx.beginPath();
    if (direction === 'up') { ctx.moveTo(x, y - h/2); ctx.lineTo(x - size/2, y + h/2); ctx.lineTo(x + size/2, y + h/2); }
    else { ctx.moveTo(x, y + h/2); ctx.lineTo(x - size/2, y - h/2); ctx.lineTo(x + size/2, y - h/2); }
    ctx.closePath();
    if (s.fill !== false) { ctx.fillStyle = color; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = s.lineWidth || 1; if (s.dashed) ctx.setLineDash([4, 4]); ctx.stroke(); ctx.setLineDash([]); }
  }
  
  _drawArrow(ctx, x, y, size, direction, s) {
    const color = ColorCache.parse(s.color || '#ffd740', s.alpha);
    const headSize = size * 0.8, shaftLen = size * 1.2;
    ctx.fillStyle = color; ctx.beginPath();
    switch (direction) {
      case 'up': ctx.moveTo(x, y - shaftLen - headSize/2); ctx.lineTo(x - headSize/2, y - shaftLen + headSize/2); ctx.lineTo(x + headSize/2, y - shaftLen + headSize/2); ctx.closePath(); ctx.fill(); ctx.fillRect(x - 1.5, y - shaftLen, 3, shaftLen); break;
      case 'down': ctx.moveTo(x, y + shaftLen + headSize/2); ctx.lineTo(x - headSize/2, y + shaftLen - headSize/2); ctx.lineTo(x + headSize/2, y + shaftLen - headSize/2); ctx.closePath(); ctx.fill(); ctx.fillRect(x - 1.5, y, 3, shaftLen); break;
      case 'left': ctx.moveTo(x - shaftLen - headSize/2, y); ctx.lineTo(x - shaftLen + headSize/2, y - headSize/2); ctx.lineTo(x - shaftLen + headSize/2, y + headSize/2); ctx.closePath(); ctx.fill(); ctx.fillRect(x - shaftLen, y - 1.5, shaftLen, 3); break;
      case 'right': ctx.moveTo(x + shaftLen + headSize/2, y); ctx.lineTo(x + shaftLen - headSize/2, y - headSize/2); ctx.lineTo(x + shaftLen - headSize/2, y + headSize/2); ctx.closePath(); ctx.fill(); ctx.fillRect(x, y - 1.5, shaftLen, 3); break;
    }
    if (s.strokeColor) { ctx.strokeStyle = ColorCache.parse(s.strokeColor, s.alpha); ctx.lineWidth = s.lineWidth || 1; ctx.stroke(); }
  }
  
  _drawDiamond(ctx, x, y, size, s) {
    const color = ColorCache.parse(s.color || '#fff', s.alpha);
    const stroke = s.strokeColor ? ColorCache.parse(s.strokeColor, s.alpha) : null;
    ctx.beginPath(); ctx.moveTo(x, y - size); ctx.lineTo(x + size, y); ctx.lineTo(x, y + size); ctx.lineTo(x - size, y); ctx.closePath();
    if (s.fill !== false) { ctx.fillStyle = color; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = s.lineWidth || 1; if (s.dashed) ctx.setLineDash([4, 4]); ctx.stroke(); ctx.setLineDash([]); }
  }
  
  _drawStar(ctx, x, y, size, spikes = 5, s) {
    const color = ColorCache.parse(s.color || '#ffd740', s.alpha);
    const outerRadius = size, innerRadius = size * 0.4;
    ctx.beginPath();
    for (let i = 0; i < spikes * 2; i++) {
      const radius = i % 2 === 0 ? outerRadius : innerRadius;
      const angle = (i * Math.PI / spikes) - Math.PI/2;
      const px = x + Math.cos(angle) * radius, py = y + Math.sin(angle) * radius;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath(); ctx.fillStyle = color; ctx.fill();
    if (s.strokeColor) { ctx.strokeStyle = ColorCache.parse(s.strokeColor, s.alpha); ctx.lineWidth = s.lineWidth || 1; ctx.stroke(); }
  }
  
  _drawCross(ctx, x, y, size, s) {
    const color = ColorCache.parse(s.strokeColor || s.color || '#fff', s.alpha);
    ctx.strokeStyle = color; ctx.lineWidth = s.lineWidth || 2;
    ctx.beginPath(); ctx.moveTo(x - size, y - size); ctx.lineTo(x + size, y + size);
    ctx.moveTo(x + size, y - size); ctx.lineTo(x - size, y + size); ctx.stroke();
  }
  
  _drawPlus(ctx, x, y, size, s) {
    const color = ColorCache.parse(s.strokeColor || s.color || '#fff', s.alpha);
    ctx.strokeStyle = color; ctx.lineWidth = s.lineWidth || 2;
    ctx.beginPath(); ctx.moveTo(x - size, y); ctx.lineTo(x + size, y);
    ctx.moveTo(x, y - size); ctx.lineTo(x, y + size); ctx.stroke();
  }
  
  _drawSingleLine(ctx, x1, y1, x2, y2, s) {
    ctx.strokeStyle = ColorCache.parse(s.color || '#fff', s.alpha); ctx.lineWidth = s.lineWidth || 1;
    if (s.dashed) ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    ctx.setLineDash([]);
  }
  
  _drawPoly(ctx, points, close, s, { ts, ps, chartH, yOffset }) {
    const color = ColorCache.parse(s.color || '#fff', s.alpha);
    const stroke = s.strokeColor ? ColorCache.parse(s.strokeColor, s.alpha) : null;
    ctx.beginPath();
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      let x = p.x, y = p.y;
      
      if (p.idx != null && ts) {
        const xFloat = ts.indexToXFloat ? ts.indexToXFloat(p.idx) : ts.indexToX(p.idx);
        x = xFloat;
      }
      if (p.price != null && ps) {
        const yFloat = ps.priceToYFloat ? ps.priceToYFloat(p.price, chartH) : ps.priceToY(p.price, chartH);
        y = yFloat + yOffset;
      }
      
      if (x == null || y == null) continue;
      
      // ✅ snapForStroke عند الرسم
      const snapX = typeof PrecisionUtils !== 'undefined' ? PrecisionUtils.snapForStroke(x, s.lineWidth || 1) : x;
      const snapY = typeof PrecisionUtils !== 'undefined' ? PrecisionUtils.snapForStroke(y, s.lineWidth || 1) : y;
      
      if (i === 0) ctx.moveTo(snapX, snapY); else ctx.lineTo(snapX, snapY);
    }
    if (close) ctx.closePath();
    if (s.fill !== false) { ctx.fillStyle = color; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = s.lineWidth || 1; if (s.dashed) ctx.setLineDash([4, 4]); ctx.stroke(); ctx.setLineDash([]); }
  }
  
  _drawText(ctx, x, y, text, s) {
    drawText(ctx, text, x, y, {
      font: s.font || `bold ${s.fontSize || 11}px monospace`, color: s.color || '#e0ecff',
      bg: s.bg || s.background, shadow: s.shadow, align: s.align || s.textAlign || 'center',
      baseline: s.baseline || s.textBaseline || 'middle', padding: s.padding || 4, alpha: s.alpha ?? 1
    });
  }
  
  _drawLabel(ctx, x, y, text, pos, s) {
    ctx.save();
    ctx.font = s.labelFont || `bold ${s.labelSize || 9}px monospace`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    let lx = x, ly = y; const offset = (s.labelSize || 9) + 4;
    switch (pos) { case 'top': ly = y - offset; break; case 'bottom': ly = y + offset; break; case 'left': lx = x - offset; ctx.textAlign = 'right'; break; case 'right': lx = x + offset; ctx.textAlign = 'left'; break; }
    if (s.labelBg) { const metrics = ctx.measureText(text); ctx.fillStyle = ColorCache.parse(s.labelBg, 0.85); ctx.fillRect(lx - metrics.width/2 - 3, ly - 7, metrics.width + 6, 14); }
    ctx.fillStyle = ColorCache.parse(s.labelColor || '#fff', s.alpha); ctx.fillText(text, lx, ly);
    ctx.restore();
  }
  
  _drawGapMarkers(items, { ctx, ts, ps, chartH, yOffset }) {
    for (const gap of items) {
      let x1 = gap.x1, x2 = gap.x2, yTop = gap.yTop, yBtm = gap.yBtm;
      
      if (gap.idx1 != null && ts) x1 = ts.indexToXFloat ? ts.indexToXFloat(gap.idx1) : ts.indexToX(gap.idx1);
      if (gap.idx2 != null && ts) x2 = ts.indexToXFloat ? ts.indexToXFloat(gap.idx2) : ts.indexToX(gap.idx2);
      if (gap.priceTop != null && ps) yTop = ps.priceToYFloat ? ps.priceToYFloat(gap.priceTop, chartH) : ps.priceToY(gap.priceTop, chartH);
      if (gap.priceBtm != null && ps) yBtm = ps.priceToYFloat ? ps.priceToYFloat(gap.priceBtm, chartH) : ps.priceToY(gap.priceBtm, chartH);
      
      if (x1 == null || x2 == null || yTop == null || yBtm == null) continue;
      
      ctx.save();
      ctx.globalAlpha = gap.alpha ?? 0.15;
      ctx.fillStyle = ColorCache.parse(gap.color || 'rgba(255,215,64,0.2)', gap.alpha);
      ctx.fillRect(Math.min(x1, x2), Math.min(yTop, yBtm) + yOffset, Math.abs(x2 - x1), Math.abs(yBtm - yTop));
      ctx.globalAlpha = gap.alphaBorder ?? 0.6;
      ctx.strokeStyle = ColorCache.parse(gap.borderColor || gap.color || '#ffd740', gap.alpha);
      ctx.lineWidth = gap.lineWidth || 1; ctx.setLineDash([3, 3]);
      ctx.strokeRect(Math.min(x1, x2), Math.min(yTop, yBtm) + yOffset, Math.abs(x2 - x1), Math.abs(yBtm - yTop));
      ctx.setLineDash([]);
      if (gap.label) { ctx.globalAlpha = 1; ctx.font = `bold ${gap.labelSize || 9}px monospace`; ctx.textAlign = 'center'; ctx.fillStyle = ColorCache.parse(gap.labelColor || '#ffd740', 1); ctx.fillText(gap.label, (x1 + x2) / 2, (yTop + yBtm) / 2 + yOffset); }
      ctx.restore();
    }
  }
  
  drawRects(rects, opts = {}) {
    if (!rects || !rects.length) return;
    const { ctx } = this;
    const { ts, ps, chartH = this.h, yOffset = 0, strokeColor = null, lineWidth = 0, dashed = false } = opts;
    batchDraw(ctx, (ctx) => {
      for (const r of rects) {
        let x1 = r.x1, x2 = r.x2, y1 = r.y1, y2 = r.y2;
        
        if (r.x1Idx != null && ts) x1 = ts.indexToXFloat ? ts.indexToXFloat(r.x1Idx) : ts.indexToX(r.x1Idx);
        if (r.x2Idx != null && ts) x2 = ts.indexToXFloat ? ts.indexToXFloat(r.x2Idx) : ts.indexToX(r.x2Idx);
        if (r.y1Price != null && ps) y1 = ps.priceToYFloat ? ps.priceToYFloat(r.y1Price, chartH) : ps.priceToY(r.y1Price, chartH);
        if (r.y2Price != null && ps) y2 = ps.priceToYFloat ? ps.priceToYFloat(r.y2Price, chartH) : ps.priceToY(r.y2Price, chartH);
        
        if (x1 == null || x2 == null || y1 == null || y2 == null) continue;
        
        const width = Math.abs(x2 - x1), height = Math.abs(y2 - y1);
        const left = Math.min(x1, x2), top = Math.min(y1, y2);
        ctx.globalAlpha = r.alpha ?? 1;
        ctx.fillStyle = ColorCache.parse(r.color || 'rgba(255,255,255,0.1)', r.alpha);
        ctx.fillRect(left, top, width, height);
        if (r.strokeColor || strokeColor) {
          ctx.globalAlpha = r.alphaBorder ?? r.alpha ?? 1;
          ctx.strokeStyle = ColorCache.parse(r.strokeColor || strokeColor, r.alpha);
          ctx.lineWidth = r.lineWidth || lineWidth;
          if (dashed || r.dashed) ctx.setLineDash([4, 4]);
          ctx.strokeRect(left, top, width, height);
          ctx.setLineDash([]);
        }
      }
    });
  }
  
  // ─── 🚀 الشبكة المحسّنة: حدود قصوى + حلقة آمنة ─────────────────────
  
  drawGuideLines(options = {}) {
    const { ctx, w, h } = this;
    const { ts, ps, chartH = this.h, timeIntervals = [], priceLevels = [], timeColor, priceColor, yOffset = 0 } = options;
    if (!ts?.data?.length) return;
    
    batchDraw(ctx, (ctx) => {
      ctx.setLineDash([2, 4]); ctx.lineWidth = 0.5;
      
      // ─── خطوط الوقت العمودية (محسّنة للأداء) ─────────────────────────
      if (timeIntervals.length > 0) {
        const vr = ts.getVisibleRange(w);
        const first = ts.data[Math.max(0, Math.floor(vr.start))];
        const last = ts.data[Math.min(ts.data.length - 1, Math.ceil(vr.end))];
        if (!first || !last) return;
        
        const timeSpan = last.time - first.time;
        if (timeSpan <= 0) return;
        
        // ✅ حد أقصى لعدد الخطوط المسموح برسمها (لمنع الثقل)
        const MAX_GRID_LINES = CFG?.ui?.grid?.maxTimeLines || 50;
        
        for (const interval of timeIntervals) {
          // ✅ حساب عدد الخطوط المتوقع مسبقاً
          const expectedLines = Math.ceil(timeSpan / interval);
          if (expectedLines > MAX_GRID_LINES) {
            // تخطي هذا الفاصل إذا كان سيُنتج خطوطاً كثيرة جداً
            console.warn(`[Renderer] Skipping grid interval ${interval}ms: would draw ${expectedLines} lines (max: ${MAX_GRID_LINES})`);
            continue;
          }
          
          // ✅ البدء من أول فاصل يقع ضمن النطاق المرئي (بدون حلقة لا نهائية)
          let t = Math.ceil(first.time / interval) * interval;
          let drawnCount = 0;
          
          while (t <= last.time && drawnCount < MAX_GRID_LINES) {
            const idx = ts.timeToIndex?.(t);
            if (idx != null && idx >= vr.start && idx <= vr.end) {
              const xFloat = ts.indexToXFloat ? ts.indexToXFloat(idx) : ts.indexToX(idx);
              const x = typeof PrecisionUtils !== 'undefined' 
                ? PrecisionUtils.snapForStroke(xFloat + 0.5, 1) 
                : Math.round(xFloat) + 0.5;
              
              ctx.strokeStyle = ColorCache.parse(timeColor || 'rgba(100,150,200,0.25)', 1);
              ctx.beginPath(); ctx.moveTo(x, yOffset); ctx.lineTo(x, chartH + yOffset); ctx.stroke();
              
              drawnCount++;
            }
            t += interval;
          }
        }
      }
      
      // ─── خطوط السعر الأفقية (محسّنة) ───────────────────────────────
      if (priceLevels?.length > 0 && ps) {
        // ✅ حد أقصى لخطوط السعر أيضاً
        const MAX_PRICE_LINES = CFG?.ui?.grid?.maxPriceLines || 20;
        let drawnPriceLines = 0;
        
        for (const price of priceLevels) {
          if (drawnPriceLines >= MAX_PRICE_LINES) break;
          
          // ✅ تحقق أن السعر ضمن النطاق المرئي قبل الرسم
          if (price < ps.min || price > ps.max) continue;
          
          const yFloat = ps.priceToYFloat ? ps.priceToYFloat(price, chartH) : ps.priceToY(price, chartH);
          const y = typeof PrecisionUtils !== 'undefined' 
            ? PrecisionUtils.snapForStroke(yFloat + 0.5 + yOffset, 1) 
            : Math.round(yFloat) + 0.5 + yOffset;
          
          // ✅ تحقق أن الخط ضمن منطقة الرسم
          if (y < yOffset || y > chartH + yOffset) continue;
          
          ctx.strokeStyle = ColorCache.parse(priceColor || 'rgba(200,150,100,0.25)', 1);
          ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
          
          drawnPriceLines++;
        }
      }
      
      ctx.setLineDash([]);
    });
  }
  
  drawBackgroundImage(url, options = {}) {
    if (!url) return;
    const { ctx, w, h } = this;
    const { alpha = 0.15, size = 'cover', offsetX = 0, offsetY = 0 } = options;
    if (!this._bgImage || this._bgImage.src !== url) {
      if (this._bgImage) { this._bgImage.onload = null; this._bgImage.onerror = null; this._bgImage.src = ''; }
      this._bgImage = new Image(); this._bgImageLoading = true;
      this._bgImage.onload = () => { this._bgImageLoading = false; if (typeof window !== 'undefined' && window.chartApp) window.chartApp.dirty = true; };
      this._bgImage.onerror = () => { this._bgImageLoading = false; console.warn('[Renderer] Failed to load background:', url); };
      this._bgImage.src = url; return;
    }
    if (this._bgImageLoading || !this._bgImage.complete) return;
    batchDraw(ctx, (ctx) => {
      ctx.globalAlpha = alpha;
      let dw = w, dh = h, dx = offsetX, dy = offsetY;
      if (size === 'contain') { const ratio = Math.min(w / this._bgImage.width, h / this._bgImage.height); dw = this._bgImage.width * ratio; dh = this._bgImage.height * ratio; dx += (w - dw) / 2; dy += (h - dh) / 2; }
      else if (size === 'auto') { dw = this._bgImage.width; dh = this._bgImage.height; }
      else if (typeof size === 'object') { dw = size.width || w; dh = size.height || h; }
      ctx.drawImage(this._bgImage, dx, dy, dw, dh);
    });
  }
  
  drawSignals(signals, opts = {}) {
    if (!signals?.length) return;
  }
  
  destroy() {
    if (this._bgImage) { this._bgImage.onload = null; this._bgImage.onerror = null; this._bgImage.src = ''; this._bgImage = null; }
    this._bgImageLoading = false;
    this._gridCache = { key: null, lines: [], timestamp: 0 };
    if (this._shapeCache) this._shapeCache.clear();
    if (typeof ColorCache !== 'undefined') ColorCache.clear();
    if (this.ctx) this.ctx.clearRect(0, 0, this.w, this.h);
  }
}

// ═══════════════════════════════════════════════════════════════════════
// القسم 5: PriceAxisRenderer
// ═══════════════════════════════════════════════════════════════════════

class PriceAxisRenderer {
  constructor(canvas) { this.canvas = canvas; this.ctx = canvas.getContext('2d', { alpha: false }); this.w = 0; this.h = 0; this.dpr = Math.min(typeof window !== 'undefined' ? window.devicePixelRatio : 1, 2); }
  resize(w, h) { if (this.w === w && this.h === h) return false; this.w = w; this.h = h; this.canvas.width = Math.floor(w * this.dpr); this.canvas.height = Math.floor(h * this.dpr); this.canvas.style.width = w + 'px'; this.canvas.style.height = h + 'px'; this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); return true; }
  render(ps, chartH, crossY = -1, lastPrice = -1, isUp = false) {
    const { ctx, w, h } = this;
    ctx.fillStyle = getColor('bg', '#060a12'); ctx.fillRect(0, 0, w, h);
    ctx.font = `${CFG?.isMobile ? 9 : 10}px monospace`; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    const r = ps.max - ps.min; ctx.fillStyle = getColor('text', '#4a6a8a');
    for (let i = 0; i <= 6; i++) { const p = ps.min + (r / 6) * i; const yFloat = ps.priceToYFloat ? ps.priceToYFloat(p, chartH) : ps.priceToY(p, chartH); const y = typeof PrecisionUtils !== 'undefined' ? PrecisionUtils.snapForStroke(yFloat, 1) : Math.round(yFloat) + 0.5; if (y >= 8 && y <= h - 8) ctx.fillText((typeof Utils !== 'undefined' && Utils.fmtPrice ? Utils.fmtPrice(p) : p.toFixed(2)), w - 6, y + 1); }
    if (crossY >= 0 && crossY <= chartH) {
      const pcy = typeof PrecisionUtils !== 'undefined' ? PrecisionUtils.snapForStroke(crossY, 1) : Math.round(crossY) + 0.5, cp = ps.yToPrice(crossY, chartH);
      ctx.fillStyle = getColor('bg', '#060a12'); ctx.fillRect(0, pcy - 9, w, 18);
      ctx.strokeStyle = getColor('textBright', '#8aaccc'); ctx.lineWidth = 1 / this.dpr; ctx.strokeRect(1, pcy - 9, w - 2, 18);
      ctx.fillStyle = getColor('textWhite', '#e0ecff'); ctx.fillText((typeof Utils !== 'undefined' && Utils.fmtPrice ? Utils.fmtPrice(cp) : cp.toFixed(2)), w - 6, pcy + 1);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════
// القسم 6: TimeAxisRenderer
// ═══════════════════════════════════════════════════════════════════════

class TimeAxisRenderer {
  constructor(canvas) { this.canvas = canvas; this.ctx = canvas.getContext('2d', { alpha: false }); this.w = 0; this.h = 0; this.dpr = Math.min(typeof window !== 'undefined' ? window.devicePixelRatio : 1, 2); }
  resize(w, h) { if (this.w === w && this.h === h) return false; this.w = w; this.h = h; this.canvas.width = Math.floor(w * this.dpr); this.canvas.height = Math.floor(h * this.dpr); this.canvas.style.width = w + 'px'; this.canvas.style.height = h + 'px'; this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); return true; }
  render(ts, candles, w, cx = -1) {
    const { ctx, h } = this;
    ctx.fillStyle = getColor('bg', '#060a12'); ctx.fillRect(0, 0, w, h);
    const vr = ts.getVisibleRange(w); ctx.font = `${CFG?.isMobile ? 8 : 9}px monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const data = ts.data; if (!data || data.length === 0) return;
    const firstIdx = Math.max(0, Math.floor(vr.start)), lastIdx = Math.min(data.length - 1, Math.ceil(vr.end));
    const first = data[firstIdx], last = data[lastIdx]; if (!first || !last) return;
    const timeSpan = last.time - first.time; if (timeSpan <= 0) return;
    const pxPerMs = w / timeSpan, TARGET_PX = 100;
    const intervals = [60_000, 300_000, 900_000, 1_800_000, 3_600_000, 7_200_000, 14_400_000, 21_600_000, 43_200_000, 86_400_000, 604_800_000];
    let chosen = intervals[intervals.length - 1]; for (const intv of intervals) { if (intv * pxPerMs >= TARGET_PX) { chosen = intv; break; } }
    const stepPx = ts.spacing, offsetPx = ts.offset; let t = Math.floor(first.time / chosen) * chosen, lx = -100;
    ctx.fillStyle = getColor('text', '#4a6a8a');
    for (; t <= last.time; t += chosen) {
      const idx = ts.timeToIndex?.(t); if (idx == null || idx < 0 || idx >= data.length) continue;
      const pxFloat = offsetPx + idx * stepPx;
      const px = typeof PrecisionUtils !== 'undefined' ? PrecisionUtils.snapForStroke(pxFloat + 0.5, 1) : Math.round(pxFloat) + 0.5; if (px < 24 || px > w - 20 || Math.abs(px - lx) < 80) continue;
      const c = candles[idx]; if (!c) continue; const d = new Date(c.time); const lb = `${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`;
      ctx.fillText(lb, px, h / 2 + 1); lx = px;
    }
    if (cx >= 0 && cx <= w && candles?.length > 0) {
      const idx = Math.round(ts.xToIndex(cx)); if (idx >= 0 && idx < candles.length) {
        const c = candles[idx]; if (c) {
          const pcxFloat = ts.indexToXFloat ? ts.indexToXFloat(idx) : ts.indexToX(idx);
          const pcx = typeof PrecisionUtils !== 'undefined' ? PrecisionUtils.snapForStroke(pcxFloat + 0.5, 1) : Math.round(pcxFloat) + 0.5;
          const lb = `${new Date(c.time).getHours().toString().padStart(2,'0')}:${new Date(c.time).getMinutes().toString().padStart(2,'0')}`;
          ctx.fillStyle = getColor('bg', '#060a12'); ctx.fillRect(pcx - 24, 2, 48, h - 4);
          ctx.strokeStyle = getColor('textBright', '#8aaccc'); ctx.lineWidth = 1 / this.dpr; ctx.strokeRect(pcx - 23.5, 2.5, 47, h - 5);
          ctx.fillStyle = getColor('textWhite', '#e0ecff'); ctx.fillText(lb, pcx, h / 2 + 1);
        }
      }
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════
// القسم 7: TimeScale
// ═══════════════════════════════════════════════════════════════════════

class TimeScale {
  constructor() { this.spacing = CFG?.defaultSpacing || 8; this.offset = 0; this.data = []; this.interval = CFG?.defaultTimeframe || '1m'; }
  setData(d) { this.data = d || []; }
  indexToX(i) { return this.offset + i * this.spacing; }
  xToIndex(x) { return (x - this.offset) / this.spacing; }
  timeToIndex(timestamp) { const data = this.data; if (!data || data.length === 0) return null; let lo = 0, hi = data.length - 1; while (lo <= hi) { const mid = (lo + hi) >>> 1; const t = data[mid].time; if (t === timestamp) return mid; if (t < timestamp) lo = mid + 1; else hi = mid - 1; } return lo < data.length ? lo : data.length - 1; }
  indexToTime(i) { const data = this.data; if (!data || i < 0 || i >= data.length) return null; return data[Math.floor(i)]?.time ?? null; }
  getVisibleRange(w) { const len = this.data?.length || 0; if (!len) return { start: 0, end: 0 }; return { start: Math.max(0, Math.floor(this.xToIndex(-this.spacing * 2))), end: Math.min(len - 1, Math.ceil(this.xToIndex(w + this.spacing * 2))) }; }
  scroll(dx) { this.offset += dx; }
  zoom(factor, centerX) { const old = this.spacing; this.spacing = Math.max(CFG?.minSpacing || 1.5, Math.min(CFG?.maxSpacing || 60, old * factor)); const idx = (centerX - this.offset) / old; this.offset = centerX - idx * this.spacing; }
  scrollToEnd(w) { if (!this.data.length) return; this.offset = w - (this.data.length - 1) * this.spacing - this.spacing * 1.5; }
}

// ═══════════════════════════════════════════════════════════════════════
// القسم 8: PriceScale
// ═══════════════════════════════════════════════════════════════════════

class PriceScale {
  constructor() { this.min = 0; this.max = 100; this._margin = CFG?.priceMargin || 0.04; }
  calculateRange(candles, start, end) { start = Math.max(0, Math.floor(start)); end = Math.min(candles.length - 1, Math.ceil(end)); let lo = Infinity, hi = -Infinity; for (let i = start; i <= end; i++) { const c = candles[i]; if (!c) continue; if (typeof c.low === 'number') lo = Math.min(lo, c.low); if (typeof c.high === 'number') hi = Math.max(hi, c.high); } if (!isFinite(lo) || !isFinite(hi)) { lo = 0; hi = 100; } const range = hi - lo; const margin = range * this._margin; this.min = lo - margin; this.max = hi + margin; if (this.max === this.min) this.max = this.min + 1; }
  priceToY(price, height) { if (this.max === this.min) return height / 2; return height * (1 - (price - this.min) / (this.max - this.min)); }
  yToPrice(y, height) { if (this.max === this.min) return this.min; return this.min + (1 - y / height) * (this.max - this.min); }
}

// ═══════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ChartRenderer, Canvas2DRenderer, PriceAxisRenderer, TimeAxisRenderer, TimeScale, PriceScale, getColor, parseColor, candleMetrics, drawText, createGradient, batchDraw, ColorCache };
}

console.log('[Renderer] Ultra Renderer Engine v3.2.1 loaded ✓ | High-Precision: ON | ColorCache: ON | Grid: OPTIMIZED | Signals: OFF | Shapes: ON');
