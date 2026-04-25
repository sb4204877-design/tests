'use strict';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * INDICATORS - محرك المؤشرات الفنية المحسّن للأداء والدقة
 * ═══════════════════════════════════════════════════════════════════════
 * ⚠️ ملاحظات هندسية:
 * - جميع الدوال تُرجع مصفوفات بنفس طول البيانات المدخلة
 * - القيم غير الجاهزة تُملأ بـ null لتجنب اختلال المؤشرات على الرسم
 * - خوارزميات محسّنة O(n) لتجنب التجميد مع آلاف الشموع
 * - جاهزة للدمج المباشر مع ChartRenderer.drawMA() و drawBollingerBands()
 */

class Indicators {
  
  // ─────────────────────────────────────────────────────────────────────
  // أدوات مساعدة داخلية
  // ─────────────────────────────────────────────────────────────────────
  
  /**
   * التحقق من صحة المدخلات قبل الحساب
   * @private
   */
  static _validate(data, period) {
    if (!Array.isArray(data) || data.length === 0) return false;
    if (period < 1 || period > data.length) return false;
    return true;
  }

  /**
   * حساب الانحراف المعياري (للبولينجر)
   * @private
   */
  static _stdDev(values, mean) {
    let sumSq = 0;
    for (let i = 0; i < values.length; i++) {
      sumSq += (values[i] - mean) ** 2;
    }
    return Math.sqrt(sumSq / values.length);
  }

  // ─────────────────────────────────────────────────────────────────────
  // 1. المتوسطات المتحركة (Trend)
  // ─────────────────────────────────────────────────────────────────────

  /**
   * المتوسط المتحرك البسيط (SMA)
   * @param {number[]} data - أسعار الإغلاق
   * @param {number} period - الفترة الزمنية
   * @returns {Array<number|null>}
   */
  static sma(data, period) {
    if (!this._validate(data, period)) return new Array(data.length).fill(null);
    
    const result = new Array(data.length).fill(null);
    let sum = 0;
    
    for (let i = 0; i < data.length; i++) {
      sum += data[i];
      if (i >= period) sum -= data[i - period];
      if (i >= period - 1) {
        result[i] = sum / period;
      }
    }
    return result;
  }

  /**
   * المتوسط المتحرك الأسي (EMA)
   * يستخدم SMA للتهيئة ثم يحوّل للأسي
   * @param {number[]} data
   * @param {number} period
   * @returns {Array<number|null>}
   */
  static ema(data, period) {
    if (!this._validate(data, period)) return new Array(data.length).fill(null);
    
    const result = new Array(data.length).fill(null);
    const k = 2 / (period + 1);
    
    // التهيئة بـ SMA لأول فترة
    let sum = 0;
    for (let i = 0; i < period; i++) sum += data[i];
    result[period - 1] = sum / period;
    
    // الحساب الأسي
    for (let i = period; i < data.length; i++) {
      result[i] = data[i] * k + result[i - 1] * (1 - k);
    }
    
    return result;
  }

  /**
   * متوسط هال المتحرك (HMA) - سريع الاستجابة ويقلل التأخير
   * @param {number[]} data
   * @param {number} period
   * @returns {Array<number|null>}
   */
  static hma(data, period = 9) {
    const half = Math.floor(period / 2);
    const sqrt = Math.round(Math.sqrt(period));
    
    const emaHalf = this.ema(data, half);
    const emaFull = this.ema(data, period);
    
    const diff = new Array(data.length).fill(null);
    for (let i = 0; i < data.length; i++) {
      if (emaHalf[i] !== null && emaFull[i] !== null) {
        diff[i] = 2 * emaHalf[i] - emaFull[i];
      }
    }
    
    return this.ema(diff, sqrt);
  }

  // ─────────────────────────────────────────────────────────────────────
  // 2. التقلب (Volatility)
  // ─────────────────────────────────────────────────────────────────────

  /**
   * بولينجر باندر (Bollinger Bands)
   * @param {number[]} closes
   * @param {number} period
   * @param {number} mult - مضاعف الانحراف المعياري
   * @returns {{upper: Array, mid: Array, lower: Array}}
   */
  static bollingerBands(closes, period = 20, mult = 2) {
    const mid = this.sma(closes, period);
    const upper = new Array(closes.length).fill(null);
    const lower = new Array(closes.length).fill(null);
    
    for (let i = period - 1; i < closes.length; i++) {
      if (mid[i] === null) continue;
      
      // حساب الانحراف المعياري للفترة
      let sumSq = 0;
      for (let j = i - period + 1; j <= i; j++) {
        sumSq += (closes[j] - mid[i]) ** 2;
      }
      const std = Math.sqrt(sumSq / period);
      
      upper[i] = mid[i] + mult * std;
      lower[i] = mid[i] - mult * std;
    }
    
    return { upper, mid, lower };
  }

