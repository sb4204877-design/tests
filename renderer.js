'use strict';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * PURE RENDERER ENGINE - محرك رسم خام (بدون أي مؤشرات مدمجة)
 * ✅ LOD System: Full Candles → Thin Candles → OHLC Line → Line Chart
 * ✅ Pixel Perfect: Snap precision + نصف بكسل دقيق
 * ✅ نظام مرن: يعتمد على 4 بدائيات فقط لرسم أي شيء
 * ✅ ✅ توحيد نظام الألوان: كل الألوان تُقرأ من CFG.colors
 * ✅ ✅ تحسين وضوح الشموع: عتبات LOD أفضل + ألفا قابلة للتحكم
 * ✅ ✅ تحكم في توهج العداد: CFG.ui.enableTimerShadow
 *    1. drawLine (لرسم أي خط: MA, RSI, خطوط الشبكة...)
 *    2. drawArea (لرسم أي منطقة مملوئة: البولينجر، التظليل...)
 *    3. drawShapes (لرسم أي شكل: أسهم، دوائر، مربعات، سويبات...)
 *    4. drawRects (لرسم أي مستطيل: مناطق SR، أعمدة الحجم...)
 * ════════════════════════════════════════════════════════════════════════
 */

function hasWebGLSupport() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGL2RenderingContext && c.getContext('webgl2')) ||
           !!(window.WebGLRenderingContext && c.getContext('webgl'));
  } catch { return false; }
}

// ✅ محسّن: إرجاع قيمة ألفا مع مقاييس الشمعة للتحكم في الشفافية حسب مستوى التكبير
function candleMetricsPrecision(index, ts) {
  const stepPx = ts.spacing;
  const offsetPx = ts.offset;
  const centerX = offsetPx + index * stepPx;
  const centerXSnap = Math.round(centerX);

  let bodyWidth; let mode = 'full'; let alpha = 1.0;
  
  // ✅ تحسين عتبات LOD لدعم الشاشات الصغيرة مع وضوح أفضل
  const minStep = typeof CFG !== 'undefined' && CFG.minSpacing ? CFG.minSpacing : 1.5;
  
  if (stepPx >= 8) { 
    bodyWidth = Math.max(3, Math.floor(stepPx * 0.72)); 
    mode = 'full'; 
    alpha = 1.0;
  }
  else if (stepPx >= 4) { // ✅ خفضنا العتبة من 5 إلى 4 لوضوح أفضل
    bodyWidth = Math.max(2, Math.floor(stepPx * 0.65)); 
    mode = 'thin'; 
    alpha = 0.95;
  }
  else if (stepPx >= 2.5) { // ✅ خفضنا العتبة من 3.5 إلى 2.5
    bodyWidth = 2; // ✅ عرض أكبر قليلاً للخط
    mode = 'line'; 
    alpha = 0.9;
  }
  else { 
    bodyWidth = 1.5; // ✅ ليس 1 فقط لتحسين الوضوح
    mode = 'line-only'; 
    // ✅ استخدام قيمة ألفا قابلة للتخصيص من الإعدادات
    alpha = typeof CFG !== 'undefined' && CFG.colors?.minZoomAlpha 
      ? CFG.colors.minZoomAlpha 
      : 0.9;
  }

  const halfBody = Math.floor(bodyWidth / 2);
  const bodyLeft = centerXSnap - halfBody;
  const bodyRight = bodyLeft + bodyWidth;

  return { centerX: centerXSnap, bodyLeft, bodyRight, bodyWidth, mode, stepPx, alpha };
}

// ✅ دالة مساعدة موحدة لجلب الألوان من CFG مع قيمة افتراضية
function getColor(key, fallback) {
  if (typeof CFG !== 'undefined' && CFG.colors && CFG.colors[key]) {
    return CFG.colors[key];
  }
  return fallback || '#060a12';
}

class ChartRenderer {
  constructor(canvas, overlayCanvas) {
    this.canvas = canvas;
    this.useWebGL = hasWebGLSupport();
    if (this.useWebGL) {
      try {
        console.log('[Renderer] Using WebGL');
        this._engine = new WebGLRenderer(canvas, overlayCanvas);
      } catch (e) {
        console.warn('[Renderer] WebGL failed, fallback to Canvas 2D:', e);
        this.useWebGL = false;
        this._engine = new Canvas2DRenderer(canvas);
      }
    } else {
      console.log('[Renderer] Using Canvas 2D');
      this._engine = new Canvas2DRenderer(canvas);
    }
  }

  resize(w, h)                          { return this._engine.resize(w, h); }
  clear(color)                          { this._engine.clear(color); }
  drawGrid(ps, ts, chartH)              { this._engine.drawGrid?.(ps, ts, chartH); }
  drawCandles(c, ts, ps, chartH)        { this._engine.drawCandles?.(c, ts, ps, chartH); }
  drawPriceLine(p, u, ps, chartH)       { return this._engine.drawPriceLine?.(p, u, ps, chartH) ?? -1; }
  drawCrosshair(x, y)                   { this._engine.drawCrosshair?.(x, y); }
  drawTimer(text, x, y, color, fontSize){ this._engine.drawTimer?.(text, x, y, color, fontSize); }
  
  drawLine(values, color, opts) { this._engine.drawLine?.(values, color, opts); }
  drawArea(topVals, btmVals, fillColor, opts) { this._engine.drawArea?.(topVals, btmVals, fillColor, opts); }
  drawShapes(shapes, opts) { this._engine.drawShapes?.(shapes, opts); }
  drawRects(rects, opts) { this._engine.drawRects?.(rects, opts); }

  setRefs(ts, ps)                       { this._engine.setRefs?.(ts, ps); }
  destroy()                             { this._engine.destroy?.(); }
}

// ════════════════════════════════════════════════════════════════════════
// Canvas 2D Renderer - Logical Pixels Only
// ════════════════════════════════════════════════════════════════════════
class Canvas2DRenderer {
  constructor(c) {
    this.canvas = c;
    this.ctx    = c.getContext('2d', { alpha: false });
    this.w = 0; this.h = 0;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
  }

  resize(w, h) {
    if (this.w === w && this.h === h) return false;
    this.w = w; this.h = h;
    this.canvas.width  = Math.floor(w * this.dpr);
    this.canvas.height = Math.floor(h * this.dpr);
    this.canvas.style.width  = w + 'px';
    this.canvas.style.height = h + 'px';
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.ctx.imageSmoothingEnabled = false;
    return true;
  }

  // ✅ ✅ إصلاح: قراءة لون الخلفية من الإعدادات إذا لم يُمرّر لون
  clear(col) {
    const bgColor = col || getColor('bg', '#060a12');
    this.ctx.fillStyle = bgColor;
    this.ctx.fillRect(0, 0, this.w, this.h);
  }

