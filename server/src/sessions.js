'use strict';

const OFFLINE_AFTER_MS = 5 * 60 * 1000; // 5 minutes without activity = offline

class SessionStore {
  constructor() {
    /** @type {Map<string, object>} */
    this._sessions = new Map();
  }

  /**
   * Update a session's last-seen timestamp. Creates the session if new.
   * Returns { session, isNew }.
   */
  touch(id, source) {
    const existing = this._sessions.get(id);
    const session = {
      id,
      name: id,
      source: source || 'unknown',
      lastSeen: new Date().toISOString(),
      skipMode: existing?.skipMode ?? false,
      _wasOnline: true,
    };
    const isNew = !existing;
    this._sessions.set(id, session);
    return { session: this._view(session), isNew };
  }

  /** List all sessions, most recently active first. */
  list() {
    return [...this._sessions.values()]
      .map(s => this._view(s))
      .sort((a, b) => b.lastSeen.localeCompare(a.lastSeen));
  }

  /** Get a single session or null. */
  get(id) {
    const s = this._sessions.get(id);
    return s ? this._view(s) : null;
  }

  /** Set per-session skip mode. Returns updated session or null if not found. */
  setSkip(id, enabled) {
    const s = this._sessions.get(id);
    if (!s) return null;
    s.skipMode = enabled;
    return this._view(s);
  }

  /**
   * Detect sessions that just transitioned online → offline.
   * Call periodically (e.g. every 30 s). Returns array of sessions that went offline.
   */
  checkOffline() {
    const now = Date.now();
    const wentOffline = [];
    for (const s of this._sessions.values()) {
      const isOnline = now - new Date(s.lastSeen).getTime() < OFFLINE_AFTER_MS;
      if (s._wasOnline && !isOnline) {
        s._wasOnline = false;
        wentOffline.push(this._view(s));
      } else if (isOnline) {
        s._wasOnline = true;
      }
    }
    return wentOffline;
  }

  _view(s) {
    return {
      id: s.id,
      name: s.name,
      source: s.source,
      lastSeen: s.lastSeen,
      online: Date.now() - new Date(s.lastSeen).getTime() < OFFLINE_AFTER_MS,
      skipMode: s.skipMode,
    };
  }
}

module.exports = { SessionStore };
