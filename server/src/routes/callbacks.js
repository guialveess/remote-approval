'use strict';

const { Router } = require('express');
const { createAuthMiddleware } = require('../middleware/auth');

/**
 * Build and return the callbacks router.
 * This receives resolution webhooks from Hark.
 *
 * @param {import('../store').ApprovalStore} store
 * @param {{ broadcast: (event: string, data: object) => void }} wsManager
 * @returns {import('express').Router}
 */
function buildCallbacksRouter(store, wsManager) {
  const router = Router();
  const callbackAuth = createAuthMiddleware('CALLBACK_SECRET');

  // ---------------------------------------------------------------------------
  // POST /callbacks/:id — Hark sends the user's response here
  // ---------------------------------------------------------------------------
  router.post('/:id', callbackAuth, (req, res) => {
    const { id } = req.params;
    const { type, kind, action, correlationId } = req.body;

    // Validate Hark payload shape
    if (type !== 'notification.response') {
      return res.status(400).json({ error: `Unexpected type "${type}"` });
    }

    if (kind !== 'approval') {
      return res.status(400).json({ error: `Unexpected kind "${kind}"` });
    }

    if (action !== 'approve' && action !== 'deny') {
      return res.status(400).json({
        error: `Invalid action "${action}". Must be "approve" or "deny"`,
      });
    }

    // correlationId should match the path :id — log a warning if not
    if (correlationId && correlationId !== id) {
      console.warn(
        `[callbacks] correlationId mismatch: path=${id}, body=${correlationId}. Using path id.`
      );
    }

    // Map Hark action to internal resolution status
    const resolution = action === 'approve' ? 'approved' : 'denied';

    const resolved = store.resolve(id, resolution);

    if (!resolved) {
      // Either not found or already resolved
      const existing = store.get(id);
      if (!existing) {
        return res.status(404).json({ error: `Approval ${id} not found` });
      }
      // Already resolved — idempotent response
      console.log(`[callbacks] ${id} already resolved as ${existing.status}`);
      return res.json({ id, status: existing.status, message: 'already resolved' });
    }

    console.log(`[callbacks] Resolved ${id} as ${resolution}`);

    // Broadcast resolution to all WebSocket clients
    wsManager.broadcast('approval:resolved', resolved);

    return res.json({ id: resolved.id, status: resolved.status });
  });

  return router;
}

module.exports = { buildCallbacksRouter };