  drawGrid(ps, ts, chartH) {
    const { ctx, w, h } = this;
    ctx.save();
    // ✅ استخدام ألوان من CFG
    ctx.strokeStyle = getColor('grid', '#0f1c2e');
    ctx.lineWidth = 1 / this.dpr;
    ctx.setLineDash([4, 4]);
    const r = ps.max - ps.min;
    for (let i = 0; i <= 6; i++) {
      const price = ps.min + (r / 6) * i;
      const y = ps.priceToY(price, chartH);
      const ySnap = Math.round(y) + 0.5;
      ctx.beginPath(); ctx.moveTo(0, ySnap); ctx.lineTo(w, ySnap); ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.strokeStyle = getColor('gridBright', '#172438');
    const vLines = this._buildTimeGridLines(ts, w, h);
    for (let j = 0; j < vLines.length; j += 4) {
      ctx.beginPath(); ctx.moveTo(vLines[j], vLines[j+1]); ctx.lineTo(vLines[j+2], vLines[j+3]); ctx.stroke();
    }
    ctx.restore();
  }

  _buildTimeGridLines(ts, w, h) {
    const lines = []; const data = ts.data; if (!data || data.length === 0) return lines;
    const vr = ts.getVisibleRange(w);
    const firstIdx = Math.max(0, Math.floor(vr.start)); const lastIdx = Math.min(data.length - 1, Math.ceil(vr.end));
    const first = data[firstIdx]; const last = data[lastIdx]; if (!first || !last) return lines;
    const timeSpan = last.time - first.time; if (timeSpan <= 0) return lines;
    const pxPerMs = w / timeSpan; const TARGET_PX = 80;
    const intervals = [ 60_000, 5 * 60_000, 15 * 60_000, 30 * 60_000, 60 * 60_000, 2 * 60 * 60_000, 4 * 60 * 60_000, 6 * 60 * 60_000, 12 * 60 * 60_000, 24 * 60 * 60_000, 7 * 24 * 60 * 60_000 ];
    let chosen = intervals[intervals.length - 1];
    for (const intv of intervals) { if (intv * pxPerMs >= TARGET_PX) { chosen = intv; break; } }
    const stepPx = ts.spacing; const offsetPx = ts.offset; let t = Math.floor(first.time / chosen) * chosen;
    for (; t <= last.time; t += chosen) {
      const idx = ts.timeToIndex(t); if (idx == null || idx < 0 || idx >= data.length) continue;
      const x = offsetPx + idx * stepPx; const xSnap = Math.round(x) + 0.5;
      if (xSnap >= -stepPx && xSnap <= w + stepPx) { lines.push(xSnap, 0, xSnap, h); }
    }
    return lines;
  }

  drawCandles(candles, ts, ps, chartH) {
    const { ctx, w } = this; const vr = ts.getVisibleRange(w);
    
    // ✅ جلب الألوان من الإعدادات الموحدة
    const colorUp = getColor('up', '#28c900');
    const colorDown = getColor('down', '#ff0000');
    const wickColor = getColor('wick', null);
    
    for (let i = vr.start; i <= vr.end; i++) {
      const c = candles[i]; if (!c) continue;
      const metrics = candleMetricsPrecision(i, ts);
      if (metrics.centerX < -ts.spacing - 2 || metrics.centerX > w + ts.spacing + 2) continue;
      
      const yH = Math.round(ps.priceToY(c.high, chartH)) + 0.5; 
      const yL = Math.round(ps.priceToY(c.low, chartH)) + 0.5;
      const yO = Math.round(ps.priceToY(c.open, chartH)); 
      const yC = Math.round(ps.priceToY(c.close, chartH));
      
      const isUp = c.close >= c.open; 
      const color = isUp ? colorUp : colorDown;
      const strokeColor = wickColor || color; // استخدام لون الفتيل المخصص إذا وجد
      
      if (metrics.mode === 'line-only' || metrics.mode === 'line') {
        ctx.strokeStyle = strokeColor; 
        ctx.lineWidth = 1; 
        // ✅ استخدام قيمة ألفا من المقاييس بدلاً من قيمة ثابتة
        ctx.globalAlpha = metrics.alpha ?? 0.9;
        ctx.beginPath(); 
        ctx.moveTo(metrics.centerX + 0.5, yH); 
        ctx.lineTo(metrics.centerX + 0.5, yL); 
        ctx.stroke(); 
        ctx.globalAlpha = 1;
      } else {
        ctx.strokeStyle = strokeColor; 
        ctx.lineWidth = 1; 
        ctx.globalAlpha = metrics.alpha ?? 0.9;
        ctx.beginPath(); 
        ctx.moveTo(metrics.centerX + 0.5, yH); 
        ctx.lineTo(metrics.centerX + 0.5, yL); 
        ctx.stroke();
        
        const bodyTop = Math.min(yO, yC); 
        const bodyHeight = Math.max(1, Math.abs(yC - yO));
        ctx.fillStyle = color; 
        // ✅ ألفا أعلى للأجسام لتحسين الوضوح
        ctx.globalAlpha = isUp ? 0.98 : 0.95;
        ctx.fillRect(metrics.bodyLeft, bodyTop, metrics.bodyWidth, bodyHeight); 
        ctx.globalAlpha = 1;
      }
    }
    ctx.globalAlpha = 1;
  }

  drawPriceLine(price, isUp, ps, chartH) {
    if (!ps || !chartH) return -1; 
    const y = Math.round(ps.priceToY(price, chartH)) + 0.5;
    
    // ✅ استخدام ألوان من الإعدادات
    this.ctx.strokeStyle = isUp ? getColor('priceLine', '#2196f3') : getColor('down', '#ff0000');
    this.ctx.lineWidth = 1; 
    this.ctx.setLineDash([4, 3]); 
    this.ctx.globalAlpha = 0.6;
    this.ctx.beginPath(); 
    this.ctx.moveTo(0, y); 
    this.ctx.lineTo(this.w, y); 
    this.ctx.stroke();
    this.ctx.setLineDash([]); 
    this.ctx.globalAlpha = 1; 
    return y;
  }

  drawCrosshair(x, y) {
    if (x < 0 || y < 0 || x > this.w || y > this.h) return;
    const { ctx, w, h } = this; 
    const px = Math.round(x) + 0.5; 
    const py = Math.round(y) + 0.5;
    
    // ✅ استخدام لون من الإعدادات
    ctx.strokeStyle = getColor('crosshair', 'rgba(150,180,220,0.5)'); 
    ctx.lineWidth = 1; 
    ctx.setLineDash([3, 4]);
    ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, h); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(w, py); ctx.stroke(); 
    ctx.setLineDash([]);
    ctx.beginPath(); ctx.arc(px, py, 4, 0, Math.PI * 2);
    ctx.fillStyle = getColor('bg', '#060a12'); 
    ctx.fill(); 
    ctx.strokeStyle = getColor('crosshair', 'rgba(150,180,220,0.5)'); 
    ctx.lineWidth = 1; 
    ctx.stroke();
  }

