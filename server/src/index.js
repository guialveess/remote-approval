'use strict';

require('dotenv').config();

const http = require('http');
const express = require('express');
const { ApprovalStore } = require('./store');
const { createWebSocketServer } = require('./ws');
const { buildApprovalsRouter } = require('./routes/approvals');
const { buildCallbacksRouter } = require('./routes/callbacks');

// ---------------------------------------------------------------------------
// Environment validation
// ---------------------------------------------------------------------------

function checkEnvironment() {
  const required = ['ADAPTER_SECRET', 'CALLBACK_SECRET', 'WS_TOKEN'];
  const optional = ['HARK_WEBHOOK_TOKEN', 'SERVER_URL', 'APP_DEEP_LINK'];
  const missing = [];

  for (const key of required) {
    if (!process.env[key]) missing.push(key);
  }

  if (missing.length > 0) {
    console.error(`[startup] FATAL: Missing required environment variables: ${missing.join(', ')}`);
    process.exit(1);
  }

  for (const key of optional) {
    if (!process.env[key]) {
      console.warn(`[startup] WARNING: ${key} is not set — some features may not work correctly`);
    }
  }
}

// ---------------------------------------------------------------------------
// App setup
// ---------------------------------------------------------------------------

function createApp() {
  const app = express();

  // Parse JSON bodies
  app.use(express.json({ limit: '1mb' }));

  // Request logging (minimal, structured)
  app.use((req, _res, next) => {
    console.log(`[http] ${req.method} ${req.path}`);
    next();
  });

  return app;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

async function main() {
  checkEnvironment();

  const PORT = parseInt(process.env.PORT, 10) || 3000;
  const SERVER_URL = process.env.SERVER_URL || `http://localhost:${PORT}`;

  // Shared approval store
  const store = new ApprovalStore();

  // Express app
  const app = createApp();

  // HTTP server (needed to attach WebSocket server)
  const httpServer = http.createServer(app);

  // WebSocket server (attached to the same HTTP server at /ws)
  const wsManager = createWebSocketServer(httpServer);

  // Mount routes
  app.use('/approvals', buildApprovalsRouter(store, wsManager));
  app.use('/callbacks', buildCallbacksRouter(store, wsManager));

  // Health check — no auth required
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', ts: new Date().toISOString() });
  });

  // 404 handler for unknown routes
  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  // Global error handler (catches any unhandled Express errors)
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    console.error('[http] Unhandled error:', err);
    if (res.headersSent) return;
    res.status(500).json({ error: 'Internal server error' });
  });

  // Start listening
  await new Promise((resolve, reject) => {
    httpServer.listen(PORT, (err) => {
      if (err) return reject(err);
      resolve();
    });
  });

  // ---------------------------------------------------------------------------
  // Startup banner
  // ---------------------------------------------------------------------------
  console.log('');
  console.log('╔═══════════════════════════════════════════╗');
  console.log('║       Remote Approval Server Ready        ║');
  console.log('╠═══════════════════════════════════════════╣');
  console.log(`║  HTTP  : ${SERVER_URL.padEnd(33)}║`);
  console.log(`║  WS    : ${SERVER_URL.replace(/^http/, 'ws').padEnd(33)}║`);
  console.log('╠═══════════════════════════════════════════╣');
  console.log(`║  HARK  : ${(process.env.HARK_WEBHOOK_TOKEN ? 'configured' : 'NOT SET ⚠').padEnd(33)}║`);
  console.log(`║  PORT  : ${String(PORT).padEnd(33)}║`);
  console.log('╚═══════════════════════════════════════════╝');
  console.log('');
}

// ---------------------------------------------------------------------------
// Process-level safety nets
// ---------------------------------------------------------------------------

process.on('unhandledRejection', (reason) => {
  console.error('[process] Unhandled promise rejection:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[process] Uncaught exception:', err);
  process.exit(1);
});

main().catch((err) => {
  console.error('[startup] Fatal error during startup:', err);
  process.exit(1);
});
