'use strict';

const { v4: uuidv4 } = require('uuid');

const MAX_STORE_SIZE = 500;
const AUTO_EXPIRE_MS = 10 * 60 * 1000; // 10 minutes

/**
 * @typedef {Object} Approval
 * @property {string} id
 * @property {string} tool
 * @property {string} action
 * @property {string} details
 * @property {string|undefined} diff
 * @property {'claude-code'|'copilot-cli'} source
 * @property {'pending'|'approved'|'denied'|'expired'} status
 * @property {string} createdAt   ISO timestamp
 * @property {string|null} resolvedAt  ISO timestamp or null
 */

class ApprovalStore {
  constructor() {
    /** @type {Map<string, Approval>} */
    this._map = new Map();

    /**
     * Waiters: map of approval id -> array of { resolve, timer } objects
     * Each waiter is a long-polling request blocked on GET /approvals/:id/wait
     * @type {Map<string, Array<{resolve: Function, timer: NodeJS.Timeout}>>}
     */
    this._waiters = new Map();

    // Insertion-order list of IDs for FIFO eviction
    /** @type {string[]} */
    this._order = [];
  }

  /**
   * Create a new pending approval and schedule auto-expiry.
   * @param {{ tool: string, action: string, details: string, diff?: string, source: string }} fields
   * @returns {Approval}
   */
  create({ tool, action, details, diff, source }) {
    const id = uuidv4();
    const now = new Date().toISOString();

    /** @type {Approval} */
    const approval = {
      id,
      tool,
      action,
      details,
      diff: diff || null,
      source,
      status: 'pending',
      createdAt: now,
      resolvedAt: null,
    };

    this._map.set(id, approval);
    this._order.push(id);

    // FIFO eviction: drop oldest when we exceed MAX_STORE_SIZE
    if (this._order.length > MAX_STORE_SIZE) {
      const evictId = this._order.shift();
      const evicted = this._map.get(evictId);
      if (evicted) {
        // Resolve any waiters as expired before evicting
        if (evicted.status === 'pending') {
          evicted.status = 'expired';
          evicted.resolvedAt = new Date().toISOString();
        }
        this._flushWaiters(evictId);
        this._map.delete(evictId);
      }
    }

    // Schedule auto-expiry after 10 minutes
    const expireTimer = setTimeout(() => {
      this._expire(id);
    }, AUTO_EXPIRE_MS);

    // Don't let the timer prevent process exit
    if (expireTimer.unref) expireTimer.unref();

    // Attach timer to approval object so we can cancel on resolution
    approval._expireTimer = expireTimer;

    return approval;
  }

  /**
   * Retrieve a single approval by ID (without private fields).
   * @param {string} id
   * @returns {Approval|null}
   */
  get(id) {
    const approval = this._map.get(id);
    return approval ? this._publicView(approval) : null;
  }

  /**
   * List approvals with optional status filter and limit.
   * @param {{ status?: string, limit?: number }} opts
   * @returns {Approval[]}
   */
  list({ status = 'all', limit = 50 } = {}) {
    const results = [];
    // Iterate insertion order, newest first
    for (let i = this._order.length - 1; i >= 0; i--) {
      const id = this._order[i];
      const approval = this._map.get(id);
      if (!approval) continue;

      if (status === 'pending' && approval.status !== 'pending') continue;
      if (status === 'resolved' && approval.status === 'pending') continue;

      results.push(this._publicView(approval));
      if (results.length >= limit) break;
    }
    return results;
  }

  /**
   * Resolve an approval as approved or denied.
   * Returns the updated approval or null if not found / already resolved.
   * @param {string} id
   * @param {'approved'|'denied'} resolution
   * @returns {Approval|null}
   */
  resolve(id, resolution) {
    const approval = this._map.get(id);
    if (!approval) return null;
    if (approval.status !== 'pending') return null;

    approval.status = resolution;
    approval.resolvedAt = new Date().toISOString();

    // Cancel the auto-expiry timer
    if (approval._expireTimer) {
      clearTimeout(approval._expireTimer);
      approval._expireTimer = null;
    }

    // Wake up long-polling waiters
    this._flushWaiters(id);

    return this._publicView(approval);
  }

  /**
   * Long-poll: returns a Promise that resolves when the approval is no longer
   * pending OR when timeoutMs elapses (in which case status is "timeout").
   * @param {string} id
   * @param {number} timeoutMs
   * @returns {Promise<{id: string, status: string}>}
   */
  wait(id, timeoutMs) {
    return new Promise((resolve) => {
      const approval = this._map.get(id);

      // If the approval doesn't exist, resolve immediately
      if (!approval) {
        return resolve({ id, status: 'expired' });
      }

      // Already resolved — return immediately
      if (approval.status !== 'pending') {
        return resolve({ id, status: approval.status });
      }

      // Set up a timeout that returns "timeout" to the poller
      const timer = setTimeout(() => {
        this._removeWaiter(id, waiter);
        resolve({ id, status: 'timeout' });
      }, timeoutMs);

      if (timer.unref) timer.unref();

      const waiter = { resolve, timer };

      if (!this._waiters.has(id)) {
        this._waiters.set(id, []);
      }
      this._waiters.get(id).push(waiter);
    });
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /** Mark a pending approval as expired and flush its waiters. */
  _expire(id) {
    const approval = this._map.get(id);
    if (!approval || approval.status !== 'pending') return;

    approval.status = 'expired';
    approval.resolvedAt = new Date().toISOString();
    approval._expireTimer = null;

    this._flushWaiters(id);
  }

  /**
   * Wake all waiters for an approval. Each waiter gets the current status.
   * Clears each waiter's timeout before resolving.
   */
  _flushWaiters(id) {
    const waiters = this._waiters.get(id);
    if (!waiters || waiters.length === 0) return;

    const approval = this._map.get(id);
    const status = approval ? approval.status : 'expired';

    for (const waiter of waiters) {
      clearTimeout(waiter.timer);
      waiter.resolve({ id, status });
    }

    this._waiters.delete(id);
  }

  /** Remove a specific waiter from the list (used on timeout). */
  _removeWaiter(id, waiter) {
    const waiters = this._waiters.get(id);
    if (!waiters) return;
    const idx = waiters.indexOf(waiter);
    if (idx !== -1) waiters.splice(idx, 1);
    if (waiters.length === 0) this._waiters.delete(id);
  }

  /** Return a copy of the approval without private/internal fields. */
  _publicView(approval) {
    const { _expireTimer, ...pub } = approval;
    return pub;
  }
}

module.exports = { ApprovalStore };