  drawTimer(text, x, y, color = '#4da6ff', fontSize = 11) {
    const { ctx } = this; 
    ctx.save();
    ctx.font = `bold ${fontSize}px 'Segoe UI', monospace`; 
    ctx.textAlign = 'center'; 
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    
    // ✅ التحكم في التوهج عبر الإعدادات
    if (typeof CFG !== 'undefined' && CFG.ui?.enableTimerShadow !== false) {
      ctx.shadowColor = getColor('timerShadow', 'rgba(0,15,40,0.4)');
      ctx.shadowBlur = 3; // ✅ قيمة أصغر لتوهج أخف
    }
    
    ctx.fillText(text, x, y + 1); 
    ctx.restore();
  }

  // ════════════════════════════════════════════════════════════════════════
  // ✅ البدائيات الذكية (Canvas 2D)
  // ════════════════════════════════════════════════════════════════════════

  drawLine(values, color, opts = {}) {
    if (!opts.ts || !opts.ps) return;
    const { ctx, w } = this;
    const { ts, ps, chartH, yOffset = 0, lineWidth = 1, alpha = 0.85 } = opts;
    const vr = ts.getVisibleRange(w);
    
    ctx.save();
    ctx.lineWidth = lineWidth;
    ctx.globalAlpha = alpha;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    
    const isDynamic = Array.isArray(color);
    if (!isDynamic) ctx.strokeStyle = color;

    let prevX, prevY, started = false;
    for (let i = vr.start; i <= vr.end; i++) {
      if (values[i] == null) { started = false; continue; }
      const x = Math.round(ts.indexToX(i)) + 0.5;
      const y = Math.round(ps.priceToY(values[i], chartH)) + 0.5 + yOffset;
      
      if (started) {
        if (isDynamic) {
          ctx.beginPath();
          ctx.strokeStyle = color[i] || '#fff';
          ctx.moveTo(prevX, prevY);
          ctx.lineTo(x, y);
          ctx.stroke();
        } else {
          ctx.lineTo(x, y);
        }
      } else if (!isDynamic) {
        ctx.beginPath();
        ctx.moveTo(x, y);
      }
      prevX = x; prevY = y; started = true;
    }
    
    if (!isDynamic) ctx.stroke();
    ctx.restore();
  }

  drawArea(topVals, btmVals, fillColor, opts = {}) {
    if (!opts.ts || !opts.ps) return;
    const { ctx, w } = this;
    const { ts, ps, chartH, yOffset = 0, strokeColor = null, lineWidth = 0, alpha = 1 } = opts;
    const vr = ts.getVisibleRange(w);
    
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    let started = false;
    const topPoints = [], btmPoints = [];

    for (let i = vr.start; i <= vr.end; i++) {
      if (topVals[i] == null || btmVals[i] == null) continue;
      const x = Math.round(ts.indexToX(i)) + 0.5;
      const yTop = Math.round(ps.priceToY(topVals[i], chartH)) + 0.5 + yOffset;
      const yBtm = Math.round(ps.priceToY(btmVals[i], chartH)) + 0.5 + yOffset;
      
      if (!started) { ctx.moveTo(x, yTop); started = true; } else { ctx.lineTo(x, yTop); }
      topPoints.push({ x, y: yTop });
      btmPoints.push({ x, y: yBtm });
    }

    for (let i = btmPoints.length - 1; i >= 0; i--) ctx.lineTo(btmPoints[i].x, btmPoints[i].y);
    ctx.closePath();
    ctx.fillStyle = fillColor;
    ctx.fill();

    if (strokeColor && lineWidth > 0) {
      ctx.strokeStyle = strokeColor; ctx.lineWidth = lineWidth;
      ctx.beginPath();
      for (let i = 0; i < topPoints.length; i++) { if (i === 0) ctx.moveTo(topPoints[i].x, topPoints[i].y); else ctx.lineTo(topPoints[i].x, topPoints[i].y); }
      ctx.stroke();
      ctx.beginPath();
      for (let i = 0; i < btmPoints.length; i++) { if (i === 0) ctx.moveTo(btmPoints[i].x, btmPoints[i].y); else ctx.lineTo(btmPoints[i].x, btmPoints[i].y); }
      ctx.stroke();
    }
    ctx.restore();
  }

  drawShapes(shapes, opts = {}) {
    if (!opts.ts || !opts.ps || !shapes) return;
    const { ctx } = this;
    const { ts, ps, chartH, yOffset = 0, size = 5 } = opts;
    ctx.save();
    for (const s of shapes) {
      const x = Math.round(ts.indexToX(s.idx)) + 0.5;
      const y = Math.round(ps.priceToY(s.price, chartH)) + 0.5 + yOffset;
      const sz = s.size || size;
      const col = s.color || '#fff';

      if (s.type === 'arrow_up') {
        ctx.fillStyle = col; ctx.beginPath();
        ctx.moveTo(x, y); ctx.lineTo(x - sz, y + sz * 2); ctx.lineTo(x + sz, y + sz * 2);
        ctx.closePath(); ctx.fill();
      } else if (s.type === 'arrow_down') {
        ctx.fillStyle = col; ctx.beginPath();
        ctx.moveTo(x, y); ctx.lineTo(x - sz, y - sz * 2); ctx.lineTo(x + sz, y - sz * 2);
        ctx.closePath(); ctx.fill();
      } else if (s.type === 'circle') {
        ctx.strokeStyle = col; ctx.lineWidth = s.lineWidth || 1.5;
        ctx.beginPath(); ctx.arc(x, y, sz, 0, Math.PI * 2); ctx.stroke();
      } else if (s.type === 'cross') {
        ctx.strokeStyle = col; ctx.lineWidth = s.lineWidth || 1.5;
        ctx.beginPath();
        ctx.moveTo(x - sz, y - sz); ctx.lineTo(x + sz, y + sz);
        ctx.moveTo(x + sz, y - sz); ctx.lineTo(x - sz, y + sz);
        ctx.stroke();
      } else if (s.type === 'diamond') {
        ctx.fillStyle = col; ctx.beginPath();
        ctx.moveTo(x, y - sz); ctx.lineTo(x + sz, y); ctx.lineTo(x, y + sz); ctx.lineTo(x - sz, y);
        ctx.closePath(); ctx.fill();
      }
    }
    ctx.restore();
  }

