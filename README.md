<div align="center">

# 🧪 Crucible

**AI Execution Platform with Hardware-Isolated Sandboxes**

An open-source AI agent that writes, executes, and iterates on code inside MicroVM sandboxes — not Docker containers. Built for developers who want real code execution with real security.

[![Next.js](https://img.shields.io/badge/Next.js-14-black?logo=next.js)](https://nextjs.org)
[![Anthropic](https://img.shields.io/badge/Claude-Sonnet_4-orange?logo=anthropic)](https://anthropic.com)
[![Supabase](https://img.shields.io/badge/Supabase-Auth_%2B_DB-green?logo=supabase)](https://supabase.com)
[![License](https://img.shields.io/badge/License-MIT-blue)](#license)

</div>

---

## Why Crucible?

Most AI coding tools run your code in **Docker containers** — which share the host kernel and have a [well-documented history of container escapes](https://www.cybereason.com/blog/container-escape). Crucible uses **hardware-isolated MicroVMs** (Firecracker / krunvm / Lima) that boot a separate guest kernel, giving you near-native security without the overhead of full VMs.

| | Docker | Crucible (MicroVM) |
| :--- | :--- | :--- |
| Kernel | Shared with host ❌ | Separate guest kernel ✅ |
| Escape risk | Container escapes are real | VM escapes are extremely rare |
| Isolation | Namespace-based (soft) | Hardware-level (hard) |
| Boot time | ~100ms | ~300ms |

## Features

### 🧠 Agent Loop

Multi-step reasoning powered by **Claude Sonnet 4** with native `tool_use`. The agent writes code, executes it, reads results, and iterates — up to 16 iterations per session.

### 🏖️ Dual Sandbox Providers

- **Local MicroVM** — Firecracker / krunvm on your machine (macOS, Linux, Windows)
- **Remote E2B** — Cloud sandboxes via [E2B](https://e2b.dev) (zero setup)
- **Auto mode** — Probes for local MicroVM, falls back to E2B if unavailable

### 💾 Memory System

Persistent memory across conversations — facts, preferences, goals, and constraints are extracted and recalled automatically.

### 📊 Run Ledger & Audit Trail

Every agent step is logged with timing, token counts, tool calls, and costs. Export full audit manifests per session.

### 💰 Budget Controls

Configurable per-session limits on tokens, cost (USD), sandbox time, and agent iterations — all adjustable from the Settings UI.

### 🔒 Security

- **Egress allowlist** — Control which domains the sandbox can reach
- **Code risk inspection** — Auto-flags dangerous patterns (network calls, file system access)
- **Strict no-fallback** — Prevent falling back to remote when local MicroVM is preferred

### 🔌 MCP Integration

[Model Context Protocol](https://modelcontextprotocol.io/) support for external tool discovery and execution.

### 🎨 Chat Interface

Real-time SSE streaming with syntax-highlighted code, interactive chart previews (Plotly HTML), file downloads, and agent thinking indicators.

## Tech Stack

| Layer | Technology |
| :--- | :--- |
| Frontend | Next.js 14, React, Tailwind CSS, Radix UI |
| AI | Anthropic Claude (Sonnet 4 for agent, Haiku 4.5 for chat) |
| Auth & DB | Supabase (Auth, Postgres, Storage) |
| Sandbox | Local MicroVM (Firecracker / krunvm / Lima) or E2B |
| Language | TypeScript (full stack) |

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    Next.js Frontend                  │
│   Chat UI  ·  Settings  ·  Auth  ·  Sandbox Output  │
└──────────────────────┬──────────────────────────────┘
                       │ SSE Stream
┌──────────────────────▼──────────────────────────────┐
│                   API Routes (7)                     │
│  /chat  /conversations  /memory  /runs  /sandbox    │
│         /settings  /upload                           │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────┐
│              Chat Workflow Engine                     │
│  Intent Router → Agent Loop (Sonnet 4 + tool_use)   │
│                → Chat Path (Haiku 4.5)              │
│                → Legacy Pipeline (fallback)          │
├─────────────────────────────────────────────────────┤
│  Memory Manager · Run Ledger · Budget · MCP · Egress│
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────┐
│              Sandbox Providers                        │
│   ┌──────────────┐    ┌──────────────┐              │
│   │ Local MicroVM │    │  Remote E2B  │              │
│   │ (Firecracker/ │    │  (Cloud)     │              │
│   │  krunvm/Lima) │    │              │              │
│   └──────────────┘    └──────────────┘              │
└─────────────────────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────┐
│                    Supabase                          │
│   Auth · Messages · Conversations · Memory · Runs   │
│                  · File Storage                      │
└─────────────────────────────────────────────────────┘
```

## Getting Started

### Prerequisites

- **Node.js** `>=20 <25` (20.x, 22.x, or 24.x)
- **Supabase** project ([create one free](https://supabase.com/dashboard))
- **Anthropic API key** ([get one](https://console.anthropic.com/))
- *(Optional)* **E2B API key** for remote sandboxes ([get one](https://e2b.dev))

### Quickstart

```bash
git clone https://github.com/simranmultani197/termless.git
cd termless
npm run quickstart
```

The quickstart script will:

1. Validate your Node.js version
2. Create `.env.local` if missing
3. Prompt for required API keys
4. Install dependencies
5. Probe for local MicroVM runtime
6. Start the dev server at [http://localhost:3000](http://localhost:3000)

### Environment Variables

Create a `.env.local` file (or let `npm run quickstart` do it):

```env
# Required
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
ANTHROPIC_API_KEY=sk-ant-...

# Optional — Remote sandbox (if not using local MicroVM)
E2B_API_KEY=e2b_...

# Optional — App config
NEXT_PUBLIC_APP_URL=http://localhost:3000
NODE_ENV=development

# Optional — Sandbox provider
SANDBOX_PROVIDER=auto                              # auto | local_microvm | remote_e2b
LOCAL_MICROVM_TRANSPORT=local                      # local | ssh
LOCAL_MICROVM_BACKEND_CLI=limactl shell crucible-worker -- microvmctl
LOCAL_MICROVM_FALLBACK_TO_REMOTE=true              # fallback to E2B if local fails

# Optional — MCP (Model Context Protocol)
MCP_ENABLED=false
MCP_DYNAMIC_DISCOVERY=false
```

## Local MicroVM Setup

### macOS (Apple Silicon recommended)

```bash
npm run microvm:setup:macos
npm run microvm:probe          # verify it works
```

### Linux

```bash
npm run microvm:setup:linux
npm run microvm:probe
```

### Windows (Hyper-V)

```powershell
npm run microvm:setup:windows
npm run microvm:probe
```

Once probe passes, set in `.env.local`:

```env
SANDBOX_PROVIDER=local_microvm
LOCAL_MICROVM_TRANSPORT=local
LOCAL_MICROVM_FALLBACK_TO_REMOTE=false
```

> See [Local MicroVM Provider Contract](docs/architecture/local-microvm-provider-contract.md) for the full CLI spec and transport details.

## Demo

### Runtime Demo (no UI)

Verify the full MicroVM flow end-to-end:

```bash
npm run demo:microvm
```

This will probe → create sandbox → write Python → execute → read artifact → cleanup.

### Product Demo (UI)

1. `npm run quickstart`
2. Open Settings → confirm provider mode (`Auto` or `Local MicroVM`)
3. Click **Test Local MicroVM** to verify
4. In chat, try: *"Plot Apple's stock price for the last 6 months"*

## Available Scripts

| Script | Description |
| :--- | :--- |
| `npm run quickstart` | Full setup + start |
| `npm run dev` | Start dev server |
| `npm run dev:clean` | Clear `.next` cache + start |
| `npm run build` | Production build |
| `npm run lint` | Run ESLint |
| `npm run microvm:probe` | Test local MicroVM connectivity |
| `npm run microvm:setup:macos` | Install krunvm worker (macOS) |
| `npm run microvm:setup:linux` | Install worker (Linux) |
| `npm run microvm:setup:windows` | Install Hyper-V worker (Windows) |
| `npm run demo:microvm` | Run MicroVM end-to-end demo |

## Project Structure

```
src/
├── app/                    # Next.js pages + API routes
│   ├── api/
│   │   ├── chat/           # SSE streaming chat endpoint
│   │   ├── conversations/  # CRUD conversations
│   │   ├── memory/         # Memory facts + summaries
│   │   ├── runs/           # Run ledger queries
│   │   ├── sandbox/        # Sandbox status + control
│   │   ├── settings/       # User preferences
│   │   └── upload/         # File upload to Supabase Storage
│   ├── (auth)/             # Login + Signup pages
│   ├── chat/               # Chat UI page
│   └── settings/           # Settings UI page
├── components/
│   ├── chat/               # ChatWindow, MessageBubble, SandboxOutput
│   ├── layout/             # Header, Sidebar
│   └── settings/           # Provider settings
├── lib/
│   ├── llm/                # Anthropic client, prompts, agent tools
│   ├── mcp/                # MCP server manager + config
│   ├── memory/             # Memory manager (facts, summaries)
│   ├── runs/               # Run ledger + manifest signing
│   ├── sandbox/            # Sandbox manager, providers, probe
│   ├── security/           # Egress allowlist
│   ├── supabase/           # Supabase client helpers
│   ├── usage/              # Budget, rate limits, quota
│   ├── utils/              # SSE stream helper
│   └── workflow/           # Chat workflow engine
├── types/                  # TypeScript type definitions
└── instrumentation.ts      # MCP lifecycle hooks
supabase/
└── migrations/             # 7 database migrations
docs/
└── architecture/           # Architecture docs + diagrams
scripts/
├── quickstart.sh           # Setup script
├── microvmctl.js           # MicroVM CLI wrapper
├── demo/                   # Demo scripts
├── macos/                  # macOS setup scripts
├── linux/                  # Linux setup scripts
└── windows/                # Windows setup scripts
```

## Database Setup

Crucible uses Supabase with 7 migrations:

1. `001_initial_schema` — Users, conversations, messages
2. `002_run_ledger` — Execution audit trail
3. `003_memory_layer_v2` — Facts + summaries
4. `004_memory_governance` — Memory TTL + pruning
5. `005_sandbox_provider` — Provider preferences
6. `006_sandbox_provider_auto` — Auto-detection support
7. `007_strict_no_fallback` — No-fallback setting

Apply migrations via the [Supabase CLI](https://supabase.com/docs/guides/cli):

```bash
supabase db push
```

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.
