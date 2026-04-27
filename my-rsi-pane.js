/**
 * ═══════════════════════════════════════════════════════════════════════
 * مؤشر مستقل: القوة النسبية (RSI) - نافذة منفصلة أسفل الشارت
 * ✅ يعمل مثل LOWESS: نافذة مستقلة بمقياس 0-100
 * ✅ لا يتداخل مع مقياس السعر الرئيسي
 * ✅ يدعم الخطوط الأفقية والتلوين الديناميكي
 * ═══════════════════════════════════════════════════════════════════════
 */
(function() {
  'use strict';

  function registerMyRSIPane() {
    if (typeof window.IndicatorRegistry === 'undefined') {
      setTimeout(registerMyRSIPane, 50);
      return;
    }

    window.IndicatorRegistry.register('myRSIPane', {
      id: 'myRSIPane',
      name: 'RSI (نافذة منفصلة)',
      button: {
        label: 'RSI-P',
        title: 'مؤشر RSI في نافذة منفصلة أسفل الشارت',
        position: 'after-vol'
      },
      
      // ✅ إعدادات خاصة بالنوافذ المنفصلة
      settings: {
        period: { value: 14, type: 'number', label: 'الفترة' },
        overbought: { value: 70, type: 'number', label: 'تشبع شرائي' },
        oversold: { value: 30, type: 'number', label: 'تشبع بيعي' },
        color: { value: '#ff9800', type: 'color', label: 'لون الخط' },
        
        // ✅ إعدادات النافذة المنفصلة
        separatePane: true,        // ← هذا السطر هو المفتاح!
        paneHeight: { value: 120, type: 'range', min: 80, max: 200, step: 10, label: 'ارتفاع النافذة' }
      },

      calculate(candles, settings) {
        if (!candles || candles.length < 2) return { line: [] };
        
        const period = settings?.period?.value ?? 14;
        const closes = candles.map(c => c?.close ?? 0);
        const result = new Array(candles.length).fill(null);

        if (candles.length < period + 1) return { line: result };

        let avgGain = 0, avgLoss = 0;
        for (let i = 1; i <= period; i++) {
          const change = closes[i] - closes[i - 1];
          if (change > 0) avgGain += change;
          else avgLoss += Math.abs(change);
        }
        avgGain /= period;
        avgLoss /= period;

        result[period] = avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));

        for (let i = period + 1; i < closes.length; i++) {
          const change = closes[i] - closes[i - 1];
          const gain = change > 0 ? change : 0;
          const loss = change < 0 ? Math.abs(change) : 0;
          avgGain = (avgGain * (period - 1) + gain) / period;
          avgLoss = (avgLoss * (period - 1) + loss) / period;
          result[i] = avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));
        }

        return { line: result };
      },

      // ✅ دالة الرسم للنافذة المنفصلة
      render(renderer, ts, ps, paneHeight, data, settings, opts = {}) {
        if (!data?.line || typeof renderer?.drawLine !== 'function') return;

        const color = settings?.color?.value ?? '#ff9800';
        const ob = settings?.overbought?.value ?? 70;
        const os = settings?.oversold?.value ?? 30;
        const yOffset = opts?.yOffset ?? 0;
        const isSeparate = opts?.isSeparatePane ?? false;

        // رسم خلفية النافذة للتمييز البصري
        if (renderer.drawRects && isSeparate) {
          const vr = ts.getVisibleRange(renderer.canvas?.width || 800);
          renderer.drawRects([{
            x1Idx: vr.start,
            y1Price: ps.max,
            x2Idx: vr.end,
            y2Price: ps.min,
            color: 'rgba(20, 30, 45, 0.4)',
            alpha: 1
          }], {
            ts, ps, chartH: paneHeight, yOffset
          });
        }

        // دالة مساعدة لإنشاء خطوط أفقية
        const flatLine = (val) => new Array(data.line.length).fill(val);

        // ✅ رسم خطوط التشبع (70 و 30)
        renderer.drawLine(flatLine(ob), 'rgba(255, 50, 50, 0.5)', {
          ts, ps, chartH: paneHeight, lineWidth: 1, alpha: 0.7, yOffset
        });
        renderer.drawLine(flatLine(os), 'rgba(0, 230, 100, 0.5)', {
          ts, ps, chartH: paneHeight, lineWidth: 1, alpha: 0.7, yOffset
        });
        // خط الوسط 50
        renderer.drawLine(flatLine(50), 'rgba(150, 150, 150, 0.3)', {
          ts, ps, chartH: paneHeight, lineWidth: 1, alpha: 0.4, yOffset
        });

        // ✅ رسم خط RSI الرئيسي
        renderer.drawLine(data.line, color, {
          ts, ps, chartH: paneHeight, lineWidth: 2, alpha: 0.95, yOffset
        });

        // ✅ تلوين الخط حسب المنطقة (أخضر تحت 30، أحمر فوق 70)
        if (isSeparate && renderer.drawLine) {
          const coloredLine = data.line.map((v, i) => {
            if (v == null) return null;
            if (v >= ob) return 'rgba(255, 50, 50, 0.9)';    // أحمر
            if (v <= os) return 'rgba(0, 230, 100, 0.9)';    // أخضر
            return color;                                      // اللون الأصلي
          });
          // رسم طبقة ثانية للألوان الديناميكية
          renderer.drawLine(data.line, coloredLine, {
            ts, ps, chartH: paneHeight, lineWidth: 2, alpha: 0.95, yOffset
          });
        }

        // ✅ رسم تسميات المحور الرأسي (0, 50, 100) باستخدام Canvas 2D
        if (isSeparate && renderer.canvas) {
          const canvas = renderer.canvas;
          const ctx = canvas.getContext?.('2d');
          if (ctx) {
            ctx.save();
            ctx.font = '9px monospace';
            ctx.textAlign = 'right';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = 'rgba(150, 180, 220, 0.8)';
            
            const labels = [0, 50, 100];
            const dpr = window.devicePixelRatio || 1;
            const canvasW = canvas.width / dpr;
            
            for (const label of labels) {
              const y = ps.priceToY(label, paneHeight) + yOffset;
              ctx.fillText(label.toString(), canvasW - 8, y);
            }
            ctx.restore();
          }
        }

        // ✅ رسم خط فاصل علوي للنافذة
        if (isSeparate && renderer.drawLine) {
          const topLine = new Array(data.line.length).fill(ps.max);
          renderer.drawLine(topLine, 'rgba(100, 120, 150, 0.3)', {
            ts, ps, chartH: paneHeight, lineWidth: 1, alpha: 0.5, yOffset
          });
        }
      },

      getTooltip(index, data) {
        if (!data?.line || index < 0 || index >= data.line.length || data.line[index] == null) return null;
        const val = data.line[index];
        const c = val >= 70 ? '#ff4444' : val <= 30 ? '#00e676' : '#ff9800';
        return `<span style="color:${c}">●</span> RSI: ${val.toFixed(2)}`;
      },

      destroy() {
        console.log('[myRSIPane] تم تنظيف المؤشر بنجاح');
      }
    });

    console.log('✅ myRSIPane (separate pane) indicator registered');
  }

  registerMyRSIPane();
})();