  drawRects(rects, opts = {}) {
    if (!opts.ts || !opts.ps || !rects) return;
    const { ctx } = this;
    const { ts, ps, chartH, yOffset = 0, strokeColor = null, lineWidth = 0, dashed = false } = opts;
    ctx.save();
    for (const r of rects) {
      const x1 = Math.round(ts.indexToX(r.x1Idx));
      const x2 = Math.round(ts.indexToX(r.x2Idx));
      const y1 = Math.round(ps.priceToY(r.y1Price, chartH)) + 0.5 + yOffset;
      const y2 = Math.round(ps.priceToY(r.y2Price, chartH)) + 0.5 + yOffset;

      ctx.fillStyle = r.color || 'rgba(255,255,255,0.1)';
      ctx.globalAlpha = r.alpha ?? 1;
      ctx.fillRect(x1, y1, x2 - x1, y2 - y1);

      if (strokeColor || r.strokeColor) {
        ctx.strokeStyle = r.strokeColor || strokeColor;
        ctx.lineWidth = r.lineWidth || lineWidth;
        if (dashed || r.dashed) ctx.setLineDash([4, 4]);
        ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
        ctx.setLineDash([]);
      }
    }
    ctx.restore();
  }

  setRefs(ts, ps) { this._ts = ts; this._ps = ps; }
}

// ════════════════════════════════════════════════════════════════════════
// WebGL Renderer - High Performance
// ════════════════════════════════════════════════════════════════════════
class WebGLRenderer {
  constructor(canvas, overlayCanvas) {
    this.canvas = canvas; this.overlay = overlayCanvas;
    this.ctx2d = overlayCanvas ? overlayCanvas.getContext('2d', { alpha: true }) : null;
    this.gl = canvas.getContext('webgl2', { antialias: true, alpha: false, preserveDrawingBuffer: false }) ||
              canvas.getContext('webgl', { antialias: true, alpha: false });
    if (!this.gl) { console.warn('[WebGLRenderer] WebGL not supported'); throw new Error('WebGL not supported'); }
    this.width = 0; this.height = 0; this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this._programs = {}; this._buffers = {}; this._initShaders(); this._initBuffers();
  }

  _initShaders() {
    const gl = this.gl;
    const vsSource = `attribute vec2 a_position; attribute vec4 a_color; uniform vec2 u_resolution; varying vec4 v_color; void main() { vec2 clip = (a_position / u_resolution) * 2.0 - 1.0; gl_Position = vec4(clip * vec2(1, -1), 0, 1); v_color = a_color; }`;
    const fsSource = `precision mediump float; varying vec4 v_color; void main() { gl_FragColor = v_color; }`;
    const vs = gl.createShader(gl.VERTEX_SHADER); gl.shaderSource(vs, vsSource); gl.compileShader(vs);
    const fs = gl.createShader(gl.FRAGMENT_SHADER); gl.shaderSource(fs, fsSource); gl.compileShader(fs);
    const prog = gl.createProgram(); gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { console.error('[WebGL] Program link error:', gl.getProgramInfoLog(prog)); throw new Error('WebGL program link failed'); }
    this._programs.main = prog;
    this._loc = { pos: gl.getAttribLocation(prog, 'a_position'), col: gl.getAttribLocation(prog, 'a_color'), res: gl.getUniformLocation(prog, 'u_resolution') };
  }

  _initBuffers() {
    const gl = this.gl; this._buffers.vertices = gl.createBuffer(); this._buffers.colors = gl.createBuffer();
  }

  resize(w, h) {
    if (this.width === w && this.height === h) return false;
    this.width = w; this.height = h; const gl = this.gl;
    this.canvas.width = Math.floor(w * this.dpr); this.canvas.height = Math.floor(h * this.dpr);
    this.canvas.style.width = w + 'px'; this.canvas.style.height = h + 'px';
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    if (this.ctx2d) {
      this.overlay.width = this.canvas.width; this.overlay.height = this.canvas.height;
      this.overlay.style.width = w + 'px'; this.overlay.style.height = h + 'px';
      this.ctx2d.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    }
    return true;
  }

