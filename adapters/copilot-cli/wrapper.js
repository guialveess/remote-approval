#!/usr/bin/env node
/**
 * Copilot CLI wrapper — opt-in remote approval gate.
 *
 * Without the flag → completely transparent passthrough to the real binary.
 * With the flag    → spawns the binary in a PTY, intercepts confirmation prompts,
 *                    and blocks execution until approved/denied from the mobile app.
 *
 * Usage:
 *   copilot [args...]                     # normal, no gate
 *   copilot remote-approval [args...]     # gate active for this session
 *
 * Config (env vars):
 *   REMOTE_APPROVAL_URL     Base URL of the relay server
 *   REMOTE_APPROVAL_SECRET  Bearer token
 *   REMOTE_APPROVAL_SESSION Session name shown in the app (default: hostname)
 *   COPILOT_BIN             Path to the real copilot binary (default: "copilot")
 */

"use strict";

const pty = require("node-pty");
const https = require("https");
const http = require("http");
const url = require("url");
const os = require("os");
const { spawnSync } = require("child_process");

// ─── Config ───────────────────────────────────────────────────────────────────

const SERVER_URL = (process.env.REMOTE_APPROVAL_URL || "").replace(/\/$/, "");
const SECRET = process.env.REMOTE_APPROVAL_SECRET || "";
const COPILOT_BIN = process.env.COPILOT_BIN || "copilot";
const SESSION = process.env.REMOTE_APPROVAL_SESSION || os.hostname();
const POLL_TIMEOUT_SECONDS = 300;
const HEARTBEAT_INTERVAL_MS = 30_000;

/**
 * Patterns that indicate Copilot CLI is asking for execution confirmation.
 * We match the common variants seen across gh copilot versions.
 */
const CONFIRMATION_PATTERNS = [
  /\?\s+.*(?:Y\/n|yes\/no)/i,
  /Execute the suggested command\?/i,
  /Would you like to run this command\?/i,
  /Run this command\?/i,
  /Shall I execute\?/i,
  /Proceed\?\s*\(Y\/n\)/i,
  /confirm.*\(y\/n\)/i,
];

// How many lines of recent output to capture as context for the approver.
const CONTEXT_LINES = 20;

// ANSI escape-sequence stripper (for clean text sent to the relay server).
const ANSI_RE = /\x1B\[[0-9;]*[mGKHF]|\x1B\][^\x07]*\x07|\x1B[=>]/g;

// ─── HTTP helper ──────────────────────────────────────────────────────────────

