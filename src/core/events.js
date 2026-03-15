/**
 * Aura — Event Bus
 * Lightweight pub/sub event system for decoupled module communication.
 */
class Events {
    static fire(type, detail) {
        window.dispatchEvent(new CustomEvent(type, { detail: detail }));
    }

    static on(type, callback) {
        return window.addEventListener(type, callback, false);
    }

    static off(type, callback) {
        return window.removeEventListener(type, callback, false);
    }
}

window.Events = Events;