  // ✅ ✅ إصلاح: قراءة لون الخلفية من الإعدادات إذا لم يُمرّر لون
  clear(color) {
    const gl = this.gl;
    // ✅ قراءة اللون من الإعدادات إذا لم يُمرّر
    const bgColor = color || getColor('bg', '#060a12');
    const r = parseInt(bgColor.slice(1, 3), 16) / 255, 
          g = parseInt(bgColor.slice(3, 5), 16) / 255, 
          b = parseInt(bgColor.slice(5, 7), 16) / 255;
    gl.clearColor(r, g, b, 1); 
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.BLEND); 
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    if (this.ctx2d) { 
      this.ctx2d.clearRect(0, 0, this.width, this.height); 
    }
  }

  _parseColor(str) {
    if (typeof str === 'string') {
      if (str.startsWith('#')) { return [ parseInt(str.slice(1, 3), 16) / 255, parseInt(str.slice(3, 5), 16) / 255, parseInt(str.slice(5, 7), 16) / 255, 1 ]; }
      if (str.startsWith('rgba')) { const m = str.match(/rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)/); if (m) { return [m[1] / 255, m[2] / 255, m[3] / 255, parseFloat(m[4])]; } }
    }
    return [1, 1, 1, 1];
  }

  _drawArrays(type, vertices, colOrArray) {
    if (!vertices || vertices.length < 2) return;
    const gl = this.gl; gl.useProgram(this._programs.main); gl.uniform2f(this._loc.res, this.canvas.width, this.canvas.height);
    gl.bindBuffer(gl.ARRAY_BUFFER, this._buffers.vertices); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(this._loc.pos); gl.vertexAttribPointer(this._loc.pos, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this._buffers.colors);
    const n = vertices.length / 2; let colorData;
    if (typeof colOrArray === 'string') { const rgba = this._parseColor(colOrArray); colorData = new Float32Array(n * 4); for (let i = 0; i < n; i++) { colorData.set(rgba, i * 4); } }
    else if (Array.isArray(colOrArray) && colOrArray.length === n * 4) { colorData = new Float32Array(colOrArray); }
    else { colorData = new Float32Array(n * 4).fill(1); }
    gl.bufferData(gl.ARRAY_BUFFER, colorData, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(this._loc.col); gl.vertexAttribPointer(this._loc.col, 4, gl.FLOAT, false, 0, 0);
    gl.lineWidth(1); gl.drawArrays(type, 0, n);
  }

  drawGrid(ps, ts, chartH) {
    const gl = this.gl; if (!gl) return; const dpr = this.dpr; const lines = []; const range = ps.max - ps.min;
    for (let i = 0; i <= 6; i++) { const price = ps.min + (range / 6) * i; const y = ps.priceToY(price, chartH); const ySnap = Math.round(y) + 0.5; lines.push(0, ySnap * dpr, this.width * dpr, ySnap * dpr); }
    const vLines = this._buildTimeGridLines(ts, this.width, this.height);
    for (let j = 0; j < vLines.length; j += 4) { lines.push(vLines[j] * dpr, vLines[j + 1] * dpr, vLines[j + 2] * dpr, vLines[j + 3] * dpr); }
    this._drawArrays(gl.LINES, lines, getColor('grid', '#0f1c2e'));
  }

  _buildTimeGridLines(ts, w, h) {
    const lines = []; const data = ts.data; if (!data || data.length === 0) return lines;
    const vr = ts.getVisibleRange(w); const firstIdx = Math.max(0, Math.floor(vr.start)); const lastIdx = Math.min(data.length - 1, Math.ceil(vr.end));
    const first = data[firstIdx]; const last = data[lastIdx]; if (!first || !last) return lines;
    const timeSpan = last.time - first.time; if (timeSpan <= 0) return lines;
    const pxPerMs = w / timeSpan; const TARGET_PX = 80;
    const intervals = [ 60_000, 5 * 60_000, 15 * 60_000, 30 * 60_000, 60 * 60_000, 2 * 60 * 60_000, 4 * 60 * 60_000, 6 * 60 * 60_000, 12 * 60 * 60_000, 24 * 60 * 60_000, 7 * 24 * 60 * 60_000 ];
    let chosen = intervals[intervals.length - 1];
    for (const intv of intervals) { if (intv * pxPerMs >= TARGET_PX) { chosen = intv; break; } }
    const stepPx = ts.spacing; const offsetPx = ts.offset; let t = Math.floor(first.time / chosen) * chosen;
    for (; t <= last.time; t += chosen) {
      const idx = ts.timeToIndex(t); if (idx == null || idx < 0 || idx >= data.length) continue;
      const x = offsetPx + idx * stepPx; const xSnap = Math.round(x) + 0.5;
      if (xSnap >= -stepPx && xSnap <= w + stepPx) { lines.push(xSnap, 0, xSnap, h); }
    }
    return lines;
  }

  drawCandles(candles, ts, ps, chartH) {
    const gl = this.gl; if (!gl) return; const dpr = this.dpr; const vr = ts.getVisibleRange(this.width);
    const wickV = [], wickC = [], bodyV = [], bodyC = [], lineV = [], lineC = [];
    
    // ✅ جلب الألوان من CFG
    const colorUp = getColor('up', '#15ff00');
    const colorDown = getColor('down', '#ff0000');
    
    for (let i = vr.start; i <= vr.end; i++) {
      const c = candles[i]; if (!c) continue; 
      const metrics = candleMetricsPrecision(i, ts);
      if (metrics.centerX < -ts.spacing - 2 || metrics.centerX > this.width + ts.spacing + 2) continue;
      
      const yH = Math.round(ps.priceToY(c.high, chartH)) + 0.5; 
      const yL = Math.round(ps.priceToY(c.low, chartH)) + 0.5;
      const yO = Math.round(ps.priceToY(c.open, chartH)); 
      const yC = Math.round(ps.priceToY(c.close, chartH));
      
      const isUp = c.close >= c.open; 
      // ✅ استخدام الألوان الموحدة
      const baseColor = isUp ? colorUp : colorDown;
      const col = this._parseColor(baseColor);
      
      // ✅ استخدام ألفا من المقاييس
      const alpha = metrics.alpha ?? 0.9;
      const colWithAlpha = [...col]; colWithAlpha[3] = alpha;
      
      if (metrics.mode === 'line-only' || metrics.mode === 'line') {
        lineV.push((metrics.centerX + 0.5) * dpr, yH * dpr, (metrics.centerX + 0.5) * dpr, yL * dpr); 
        lineC.push(...colWithAlpha, ...colWithAlpha);
      } else {
        const wickW = 0.5;
        wickV.push(
          (metrics.centerX + 0.5 - wickW) * dpr, yH * dpr, 
          (metrics.centerX + 0.5 + wickW) * dpr, yH * dpr, 
          (metrics.centerX + 0.5 + wickW) * dpr, yL * dpr, 
          (metrics.centerX + 0.5 - wickW) * dpr, yH * dpr, 
          (metrics.centerX + 0.5 + wickW) * dpr, yL * dpr, 
          (metrics.centerX + 0.5 - wickW) * dpr, yL * dpr
        );
        for (let j = 0; j < 6; j++) wickC.push(...colWithAlpha);
        
        const bodyTop = Math.min(yO, yC); 
        const bodyH = Math.max(1, Math.abs(yC - yO));
        bodyV.push(
          metrics.bodyLeft * dpr, bodyTop * dpr, 
          metrics.bodyRight * dpr, bodyTop * dpr, 
          metrics.bodyRight * dpr, (bodyTop + bodyH) * dpr, 
          metrics.bodyLeft * dpr, bodyTop * dpr, 
          metrics.bodyRight * dpr, (bodyTop + bodyH) * dpr, 
          metrics.bodyLeft * dpr, (bodyTop + bodyH) * dpr
        );
        // ✅ ألفا أعلى للأجسام
        const bodyAlpha = [...col]; bodyAlpha[3] = isUp ? 0.98 : 0.95;
        for (let j = 0; j < 6; j++) bodyC.push(...bodyAlpha);
      }
    }
    if (wickV.length >= 6) this._drawArrays(gl.TRIANGLES, wickV, wickC);
    if (bodyV.length >= 6) this._drawArrays(gl.TRIANGLES, bodyV, bodyC);
    if (lineV.length >= 2) this._drawArrays(gl.LINES, lineV, lineC);
  }

  drawPriceLine(price, isUp, ps, chartH) {
    const gl = this.gl; if (!gl || !ps || !chartH) return -1; 
    const dpr = this.dpr; 
    const y = Math.round(ps.priceToY(price, chartH)) + 0.5;
    
    const color = isUp ? getColor('priceLine', '#2196f3') : getColor('down', '#ff0000');
    const dashedVerts = []; const dashLen = 6; const gapLen = 4;
    for (let x = 0; x < this.width; x += dashLen + gapLen) { 
      const endX = Math.min(x + dashLen, this.width); 
      dashedVerts.push(x * dpr, y * dpr, endX * dpr, y * dpr); 
    }
    this._drawArrays(gl.LINES, dashedVerts, color); 
    return y;
  }

  drawCrosshair(x, y) {
    const gl = this.gl; if (!gl) return; 
    const dpr = this.dpr; 
    const px = Math.round(x) + 0.5; 
    const py = Math.round(y) + 0.5;
    
    this._drawArrays(gl.LINES, 
      [ px * dpr, 0, px * dpr, this.height * dpr, 0, py * dpr, this.width * dpr, py * dpr ], 
      getColor('crosshair', 'rgba(150,180,220,0.6)')
    );
    
    if (this.ctx2d) {
      this.ctx2d.beginPath(); this.ctx2d.arc(x, y, 4, 0, Math.PI * 2);
      this.ctx2d.fillStyle = getColor('bg', '#060a12'); this.ctx2d.fill();
      this.ctx2d.strokeStyle = getColor('crosshair', 'rgba(150,180,220,0.6)'); 
      this.ctx2d.lineWidth = 1; this.ctx2d.stroke();
    }
  }

  drawTimer(text, x, y, color = '#4da6ff', fontSize = 11) {
    if (!this.ctx2d) return; 
    this.ctx2d.save();
    this.ctx2d.font = `bold ${fontSize}px 'Segoe UI', monospace`; 
    this.ctx2d.textAlign = 'center'; 
    this.ctx2d.textBaseline = 'middle';
    this.ctx2d.fillStyle = color;
    
    // ✅ التحكم في التوهج عبر الإعدادات
    if (typeof CFG !== 'undefined' && CFG.ui?.enableTimerShadow !== false) {
      this.ctx2d.shadowColor = getColor('timerShadow', 'rgba(0,15,40,0.4)');
      this.ctx2d.shadowBlur = 3;
    }
    
    this.ctx2d.fillText(text, x / this.dpr, y / this.dpr + 1); 
    this.ctx2d.restore();
  }

  // ════════════════════════════════════════════════════════════════════════
  // ✅ البدائيات الذكية (WebGL) - نستخدم Canvas 2D Overlay للمرونة الكاملة
  // ════════════════════════════════════════════════════════════════════════
  drawLine(values, color, opts = {}) {
    if (!this.ctx2d || !opts.ts || !opts.ps) return;
    const ctx = this.ctx2d;
    const { ts, ps, chartH, yOffset = 0, lineWidth = 1, alpha = 0.85 } = opts;
    const vr = ts.getVisibleRange(this.width);
    
    ctx.save();
    ctx.lineWidth = lineWidth;
    ctx.globalAlpha = alpha;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    
    const isDynamic = Array.isArray(color);
    if (!isDynamic) ctx.strokeStyle = color;

    let prevX, prevY, started = false;
    for (let i = vr.start; i <= vr.end; i++) {
      if (values[i] == null) { started = false; continue; }
      const x = Math.round(ts.indexToX(i)) + 0.5;
      const y = Math.round(ps.priceToY(values[i], chartH)) + 0.5 + yOffset;
      
      if (started) {
        if (isDynamic) {
          ctx.beginPath();
          ctx.strokeStyle = color[i] || '#fff';
          ctx.moveTo(prevX, prevY);
          ctx.lineTo(x, y);
          ctx.stroke();
        } else {
          ctx.lineTo(x, y);
        }
      } else if (!isDynamic) {
        ctx.beginPath();
        ctx.moveTo(x, y);
      }
      prevX = x; prevY = y; started = true;
    }
    
    if (!isDynamic) ctx.stroke();
    ctx.restore();
  }

  drawArea(topVals, btmVals, fillColor, opts = {}) {
    if (!this.ctx2d || !opts.ts || !opts.ps) return;
    const ctx = this.ctx2d;
    const { ts, ps, chartH, yOffset = 0, strokeColor = null, lineWidth = 0, alpha = 1 } = opts;
    const vr = ts.getVisibleRange(this.width);
    ctx.save(); ctx.globalAlpha = alpha; ctx.beginPath(); let started = false; const topPoints = [], btmPoints = [];
    for (let i = vr.start; i <= vr.end; i++) {
      if (topVals[i] == null || btmVals[i] == null) continue;
      const x = Math.round(ts.indexToX(i)) + 0.5;
      const yTop = Math.round(ps.priceToY(topVals[i], chartH)) + 0.5 + yOffset;
      const yBtm = Math.round(ps.priceToY(btmVals[i], chartH)) + 0.5 + yOffset;
      if (!started) { ctx.moveTo(x, yTop); started = true; } else { ctx.lineTo(x, yTop); }
      topPoints.push({ x, y: yTop }); btmPoints.push({ x, y: yBtm });
    }
    for (let i = btmPoints.length - 1; i >= 0; i--) ctx.lineTo(btmPoints[i].x, btmPoints[i].y);
    ctx.closePath(); ctx.fillStyle = fillColor; ctx.fill();
    if (strokeColor && lineWidth > 0) {
      ctx.strokeStyle = strokeColor; ctx.lineWidth = lineWidth;
      ctx.beginPath(); for (let i = 0; i < topPoints.length; i++) { if (i === 0) ctx.moveTo(topPoints[i].x, topPoints[i].y); else ctx.lineTo(topPoints[i].x, topPoints[i].y); } ctx.stroke();
      ctx.beginPath(); for (let i = 0; i < btmPoints.length; i++) { if (i === 0) ctx.moveTo(btmPoints[i].x, btmPoints[i].y); else ctx.lineTo(btmPoints[i].x, btmPoints[i].y); } ctx.stroke();
    }
    ctx.restore();
  }

  drawShapes(shapes, opts = {}) {
    if (!this.ctx2d || !opts.ts || !opts.ps || !shapes) return;
    const ctx = this.ctx2d;
    const { ts, ps, chartH, yOffset = 0, size = 5 } = opts;
    ctx.save();
    for (const s of shapes) {
      const x = Math.round(ts.indexToX(s.idx)) + 0.5;
      const y = Math.round(ps.priceToY(s.price, chartH)) + 0.5 + yOffset;
      const sz = s.size || size; const col = s.color || '#fff';
      if (s.type === 'arrow_up') { ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - sz, y + sz * 2); ctx.lineTo(x + sz, y + sz * 2); ctx.closePath(); ctx.fill(); }
      else if (s.type === 'arrow_down') { ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - sz, y - sz * 2); ctx.lineTo(x + sz, y - sz * 2); ctx.closePath(); ctx.fill(); }
      else if (s.type === 'circle') { ctx.strokeStyle = col; ctx.lineWidth = s.lineWidth || 1.5; ctx.beginPath(); ctx.arc(x, y, sz, 0, Math.PI * 2); ctx.stroke(); }
      else if (s.type === 'cross') { ctx.strokeStyle = col; ctx.lineWidth = s.lineWidth || 1.5; ctx.beginPath(); ctx.moveTo(x - sz, y - sz); ctx.lineTo(x + sz, y + sz); ctx.moveTo(x + sz, y - sz); ctx.lineTo(x - sz, y + sz); ctx.stroke(); }
      else if (s.type === 'diamond') { ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(x, y - sz); ctx.lineTo(x + sz, y); ctx.lineTo(x, y + sz); ctx.lineTo(x - sz, y); ctx.closePath(); ctx.fill(); }
    }
    ctx.restore();
  }

  drawRects(rects, opts = {}) {
    if (!this.ctx2d || !opts.ts || !opts.ps || !rects) return;
    const ctx = this.ctx2d;
    const { ts, ps, chartH, yOffset = 0, strokeColor = null, lineWidth = 0, dashed = false } = opts;
    ctx.save();
    for (const r of rects) {
      const x1 = Math.round(ts.indexToX(r.x1Idx)); const x2 = Math.round(ts.indexToX(r.x2Idx));
      const y1 = Math.round(ps.priceToY(r.y1Price, chartH)) + 0.5 + yOffset;
      const y2 = Math.round(ps.priceToY(r.y2Price, chartH)) + 0.5 + yOffset;
      ctx.fillStyle = r.color || 'rgba(255,255,255,0.1)'; ctx.globalAlpha = r.alpha ?? 1;
      ctx.fillRect(x1, y1, x2 - x1, y2 - y1);
      if (strokeColor || r.strokeColor) {
        ctx.strokeStyle = r.strokeColor || strokeColor; ctx.lineWidth = r.lineWidth || lineWidth;
        if (dashed || r.dashed) ctx.setLineDash([4, 4]);
        ctx.strokeRect(x1, y1, x2 - x1, y2 - y1); ctx.setLineDash([]);
      }
    }
    ctx.restore();
  }

  setRefs(ts, ps) { this._cachedTS = ts; this._cachedPS = ps; }

  destroy() {
    const gl = this.gl; if (!gl) return;
    if (this._programs.main) gl.deleteProgram(this._programs.main);
    if (this._buffers.vertices) gl.deleteBuffer(this._buffers.vertices);
    if (this._buffers.colors) gl.deleteBuffer(this._buffers.colors);
  }
}

