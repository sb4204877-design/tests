/**
 * ═══════════════════════════════════════════════════════════════════════
 * مؤشر مستقل: المتوسط المتحرك الأسي (EMA) - يرسم فوق الشموع مباشرة
 * ✅ لا يحتاج مقياس منفصل - يستخدم مقياس السعر الأصلي
 * ✅ مثالي لاختبار نظام الرسم
 * ✅ يظهر زرّه تلقائياً في الشريط العلوي
 * ═══════════════════════════════════════════════════════════════════════
 */
(function() {
  'use strict';

  function registerMyEMA() {
    if (typeof window.IndicatorRegistry === 'undefined') {
      setTimeout(registerMyEMA, 50);
      return;
    }

    window.IndicatorRegistry.register('myEMA', {
      id: 'myEMA',
      name: 'المتوسط المتحرك الأسي (EMA)',
      button: {
        label: 'EMA',
        title: 'متوسط متحرك أسي - يرسم فوق السعر',
        position: 'after-vol'
      },
      
      settings: {
        period: { value: 20, type: 'number', label: 'الفترة' },
        color: { value: '#00ffff', type: 'color', label: 'لون الخط' },
        lineWidth: { value: 2, type: 'range', min: 1, max: 4, step: 1, label: 'سمك الخط' }
      },

      // ═══════════════════════════════════════════════════════════════
      // دالة الحساب - تُرجع مصفوفة بنفس طول الشموع وبنفس نطاق الأسعار
      // ═══════════════════════════════════════════════════════════════
      calculate(candles, settings) {
        if (!candles || candles.length < 2) return { line: [] };
        
        const period = settings?.period?.value ?? 20;
        const closes = candles.map(c => c?.close ?? 0);
        const result = new Array(candles.length).fill(null);

        // حساب EMA البسيط
        const k = 2 / (period + 1);
        
        // أول قيمة: متوسط بسيط للفترة الأولى
        let sum = 0;
        for (let i = 0; i < period && i < closes.length; i++) {
          if (closes[i] != null) sum += closes[i];
        }
        if (period <= closes.length) {
          result[period - 1] = sum / period;
        }

        // بقية القيم: صيغة EMA
        for (let i = period; i < closes.length; i++) {
          if (closes[i] != null && result[i-1] != null) {
            result[i] = closes[i] * k + result[i-1] * (1 - k);
          }
        }

        return { line: result };
      },

      // ═══════════════════════════════════════════════════════════════
      // دالة الرسم - تستخدم مقياس السعر الأصلي (ps) مباشرة
      // ✅ هذا هو الفرق الجوهري عن RSI: لا نخلق مقياساً جديداً
      // ═══════════════════════════════════════════════════════════════
      render(renderer, ts, ps, chartH, data, settings) {
        // تحقق أساسي
        if (!data?.line || typeof renderer?.drawLine !== 'function') {
          console.warn('[myEMA] Missing data or renderer');
          return;
        }

        const color = settings?.color?.value ?? '#00ffff';
        const lineWidth = settings?.lineWidth?.value ?? 2;

        // ✅ رسم الخط باستخدام مقياس السعر الأصلي (ps) مباشرة
        // هذا يضمن أن القيم تُرسم في المكان الصحيح فوق الشموع
        renderer.drawLine(data.line, color, {
          ts: ts,           // مقياس الوقت (مطلوب)
          ps: ps,           // ✅ مقياس السعر الأصلي (ليس مقياساً جديداً!)
          chartH: chartH,   // ارتفاع منطقة الرسم
          lineWidth: lineWidth,
          alpha: 0.95       // شفافية عالية لوضوح الخط
        });

        // ✅ إضافة تلميح بصري: نقطة صغيرة على آخر قيمة مرسومة
        const lastValidIdx = data.line.findLastIndex(v => v != null);
        if (lastValidIdx >= 0 && renderer.drawShapes) {
          renderer.drawShapes([{
            type: 'circle',
            idx: lastValidIdx,
            price: data.line[lastValidIdx],
            color: color,
            size: 4,
            lineWidth: 2
          }], {
            ts: ts,
            ps: ps,
            chartH: chartH
          });
        }
      },

      // ═══════════════════════════════════════════════════════════════
      // تلميح يظهر عند تمرير الماوس
      // ═══════════════════════════════════════════════════════════════
      getTooltip(index, data, candles) {
        if (!data?.line || index < 0 || index >= data.line.length || data.line[index] == null) return null;
        
        const val = data.line[index];
        const fmt = (typeof Utils !== 'undefined' && typeof Utils.fmtPrice === 'function')
          ? Utils.fmtPrice(val)
          : val.toFixed(2);
        
        return `<span style="color:#00ffff">●</span> EMA: ${fmt}`;
      },

      destroy() {
        console.log('[myEMA] تم تنظيف المؤشر بنجاح');
      }
    });

    console.log('✅ myEMA indicator registered successfully');
  }

  registerMyEMA();
})();
