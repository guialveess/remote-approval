#!/usr/bin/env node
/**
 * Claude Code PreToolUse hook — remote approval gate.
 *
 * Reads a tool-call payload from stdin, posts it to the relay server for human
 * approval, and exits 0 (approved / timeout / server-error) or 1 (denied).
 *
 * Config (env vars):
 *   REMOTE_APPROVAL_URL     Base URL of the relay server, e.g. https://relay.example.com
 *   REMOTE_APPROVAL_SECRET  Bearer token accepted by the relay server
 */

"use strict";

const https = require("https");
const http = require("http");
const url = require("url");
const os = require("os");

// ─── Config ───────────────────────────────────────────────────────────────────

const SERVER_URL = (process.env.REMOTE_APPROVAL_URL || "").replace(/\/$/, "");
const SECRET = process.env.REMOTE_APPROVAL_SECRET || "";
const SESSION = process.env.REMOTE_APPROVAL_SESSION || os.hostname();
const POLL_TIMEOUT_SECONDS = 300;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Perform an HTTP/HTTPS request, returning { statusCode, body } */
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

    // 320-second total socket timeout (slightly above POLL_TIMEOUT_SECONDS to
    // give the server time to respond with "timeout" before we abort locally).
    req.setTimeout((POLL_TIMEOUT_SECONDS + 20) * 1000, () => {
      req.destroy(new Error("socket timeout"));
    });

    if (body) req.write(typeof body === "string" ? body : JSON.stringify(body));
    req.end();
  });
}

/** Read all of stdin as a string. */
function readStdin() {
  return new Promise((resolve, reject) => {
    const chunks = [];
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (c) => chunks.push(c));
    process.stdin.on("end", () => resolve(chunks.join("")));
    process.stdin.on("error", reject);
  });
}

// ─── Diff builder ─────────────────────────────────────────────────────────────

/**
 * Build a minimal unified-diff string between two texts.
 * We implement this without external deps so the hook has no install step.
 */
function buildUnifiedDiff(oldText, newText, label) {
  const oldLines = (oldText || "").split("\n");
  const newLines = (newText || "").split("\n");

  // Compute LCS-based diff (Myers lite — good enough for code review diffs).
  const hunks = computeHunks(oldLines, newLines);

  if (hunks.length === 0) return "(no changes)";

  const header = `--- a/${label}\n+++ b/${label}\n`;
  return header + hunks.join("\n");
}

function computeHunks(oldLines, newLines) {
  const edits = lcs(oldLines, newLines);
  if (edits.length === 0) return [];

  const CONTEXT = 3;
  const output = [];
  let i = 0;

  while (i < edits.length) {
    // Collect a contiguous changed region plus context.
    const hunkEdits = [];
    let j = i;

    // Skip leading context (unchanged lines before the first change in hunk).
    while (j < edits.length && edits[j][0] === " ") j++;
    if (j === edits.length) break; // no more changes

    const start = Math.max(0, j - CONTEXT);
    const end_search = Math.min(edits.length, j + 1);

    // Collect from start through end of contiguous changed region + trailing ctx
    let k = start;
    let lastChange = j;
    while (k < edits.length) {
      if (edits[k][0] !== " ") lastChange = k;
      if (k > lastChange + CONTEXT) break;
      k++;
    }

    const hunkSlice = edits.slice(start, k);
    i = k;

    // Compute hunk header line numbers.
    let oldStart = 1,
      newStart = 1;
    for (let m = 0; m < start; m++) {
      if (edits[m][0] !== "+") oldStart++;
      if (edits[m][0] !== "-") newStart++;
    }
    const oldCount = hunkSlice.filter((e) => e[0] !== "+").length;
    const newCount = hunkSlice.filter((e) => e[0] !== "-").length;

    output.push(
      `@@ -${oldStart},${oldCount} +${newStart},${newCount} @@`
    );
    for (const [sign, line] of hunkSlice) {
      output.push(`${sign}${line}`);
    }
  }
  return output;
}