// ════════════════════════════════════════════════════════════════════════
// PriceAxisRenderer / TimeAxisRenderer / Scales
// ════════════════════════════════════════════════════════════════════════
class PriceAxisRenderer {
  constructor(c) { this.canvas = c; this.ctx = c.getContext('2d', { alpha: false }); this.w = 0; this.h = 0; this.dpr = Math.min(window.devicePixelRatio || 1, 2); }
  resize(w, h) {
    if (this.w === w && this.h === h) return false; this.w = w; this.h = h;
    this.canvas.width = Math.floor(w * this.dpr); this.canvas.height = Math.floor(h * this.dpr);
    this.canvas.style.width = w + 'px'; this.canvas.style.height = h + 'px';
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); this.ctx.imageSmoothingEnabled = false; return true;
  }
  render(ps, chartH, crossY = -1, lastPrice = -1, isUp = false, priceStr = '') {
    const { ctx, w, h } = this; 
    // ✅ استخدام لون الخلفية من الإعدادات
    ctx.fillStyle = getColor('bg', '#060a12'); 
    ctx.fillRect(0, 0, w, h);
    ctx.font = `${typeof CFG !== 'undefined' && CFG.isMobile ? 9 : 10}px monospace`; 
    ctx.textAlign = 'right'; 
    ctx.textBaseline = 'middle';
    const r = ps.max - ps.min;
    for (let i = 0; i <= 6; i++) {
      const p = ps.min + (r / 6) * i; 
      const y = Math.round(ps.priceToY(p, chartH)) + 0.5;
      if (y < 8 || y > h - 8) continue; 
      // ✅ استخدام لون نص من الإعدادات
      ctx.fillStyle = getColor('text', '#4a6a8a');
      ctx.fillText(typeof Utils !== 'undefined' && Utils.fmtPrice ? Utils.fmtPrice(p) : p.toFixed(2), w - 6, y + 1);
    }
    if (crossY >= 0 && crossY <= chartH) {
      const pcy = Math.round(crossY) + 0.5; 
      const cp = ps.yToPrice(crossY, chartH);
      // ✅ استخدام لون الخلفية من الإعدادات
      ctx.fillStyle = getColor('bg', '#060a12'); 
      ctx.fillRect(0, pcy - 9, w, 18);
      ctx.strokeStyle = getColor('textBright', '#8aaccc'); 
      ctx.lineWidth = 1 / this.dpr; 
      ctx.strokeRect(1, pcy - 9, w - 2, 18);
      // ✅ استخدام لون نص أبيض للقيمة المحددة
      ctx.fillStyle = getColor('textWhite', '#e0ecff'); 
      ctx.fillText(typeof Utils !== 'undefined' && Utils.fmtPrice ? Utils.fmtPrice(cp) : cp.toFixed(2), w - 6, pcy + 1);
    }
  }
}

