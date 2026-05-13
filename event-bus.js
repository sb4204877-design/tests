/**
 * event-bus.js - نظام أحداث بسيط بديل عن 'bus'
 * متوافق مع بنية المشروع الحالية
 */

class EventBus {
  constructor() {
    this._events = {};
  }

  on(event, handler) {
    if (!this._events[event]) this._events[event] = [];
    this._events[event].push(handler);
    return () => this.off(event, handler);
  }

  off(event, handler) {
    if (!this._events[event]) return;
    this._events[event] = this._events[event].filter(h => h !== handler);
  }

  emit(event, data) {
    if (!this._events[event]) return;
    // نسخ المصفوفة لتجنب المشاكل عند إزالة مستمع أثناء التنفيذ
    [...this._events[event]].forEach(handler => {
      try {
        handler(data);
      } catch (e) {
        console.error(`[EventBus] Error in handler for '${event}':`, e);
      }
    });
  }

  clear() {
    this._events = {};
  }
}

// تصدير نسخة عالمية
const bus = new EventBus();

if (typeof window !== 'undefined') {
  window.bus = bus;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { EventBus, bus };
}
