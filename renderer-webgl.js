'use strict';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * WEBGL RENDERER - محرك رسم دقيق وسريع عبر GPU
 * ✅ Snap يُستخدم فقط لـ LINES لضمان حدة البكسل
 * ✅ Triangles (الشموع والفوليوم) تُرسم بناءً على الإحداثيات المنطقية بدون Snap
 * ✅ إصلاح حساب ارتفاع جسم الشمعة بدقة
 */

class WebGLRenderer {
  constructor(canvas, overlayCanvas) {
    this.canvas = canvas;
    this.overlay = overlayCanvas;
    this.ctx2d = overlay ? overlay.getContext('2d', { alpha: true }) : null;
    
    this.gl = canvas.getContext('webgl2', { antialias: true, alpha: false, preserveDrawingBuffer: false }) ||
              canvas.getContext('webgl', { antialias: true, alpha: false });
              
    if (!this.gl) {
      console.warn('[WebGLRenderer] WebGL غير مدعوم، العودة لـ Canvas 2D');
      throw new Error('WebGL not supported');
    }

    this.width = 0; this.height = 0; 
    this.dpr = typeof CFG !== 'undefined' && CFG.dpr ? CFG.dpr : Math.min(window.devicePixelRatio || 1, 2);
    this._programs = {};
    this._buffers = {};
    this._initShaders();
    this._initBuffers();
    
    // 🔥 Pixel Snapping للخطوط فقط
    this.snap = (v) => Math.round(v) + 0.5;
  }

  _initShaders() {
    const gl = this.gl;
    
    const vsSource = `
      attribute vec2 a_position;
      attribute vec4 a_color;
      uniform vec2 u_resolution;
      varying vec4 v_color;
      void main() {
        vec2 clip = (a_position / u_resolution) * 2.0 - 1.0;
        gl_Position = vec4(clip * vec2(1, -1), 0, 1);
        v_color = a_color;
      }
    `;
    const fsSource = `
      precision mediump float;
      varying vec4 v_color;
      void main() { gl_FragColor = v_color; }
    `;
    
    const vs = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(vs, vsSource); gl.compileShader(vs);
    const fs = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(fs, fsSource); gl.compileShader(fs);
    
    const prog = gl.createProgram();
    gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
    this._programs.main = prog;
    
    this._loc = {
      pos: gl.getAttribLocation(prog, 'a_position'),
      col: gl.getAttribLocation(prog, 'a_color'),
      res: gl.getUniformLocation(prog, 'u_resolution')
    };
  }

  _initBuffers() {
    const gl = this.gl;
    this._buffers.vertices = gl.createBuffer();
    this._buffers.colors = gl.createBuffer();
  }

  resize(w, h) {
    if (this.width === w && this.height === h) return false;
    this.width = w; this.height = h;
    
    const gl = this.gl;
    this.canvas.width = Math.floor(w * this.dpr);
    this.canvas.height = Math.floor(h * this.dpr);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);