class TimeAxisRenderer {
  constructor(c) { this.canvas = c; this.ctx = c.getContext('2d', { alpha: false }); this.w = 0; this.h = 0; this.dpr = Math.min(window.devicePixelRatio || 1, 2); }
  resize(w, h) {
    if (this.w === w && this.h === h) return false; this.w = w; this.h = h;
    this.canvas.width = Math.floor(w * this.dpr); this.canvas.height = Math.floor(h * this.dpr);
    this.canvas.style.width = w + 'px'; this.canvas.style.height = h + 'px';
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); this.ctx.imageSmoothingEnabled = false; return true;
  }
  render(ts, candles, w, cx = -1) {
    const { ctx, h } = this; 
    // ✅ استخدام لون الخلفية من الإعدادات
    ctx.fillStyle = getColor('bg', '#060a12'); 
    ctx.fillRect(0, 0, w, h);
    const vr = ts.getVisibleRange(w); 
    ctx.font = `${typeof CFG !== 'undefined' && CFG.isMobile ? 8 : 9}px monospace`;
    ctx.textAlign = 'center'; 
    ctx.textBaseline = 'middle'; 
    const data = ts.data; if (!data || data.length === 0) return;
    const firstIdx = Math.max(0, Math.floor(vr.start)); const lastIdx = Math.min(data.length - 1, Math.ceil(vr.end));
    const first = data[firstIdx]; const last = data[lastIdx]; if (!first || !last) return;
    const timeSpan = last.time - first.time; if (timeSpan <= 0) return; 
    const pxPerMs = w / timeSpan; const TARGET_PX = 80;
    const intervals = [ 60_000, 5 * 60_000, 15 * 60_000, 30 * 60_000, 60 * 60_000, 2 * 60 * 60_000, 4 * 60 * 60_000, 6 * 60 * 60_000, 12 * 60 * 60_000, 24 * 60 * 60_000, 7 * 24 * 60 * 60_000 ];
    let chosen = intervals[intervals.length - 1];
    for (const intv of intervals) { if (intv * pxPerMs >= TARGET_PX) { chosen = intv; break; } }
    const stepPx = ts.spacing; const offsetPx = ts.offset; let t = Math.floor(first.time / chosen) * chosen; let lx = -100;
    for (; t <= last.time; t += chosen) {
      const idx = ts.timeToIndex(t); if (idx == null || idx < 0 || idx >= data.length) continue;
      const px = Math.round(offsetPx + idx * stepPx) + 0.5;
      if (px < 24 || px > w - 20 || Math.abs(px - lx) < 55) continue;
      const c = candles[idx]; if (!c) continue; const d = new Date(c.time); const lb = this._formatTime(d, chosen);
      // ✅ استخدام لون نص من الإعدادات
      ctx.fillStyle = getColor('text', '#4a6a8a'); 
      ctx.fillText(lb, px, h / 2 + 1); lx = px;
    }
    if (cx >= 0 && cx <= w && candles?.length > 0) {
      const idx = Math.round(ts.xToIndex(cx)); if (idx >= 0 && idx < candles.length) {
        const c = candles[idx]; if (c) {
          const pcx = Math.round(ts.indexToX(idx)) + 0.5; const d = new Date(c.time); const lb = this._formatTime(d, chosen);
          // ✅ استخدام لون الخلفية من الإعدادات
          ctx.fillStyle = getColor('bg', '#060a12'); 
          ctx.fillRect(pcx - 24, 2, 48, h - 4);
          ctx.strokeStyle = getColor('textBright', '#8aaccc'); 
          ctx.lineWidth = 1 / this.dpr; 
          ctx.strokeRect(pcx - 23.5, 2.5, 47, h - 5);
          ctx.fillStyle = getColor('textWhite', '#e0ecff'); 
          ctx.fillText(lb, pcx, h / 2 + 1);
        }
      }
    }
  }
  _formatTime(date, intervalMs) {
    const h = date.getHours().toString().padStart(2, '0'); const m = date.getMinutes().toString().padStart(2, '0');
    const d = date.getDate().toString().padStart(2, '0'); const mo = (date.getMonth() + 1).toString().padStart(2, '0');
    if (intervalMs >= 24 * 60 * 60_000) return `${d}/${mo}`;
    if (intervalMs >= 60 * 60_000) return `${h}:00`;
    return `${h}:${m}`;
  }
}