/** Returns array of [sign, line] where sign is ' ', '-', or '+'. */
function lcs(a, b) {
  const m = a.length,
    n = b.length;
  // dp[i][j] = length of LCS of a[0..i-1] and b[0..j-1]
  const dp = Array.from({ length: m + 1 }, () => new Int32Array(n + 1));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1] + 1
          : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }

  // Trace back
  const edits = [];
  let i = m,
    j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      edits.push([" ", a[i - 1]]);
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      edits.push(["+", b[j - 1]]);
      j--;
    } else {
      edits.push(["-", a[i - 1]]);
      i--;
    }
  }
  return edits.reverse();
}

// ─── Payload builder ──────────────────────────────────────────────────────────

function buildPayload(toolName, toolInput) {
  let action = toolName;
  let details = "";
  let diff = undefined;

  switch (toolName) {
    case "Edit": {
      const fp = toolInput.file_path || "(unknown file)";
      action = `Edit file: ${fp}`;
      details =
        `File: ${fp}\n` +
        `Old string (${(toolInput.old_string || "").split("\n").length} lines) → ` +
        `New string (${(toolInput.new_string || "").split("\n").length} lines)`;
      diff = buildUnifiedDiff(
        toolInput.old_string || "",
        toolInput.new_string || "",
        fp
      );
      break;
    }

    case "Write": {
      const fp = toolInput.file_path || "(unknown file)";
      action = `Write file: ${fp}`;
      const newContent = toolInput.content || "";
      details = `File: ${fp}\nContent length: ${newContent.length} chars / ${newContent.split("\n").length} lines`;
      // Diff: treat old as empty (new file) or show full content as additions.
      diff = buildUnifiedDiff("", newContent, fp);
      break;
    }

    case "Bash": {
      const cmd = toolInput.command || "";
      action = `Run bash command`;
      details = `Command:\n${cmd}`;
      if (toolInput.description) details += `\n\nDescription: ${toolInput.description}`;
      break;
    }

    case "Read": {
      const fp = toolInput.file_path || "(unknown file)";
      action = `Read file: ${fp}`;
      details = `File: ${fp}`;
      if (toolInput.offset) details += `\nOffset: ${toolInput.offset}`;
      if (toolInput.limit) details += `\nLimit: ${toolInput.limit}`;
      break;
    }

    case "MultiEdit": {
      const fp = toolInput.file_path || "(unknown file)";
      const edits = Array.isArray(toolInput.edits) ? toolInput.edits : [];
      action = `Multi-edit file: ${fp}`;
      details = `File: ${fp}\nNumber of edits: ${edits.length}`;
      // Build a combined diff for all edits sequentially.
      let running = "";
      const diffParts = [];
      for (const [idx, edit] of edits.entries()) {
        const d = buildUnifiedDiff(
          edit.old_string || "",
          edit.new_string || "",
          `${fp} (edit ${idx + 1})`
        );
        diffParts.push(d);
        running = running.replace(edit.old_string || "", edit.new_string || "");
      }
      diff = diffParts.join("\n\n");
      break;
    }

    default: {
      action = `Tool call: ${toolName}`;
      // Stringify the input, redacting anything that looks like a secret.
      const safeInput = JSON.stringify(toolInput, null, 2).replace(
        /"(password|secret|token|key|auth)":\s*"[^"]*"/gi,
        '"$1": "[REDACTED]"'
      );
      details = safeInput;
      break;
    }
  }

  const payload = {
    tool: toolName,
    action,
    details,
    source: "claude-code",
    session: SESSION,
  };

  if (diff !== undefined) payload.diff = diff;

  return payload;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  // Validate config before doing any work.
  if (!SERVER_URL) {
    process.stderr.write(
      "[remote-approval] WARNING: REMOTE_APPROVAL_URL is not set. Skipping approval (fail open).\n"
    );
    process.exit(0);
  }
  if (!SECRET) {
    process.stderr.write(
      "[remote-approval] WARNING: REMOTE_APPROVAL_SECRET is not set. Skipping approval (fail open).\n"
    );
    process.exit(0);
  }

  // 1. Read stdin.
  let rawInput;
  try {
    rawInput = await readStdin();
  } catch (err) {
    process.stderr.write(
      `[remote-approval] WARNING: Failed to read stdin: ${err.message}. Fail open.\n`
    );
    process.exit(0);
  }

  if (!rawInput.trim()) {
    // No payload — nothing to approve.
    process.exit(0);
  }

  let payload_input;
  try {
    payload_input = JSON.parse(rawInput);
  } catch (err) {
    process.stderr.write(
      `[remote-approval] WARNING: Could not parse stdin JSON: ${err.message}. Fail open.\n`
    );
    process.exit(0);
  }

  const toolName = payload_input.tool_name || "Unknown";
  const toolInput = payload_input.tool_input || {};

  // 2. Build structured payload.
  let approvalPayload;
  try {
    approvalPayload = buildPayload(toolName, toolInput);
  } catch (err) {
    process.stderr.write(
      `[remote-approval] WARNING: Failed to build payload: ${err.message}. Fail open.\n`
    );
    process.exit(0);
  }

  // 3. POST approval request.
  let approvalId;
  try {
    const res = await request(
      "POST",
      `${SERVER_URL}/approvals`,
      {},
      approvalPayload
    );

    if (res.statusCode < 200 || res.statusCode >= 300) {
      process.stderr.write(
        `[remote-approval] WARNING: Server returned HTTP ${res.statusCode}. Fail open.\n`
      );
      process.exit(0);
    }

    const body = JSON.parse(res.body);
    approvalId = body.id;

    if (!approvalId) {
      process.stderr.write(
        "[remote-approval] WARNING: Server response missing 'id'. Fail open.\n"
      );
      process.exit(0);
    }

    process.stderr.write(
      `[remote-approval] Approval requested (id: ${approvalId}). Waiting up to ${POLL_TIMEOUT_SECONDS}s...\n`
    );
  } catch (err) {
    process.stderr.write(
      `[remote-approval] WARNING: Could not reach server (${err.message}). Fail open.\n`
    );
    process.exit(0);
  }

  // 4. Long-poll for result.
  let status;
  try {
    const pollUrl = `${SERVER_URL}/approvals/${encodeURIComponent(approvalId)}/wait?timeout=${POLL_TIMEOUT_SECONDS}`;
    const res = await request("GET", pollUrl, {});

    if (res.statusCode < 200 || res.statusCode >= 300) {
      process.stderr.write(
        `[remote-approval] WARNING: Poll returned HTTP ${res.statusCode}. Fail open.\n`
      );
      process.exit(0);
    }

    const body = JSON.parse(res.body);
    status = body.status;
  } catch (err) {
    process.stderr.write(
      `[remote-approval] WARNING: Poll failed (${err.message}). Fail open.\n`
    );
    process.exit(0);
  }

  // 5. Act on result.
  switch (status) {
    case "approved":
      process.stderr.write("[remote-approval] Approved.\n");
      process.exit(0);

    case "denied":
      process.stderr.write("[remote-approval] Denied by remote approver.\n");
      process.exit(1);

    case "timeout":
    case "expired":
      process.stderr.write(
        `[remote-approval] ${status} — no response received. Fail open.\n`
      );
      process.exit(0);

    default:
      process.stderr.write(
        `[remote-approval] WARNING: Unexpected status '${status}'. Fail open.\n`
      );
      process.exit(0);
  }
}

main().catch((err) => {
  process.stderr.write(
    `[remote-approval] FATAL: Unexpected error: ${err.message}. Fail open.\n`
  );
  process.exit(0);
});
