# remote-approval

> Approve or deny AI agent actions from your phone — in real time, from anywhere.

When an AI coding agent (Claude Code, GitHub Copilot CLI) wants to edit a file or run a command, it blocks and sends a push notification to your iPhone. You review the full diff and approve or deny directly from the mobile app, even when you're away from your computer.

---

## How it works

```
┌─────────────────────────────────────────────────────────────────┐
│  PC (home / work)                                               │
│                                                                 │
│  Claude Code ──── PreToolUse hook ──┐                          │
│  Copilot CLI ──── PTY wrapper ──────┤                          │
│                                     │  POST /approvals         │
└─────────────────────────────────────┼──────────────────────────┘
                                      │  (outbound HTTPS — no
                                      │   open ports needed)
                                      ▼
                          ┌───────────────────────┐
                          │   Relay Server        │
                          │   (Railway / Fly.io)  │
                          │                       │
                          │  • REST API           │
                          │  • WebSocket push     │
                          │  • Long-poll for      │
                          │    adapter response   │
                          └───────┬───────────────┘
                                  │
                    ┌─────────────┴──────────────┐
                    │                            │
                    ▼                            ▼
          Hark push notification          Expo mobile app
          (approve/deny buttons)          (real-time via WS)
                    │                            │
                    └─────────────┬──────────────┘
                                  │  POST /approvals/:id/approve
                                  │         or /deny
                                  ▼
                          Adapter unblocks
                          (exit 0 = proceed,
                           exit 1 = blocked)
```

**Key design choice:** the PC makes outbound HTTPS connections to the relay server. No ports need to be opened, no ngrok, no firewall rules — works on corporate networks.

---

## Project structure

```
remote-approval/
├── server/                   # Node.js relay server
│   ├── src/
│   │   ├── index.js          # Express + WebSocket entrypoint
│   │   ├── store.js          # In-memory approval store with auto-expiry
│   │   ├── ws.js             # WebSocket server (real-time push)
│   │   ├── hark.js           # Hark push notification integration
│   │   ├── middleware/
│   │   │   └── auth.js       # Bearer token authentication
│   │   └── routes/
│   │       ├── approvals.js  # CRUD + long-poll + approve/deny endpoints
│   │       └── callbacks.js  # Hark webhook callback handler
│   ├── .env.example
│   └── railway.toml
│
├── mobile/                   # Expo (React Native) app
│   ├── app/
│   │   ├── (tabs)/
│   │   │   ├── index.tsx     # Pending approvals list
│   │   │   ├── history.tsx   # Resolved approvals history
│   │   │   └── settings.tsx  # Connection status
│   │   └── approval/[id].tsx # Approval detail with diff viewer
│   ├── components/
│   │   ├── ApprovalCard.tsx
│   │   └── DiffViewer.tsx
│   ├── context/
│   │   └── WebSocketContext.tsx
│   └── hooks/
│       ├── useApprovals.ts
│       └── useWebSocket.ts
│
└── adapters/
    ├── claude-code/
    │   ├── hook.js           # PreToolUse hook (no dependencies)
    │   └── install.sh        # Registers hook in ~/.claude/settings.json
    └── copilot-cli/
        ├── wrapper.js        # PTY wrapper for gh copilot
        └── install.sh
```

---

## Prerequisites

