#!/usr/bin/env bash
# install.sh — Registers the remote-approval Claude Code hook and sets env vars.
#
# Usage: bash install.sh
#
# What it does:
#   1. Writes the PreToolUse hook path into ~/.claude/settings.json
#   2. Adds placeholder env vars to ~/.zshrc and ~/.bashrc
#   3. Prints instructions for what to fill in

set -euo pipefail

# ─── Paths ────────────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOK_PATH="${SCRIPT_DIR}/hook.js"
SETTINGS_FILE="${HOME}/.claude/settings.json"

# ─── Helpers ──────────────────────────────────────────────────────────────────

info()    { echo "  [info]  $*"; }
success() { echo "  [ok]    $*"; }
warn()    { echo "  [warn]  $*" >&2; }

# Merge a PreToolUse hook entry into ~/.claude/settings.json using only tools
# available without extra dependencies (node is already required for the hook).
merge_settings() {
  local hook_cmd="node ${HOOK_PATH}"

  # Create the directory if needed.
  mkdir -p "$(dirname "${SETTINGS_FILE}")"

  # If the file doesn't exist, seed it with an empty object.
  if [[ ! -f "${SETTINGS_FILE}" ]]; then
    echo '{}' > "${SETTINGS_FILE}"
    info "Created ${SETTINGS_FILE}"
  fi

  # Use node (already a dependency) to do a safe JSON merge.
  node - "${SETTINGS_FILE}" "${hook_cmd}" <<'NODE'
const fs   = require("fs");
const path = require("path");

const settingsPath = process.argv[2];
const hookCmd      = process.argv[3];

let settings = {};
try {
  settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
} catch (_) {}

// Ensure hooks.PreToolUse is an array.
if (!settings.hooks)                               settings.hooks = {};
if (!Array.isArray(settings.hooks.PreToolUse))     settings.hooks.PreToolUse = [];

// Check if our hook is already registered.
const alreadyRegistered = settings.hooks.PreToolUse.some((entry) => {
  // Entry may be a string or an object like { command: "...", ... }
  const cmd = typeof entry === "string" ? entry : (entry.command || "");
  return cmd.includes("remote-approval");
});

if (alreadyRegistered) {
  process.stdout.write("already_registered\n");
  process.exit(0);
}

// Append our hook.
settings.hooks.PreToolUse.push({ command: hookCmd });

fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n", "utf8");
process.stdout.write("registered\n");
NODE
}

# Append env-var placeholders to a shell rc file (idempotent).
add_env_vars() {
  local rc_file="$1"

  # Don't add if already present.
  if grep -q "REMOTE_APPROVAL_URL" "${rc_file}" 2>/dev/null; then
    info "${rc_file} already contains REMOTE_APPROVAL_URL — skipping."
    return
  fi

  cat >> "${rc_file}" <<'SHELLVARS'

# ── Remote Approval ──────────────────────────────────────────────────────────
# Set these to your actual relay server URL and secret token.
export REMOTE_APPROVAL_URL="https://YOUR_RELAY_SERVER_URL"
export REMOTE_APPROVAL_SECRET="YOUR_SECRET_TOKEN"
# ─────────────────────────────────────────────────────────────────────────────
SHELLVARS

  success "Added placeholder env vars to ${rc_file}"
}

# ─── Pre-flight checks ────────────────────────────────────────────────────────

echo ""
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║         Remote Approval — Claude Code Hook Installer      ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""

if ! command -v node &>/dev/null; then
  warn "Node.js is not installed or not on PATH. The hook requires Node.js >= 14."
  warn "Install it from https://nodejs.org and re-run this script."
  exit 1
fi

NODE_MAJOR=$(node -e "process.stdout.write(process.versions.node.split('.')[0])")
if [[ "${NODE_MAJOR}" -lt 14 ]]; then
  warn "Node.js ${NODE_MAJOR} is too old. Please upgrade to >= 14."
  exit 1
fi

if [[ ! -f "${HOOK_PATH}" ]]; then
  warn "hook.js not found at ${HOOK_PATH}"
  warn "Make sure you run this script from its own directory."
  exit 1
fi

# ─── 1. Register hook in Claude Code settings ─────────────────────────────────

echo "Step 1: Registering PreToolUse hook in Claude Code settings..."
result=$(merge_settings)
if [[ "${result}" == "already_registered" ]]; then
  info "Hook already registered in ${SETTINGS_FILE} — skipping."
else
  success "Hook registered in ${SETTINGS_FILE}"
fi

# ─── 2. Add env vars to shell rc files ───────────────────────────────────────

echo ""
echo "Step 2: Adding env-var placeholders to shell rc files..."

ADDED_ANY=false

if [[ -f "${HOME}/.zshrc" ]] || [[ "${SHELL}" == *zsh* ]]; then
  touch "${HOME}/.zshrc"
  add_env_vars "${HOME}/.zshrc"
  ADDED_ANY=true
fi

if [[ -f "${HOME}/.bashrc" ]]; then
  add_env_vars "${HOME}/.bashrc"
  ADDED_ANY=true
fi

if [[ "${ADDED_ANY}" == "false" ]]; then
  warn "Neither ~/.zshrc nor ~/.bashrc found. Add env vars manually (see below)."
fi

# ─── 3. Print instructions ───────────────────────────────────────────────────

echo ""
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║                    Next Steps                             ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""
echo "  1. Open ~/.zshrc (or ~/.bashrc) and replace the placeholders:"
echo ""
echo "       REMOTE_APPROVAL_URL   → Your relay server URL"
echo "                               e.g. https://my-relay.railway.app"
echo "                               or   http://localhost:3000  (local dev)"
echo ""
echo "       REMOTE_APPROVAL_SECRET → The bearer token your relay server"
echo "                                expects (set in the server's env)."
echo ""
echo "  2. Reload your shell:"
echo "       source ~/.zshrc    # or ~/.bashrc"
echo ""
echo "  3. Start (or restart) Claude Code. Every tool call will now be"
echo "     sent to your relay server for approval before execution."
echo ""
echo "  Hook location : ${HOOK_PATH}"
echo "  Settings file : ${SETTINGS_FILE}"
echo ""
echo "  Fail-open behaviour: if the relay server is unreachable, the hook"
echo "  exits 0 so Claude Code continues working uninterrupted."
echo ""
