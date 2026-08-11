#!/usr/bin/env bash
# install.sh — Installs the Copilot CLI wrapper and sets up shell aliases/env vars.
#
# Usage: bash install.sh
#
# What it does:
#   1. Runs `npm install` inside adapters/copilot-cli/ to install node-pty
#   2. Adds a `copilot` alias (and `ghc` shorthand) to ~/.zshrc
#   3. Adds placeholder env vars to ~/.zshrc
#   4. Prints clear next steps

set -euo pipefail

# ─── Paths ────────────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WRAPPER_PATH="${SCRIPT_DIR}/wrapper.js"

# ─── Helpers ──────────────────────────────────────────────────────────────────

info()    { echo "  [info]  $*"; }
success() { echo "  [ok]    $*"; }
warn()    { echo "  [warn]  $*" >&2; }

add_to_rc() {
  local rc_file="$1"
  local marker="$2"
  local block="$3"

  if grep -q "${marker}" "${rc_file}" 2>/dev/null; then
    info "${rc_file} already contains '${marker}' — skipping."
    return
  fi

  printf "%s" "${block}" >> "${rc_file}"
  success "Updated ${rc_file}"
}

# ─── Banner ───────────────────────────────────────────────────────────────────

echo ""
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║      Remote Approval — Copilot CLI Wrapper Installer      ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""

# ─── Pre-flight checks ────────────────────────────────────────────────────────

if ! command -v node &>/dev/null; then
  warn "Node.js is not installed. The wrapper requires Node.js >= 14."
  warn "Install it from https://nodejs.org and re-run this script."
  exit 1
fi

NODE_MAJOR=$(node -e "process.stdout.write(process.versions.node.split('.')[0])")
if [[ "${NODE_MAJOR}" -lt 14 ]]; then
  warn "Node.js ${NODE_MAJOR} is too old. Please upgrade to >= 14."
  exit 1
fi

if ! command -v npm &>/dev/null; then
  warn "npm is not installed. Please install npm and re-run."
  exit 1
fi

if [[ ! -f "${WRAPPER_PATH}" ]]; then
  warn "wrapper.js not found at ${WRAPPER_PATH}"
  warn "Make sure you run this script from its own directory."
  exit 1
fi

COPILOT_REAL=$(command -v copilot 2>/dev/null || true)
if [[ -z "${COPILOT_REAL}" ]]; then
  warn "'copilot' binary not found in PATH. Install it and re-run."
  warn "The wrapper needs the real copilot binary to be available."
  # Not a fatal error — user might add it to PATH later.
else
  success "Found copilot at ${COPILOT_REAL}"
fi

# ─── Step 1: npm install ──────────────────────────────────────────────────────

echo "Step 1: Installing node-pty dependency..."
(cd "${SCRIPT_DIR}" && npm install --loglevel warn)
success "npm install complete."

# ─── Step 2 & 3: Shell aliases + env vars ─────────────────────────────────────

ALIAS_BLOCK="
# ── Remote Approval — Copilot CLI wrapper ───────────────────────────────────
# Set these to your actual relay server URL and secret token.
export REMOTE_APPROVAL_URL=\"https://YOUR_RELAY_SERVER_URL\"
export REMOTE_APPROVAL_SECRET=\"YOUR_SECRET_TOKEN\"

# Full path to the real copilot binary — avoids alias recursion.
export COPILOT_BIN=\"${COPILOT_REAL:-copilot}\"

# Override the 'copilot' command so every invocation goes through the gate.
alias copilot='node ${WRAPPER_PATH}'
# ─────────────────────────────────────────────────────────────────────────────
"

echo ""
echo "Step 2: Adding alias and env-var placeholders to shell rc files..."

ADDED_ANY=false

if [[ -f "${HOME}/.zshrc" ]] || [[ "${SHELL}" == *zsh* ]]; then
  touch "${HOME}/.zshrc"
  add_to_rc "${HOME}/.zshrc" "Remote Approval — Copilot CLI wrapper" "${ALIAS_BLOCK}"
  ADDED_ANY=true
fi

# Also update .bashrc if it exists.
if [[ -f "${HOME}/.bashrc" ]]; then
  add_to_rc "${HOME}/.bashrc" "Remote Approval — Copilot CLI wrapper" "${ALIAS_BLOCK}"
  ADDED_ANY=true
fi

if [[ "${ADDED_ANY}" == "false" ]]; then
  warn "Neither ~/.zshrc nor ~/.bashrc found. Add the following manually:"
  echo ""
  printf "%s\n" "${ALIAS_BLOCK}"
fi

# ─── Step 4: Instructions ─────────────────────────────────────────────────────

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
echo "       source ~/.zshrc"
echo ""
echo "  3. Use 'copilot' normally — the wrapper is transparent:"
echo "       copilot suggest -t shell 'list all docker containers'"
echo "       copilot explain 'git rebase -i HEAD~3'"
echo ""
echo "  When Copilot asks for execution confirmation, the wrapper"
echo "  will pause and wait for a remote approver. If the server is"
echo "  unreachable the command passes through automatically (fail open)."
echo ""
echo "  Wrapper location : ${WRAPPER_PATH}"
echo ""