- **Node.js** >= 18
- **Expo Go** app on your iPhone (App Store)
- A **Hark** account at [hark.ryan.ceo](https://hark.ryan.ceo) (for push notifications)
- A cloud host for the relay server: [Railway](https://railway.app), [Fly.io](https://fly.io), or [Render](https://render.com)

---

## Setup

### 1. Relay server

**Generate secrets:**
```bash
openssl rand -hex 32  # ADAPTER_SECRET
openssl rand -hex 32  # CALLBACK_SECRET
openssl rand -hex 32  # WS_TOKEN
```

**Deploy to Fly.io:**
```bash
npm install -g flyctl
fly auth login
cd server
fly launch
fly deploy
```

**Or deploy to Railway:**
```bash
npm install -g @railway/cli
railway login
cd server
railway init && railway up
```

**Set environment variables in your cloud dashboard:**

| Variable | Description |
|---|---|
| `ADAPTER_SECRET` | Bearer token used by adapters to POST approvals |
| `CALLBACK_SECRET` | Bearer token for Hark webhook callbacks |
| `WS_TOKEN` | Token for WebSocket authentication from the mobile app |
| `HARK_WEBHOOK_TOKEN` | Your Hark webhook token (from hark.ryan.ceo) |
| `SERVER_URL` | Your public server URL (e.g. `https://myapp.fly.dev`) |
| `APP_DEEP_LINK` | `remoteapproval://` |
| `PORT` | `3000` |

**Run locally (dev):**
```bash
cd server
cp .env.example .env   # fill in values
npm start
```

---

### 2. Hark (push notifications)

1. Download **Hark** on your iPhone
2. Go to [hark.ryan.ceo](https://hark.ryan.ceo) → create account → create a new service
3. Copy the webhook token → set as `HARK_WEBHOOK_TOKEN` on the server
4. Set the callback URL to `https://your-server.com/callbacks/:id`

When an approval is created, Hark sends a push notification with **Approve** and **Deny** inline action buttons. Tapping either calls your server back directly.

---

### 3. Mobile app (Expo)

```bash
cd mobile
npm install
cp .env.example .env.local
```

Edit `.env.local`:
```env
EXPO_PUBLIC_SERVER_URL=https://your-server.fly.dev
EXPO_PUBLIC_WS_TOKEN=your-ws-token
```

Start the dev server:
```bash
npx expo start --clear
```

Scan the QR code with **Expo Go** on your iPhone. The app connects via WebSocket and receives new approvals in real time.

---

### 4. Claude Code adapter (personal Mac)

```bash
cd adapters/claude-code
chmod +x install.sh
./install.sh
```

The installer registers a `PreToolUse` hook in `~/.claude/settings.json` and adds env var placeholders to `~/.zshrc`. Replace the placeholders:

```bash
export REMOTE_APPROVAL_URL=https://your-server.fly.dev
export REMOTE_APPROVAL_SECRET=your-adapter-secret
```

Then `source ~/.zshrc` and restart Claude Code. Every tool call (Edit, Write, Bash, Read...) will now block until you approve or deny from your phone.

**Tip:** to only gate destructive operations, edit `~/.claude/settings.json` and change the matcher:
```json
{ "matcher": "Bash|Edit|Write|MultiEdit", "hooks": [...] }
```

---

### 5. Copilot CLI adapter (work PC — Linux / WSL / Mac)

> **Important:** on the work PC you only need the adapter. Do NOT set up the server or the mobile app locally — the server is already running in the cloud and the mobile app is on your phone. Only follow the steps below.

**Requirements:** Node.js >= 18 and `gh` CLI with the Copilot extension (`gh extension install github/gh-copilot`).

```bash
# 1. Clone only what you need
git clone https://github.com/guialveess/remote-approval.git
cd remote-approval/adapters/copilot-cli

# 2. Install node-pty (native module — needs make/g++ on Linux)
#    If build tools are missing on Ubuntu/Debian:
#    sudo apt-get install -y build-essential python3
npm install

# 3. Add env vars and aliases to your shell profile
#    On Linux/WSL use ~/.bashrc; on Mac use ~/.zshrc
cat >> ~/.bashrc << 'EOF'

# ── Remote Approval ──────────────────────────────────────────────
export REMOTE_APPROVAL_URL=https://remote-approval.onrender.com
export REMOTE_APPROVAL_SECRET=<your-ADAPTER_SECRET-from-the-server>
alias copilot="node $HOME/remote-approval/adapters/copilot-cli/wrapper.js"
alias ghc="node $HOME/remote-approval/adapters/copilot-cli/wrapper.js"
# ─────────────────────────────────────────────────────────────────
EOF

source ~/.bashrc
```

Replace `<your-ADAPTER_SECRET-from-the-server>` with the value of `ADAPTER_SECRET` set in your cloud dashboard (Render / Fly.io).

**Usage** — use `copilot` or `ghc` instead of `gh copilot`:
```bash
copilot suggest -t shell "list docker containers sorted by size"
copilot explain "git rebase -i HEAD~3"
```

When Copilot suggests a command and asks for confirmation, the wrapper intercepts the prompt, sends it to the relay server, and waits. The card appears on your phone — approve or deny from the app. If the server is unreachable the command passes through automatically (fail open).

> **Note for WSL:** `node-pty` requires native build tools. If `npm install` fails with a `node-gyp` error, run `sudo apt-get install -y build-essential python3` and retry.

---

## API reference

All endpoints are on the relay server.

### Adapters

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/approvals` | `ADAPTER_SECRET` | Create an approval request |
| `GET` | `/approvals/:id/wait?timeout=300` | `ADAPTER_SECRET` | Long-poll until resolved |

### Mobile app

| Method | Path | Description |
|---|---|---|
| `GET` | `/approvals` | List approvals (`?status=pending\|resolved`, `?limit=N`) |
| `GET` | `/approvals/:id` | Get single approval |
| `POST` | `/approvals/:id/approve` | Approve |
| `POST` | `/approvals/:id/deny` | Deny |

### Hark callback

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/callbacks/:id` | `CALLBACK_SECRET` | Hark webhook — resolves approval |

### WebSocket

Connect to `ws://your-server/ws?token=WS_TOKEN`. The server pushes:

```json
{ "type": "approval:new",      "data": { ...approval } }
{ "type": "approval:resolved", "data": { ...approval } }
```

---

## Security

- All adapter-facing endpoints require `Authorization: Bearer <ADAPTER_SECRET>`
- Hark callbacks require `Authorization: Bearer <CALLBACK_SECRET>`
- WebSocket connections require `?token=WS_TOKEN`
- Secrets use constant-time comparison to prevent timing attacks
- Approvals auto-expire after 10 minutes if not resolved
- The adapter fails open (exit 0) if the server is unreachable — Claude Code continues working uninterrupted

---

## Roadmap

- [ ] Persistent storage (SQLite) — survive server restarts
- [ ] Auto-approve rules — skip approval for `Read`/`Grep` automatically  
- [ ] App icon badge — show pending count
- [ ] Haptic feedback on new approval
- [ ] Configurable expiry timeout per source
- [ ] Web dashboard as alternative to the mobile app

---

## License

MIT