  // ─────────────────────────────────────────────────────────────────────
  // 3. الزخم (Momentum)
  // ─────────────────────────────────────────────────────────────────────

  /**
   * مؤشر القوة النسبية (RSI) - طريقة وايلدر (المعتمدة في المنصات)
   * @param {number[]} closes
   * @param {number} period
   * @returns {Array<number|null>}
   */
  static rsi(closes, period = 14) {
    const result = new Array(closes.length).fill(null);
    if (closes.length < period + 1) return result;
    
    let avgGain = 0, avgLoss = 0;
    
    // حساب المتوسط الأول
    for (let i = 1; i <= period; i++) {
      const change = closes[i] - closes[i - 1];
      if (change > 0) avgGain += change;
      else avgLoss -= change;
    }
    avgGain /= period;
    avgLoss /= period;
    
    result[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
    
    // التمليس الأسي (وايلدر)
    for (let i = period + 1; i < closes.length; i++) {
      const change = closes[i] - closes[i - 1];
      const gain = change > 0 ? change : 0;
      const loss = change < 0 ? -change : 0;
      
      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;
      
      result[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
    }
    
    return result;
  }

  /**
   * مؤشر التقارب/التباعد المتوسط (MACD)
   * @param {number[]} closes
   * @param {number} fast
   * @param {number} slow
   * @param {number} signal
   * @returns {{macdLine: Array, signalLine: Array, histogram: Array}}
   */
  static macd(closes, fast = 12, slow = 26, signal = 9) {
    const emaFast = this.ema(closes, fast);
    const emaSlow = this.ema(closes, slow);
    
    const macdLine = new Array(closes.length).fill(null);
    let firstValidIdx = -1;
    
    for (let i = 0; i < closes.length; i++) {
      if (emaFast[i] !== null && emaSlow[i] !== null) {
        macdLine[i] = emaFast[i] - emaSlow[i];
        if (firstValidIdx === -1) firstValidIdx = i;
      }
    }
    
    // حساب خط الإشارة من القيم الصالحة فقط
    const validMacd = macdLine.slice(firstValidIdx);
    const signalRaw = this.ema(validMacd, signal);
    
    // إعادة محاذاة خط الإشارة مع المؤشرات الأصلية
    const signalLine = new Array(closes.length).fill(null);
    for (let i = 0; i < signalRaw.length; i++) {
      if (signalRaw[i] !== null && (firstValidIdx + i) < signalLine.length) {
        signalLine[firstValidIdx + i] = signalRaw[i];
      }
    }
    
    // الهيستوجرام
    const histogram = new Array(closes.length).fill(null);
    for (let i = 0; i < closes.length; i++) {
      if (macdLine[i] !== null && signalLine[i] !== null) {
        histogram[i] = macdLine[i] - signalLine[i];
      }
    }
    
    return { macdLine, signalLine, histogram };
  }

  // ─────────────────────────────────────────────────────────────────────
  // 4. الحجم والوزن (Volume & Weighted)
  // ─────────────────────────────────────────────────────────────────────

  /**
   * متوسط الحجم (Volume MA)
   * @param {number[]} volumes
   * @param {number} period
   * @returns {Array<number|null>}
   */
  static volumeMA(volumes, period = 20) {
    return this.sma(volumes, period);
  }

  /**
   * السعر المرجح بالحجم (VWAP) - لحساب متوسط السعر الحقيقي
   * ملاحظة: يعيد حساب متراكم من البداية (مناسب للجلسة اليومية)
   * @param {Array<{close: number, volume: number}>} candles
   * @returns {Array<number|null>}
   */
  static vwap(candles) {
    const result = new Array(candles.length).fill(null);
    let cumulativeVP = 0; // Volume * Price
    let cumulativeV = 0;  // Volume
    
    for (let i = 0; i < candles.length; i++) {
      const c = candles[i];
      if (!c || !c.volume) continue;
      
      cumulativeVP += c.close * c.volume;
      cumulativeV += c.volume;
      
      if (cumulativeV > 0) {
        result[i] = cumulativeVP / cumulativeV;
      }
    }
    
    return result;
  }

  /**
   * حساب نقاط المحور (Pivot Points) - للدعم والمقاومة اليومية
   * @param {number} high
   * @param {number} low
   * @param {number} close
   * @returns {{pp: number, r1: number, r2: number, r3: number, s1: number, s2: number, s3: number}}
   */
  static pivotPoints(high, low, close) {
    const pp = (high + low + close) / 3;
    const range = high - low;
    
    return {
      pp,
      r1: 2 * pp - low,
      r2: pp + range,
      r3: high + 2 * (pp - low),
      s1: 2 * pp - high,
      s2: pp - range,
      s3: low - 2 * (high - pp)
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Indicators;
}