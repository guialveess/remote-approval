'use strict';

const { Router } = require('express');
const { createAuthMiddleware } = require('../middleware/auth');
const { sendHarkNotification } = require('../hark');

const VALID_SOURCES = new Set(['claude-code', 'copilot-cli']);
const DEFAULT_WAIT_TIMEOUT = 300; // seconds
const MAX_WAIT_TIMEOUT = 600;     // seconds — cap to avoid runaway connections

/**
 * Build and return the approvals router.
 *
 * @param {import('../store').ApprovalStore} store
 * @param {{ broadcast: (event: string, data: object) => void }} wsManager
 * @returns {import('express').Router}
 */
function buildApprovalsRouter(store, wsManager) {
  const router = Router();
  const adapterAuth = createAuthMiddleware('ADAPTER_SECRET');

  // Skip mode — when enabled, all approvals are auto-approved instantly
  let skipMode = false;

  // -------------------------------------------------------------------------
  // GET /skip — return current skip mode state
  // POST /skip — set skip mode { enabled: boolean }
  // -------------------------------------------------------------------------
  router.get('/skip', (_req, res) => {
    return res.json({ skipMode });
  });

  router.post('/skip', (req, res) => {
    const { enabled } = req.body;
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ error: '"enabled" must be a boolean' });
    }
    skipMode = enabled;
    wsManager.broadcast('skip:changed', { skipMode });
    console.log(`[approvals] Skip mode ${skipMode ? 'ENABLED' : 'disabled'}`);
    return res.json({ skipMode });
  });

  // -------------------------------------------------------------------------
  // POST /approvals — create a new approval request (adapter clients)
  // -------------------------------------------------------------------------
  router.post('/', adapterAuth, async (req, res) => {
    const { tool, action, details, diff, source } = req.body;

    // Validate required fields
    const missing = [];
    if (!tool || typeof tool !== 'string') missing.push('tool');
    if (!action || typeof action !== 'string') missing.push('action');
    if (!details || typeof details !== 'string') missing.push('details');
    if (!source) missing.push('source');

    if (missing.length > 0) {
      return res.status(400).json({ error: `Missing or invalid fields: ${missing.join(', ')}` });
    }

    if (!VALID_SOURCES.has(source)) {
      return res.status(400).json({
        error: `Invalid source "${source}". Must be one of: ${[...VALID_SOURCES].join(', ')}`,
      });
    }

    if (diff !== undefined && typeof diff !== 'string') {
      return res.status(400).json({ error: 'Field "diff" must be a string if provided' });
    }

    // Create the approval record
    const approval = store.create({ tool, action, details, diff, source });

    console.log(`[approvals] Created ${approval.id} from ${source} — ${action}`);

    // Skip mode: auto-approve immediately without notifying
    if (skipMode) {
      const resolved = store.resolve(approval.id, 'approved');
      console.log(`[approvals] Auto-approved ${approval.id} (skip mode)`);
      return res.status(201).json({
        id: approval.id,
        status: 'approved',
        createdAt: approval.createdAt,
      });
    }

    // Send Hark notification asynchronously; don't fail the request if it errors
    sendHarkNotification(approval).catch((err) => {
      console.error(`[approvals] Hark notification failed for ${approval.id}:`, err.message);
    });

    // Broadcast to WebSocket clients (Expo app)
    wsManager.broadcast('approval:new', store.get(approval.id));

    return res.status(201).json({
      id: approval.id,
      status: approval.status,
      createdAt: approval.createdAt,
    });
  });

  // -------------------------------------------------------------------------
  // GET /approvals — list approvals (Expo app; no auth required by spec)
  // -------------------------------------------------------------------------
  router.get('/', (req, res) => {
    const { status = 'all', limit } = req.query;

    const validStatuses = new Set(['pending', 'resolved', 'all']);
    if (!validStatuses.has(status)) {
      return res.status(400).json({
        error: `Invalid status filter "${status}". Must be: pending, resolved, or all`,
      });
    }

    const parsedLimit = limit !== undefined ? parseInt(limit, 10) : 50;
    if (isNaN(parsedLimit) || parsedLimit < 1 || parsedLimit > 500) {
      return res.status(400).json({ error: 'limit must be an integer between 1 and 500' });
    }

    const approvals = store.list({ status, limit: parsedLimit });
    return res.json({ approvals });
  });

  // -------------------------------------------------------------------------
  // GET /approvals/:id — get a single approval (Expo app)
  // -------------------------------------------------------------------------
  router.get('/:id', (req, res) => {
    const approval = store.get(req.params.id);
    if (!approval) {
      return res.status(404).json({ error: `Approval ${req.params.id} not found` });
    }
    return res.json(approval);
  });

  // -------------------------------------------------------------------------
  // POST /approvals/:id/approve — in-app approve (Expo app)
  // POST /approvals/:id/deny   — in-app deny    (Expo app)
  // -------------------------------------------------------------------------
  router.post('/:id/approve', (req, res) => {
    const approval = store.resolve(req.params.id, 'approved');
    if (!approval) return res.status(404).json({ error: 'Not found or already resolved' });
    wsManager.broadcast('approval:resolved', approval);
    return res.json({ id: approval.id, status: approval.status });
  });

  router.post('/:id/deny', (req, res) => {
    const approval = store.resolve(req.params.id, 'denied');
    if (!approval) return res.status(404).json({ error: 'Not found or already resolved' });
    wsManager.broadcast('approval:resolved', approval);
    return res.json({ id: approval.id, status: approval.status });
  });

  // -------------------------------------------------------------------------
  // GET /approvals/:id/wait?timeout=300 — long-poll until resolved (adapters)
  // -------------------------------------------------------------------------
  router.get('/:id/wait', adapterAuth, async (req, res) => {
    const { id } = req.params;

    // Quick existence check before entering the wait
    const approval = store.get(id);
    if (!approval) {
      return res.status(404).json({ error: `Approval ${id} not found` });
    }

    // Parse and clamp timeout
    let timeoutSecs = parseInt(req.query.timeout, 10);
    if (isNaN(timeoutSecs) || timeoutSecs < 1) {
      timeoutSecs = DEFAULT_WAIT_TIMEOUT;
    }
    if (timeoutSecs > MAX_WAIT_TIMEOUT) {
      timeoutSecs = MAX_WAIT_TIMEOUT;
    }

    // Handle client disconnect: we can't cancel the internal wait promise, but we
    // avoid sending a response to a closed socket by checking res.writableEnded.
    let clientGone = false;
    req.on('close', () => {
      clientGone = true;
    });

    console.log(`[approvals] Long-poll started for ${id} (timeout: ${timeoutSecs}s)`);

    const result = await store.wait(id, timeoutSecs * 1000);

    if (clientGone) {
      // Client disconnected while we were waiting — nothing to do
      console.log(`[approvals] Long-poll client gone for ${id}`);
      return;
    }

    console.log(`[approvals] Long-poll resolved for ${id}: ${result.status}`);
    return res.json(result);
  });

  return router;
}

module.exports = { buildApprovalsRouter };