    if (this.ctx2d) {
      this.overlay.width = this.canvas.width;
      this.overlay.height = this.canvas.height;
      this.overlay.style.width = w + 'px';
      this.overlay.style.height = h + 'px';
      this.ctx2d.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    }
    return true;
  }

  clear(color = '#060a12') {
    const gl = this.gl;
    const r = parseInt(color.slice(1,3),16)/255;
    const g = parseInt(color.slice(3,5),16)/255;
    const b = parseInt(color.slice(5,7),16)/255;
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
      if (str.startsWith('#')) {
        return [parseInt(str.slice(1,3),16)/255, parseInt(str.slice(3,5),16)/255, parseInt(str.slice(5,7),16)/255, 1];
      }
      if (str.startsWith('rgba')) {
        const m = str.match(/rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)/);
        if (m) return [m[1]/255, m[2]/255, m[3]/255, parseFloat(m[4])];
      }
    }
    return [1,1,1,1];
  }

  _drawArrays(type, vertices, colOrArray, lineWidth = 1) {
    if (!vertices || vertices.length < 2) return;
    const gl = this.gl;
    
    gl.useProgram(this._programs.main);
    gl.uniform2f(this._loc.res, this.width, this.height);

    gl.bindBuffer(gl.ARRAY_BUFFER, this._buffers.vertices);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(this._loc.pos);
    gl.vertexAttribPointer(this._loc.pos, 2, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, this._buffers.colors);
    const n = vertices.length / 2;
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
    gl.enableVertexAttribArray(this._loc.col);
    gl.vertexAttribPointer(this._loc.col, 4, gl.FLOAT, false, 0, 0);

    gl.lineWidth(1);
    gl.drawArrays(type, 0, n);
  }

  _createDashedLine(x1, y1, x2, y2, dash = 5, gap = 4) {
    const dx = x2 - x1;
    const dir = dx > 0 ? 1 : -1;
    const vertices = [];
    let currentX = x1;
    const totalLen = Math.abs(dx);
    
    while (Math.abs(currentX - x1) < totalLen) {
       vertices.push(currentX, y1);
       let endX = currentX + (dir * dash);
       if (dir === 1 && endX > x2) endX = x2;
       if (dir === -1 && endX < x2) endX = x2;
       vertices.push(endX, y1);
       currentX += (dir * (dash + gap));
    }
    return vertices;
  }

  drawGrid(ps, ts, chartH) {
    const gl = this.gl; if(!gl) return;
    const lines = [];
    const range = ps.max - ps.min;
    
    for (let i = 0; i <= 8; i++) {
      const logicalY = ps.priceToY(ps.min + (range/8)*i, chartH);
      const snappedY = this.snap(logicalY); // ✅ LINES: نستخدم Snap
      lines.push(0, snappedY, this.width, snappedY);
    }
    
    const vr = ts.getVisibleRange(this.width);
    const step = Math.max(1, Math.floor((vr.end - vr.start) / 10));
    for (let i = vr.start; i <= vr.end; i += step) {
      const logicalX = ts.indexToX(i);
      const snappedX = this.snap(logicalX); // ✅ LINES: نستخدم Snap
      if (snappedX >= 0 && snappedX <= this.width) {
        lines.push(snappedX, 0, snappedX, this.height);
      }
    }
    this._drawArrays(gl.LINES, lines, (typeof CFG !== 'undefined' && CFG.colors?.grid) || '#0f1c2e', 1);
  }

  drawCandles(candles, ts, ps, chartH) {
    const gl = this.gl; if(!gl) return;
    const vr = ts.getVisibleRange(this.width);
    const bw = Math.max(1, (typeof CFG !== 'undefined' && CFG.candleBodyRatio) ? ts.spacing * CFG.candleBodyRatio : ts.spacing * 0.62);
    
    const wickV = [], wickC = [], bodyV = [], bodyC = [];

    for (let i = vr.start; i <= vr.end; i++) {
      const cd = candles[i]; if (!cd) continue;
      const x = ts.indexToX(i); // ❌ TRIANGLES: لا نستخدم snap
      
      if (x < -bw - 2 || x > this.width + bw + 2) continue;

      const isUp = cd.close >= cd.open;
      const col = this._parseColor(isUp ? '#00e676' : '#ff1744');

      // الفتيل (بدون snap ليتطابق تماماً مع جسم الشمعة)
      const yh = ps.priceToY(cd.high, chartH);
      const yl = ps.priceToY(cd.low, chartH);
      wickV.push(x, yh, x, yl);
      wickC.push(...col, ...col);

      // الجسم (إحداثيات منطقية بحتة)
      const yo = ps.priceToY(cd.open, chartH);
      const yc = ps.priceToY(cd.close, chartH);
      const topY = Math.min(yo, yc);
      
      // ✅ إصلاح حساب الارتفاع بدون تشوه
      const h = Math.abs(yc - yo);
      const bodyH = h < 1 ? 1 : h;
      
      const half = bw / 2;
      
      bodyV.push(
        x - half, topY,
        x + half, topY,
        x + half, topY + bodyH,
        x - half, topY,
        x + half, topY + bodyH,
        x - half, topY + bodyH
      );
      for (let j = 0; j < 6; j++) bodyC.push(...col);
    }
    
    if (wickV.length >= 2) this._drawArrays(gl.LINES, wickV, wickC, 1);
    if (bodyV.length >= 6) this._drawArrays(gl.TRIANGLES, bodyV, bodyC, 1);
  }

  drawVolume(candles, ts, ps, chartH, ratio = 0.15) {
    const gl = this.gl; if(!gl) return;
    const vr = ts.getVisibleRange(this.width);
    const bw = Math.max(1, ts.spacing * 0.6);
    let mv = 0;
    
    for (let i = vr.start; i <= vr.end; i++) {
      const c = candles[i]; if (c && c.volume > mv) mv = c.volume;
    }
    if (!mv) return;
    
    const v = [], c = [], vh = chartH * ratio;
    
    for (let i = vr.start; i <= vr.end; i++) {
      const cd = candles[i]; if (!cd) continue;
      const x = ts.indexToX(i); // ❌ TRIANGLES: لا نستخدم snap
      
      const col = this._parseColor(cd.close >= cd.open ? '#00e676' : '#ff1744');
      col[3] = 0.8;
      
      const logicalHv = (cd.volume / mv) * vh;
      const half = bw / 2;
      
      v.push(
        x - half, this.height - logicalHv,
        x + half, this.height - logicalHv,
        x + half, this.height,
        x - half, this.height - logicalHv,
        x + half, this.height,
        x - half, this.height
      );
      for (let j = 0; j < 6; j++) c.push(...col);
    }
    
    if (v.length >= 6) this._drawArrays(gl.TRIANGLES, v, c, 1);
  }

  drawMA(values, color, ts, ps, chartH) {
    const gl = this.gl; if(!gl || !ts || !ps) return;
    const vr = ts.getVisibleRange(this.width);
    const lines = [];
    let lx, ly, s = false;
    
    for (let i = vr.start; i <= vr.end; i++) {
      if (values[i] == null) continue;
      const logicalX = ts.indexToX(i), logicalY = ps.priceToY(values[i], chartH);
      const snappedX = this.snap(logicalX), snappedY = this.snap(logicalY); // ✅ LINES: نستخدم Snap
      if (s) lines.push(lx, ly, snappedX, snappedY);
      lx = snappedX; ly = snappedY; s = true;
    }
    this._drawArrays(gl.LINES, lines, color || '#f9a825', 1);
  }

  drawBollingerBands(bb, ts, ps, chartH) {
    const gl = this.gl; if(!gl || !ts || !ps || !bb?.upper) return;
    const vr = ts.getVisibleRange(this.width);
    
    for (const [key, col] of [['upper','rgba(100,181,246,0.5)'],['mid','rgba(100,181,246,0.8)'],['lower','rgba(100,181,246,0.5)']]) {
      const lines = [];
      let sx, sy, s = false;
      for (let i = vr.start; i <= vr.end; i++) {
        if (bb[key][i] == null) continue;
        const logicalX = ts.indexToX(i), logicalY = ps.priceToY(bb[key][i], chartH);
        const snappedX = this.snap(logicalX), snappedY = this.snap(logicalY); // ✅ LINES: نستخدم Snap
        if (s) lines.push(sx, sy, snappedX, snappedY);
        sx = snappedX; sy = snappedY; s = true;
      }
      this._drawArrays(gl.LINES, lines, col, 1);
    }
  }

  drawPriceLine(price, isUp, ps, chartH) {
    const gl = this.gl; if(!gl || !ps || !chartH) return -1;
    const logicalY = ps.priceToY(price, chartH);
    const snappedY = this.snap(logicalY); // ✅ LINES: نستخدم Snap
    
    const dashedVerts = this._createDashedLine(0, snappedY, this.width, snappedY, 6, 4);
    this._drawArrays(gl.LINES, dashedVerts, isUp ? '#00e676' : '#ff1744', 1);
    
    if (this.ctx2d && typeof Utils !== 'undefined') {
      this._drawTextOverlay(Utils.fmtPrice(price), this.width - 60, snappedY - 10, isUp ? '#00e676' : '#ff1744');
    }
    return snappedY;
  }

  drawCrosshair(x, y) {
    const gl = this.gl; if(!gl) return;
    const snappedX = this.snap(x), snappedY = this.snap(y); // ✅ LINES: نستخدم Snap
    
    this._drawArrays(gl.LINES, [
      snappedX, 0, snappedX, this.height,
      0, snappedY, this.width, snappedY
    ], 'rgba(150,180,220,0.6)', 1);
    
    if (this.ctx2d) {
      this.ctx2d.beginPath();
      this.ctx2d.arc(x, y, 4, 0, Math.PI * 2);
      this.ctx2d.fillStyle = '#060a12';
      this.ctx2d.fill();
      this.ctx2d.strokeStyle = 'rgba(150,180,220,0.6)';
      this.ctx2d.lineWidth = 1;
      this.ctx2d.stroke();
    }
  }

  _drawTextOverlay(text, x, y, color) {
    if (!this.ctx2d) return;
    this.ctx2d.font = 'bold 10px monospace';
    this.ctx2d.textAlign = 'right';
    this.ctx2d.textBaseline = 'middle';
    const w = this.ctx2d.measureText(text).width + 8;
    this.ctx2d.fillStyle = 'rgba(6,10,18,0.8)';
    this.ctx2d.fillRect(x - w/2, y - 10, w, 20);
    this.ctx2d.fillStyle = color;
    this.ctx2d.fillText(text, x, y + 1);
  }

  setRefs(ts, ps) {
    this._cachedTS = ts;
    this._cachedPS = ps;
  }
  
  destroy() {
    const gl = this.gl; if(!gl) return;
    if (this._programs.main) gl.deleteProgram(this._programs.main);
    gl.deleteBuffer(this._buffers.vertices);
    gl.deleteBuffer(this._buffers.colors);
  }
}