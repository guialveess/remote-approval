'use strict';

const { Router } = require('express');
const { createAuthMiddleware } = require('../middleware/auth');

/**
 * @param {import('../sessions').SessionStore} sessionStore
 * @param {{ broadcast: (event: string, data: object) => void }} wsManager
 */
function buildSessionsRouter(sessionStore, wsManager) {
  const router = Router();
  const adapterAuth = createAuthMiddleware('ADAPTER_SECRET');

  // POST /sessions/heartbeat — adapter calls this periodically to stay "online"
  router.post('/heartbeat', adapterAuth, (req, res) => {
    const { session, source } = req.body;
    if (!session || typeof session !== 'string') {
      return res.status(400).json({ error: '"session" must be a non-empty string' });
    }
    const { session: s, isNew } = sessionStore.touch(session, source);
    wsManager.broadcast('session:updated', s);
    if (isNew) console.log(`[sessions] New session registered: ${session} (${source})`);
    return res.json({ ok: true });
  });

  // GET /sessions — list all known sessions
  router.get('/', (_req, res) => {
    return res.json({ sessions: sessionStore.list() });
  });

  // GET /sessions/:id — single session
  router.get('/:id', (req, res) => {
    const s = sessionStore.get(req.params.id);
    if (!s) return res.status(404).json({ error: 'Session not found' });
    return res.json(s);
  });

  // POST /sessions/:id/skip — toggle per-session skip mode
  router.post('/:id/skip', (req, res) => {
    const { enabled } = req.body;
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ error: '"enabled" must be a boolean' });
    }
    const s = sessionStore.setSkip(req.params.id, enabled);
    if (!s) return res.status(404).json({ error: 'Session not found' });
    wsManager.broadcast('session:updated', s);
    console.log(`[sessions] Skip ${enabled ? 'ENABLED' : 'disabled'} for "${req.params.id}"`);
    return res.json(s);
  });

  return router;
}

module.exports = { buildSessionsRouter };