class TimeScale {
  constructor() { this.spacing = 8; this.offset = 0; this.data = []; }
  setData(d) { this.data = d; }
  indexToX(i) { return this.offset + i * this.spacing; }
  xToIndex(x) { return (x - this.offset) / this.spacing; }
  timeToIndex(timestamp) {
    const data = this.data; if (!data || data.length === 0) return null;
    let lo = 0, hi = data.length - 1;
    while (lo <= hi) { const mid = (lo + hi) >>> 1; const t = data[mid].time; if (t < timestamp) { lo = mid + 1; } else if (t > timestamp) { hi = mid - 1; } else { return mid; } }
    if (lo >= data.length) return data.length - 1; if (lo <= 0) return 0;
    const t0 = data[lo - 1].time; const t1 = data[lo].time; if (t1 === t0) return lo - 1;
    const ratio = (timestamp - t0) / (t1 - t0); return (lo - 1) + ratio;
  }
  indexToTime(i) { const data = this.data; if (!data || i < 0 || i >= data.length) return null; return data[Math.floor(i)]?.time ?? null; }
  getVisibleRange(w) { const s = Math.max(0, Math.floor(this.xToIndex(-this.spacing * 2))); const e = Math.min(this.data.length - 1, Math.ceil(this.xToIndex(w + this.spacing * 2))); return { start: s, end: e }; }
  scroll(dx, w) { this.offset = this._clamp(this.offset + dx, w); }
  zoom(f, cx, w) { const os = this.spacing; const ns = Math.max(1.5, Math.min(60, os * f)); const ci = this.xToIndex(cx); this.spacing = ns; this.offset += cx - this.indexToX(ci); this.offset = this._clamp(this.offset, w); }
  scrollToEnd(w) { if (!this.data.length) return; this.offset = w - (this.data.length - 1) * this.spacing - this.spacing * 1.5; this.offset = this._clamp(this.offset, w); }
  _clamp(o, w) { const mx = w * 0.6; const mn = -(this.data.length * this.spacing) + w * 0.4; return Math.max(mn, Math.min(mx, o)); }
  setBounds(w) { this.offset = this._clamp(this.offset, w); }
}

class PriceScale {
  constructor() { this.min = 0; this.max = 100; this._margin = 0.04; }
  calculateRange(c, s, e) {
    s = Math.max(0, Math.floor(s)); e = Math.min(c.length - 1, Math.ceil(e));
    let lo = Infinity, hi = -Infinity;
    for (let i = s; i <= e; i++) { const x = c[i]; if (!x) continue; if (x.low < lo) lo = x.low; if (x.high > hi) hi = x.high; }
    if (!isFinite(lo)) { lo = 0; hi = 100; }
    const r = hi - lo; this.min = lo - r * this._margin; this.max = hi + r * this._margin;
    if (this.max === this.min) this.max = this.min + 1;
  }
  priceToY(p, h) { return h * (1 - (p - this.min) / (this.max - this.min)); }
  yToPrice(y, h) { return this.min + (1 - y / h) * (this.max - this.min); }
}

class InertiaScroller {
  constructor(ts) { this.ts = ts; this.vel = 0; this.running = false; this.friction = 0.96; this.minVel = 0.2; this.history = []; this.maxHistory = 6; this.raf = null; this.chartW = 0; }
  setChartWidth(w) { this.chartW = w; }
  startTracking() { this.vel = 0; this.history = []; }
  track(dx, ts) { this.history.push({ dx, ts }); if (this.history.length > this.maxHistory) this.history.shift(); }
  release() {
    if (this.history.length < 2) return; const r = this.history.slice(-4); let sv = 0, n = 0;
    for (let i = 1; i < r.length; i++) { const dt = r[i].ts - r[i - 1].ts; if (dt > 0 && dt < 80) { sv += r[i].dx / dt; n++; } }
    this.vel = (n ? sv / n : 0) * 16 * 1.6; if (Math.abs(this.vel) > this.minVel) this._run();
  }
  _run() {
    if (this.running) return; this.running = true;
    const step = () => {
      if (!this.running) return; this.vel *= this.friction;
      if (Math.abs(this.vel) < this.minVel) { this.vel = 0; this.running = false; return; }
      this.ts.scroll(this.vel, this.chartW); this.raf = requestAnimationFrame(step);
    };
    this.raf = requestAnimationFrame(step);
  }
  stop() { this.running = false; if (this.raf) { cancelAnimationFrame(this.raf); this.raf = null; } this.vel = 0; this.history = []; }
  isActive() { return this.running; }
}
