'use strict';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * RENDERER - محرك رسم موحد (WebGL + Canvas 2D Fallback)
 * ✅ الشموع: Pixel Perfect (Math.round + no AA)
 * ✅ المؤشرات: TRIANGLES + Feather AA + Smooth Joints + Catmull-Rom
 * ✅ خط متقطع ناعم (Dashed) + ألوان RGBA مدعومة
 * ✅ عداد تنازلي: أرقام زرقاء بدون إطار
 * ✅ كامل بدون نقص: جميع الوظائف محفوظة ومحدثة
 */

function hasWebGLSupport() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGL2RenderingContext && c.getContext('webgl2')) ||
           !!(window.WebGLRenderingContext && c.getContext('webgl'));
  } catch { return false; }
}

class ChartRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.useWebGL = hasWebGLSupport();
    if (this.useWebGL) {
      try {
        console.log('[Renderer] Using WebGL');
        this._engine = new WebGLRenderer(canvas);
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
  resize(w, h) { return this._engine.resize(w, h); }
  clear(color) { this._engine.clear(color); }
  drawGrid(ps, ts, chartH) { this._engine.drawGrid?.(ps, ts, chartH); }
  drawCandles(c, ts, ps, chartH) { this._engine.drawCandles?.(c, ts, ps, chartH); }
  drawVolume(c, ts, ps, r, chartH) { this._engine.drawVolume?.(c, ts, ps, r, chartH); }
  drawMA(v, col, ts, ps, chartH) { this._engine.drawMA?.(v, col, ts, ps, chartH); }
  drawBollingerBands(bb, ts, ps, chartH) { this._engine.drawBollingerBands?.(bb, ts, ps, chartH); }
  drawPriceLine(p, u, ps, chartH) { return this._engine.drawPriceLine?.(p, u, ps, chartH) ?? -1; }
  drawCrosshair(x, y) { this._engine.drawCrosshair?.(x, y); }
  drawTimer(text, x, y, color, fontSize) { this._engine.drawTimer?.(text, x, y, color, fontSize); }
  setRefs(ts, ps) { this._engine.setRefs?.(ts, ps); }
  destroy() { this._engine.destroy?.(); }
}

// ═══════════════════════════════════════════════════════════════════════
// Canvas 2D Renderer (Fallback)
// ═══════════════════════════════════════════════════════════════════════
class Canvas2DRenderer {
  constructor(c) {
    this.canvas = c;
    this.ctx = c.getContext('2d', { alpha: false });
    this.w = 0; this.h = 0;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
  }

  resize(w, h) {
    if (this.w === w && this.h === h) return false;
    this.w = w; this.h = h;
    this.canvas.width = Math.floor(w * this.dpr);
    this.canvas.height = Math.floor(h * this.dpr);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.ctx.imageSmoothingEnabled = false;
    this.ctx.imageSmoothingQuality = 'high';
    return true;
  }

  clear(col = '#060a12') {
    this.ctx.fillStyle = col;
    this.ctx.fillRect(0, 0, this.w * this.dpr, this.h * this.dpr);
  }

  drawGrid(ps, ts, chartH) {
    const { ctx, w, h } = this;
    const dpr = this.dpr;
    ctx.strokeStyle = '#0f1c2e';
    ctx.lineWidth = 0.5 * dpr;
    ctx.setLineDash([4, 4]);
    const r = ps.max - ps.min;
    for (let i = 0; i <= 8; i++) {
      const physicalY = Math.round(ps.priceToY(ps.min + (r / 8) * i, chartH) * dpr);
      ctx.beginPath(); ctx.moveTo(0, physicalY); ctx.lineTo(w * dpr, physicalY); ctx.stroke();
    }
    ctx.setLineDash([]);
    const vr = ts.getVisibleRange(w);
    const st = Math.max(1, Math.floor((vr.end - vr.start) / 10));
    ctx.strokeStyle = '#172438';
    for (let i = vr.start; i <= vr.end; i += st) {
      const physicalX = Math.round(ts.indexToX(i) * dpr);
      if (physicalX >= 0 && physicalX <= w * dpr) {
        ctx.beginPath(); ctx.moveTo(physicalX, 0); ctx.lineTo(physicalX, h * dpr); ctx.stroke();
      }
    }
  }

  drawCandles(candles, ts, ps, chartH) {
    const { ctx, w, h } = this;
    const dpr = this.dpr;
    const vr = ts.getVisibleRange(w);
    const bw = Math.max(1, ts.spacing * 0.62);
    for (let i = vr.start; i <= vr.end; i++) {
      const c = candles[i]; if (!c) continue;
      const logicalX = ts.indexToX(i);
      const physicalX = Math.round(logicalX * dpr);
      if (logicalX < -bw - 2 || logicalX > w + bw + 2) continue;
      const up = c.close >= c.open;
      const logicalYo = ps.priceToY(c.open, chartH), logicalYh = ps.priceToY(c.high, chartH);
      const logicalYl = ps.priceToY(c.low,  chartH), logicalYc = ps.priceToY(c.close, chartH);
      const physicalYh = Math.round(logicalYh * dpr), physicalYl = Math.round(logicalYl * dpr);
      ctx.strokeStyle = up ? '#2bff01' : '#ff0000';
      ctx.lineWidth = Math.max(0.5, bw > 6 ? 1.5 : 0.8) * dpr;
      ctx.globalAlpha = up ? 0.7 : 0.6;
      ctx.beginPath(); ctx.moveTo(physicalX, physicalYh); ctx.lineTo(physicalX, physicalYl); ctx.stroke();
      ctx.globalAlpha = 0.95;
      ctx.fillStyle = up ? '#00ff00' : '#ff0000';
      const physicalBy = Math.round(Math.min(logicalYo, logicalYc) * dpr);
      const physicalBh = Math.max(1, Math.round(Math.abs(logicalYc - logicalYo) * dpr));
      ctx.fillRect(Math.round(physicalX - (bw * dpr) / 2), physicalBy, Math.max(1, Math.round(bw * dpr)), physicalBh);
    }
    ctx.globalAlpha = 1;
  }

  drawVolume(candles, ts, ps, ratio = 0.15, chartH) {
    const { ctx, w, h } = this;
    const dpr = this.dpr;
    const vr = ts.getVisibleRange(w);
    const bw = Math.max(1, ts.spacing * 0.6);
    let mv = 0;
    for (let i = vr.start; i <= vr.end; i++) { const c = candles[i]; if (c && c.volume > mv) mv = c.volume; }
    if (!mv) return;
    const vh = chartH * ratio;
    for (let i = vr.start; i <= vr.end; i++) {
      const c = candles[i]; if (!c) continue;
      const logicalX = ts.indexToX(i);
      const physicalX = Math.round(logicalX * dpr);
      if (logicalX < -bw - 2 || logicalX > w + bw + 2) continue;
      ctx.fillStyle = c.close >= c.open ? 'rgba(0,230,118,0.3)' : 'rgba(255,23,68,0.3)';
      const physicalVh = Math.round((c.volume / mv) * vh * dpr);
      ctx.fillRect(Math.round(physicalX - (bw * dpr) / 2), h * dpr - physicalVh, Math.max(1, Math.round(bw * dpr)), physicalVh);
    }
  }

  // ✅ Canvas 2D: lineJoin/lineCap = round للمؤشرات (ناعمة طبيعياً)
  drawMA(values, color, ts, ps, chartH) {
    if (!ts || !ps) return;
    const { ctx, w } = this;
    const dpr = this.dpr;
    const vr = ts.getVisibleRange(w);
    ctx.strokeStyle = color || '#f9a825';
    ctx.lineWidth = 1.2 * dpr;
    ctx.globalAlpha = 0.85;
    ctx.lineJoin = 'round';
    ctx.lineCap  = 'round';
    ctx.beginPath();
    let s = false;
    for (let i = vr.start; i <= vr.end; i++) {
      if (values[i] == null) continue;
      const x = ts.indexToX(i) * dpr, y = ps.priceToY(values[i], chartH) * dpr;
      if (!s) { ctx.moveTo(x, y); s = true; } else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  drawBollingerBands(bb, ts, ps, chartH) {
    if (!ts || !ps || !bb) return;
    const { ctx, w } = this;
    const dpr = this.dpr;
    const vr = ts.getVisibleRange(w);
    ctx.lineJoin = 'round';
    ctx.lineCap  = 'round';

    ctx.beginPath();
    let s = false;
    const lp = [];
    for (let i = vr.start; i <= vr.end; i++) {
      if (bb.upper[i] == null) continue;
      const x = ts.indexToX(i) * dpr, y = ps.priceToY(bb.upper[i], chartH) * dpr;
      if (!s) { ctx.moveTo(x, y); s = true; } else ctx.lineTo(x, y);
      lp.push({ x, y: ps.priceToY(bb.lower[i], chartH) * dpr });
    }
    for (let i = lp.length - 1; i >= 0; i--) ctx.lineTo(lp[i].x, lp[i].y);
    ctx.closePath();
    ctx.fillStyle = 'rgba(33,150,243,0.04)';
    ctx.fill();

    for (const [v, c] of [[bb.upper, 'rgba(100,181,246,0.5)'], [bb.mid, 'rgba(100,181,246,0.8)'], [bb.lower, 'rgba(100,181,246,0.5)']]) {
      ctx.beginPath(); ctx.strokeStyle = c; ctx.lineWidth = 0.8 * dpr; ctx.globalAlpha = 0.7; s = false;
      for (let i = vr.start; i <= vr.end; i++) {
        if (v[i] == null) continue;
        const x = ts.indexToX(i) * dpr, y = ps.priceToY(v[i], chartH) * dpr;
        if (!s) { ctx.moveTo(x, y); s = true; } else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  drawPriceLine(price, isUp, ps, chartH) {
    if (!ps || !chartH) return -1;
    const dpr = this.dpr;
    const physicalY = Math.round(ps.priceToY(price, chartH) * dpr);
    this.ctx.strokeStyle = isUp ? '#15ff00' : '#ff0000';
    this.ctx.lineWidth = 1 * dpr;
    this.ctx.setLineDash([4, 3]);
    this.ctx.globalAlpha = 0.6;
    this.ctx.beginPath(); this.ctx.moveTo(0, physicalY); this.ctx.lineTo(this.w * dpr, physicalY); this.ctx.stroke();
    this.ctx.setLineDash([]); this.ctx.globalAlpha = 1;
    return physicalY;
  }

  drawCrosshair(x, y) {
    if (x < 0 || y < 0 || x > this.w || y > this.h) return;
    const { ctx, w, h } = this;
    const dpr = this.dpr;
    const px = Math.round(x * dpr), py = Math.round(y * dpr);
    ctx.strokeStyle = 'rgba(150,180,220,0.5)'; ctx.lineWidth = 0.6 * dpr; ctx.setLineDash([3, 4]);
    ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, h * dpr); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(w * dpr, py); ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath(); ctx.arc(px, py, 4 * dpr, 0, Math.PI * 2);
    ctx.fillStyle = '#060a12'; ctx.fill();
    ctx.strokeStyle = 'rgba(150,180,220,0.5)'; ctx.lineWidth = 1 * dpr; ctx.stroke();
  }

  // ════════════════════════════════════════
  // ✅ رسم عداد تنازلي (نص أزرق بدون إطار)
  // ════════════════════════════════════════
  drawTimer(text, x, y, color = '#4da6ff', fontSize = 11) {
    const { ctx } = this;
    const dpr = this.dpr;
    
    ctx.save();
    ctx.font = `bold ${fontSize * dpr}px 'Segoe UI', monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    // ظل خفيف لتحسين القراءة على أي خلفية
    ctx.shadowColor = 'rgba(0, 15, 40, 0.7)';
    ctx.shadowBlur = 6 * dpr;
    ctx.fillText(text, x * dpr, y * dpr + 1 * dpr);
    ctx.restore();
  }

  setRefs(ts, ps) { this._ts = ts; this._ps = ps; }
}

// ═══════════════════════════════════════════════════════════════════════
// WebGL Renderer
// ✅ الشموع/grid/volume : Pixel Perfect - لم تتغير
// ✅ المؤشرات           : Catmull-Rom + Feathered TRIANGLES
// ✅ العداد التنازلي    : Canvas 2D Overlay للنصوص
// ═══════════════════════════════════════════════════════════════════════
class WebGLRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.gl = canvas.getContext('webgl2', { antialias: false, alpha: false }) ||
              canvas.getContext('webgl',  { antialias: false, alpha: false });
    if (!this.gl) throw new Error('WebGL not supported');
    this.w = 0; this.h = 0;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this._prog = {}; this._buf = {};
    this._textCanvas = null; this._textCtx = null;
    this._initShaders(); this._initBuffers();
  }

  _initShaders() {
    const gl = this.gl;
    const vs = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(vs, `attribute vec2 a; attribute vec4 c; uniform vec2 r; varying vec4 vc; void main(){vec2 p=(a/r)*2.0-1.0; gl_Position=vec4(p*vec2(1,-1),0,1); vc=c;}`);
    gl.compileShader(vs);
    const fs = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(fs, `precision mediump float; varying vec4 vc; void main(){gl_FragColor=vc;}`);
    gl.compileShader(fs);
    const p = gl.createProgram(); gl.attachShader(p, vs); gl.attachShader(p, fs); gl.linkProgram(p);
    this._prog.main = p;
    this._loc = { a: gl.getAttribLocation(p, 'a'), c: gl.getAttribLocation(p, 'c'), r: gl.getUniformLocation(p, 'r') };
  }

  _initBuffers() {
    const gl = this.gl;
    this._buf.v = gl.createBuffer(); this._buf.c = gl.createBuffer();
  }

  resize(w, h) {
    if (this.w === w && this.h === h) return false;
    this.w = w; this.h = h;
    const gl = this.gl;
    this.canvas.width  = Math.floor(w * this.dpr);
    this.canvas.height = Math.floor(h * this.dpr);
    this.canvas.style.width  = w + 'px';
    this.canvas.style.height = h + 'px';
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    
    // تحديث حجم الـ text canvas إن وُجد
    if (this._textCanvas && this._textCtx) {
      this._textCanvas.width = this.canvas.width;
      this._textCanvas.height = this.canvas.height;
      this._textCanvas.style.width = this.w + 'px';
      this._textCanvas.style.height = this.h + 'px';
      this._textCtx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    }
    return true;
  }

  clear(col = '#060a12') {
    const gl = this.gl;
    const r = parseInt(col.slice(1, 3), 16) / 255,
          g = parseInt(col.slice(3, 5), 16) / 255,
          b = parseInt(col.slice(5, 7), 16) / 255;
    gl.clearColor(r, g, b, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    
    // مسح طبقة النصوص أيضاً
    if (this._textCtx) {
      this._textCtx.clearRect(0, 0, this.w, this.h);
    }
  }

  _parseColor(str) {
    if (typeof str === 'string') {
      if (str.startsWith('#')) {
        return [parseInt(str.slice(1,3),16)/255, parseInt(str.slice(3,5),16)/255, parseInt(str.slice(5,7),16)/255, 1];
      }
      if (str.startsWith('rgba')) {
        const m = str.match(/rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)/);
        if (m) return [m[1]/255, m[2]/255, m[3]/255, parseFloat(m[4])];
      }
    }
    return [1, 1, 1, 1];
  }

  _draw(type, verts, colOrArray, lw = 1) {
    if (!verts || verts.length < 2) return;
    const gl = this.gl;
    gl.useProgram(this._prog.main);
    gl.uniform2f(this._loc.r, this.w * this.dpr, this.h * this.dpr);

    gl.bindBuffer(gl.ARRAY_BUFFER, this._buf.v);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(this._loc.a);
    gl.vertexAttribPointer(this._loc.a, 2, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, this._buf.c);
    const n = verts.length / 2;
    let colorData;
    if (typeof colOrArray === 'string') {
      const rgba = this._parseColor(colOrArray);
      colorData = new Float32Array(n * 4);
      for (let i = 0; i < n; i++) colorData.set(rgba, i * 4);
    } else if (Array.isArray(colOrArray) && colOrArray.length === n * 4) {
      colorData = new Float32Array(colOrArray);
    } else {
      colorData = new Float32Array(n * 4).fill(1);
    }
    gl.bufferData(gl.ARRAY_BUFFER, colorData, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(this._loc.c);
    gl.vertexAttribPointer(this._loc.c, 4, gl.FLOAT, false, 0, 0);

    gl.lineWidth(Math.max(1, lw) * this.dpr);
    gl.drawArrays(type, 0, n);
  }

  // ═══════════════════════════════════════════════════════════════════
  // ✅ Catmull-Rom Spline Interpolation
  //    تضيف نقاط وسطية ناعمة بين كل نقطتي بيانات
  //    → منحنى ناعم بدلاً من خط متكسر عند الزوايا
  // ═══════════════════════════════════════════════════════════════════
  _interpolatePoints(points, steps = 4) {
    if (points.length < 4) return points;
    const out = [];

    for (let i = 0; i < points.length - 2; i += 2) {
      const x1 = points[i],     y1 = points[i + 1];
      const x2 = points[i + 2], y2 = points[i + 3];

      // نقاط التحكم: السابقة واللاحقة
      const x0 = i >= 2                   ? points[i - 2] : x1 - (x2 - x1);
      const y0 = i >= 2                   ? points[i - 1] : y1 - (y2 - y1);
      const x3 = i + 4 < points.length   ? points[i + 4] : x2 + (x2 - x1);
      const y3 = i + 4 < points.length   ? points[i + 5] : y2 + (y2 - y1);

      out.push(x1, y1);

      for (let s = 1; s < steps; s++) {
        const t  = s / steps;
        const t2 = t * t;
        const t3 = t2 * t;
        // معادلة Catmull-Rom
        out.push(
          0.5 * ((2*x1) + (-x0+x2)*t + (2*x0-5*x1+4*x2-x3)*t2 + (-x0+3*x1-3*x2+x3)*t3),
          0.5 * ((2*y1) + (-y0+y2)*t + (2*y0-5*y1+4*y2-y3)*t2 + (-y0+3*y1-3*y2+y3)*t3)
        );
      }
    }
    out.push(points[points.length - 2], points[points.length - 1]);
    return out;
  }

  // ═══════════════════════════════════════════════════════════════════
  // ✅ Thick Line بـ TRIANGLES + Feathered Edges (pseudo Anti-Alias)
  //
  //  كل segment → 3 طبقات:
  //    [حافة شفافة] → [مركز معتم] → [حافة شفافة]
  //
  //  + Overlap بين segments لإخفاء الفراغات (smooth joints)
  // ═══════════════════════════════════════════════════════════════════
  _drawThickLine(points, color, thickness = 1.5) {
    if (!points || points.length < 4) return;
    const gl   = this.gl;
    const rgba = typeof color === 'string' ? this._parseColor(color) : [...color];
    const [cR, cG, cB, cA] = rgba;

    const verts = [];
    const cols  = [];

    // ✅ Overlap: يُغلق الفراغ بين الـ segments المتجاورة
    const overlap = thickness * 0.6;
    const halfOuter = thickness + overlap;
    const halfInner = Math.max(0, thickness - overlap * 0.3);

    // ✅ Feather: عرض منطقة التلاشي على كل حافة
    const feather = Math.max(0.8, thickness * 0.5);

    const aCenter = cA;       // مركز الخط: اللون الأصلي
    const aEdge   = 0.0;      // حافة الخط: شفاف تماماً → anti-alias ناعم

    for (let i = 0; i < points.length - 2; i += 2) {
      const x1 = points[i],     y1 = points[i + 1];
      const x2 = points[i + 2], y2 = points[i + 3];

      const dx  = x2 - x1;
      const dy  = y2 - y1;
      const len = Math.hypot(dx, dy);
      if (len < 0.01) continue;

      const nx = -dy / len;
      const ny =  dx / len;

      // ──────────────────────────────────────────
      // 6 نقاط عبر عرض الخط (من اليسار لليمين):
      //  o1(شفافة) → i1(معتمة) → c1(مركز) → i2(معتمة) → o2(شفافة)
      // ──────────────────────────────────────────
      const o1x1 = x1 + nx * halfOuter,  o1y1 = y1 + ny * halfOuter;
      const i1x1 = x1 + nx * halfInner,  i1y1 = y1 + ny * halfInner;
      const i2x1 = x1 - nx * halfInner,  i2y1 = y1 - ny * halfInner;
      const o2x1 = x1 - nx * halfOuter,  o2y1 = y1 - ny * halfOuter;

      const o1x2 = x2 + nx * halfOuter,  o1y2 = y2 + ny * halfOuter;
      const i1x2 = x2 + nx * halfInner,  i1y2 = y2 + ny * halfInner;
      const i2x2 = x2 - nx * halfInner,  i2y2 = y2 - ny * halfInner;
      const o2x2 = x2 - nx * halfOuter,  o2y2 = y2 - ny * halfOuter;

      // ── طبقة الحافة اليسرى (feather: شفاف → معتم) ──
      verts.push(
        o1x1, o1y1,  i1x1, i1y1,  o1x2, o1y2,
        i1x1, i1y1,  o1x2, o1y2,  i1x2, i1y2
      );
      cols.push(
        cR,cG,cB,aEdge,    cR,cG,cB,aCenter,  cR,cG,cB,aEdge,
        cR,cG,cB,aCenter,  cR,cG,cB,aEdge,    cR,cG,cB,aCenter
      );

      // ── المركز (معتم بالكامل) ──
      verts.push(
        i1x1, i1y1,  i2x1, i2y1,  i1x2, i1y2,
        i2x1, i2y1,  i1x2, i1y2,  i2x2, i2y2
      );
      cols.push(
        cR,cG,cB,aCenter, cR,cG,cB,aCenter, cR,cG,cB,aCenter,
        cR,cG,cB,aCenter, cR,cG,cB,aCenter, cR,cG,cB,aCenter
      );

      // ── طبقة الحافة اليمنى (feather: معتم → شفاف) ──
      verts.push(
        i2x1, i2y1,  o2x1, o2y1,  i2x2, i2y2,
        o2x1, o2y1,  i2x2, i2y2,  o2x2, o2y2
      );
      cols.push(
        cR,cG,cB,aCenter,  cR,cG,cB,aEdge,    cR,cG,cB,aCenter,
        cR,cG,cB,aEdge,    cR,cG,cB,aCenter,  cR,cG,cB,aEdge
      );
    }

    if (verts.length >= 6) this._draw(gl.TRIANGLES, verts, cols, 1);
  }

  _createDashedLine(x1, y1, x2, y2, dash = 5, gap = 4) {
    const dx = x2 - x1, dir = dx > 0 ? 1 : -1;
    const verts = []; let cur = x1;
    while (Math.abs(cur - x1) < Math.abs(dx)) {
      verts.push(cur, y1);
      let end = cur + dir * dash;
      if (dir === 1 && end > x2) end = x2;
      if (dir === -1 && end < x2) end = x2;
      verts.push(end, y1);
      cur += dir * (dash + gap);
    }
    return verts;
  }

  // ════════════════════════════════════════
  // الشموع / grid / volume : لم تتغير
  // ════════════════════════════════════════

  drawGrid(ps, ts, chartH) {
    const gl = this.gl; if (!gl) return;
    const dpr = this.dpr, lines = [], range = ps.max - ps.min;
    for (let i = 0; i <= 8; i++) {
      const py = ps.priceToY(ps.min + (range / 8) * i, chartH) * dpr;
      lines.push(0, py, this.w * dpr, py);
    }
    const vr = ts.getVisibleRange(this.w), step = Math.max(1, Math.floor((vr.end - vr.start) / 10));
    for (let i = vr.start; i <= vr.end; i += step) {
      const px = ts.indexToX(i) * dpr;
      if (px >= 0 && px <= this.w * dpr) lines.push(px, 0, px, this.h * dpr);
    }
    this._draw(gl.LINES, lines, (typeof CFG !== 'undefined' && CFG.colors?.grid) || '#0f1c2e', 0.5);
  }

  drawCandles(candles, ts, ps, chartH) {
    const gl = this.gl; if (!gl) return;
    const dpr = this.dpr;
    const vr = ts.getVisibleRange(this.w);
    const bw = Math.max(1, ts.spacing * 0.62);
    const wickV = [], wickC = [], bodyV = [], bodyC = [];
    for (let i = vr.start; i <= vr.end; i++) {
      const cd = candles[i]; if (!cd) continue;
      const logicalX = ts.indexToX(i), physicalX = logicalX * dpr;
      if (logicalX < -bw - 2 || logicalX > this.w + bw + 2) continue;
      const isUp = cd.close >= cd.open;
      const col  = this._parseColor(isUp ? '#26e600' : '#ff0000');
      const pyh  = ps.priceToY(cd.high,  chartH) * dpr;
      const pyl  = ps.priceToY(cd.low,   chartH) * dpr;
      wickV.push(physicalX, pyh, physicalX, pyl); wickC.push(...col, ...col);
      const pyBy = Math.min(ps.priceToY(cd.open, chartH), ps.priceToY(cd.close, chartH)) * dpr;
      const pyBh = Math.max(1, Math.abs(ps.priceToY(cd.close, chartH) - ps.priceToY(cd.open, chartH))) * dpr;
      const half = (bw / 2) * dpr;
      bodyV.push(
        physicalX-half, pyBy,  physicalX+half, pyBy,  physicalX+half, pyBy+pyBh,
        physicalX-half, pyBy,  physicalX+half, pyBy+pyBh,  physicalX-half, pyBy+pyBh
      );
      for (let j = 0; j < 6; j++) bodyC.push(...col);
    }
    if (wickV.length >= 2)  this._draw(gl.LINES,     wickV, wickC, 1.0);
    if (bodyV.length >= 6)  this._draw(gl.TRIANGLES, bodyV, bodyC, 1.0);
  }

  drawVolume(candles, ts, ps, ratio = 0.15, chartH) {
    const gl = this.gl; if (!gl) return;
    const dpr = this.dpr;
    const vr = ts.getVisibleRange(this.w), bw = Math.max(1, ts.spacing * 0.6);
    let mv = 0;
    for (let i = vr.start; i <= vr.end; i++) { const c = candles[i]; if (c && c.volume > mv) mv = c.volume; }
    if (!mv) return;
    const v = [], c = [], vh = chartH * ratio;
    for (let i = vr.start; i <= vr.end; i++) {
      const cd = candles[i]; if (!cd) continue;
      const px  = ts.indexToX(i) * dpr;
      const col = this._parseColor(cd.close >= cd.open ? '#1eff00' : '#ff0000');
      col[3] = 0.8;
      const pvh = (cd.volume / mv) * vh * dpr;
      v.push(
        px-(bw*dpr)/2, this.h*dpr-pvh,  px+(bw*dpr)/2, this.h*dpr-pvh,  px+(bw*dpr)/2, this.h*dpr,
        px-(bw*dpr)/2, this.h*dpr-pvh,  px+(bw*dpr)/2, this.h*dpr,      px-(bw*dpr)/2, this.h*dpr
      );
      for (let j = 0; j < 6; j++) c.push(...col);
    }
    if (v.length >= 6) this._draw(gl.TRIANGLES, v, c, 1);
  }

  // ════════════════════════════════════════
  // ✅ المؤشرات: Catmull-Rom + Feathered TRIANGLES
  // ════════════════════════════════════════

  drawMA(values, color, ts, ps, chartH) {
    if (!ts || !ps) return;
    const dpr = this.dpr, vr = ts.getVisibleRange(this.w);
    const pts = [];
    for (let i = vr.start; i <= vr.end; i++) {
      if (values[i] == null) continue;
      pts.push(ts.indexToX(i) * dpr, ps.priceToY(values[i], chartH) * dpr);
    }
    if (pts.length < 4) return;
    // ✅ Catmull-Rom → خطوط ناعمة بدون كسور عند الزوايا
    this._drawThickLine(this._interpolatePoints(pts, 4), color || '#f9a825', 1.2 * dpr);
  }

  drawBollingerBands(bb, ts, ps, chartH) {
    if (!ts || !ps || !bb?.upper) return;
    const dpr = this.dpr, vr = ts.getVisibleRange(this.w);

    // ✅ تعبئة المنطقة أولاً (تحت الخطوط)
    this._drawBollingerFill(bb, ts, ps, chartH, dpr, vr);

    const bandDefs = [
      { key: 'upper', color: 'rgba(100,181,246,0.5)', thickness: 0.8 * dpr },
      { key: 'mid',   color: 'rgba(100,181,246,0.8)', thickness: 1.0 * dpr },
      { key: 'lower', color: 'rgba(100,181,246,0.5)', thickness: 0.8 * dpr },
    ];

    for (const { key, color, thickness } of bandDefs) {
      const pts = [];
      for (let i = vr.start; i <= vr.end; i++) {
        if (bb[key][i] == null) continue;
        pts.push(ts.indexToX(i) * dpr, ps.priceToY(bb[key][i], chartH) * dpr);
      }
      if (pts.length < 4) continue;
      // ✅ Catmull-Rom + Feathered TRIANGLES
      this._drawThickLine(this._interpolatePoints(pts, 4), color, thickness);
    }
  }

  _drawBollingerFill(bb, ts, ps, chartH, dpr, vr) {
    const gl = this.gl;
    const verts = [], cols = [];
    const fill = [33/255, 150/255, 243/255, 0.04];
    const pts = [];
    for (let i = vr.start; i <= vr.end; i++) {
      if (bb.upper[i] == null || bb.lower[i] == null) continue;
      pts.push({ x: ts.indexToX(i)*dpr, yu: ps.priceToY(bb.upper[i],chartH)*dpr, yl: ps.priceToY(bb.lower[i],chartH)*dpr });
    }
    for (let i = 0; i < pts.length - 1; i++) {
      const { x:x1, yu:y1u, yl:y1l } = pts[i];
      const { x:x2, yu:y2u, yl:y2l } = pts[i+1];
      verts.push(x1,y1u, x1,y1l, x2,y2u, x1,y1l, x2,y2l, x2,y2u);
      for (let j = 0; j < 6; j++) cols.push(...fill);
    }
    if (verts.length >= 6) this._draw(gl.TRIANGLES, verts, cols, 1);
  }

  drawPriceLine(price, isUp, ps, chartH) {
    const gl = this.gl; if (!gl || !ps || !chartH) return -1;
    const dpr = this.dpr;
    const physicalY = ps.priceToY(price, chartH) * dpr;
    const dashed = this._createDashedLine(0, physicalY, this.w * dpr, physicalY, 6, 4);
    this._draw(gl.LINES, dashed, isUp ? '#00e676' : '#ff1744', 1);
    return physicalY;
  }

  drawCrosshair(x, y) {
    const gl = this.gl; if (!gl) return;
    const dpr = this.dpr;
    this._draw(gl.LINES, [
      x*dpr, 0, x*dpr, this.h*dpr,
      0, y*dpr, this.w*dpr, y*dpr
    ], 'rgba(150,180,220,0.6)', 0.8);
  }

  // ════════════════════════════════════════
  // ✅ رسم عداد تنازلي في WebGL (Canvas 2D Overlay)
  // ════════════════════════════════════════
  drawTimer(text, x, y, color = '#4da6ff', fontSize = 11) {
    // إنشاء Canvas 2D مؤقت لرسم النصوص فوق WebGL
    if (!this._textCtx) {
      this._textCanvas = document.createElement('canvas');
      this._textCtx = this._textCanvas.getContext('2d', { alpha: true });
      this._textCanvas.style.position = 'absolute';
      this._textCanvas.style.left = '0';
      this._textCanvas.style.top = '0';
      this._textCanvas.style.pointerEvents = 'none';
      this._textCanvas.style.zIndex = '5';
      if (this.canvas.parentNode) {
        this.canvas.parentNode.appendChild(this._textCanvas);
      }
    }
    const dpr = this.dpr;
    if (this._textCanvas.width !== this.canvas.width || this._textCanvas.height !== this.canvas.height) {
      this._textCanvas.width = this.canvas.width;
      this._textCanvas.height = this.canvas.height;
      this._textCanvas.style.width = this.w + 'px';
      this._textCanvas.style.height = this.h + 'px';
      this._textCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    const ctx = this._textCtx;
    ctx.clearRect(0, 0, this.w, this.h);
    
    ctx.save();
    ctx.font = `bold ${fontSize}px 'Segoe UI', monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    ctx.shadowColor = 'rgba(0, 15, 40, 0.7)';
    ctx.shadowBlur = 6;
    ctx.fillText(text, x, y + 1);
    ctx.restore();
  }

  setRefs(ts, ps) { this._ts = ts; this._ps = ps; }

  destroy() {
    const gl = this.gl; if (!gl) return;
    if (this._prog.main) gl.deleteProgram(this._prog.main);
    gl.deleteBuffer(this._buf.v); gl.deleteBuffer(this._buf.c);
    
    // تنظيف Canvas النصوص إن وُجد
    if (this._textCanvas?.parentNode) {
      this._textCanvas.parentNode.removeChild(this._textCanvas);
      this._textCanvas = null;
      this._textCtx = null;
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════
// PriceAxisRenderer
// ═══════════════════════════════════════════════════════════════════════
class PriceAxisRenderer {
  constructor(c) {
    this.canvas = c;
    this.ctx = c.getContext('2d', { alpha: false });
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

  render(ps, chartH, crossY = -1, lastPrice = -1, isUp = false, priceStr = '') {
    const { ctx, w, h } = this;
    const dpr = this.dpr;
    ctx.fillStyle = '#060a12'; ctx.fillRect(0, 0, w*dpr, h*dpr);
    ctx.font = `${typeof CFG !== 'undefined' && CFG.isMobile ? 9 : 10}px monospace`;
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';

    const r = ps.max - ps.min;
    for (let i = 0; i <= 8; i++) {
      const p = ps.min + (r / 8) * i;
      const physicalY = Math.round(ps.priceToY(p, chartH) * dpr);
      if (physicalY < 8*dpr || physicalY > h*dpr - 8*dpr) continue;
      ctx.fillStyle = '#4a6a8a';
      ctx.fillText(
        (typeof Utils !== 'undefined' && Utils.fmtPrice ? Utils.fmtPrice(p) : p.toFixed(2)),
        w*dpr - 6*dpr, physicalY + 1*dpr
      );
    }

    if (crossY >= 0 && crossY <= chartH) {
      const pcy = Math.round(crossY * dpr);
      const cp  = ps.yToPrice(crossY, chartH);
      ctx.fillStyle = '#060a12'; ctx.fillRect(0, pcy-9*dpr, w*dpr, 18*dpr);
      ctx.strokeStyle = '#8aaccc'; ctx.lineWidth = 0.5*dpr;
      ctx.strokeRect(1*dpr, pcy-9*dpr, w*dpr-2*dpr, 18*dpr);
      ctx.fillStyle = '#e0ecff';
      ctx.fillText(
        (typeof Utils !== 'undefined' && Utils.fmtPrice ? Utils.fmtPrice(cp) : cp.toFixed(2)),
        w*dpr - 6*dpr, pcy + 1*dpr
      );
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════
// TimeAxisRenderer
// ═══════════════════════════════════════════════════════════════════════
class TimeAxisRenderer {
  constructor(c) {
    this.canvas = c;
    this.ctx = c.getContext('2d', { alpha: false });
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

  render(ts, candles, w, cx = -1) {
    const { ctx, h } = this;
    const dpr = this.dpr;
    ctx.fillStyle = '#060a12'; ctx.fillRect(0, 0, w*dpr, h*dpr);
    const vr = ts.getVisibleRange(w);
    ctx.font = `${typeof CFG !== 'undefined' && CFG.isMobile ? 8 : 9}px monospace`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';

    let lx = -100;
    const st = Math.max(1, Math.floor((vr.end - vr.start) / 8));
    for (let i = vr.start; i <= vr.end; i += st) {
      const px = Math.round(ts.indexToX(i) * dpr);
      if (px < 24*dpr || px > w*dpr-20*dpr || Math.abs(px-lx) < 55*dpr) continue;
      const c = candles[i]; if (!c) continue;
      const d = new Date(c.time);
      const lb = `${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`;
      ctx.fillStyle = '#4a6a8a'; ctx.fillText(lb, px, h*dpr/2 + 1*dpr); lx = px;
    }

    if (cx >= 0 && cx <= w && candles?.length > 0) {
      const idx = Math.round(ts.xToIndex(cx));
      if (idx >= 0 && idx < candles.length) {
        const c = candles[idx]; if (c) {
          const pcx = Math.round(ts.indexToX(idx) * dpr);
          const d   = new Date(c.time);
          const lb  = `${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`;
          ctx.fillStyle = '#060a12'; ctx.fillRect(pcx-24*dpr, 2*dpr, 48*dpr, h*dpr-4*dpr);
          ctx.strokeStyle = '#8aaccc'; ctx.lineWidth = 0.5*dpr;
          ctx.strokeRect(pcx-23.5*dpr, 2.5*dpr, 47*dpr, h*dpr-5*dpr);
          ctx.fillStyle = '#e0ecff'; ctx.fillText(lb, pcx, h*dpr/2 + 1*dpr);
        }
      }
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════
// InertiaScroller / TimeScale / PriceScale (لم تتغير)
// ═══════════════════════════════════════════════════════════════════════
class InertiaScroller {
  constructor(ts) {
    this.ts = ts; this.vel = 0; this.running = false;
    this.friction = 0.96; this.minVel = 0.2;
    this.history = []; this.maxHistory = 6;
    this.raf = null; this.chartW = 0;
  }
  setChartWidth(w) { this.chartW = w; }
  startTracking() { this.vel = 0; this.history = []; }
  track(dx, ts) { this.history.push({ dx, ts }); if (this.history.length > this.maxHistory) this.history.shift(); }
  release() {
    if (this.history.length < 2) return;
    const r = this.history.slice(-4); let sv = 0, n = 0;
    for (let i = 1; i < r.length; i++) {
      const dt = r[i].ts - r[i-1].ts;
      if (dt > 0 && dt < 80) { sv += r[i].dx / dt; n++; }
    }
    this.vel = (n ? sv/n : 0) * 16 * 1.6;
    if (Math.abs(this.vel) > this.minVel) this._run();
  }
  _run() {
    if (this.running) return; this.running = true;
    const st = () => {
      if (!this.running) return;
      this.vel *= this.friction;
      if (Math.abs(this.vel) < this.minVel) { this.vel = 0; this.running = false; return; }
      this.ts.scroll(this.vel, this.chartW);
      this.raf = requestAnimationFrame(st);
    };
    this.raf = requestAnimationFrame(st);
  }
  stop() {
    this.running = false;
    if (this.raf) { cancelAnimationFrame(this.raf); this.raf = null; }
    this.vel = 0; this.history = [];
  }
  isActive() { return this.running; }
}

class TimeScale {
  constructor() { this.spacing = 8; this.offset = 0; this.data = []; }
  setData(d) { this.data = d; }
  indexToX(i) { return this.offset + i * this.spacing; }
  xToIndex(x) { return (x - this.offset) / this.spacing; }
  getVisibleRange(w) {
    const s = Math.max(0, Math.floor(this.xToIndex(-this.spacing * 2))),
          e = Math.min(this.data.length-1, Math.ceil(this.xToIndex(w + this.spacing * 2)));
    return { start: s, end: e };
  }
  scroll(dx, w) { this.offset = this._clamp(this.offset + dx, w); }
  zoom(f, cx, w) {
    const os = this.spacing, ns = Math.max(1.5, Math.min(60, os*f)), ci = this.xToIndex(cx);
    this.spacing = ns; this.offset += cx - this.indexToX(ci); this.offset = this._clamp(this.offset, w);
  }
  scrollToEnd(w) {
    if (!this.data.length) return;
    this.offset = w - (this.data.length-1) * this.spacing - this.spacing * 1.5;
    this.offset = this._clamp(this.offset, w);
  }
  _clamp(o, w) { const mx = w*0.6, mn = -(this.data.length*this.spacing)+w*0.4; return Math.max(mn, Math.min(mx, o)); }
  setBounds(w) { this._clamp(this.offset, w); }
}

class PriceScale {
  constructor() { this.min = 0; this.max = 100; this._margin = 0.04; }
  calculateRange(c, s, e) {
    s = Math.max(0, Math.floor(s)); e = Math.min(c.length-1, Math.ceil(e));
    let lo = Infinity, hi = -Infinity;
    for (let i = s; i <= e; i++) { const x = c[i]; if (!x) continue; if (x.low < lo) lo = x.low; if (x.high > hi) hi = x.high; }
    if (!isFinite(lo)) { lo = 0; hi = 100; }
    const r = hi - lo;
    this.min = lo - r*this._margin; this.max = hi + r*this._margin;
    if (this.max === this.min) this.max = this.min + 1;
  }
  priceToY(p, h) { return h * (1 - (p - this.min) / (this.max - this.min)); }
  yToPrice(y, h) { return this.min + (1 - y/h) * (this.max - this.min); }
}