function request(method, rawUrl, headers, body) {
  return new Promise((resolve, reject) => {
    const parsed = url.parse(rawUrl);
    const isHttps = parsed.protocol === "https:";
    const lib = isHttps ? https : http;

    const options = {
      hostname: parsed.hostname,
      port: parsed.port || (isHttps ? 443 : 80),
      path: parsed.path,
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SECRET}`,
        ...headers,
      },
    };

    const req = lib.request(options, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () =>
        resolve({
          statusCode: res.statusCode,
          body: Buffer.concat(chunks).toString("utf8"),
        })
      );
    });

    req.on("error", reject);
    req.setTimeout((POLL_TIMEOUT_SECONDS + 20) * 1000, () => {
      req.destroy(new Error("socket timeout"));
    });

    if (body) req.write(typeof body === "string" ? body : JSON.stringify(body));
    req.end();
  });
}

// ─── Remote approval ──────────────────────────────────────────────────────────

/**
 * Post an approval request and long-poll for the result.
 * Returns "approved" | "denied" | "timeout" | "error".
 */
async function requestApproval(details) {
  if (!SERVER_URL || !SECRET) {
    process.stderr.write(
      "\n[remote-approval] WARNING: URL or secret not configured. Fail open.\n"
    );
    return "error";
  }

  const payload = {
    tool: "copilot-cli",
    action: "Execute suggested command",
    details,
    source: "copilot-cli",
    session: SESSION,
  };

  let approvalId;
  try {
    const res = await request("POST", `${SERVER_URL}/approvals`, {}, payload);
    if (res.statusCode < 200 || res.statusCode >= 300) {
      process.stderr.write(
        `\n[remote-approval] WARNING: Server returned HTTP ${res.statusCode}. Fail open.\n`
      );
      return "error";
    }
    const body = JSON.parse(res.body);
    approvalId = body.id;
    if (!approvalId) {
      process.stderr.write(
        "\n[remote-approval] WARNING: Missing 'id' in server response. Fail open.\n"
      );
      return "error";
    }
  } catch (err) {
    process.stderr.write(
      `\n[remote-approval] WARNING: Could not reach server (${err.message}). Fail open.\n`
    );
    return "error";
  }

  try {
    const pollUrl = `${SERVER_URL}/approvals/${encodeURIComponent(approvalId)}/wait?timeout=${POLL_TIMEOUT_SECONDS}`;
    const res = await request("GET", pollUrl, {});
    if (res.statusCode < 200 || res.statusCode >= 300) {
      process.stderr.write(
        `\n[remote-approval] WARNING: Poll returned HTTP ${res.statusCode}. Fail open.\n`
      );
      return "error";
    }
    const body = JSON.parse(res.body);
    return body.status || "error";
  } catch (err) {
    process.stderr.write(
      `\n[remote-approval] WARNING: Poll failed (${err.message}). Fail open.\n`
    );
    return "error";
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function sendHeartbeat() {
  if (!SERVER_URL || !SECRET) return;
  request("POST", `${SERVER_URL}/sessions/heartbeat`, {}, { session: SESSION, source: "copilot-cli" })
    .catch(() => {}); // fire-and-forget; never block on heartbeat failure
}

async function main() {
  const args = process.argv.slice(2);

  // ── Gate flag check ────────────────────────────────────────────────────────
  // If 'remote-approval' is not present, pass through to the real binary with
  // zero overhead — the wrapper is completely invisible to the user.

  const gateIndex = args.indexOf("remote-approval");

  if (gateIndex === -1) {
    const result = spawnSync(COPILOT_BIN, args, { stdio: "inherit" });
    process.exit(result.status ?? (result.signal ? 1 : 0));
    return;
  }

  // Strip 'remote-approval' from args — it can appear in any position.
  const gatedArgs = [...args.slice(0, gateIndex), ...args.slice(gateIndex + 1)];

  process.stderr.write(
    `\x1B[33m[remote-approval] Gate active · session: ${SESSION}\x1B[0m\n`
  );

  // Register session and keep it alive via periodic heartbeat.
  sendHeartbeat();
  const hbTimer = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);
  if (hbTimer.unref) hbTimer.unref();

  // ── Spawn copilot inside a PTY ─────────────────────────────────────────────

  const cols = process.stdout.columns || 120;
  const rows = process.stdout.rows || 24;

  const ptyProcess = pty.spawn(COPILOT_BIN, gatedArgs, {
    name: process.env.TERM || "xterm-256color",
    cols,
    rows,
    cwd: process.cwd(),
    env: process.env,
  });

  // ── State ──────────────────────────────────────────────────────────────────

  /** Rolling buffer of the last CONTEXT_LINES clean (no ANSI) output lines. */
  const lineBuffer = [];
  /** Partial line accumulator for the current chunk. */
  let partialLine = "";
  /** Whether we are currently awaiting a remote approval decision. */
  let approvalInFlight = false;
  /** Whether stdin passthrough to the PTY is blocked. */
  let inputBlocked = false;

  // Helper: push text into the rolling line buffer.
  function feedText(text) {
    const clean = text.replace(ANSI_RE, "");
    const combined = partialLine + clean;
    const parts = combined.split(/\r?\n/);
    partialLine = parts.pop(); // last fragment (may be incomplete)
    for (const line of parts) {
      lineBuffer.push(line);
      if (lineBuffer.length > CONTEXT_LINES * 2) lineBuffer.shift();
    }
  }

  // Helper: check if any confirmation pattern matches the recent output.
  function detectConfirmation(text) {
    const clean = text.replace(ANSI_RE, "");
    return CONFIRMATION_PATTERNS.some((re) => re.test(clean));
  }

  // Helper: get last N clean lines as a single string.
  function getContext() {
    // Flush partial line into snapshot.
    const snapshot = [...lineBuffer];
    if (partialLine.trim()) snapshot.push(partialLine);
    return snapshot.slice(-CONTEXT_LINES).join("\n");
  }

  // ── PTY output → our stdout ────────────────────────────────────────────────

  ptyProcess.onData((data) => {
    // Always forward output to the user.
    process.stdout.write(data);
    feedText(data);

    // If we're already handling an approval, don't re-trigger.
    if (approvalInFlight) return;

    if (detectConfirmation(data)) {
      approvalInFlight = true;
      inputBlocked = true;

      const context = getContext();

      // Show status message on a new line so it doesn't corrupt Copilot's UI.
      process.stdout.write(
        "\r\n\x1B[33m⏳ Waiting for remote approval...\x1B[0m\r\n"
      );

      // Fire off approval request asynchronously.
      requestApproval(context)
        .then((status) => {
          approvalInFlight = false;
          inputBlocked = false;

          switch (status) {
            case "approved":
              process.stdout.write(
                "\x1B[32m✔ Approved — executing.\x1B[0m\r\n"
              );
              ptyProcess.write("\r"); // send Enter (Yes)
              break;

            case "denied":
              process.stdout.write("\x1B[31m✖ Denied.\x1B[0m\r\n");
              ptyProcess.write("n\r"); // send n (No)
              break;

            case "timeout":
            case "expired":
              process.stdout.write(
                "\x1B[33m⏰ Approval timed out — failing open.\x1B[0m\r\n"
              );
              ptyProcess.write("\r"); // fail open
              break;

            default: // "error" or anything unexpected
              process.stdout.write(
                "\x1B[33m⚠ Approval server unreachable — failing open.\x1B[0m\r\n"
              );
              ptyProcess.write("\r"); // fail open
              break;
          }
        })
        .catch((err) => {
          approvalInFlight = false;
          inputBlocked = false;
          process.stdout.write(
            `\x1B[33m⚠ Approval error (${err.message}) — failing open.\x1B[0m\r\n`
          );
          ptyProcess.write("\r");
        });
    }
  });

  // ── stdin → PTY ────────────────────────────────────────────────────────────

  // Put stdin into raw mode so we capture individual keypresses.
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
  }
  process.stdin.resume();

  process.stdin.on("data", (data) => {
    // While approval is in flight, swallow all keystrokes to prevent the user
    // from accidentally confirming or cancelling themselves.
    if (inputBlocked) return;

    // Ctrl-C / Ctrl-D passthrough (in case raw mode swallows them otherwise).
    ptyProcess.write(data.toString());
  });

  // ── Terminal resize ────────────────────────────────────────────────────────

  process.stdout.on("resize", () => {
    try {
      ptyProcess.resize(
        process.stdout.columns || cols,
        process.stdout.rows || rows
      );
    } catch (_) {
      // Ignore resize errors (PTY may already be closing).
    }
  });

  // ── PTY exit ───────────────────────────────────────────────────────────────

  ptyProcess.onExit(({ exitCode, signal }) => {
    // Restore stdin before exiting.
    if (process.stdin.isTTY) {
      try {
        process.stdin.setRawMode(false);
      } catch (_) {}
    }
    process.stdin.pause();

    if (signal) {
      // Re-raise the signal so our process exits with the same signal.
      process.kill(process.pid, signal);
    } else {
      process.exit(exitCode ?? 0);
    }
  });
}

main().catch((err) => {
  process.stderr.write(`[copilot-wrapper] FATAL: ${err.message}\n`);
  if (err.code === "MODULE_NOT_FOUND" && err.message.includes("node-pty")) {
    process.stderr.write(
      "\n[copilot-wrapper] 'node-pty' is not installed.\n" +
        "Run:  npm install  (in the adapters/copilot-cli directory)\n\n"
    );
  }
  process.exit(1);
});
