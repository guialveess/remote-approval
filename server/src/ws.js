'use strict';

const { WebSocketServer, WebSocket } = require('ws');
const url = require('url');

/**
 * Creates and manages the WebSocket server.
 * Authentication is checked on connection via ?token= query param.
 *
 * @param {import('http').Server} httpServer
 * @returns {{ broadcast: (event: string, data: object) => void, wss: WebSocketServer }}
 */
function createWebSocketServer(httpServer) {
  const wsToken = process.env.WS_TOKEN;

  const wss = new WebSocketServer({
    server: httpServer,
    path: '/ws',
    // Disable per-message deflate to reduce memory overhead on Railway
    perMessageDeflate: false,
  });

  wss.on('connection', (ws, req) => {
    // Authenticate via ?token= query param
    const parsed = url.parse(req.url, true);
    const providedToken = parsed.query.token;

    if (!wsToken || providedToken !== wsToken) {
      ws.close(4001, 'Unauthorized');
      return;
    }

    const remoteAddr = req.socket.remoteAddress;
    console.log(`[ws] Client connected from ${remoteAddr} (total: ${wss.clients.size})`);

    // Send a welcome ping to confirm connectivity
    safeSend(ws, { event: 'connected', data: { ts: new Date().toISOString() } });

    ws.on('close', () => {
      console.log(`[ws] Client disconnected (remaining: ${wss.clients.size})`);
    });

    ws.on('error', (err) => {
      console.error('[ws] Client error:', err.message);
    });

    // Ignore any inbound messages — this is server-push only
    ws.on('message', () => {});
  });

  wss.on('error', (err) => {
    console.error('[ws] Server error:', err.message);
  });

  /**
   * Broadcast an event to all authenticated connected clients.
   * @param {string} event
   * @param {object} data
   */
  function broadcast(event, data) {
    const payload = JSON.stringify({ type: event, data });
    let sent = 0;

    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        safeSend(client, null, payload);
        sent++;
      }
    }

    if (sent > 0) {
      console.log(`[ws] Broadcast "${event}" to ${sent} client(s)`);
    }
  }

  return { broadcast, wss };
}

/**
 * Send a message to a WebSocket client, catching any errors.
 * Pass either `data` (object, will be serialized) or `raw` (pre-serialized string).
 * @param {WebSocket} ws
 * @param {object|null} data
 * @param {string} [raw]
 */
function safeSend(ws, data, raw) {
  try {
    const payload = raw !== undefined ? raw : JSON.stringify(data);
    ws.send(payload);
  } catch (err) {
    console.error('[ws] Send error:', err.message);
  }
}

module.exports = { createWebSocketServer };
