# Remote Approval — Claude Code Context

AI-powered remote approval gate. When an agent (Claude Code, Copilot CLI) wants to execute an action, it blocks and sends a notification to the developer's iPhone. The developer approves or denies from the Expo mobile app.

## Project structure

```
remote-approval/
├── server/          # Node.js relay server (deployed on Render)
├── mobile/          # Expo app (React Native, Expo Go compatible)
└── adapters/
    ├── claude-code/ # PreToolUse hook for Claude Code
    └── copilot-cli/ # PTY wrapper for GitHub Copilot CLI
```

## Running locally

**Server:**
```bash
cd server
node src/index.js
# Runs on http://localhost:3000
```

**Mobile app:**
```bash
cd mobile
npx expo start --clear
# Scan QR with Expo Go on iPhone
```

## Environment variables

**Server** (`server/.env`):
```
PORT=3000
ADAPTER_SECRET=...       # bearer token for adapter requests
CALLBACK_SECRET=...      # bearer token for Hark webhook callbacks
WS_TOKEN=...             # token for WebSocket auth
HARK_WEBHOOK_TOKEN=...   # from hark.ryan.ceo
SERVER_URL=...           # public URL (https://remote-approval.onrender.com in prod)
APP_DEEP_LINK=remoteapproval://
```

**Mobile** (`mobile/.env.local`):
```
EXPO_PUBLIC_SERVER_URL=https://remote-approval.onrender.com
EXPO_PUBLIC_WS_TOKEN=...
```

## Production

- **Server:** deployed on Render at `https://remote-approval.onrender.com`
- **Repo:** `github.com/guialveess/remote-approval`
- Render auto-deploys on push to `main`

## Key architecture decisions

- **Outbound-only from PC:** adapters connect out to the relay server via HTTPS — no open ports, works on corporate firewalls
- **Fail-open:** if the server is unreachable, adapters exit 0 so Claude Code continues uninterrupted
- **In-memory store:** approvals are stored in memory — server restart clears history. Auto-expiry at 10 minutes per approval
- **WebSocket push:** the mobile app receives real-time events; no polling needed
- **`{ type: '...' }` field:** WebSocket events use `type` (not `event`) — the server broadcasts `{ type, data }`

## Server API

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/approvals` | `ADAPTER_SECRET` | Create approval (adapters) |
| `GET` | `/approvals/:id/wait` | `ADAPTER_SECRET` | Long-poll until resolved |
| `GET` | `/approvals` | — | List (`?status=pending\|resolved`) |
| `GET` | `/approvals/:id` | — | Get single approval |
| `POST` | `/approvals/:id/approve` | — | Approve (from app) |
| `POST` | `/approvals/:id/deny` | — | Deny (from app) |
| `POST` | `/callbacks/:id` | `CALLBACK_SECRET` | Hark webhook callback |

## Claude Code hook

Registered in `~/.claude/settings.json` as a `PreToolUse` hook with `matcher: ""` (intercepts all tools). Env vars are embedded directly in the command since Claude Code doesn't load `~/.zshrc`.

To restrict to destructive operations only, change matcher to `Bash|Edit|Write|MultiEdit`.

## Mobile app notes

- Uses **Gluestack UI v2** (`@gluestack-ui/themed`) — compatible with Expo Go, no native modules
- Animations use React Native's built-in `Animated` API — **not** `react-native-reanimated` (version mismatch with Expo Go SDK 54)
- `@expo/vector-icons` (Ionicons) for tab bar icons — bundled with Expo, no extra install

## Copilot CLI adapter (work PC)

Requires `node-pty` (native module). On the work PC:
```bash
git clone https://github.com/guialveess/remote-approval.git
cd remote-approval/adapters/copilot-cli
npm install
# Add env vars and alias to ~/.zshrc — see README
```
