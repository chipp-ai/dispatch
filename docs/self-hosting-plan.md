# Self-Hosting Plan: GCP to Home Infrastructure

> Feasibility analysis, bandwidth requirements, hardware specifications, and migration plan for moving the Chipp platform off GCP onto self-hosted hardware behind residential fiber with Cloudflare Tunnel.

**Date:** 2026-02-07
**Status:** Planning / Research Complete

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Current Infrastructure Inventory](#current-infrastructure-inventory)
3. [Traffic & Bandwidth Analysis](#traffic--bandwidth-analysis)
4. [Streaming Architecture Analysis](#streaming-architecture-analysis)
5. [Hardware Specifications](#hardware-specifications)
6. [Network Architecture](#network-architecture)
7. [Migration Plan](#migration-plan)
8. [Operational Considerations](#operational-considerations)

---

## Executive Summary

The Chipp platform currently runs on GKE Autopilot (8 nodes, ~40 pods) in GCP `us-central1`. Analysis of real production traffic data shows that **self-hosting on a single M3 Max MacBook Pro (128 GB RAM) behind 415/425 Mbps AT&T fiber with Cloudflare Tunnel is more than sufficient** for current and foreseeable traffic levels.

**Available hardware:** 1x M3 Max MacBook Pro (128 GB) + 3x M4 MacBook Pro (64 GB) = 4 machines, 320 GB RAM, ~64 CPU cores.

Key findings:
- Current bandwidth usage: ~2-5 Mbps sustained, ~15-30 Mbps peak (you have 415/425 Mbps)
- Current compute usage: ~7 vCPU, ~87 GB RAM (but ~35 GB of that is chipp-admin memory leaks)
- chipp-deno (the replacement) uses 1m CPU and 309 MB RAM with zero restarts
- No static IP needed -- Cloudflare Tunnel handles ingress
- No Caddy needed -- Cloudflare for SaaS handles custom domain TLS, k3s Traefik handles internal routing
- 4-node k3s cluster across all MacBooks preserves existing Kubernetes/Helm investment
- Estimated GCP spend: **~$3,800-5,100/month** (calculated from Autopilot resource requests + infrastructure)
- Estimated self-hosted costs: ~$40-50/month (electricity, backups, Cloudflare)
- **Estimated savings: ~$3,750-5,050/month ($45,000-60,000/year)**

---

## Current Infrastructure Inventory

### GKE Autopilot Cluster (8 Nodes)

Collected 2026-02-07 from production cluster:

| Node | CPU Used | CPU % | RAM Used | RAM % |
|------|----------|-------|----------|-------|
| gk3-...-hmcb | 1082m | 6% | 14,254 Mi | 24% |
| gk3-...-t4nq | 454m | 2% | 11,009 Mi | 18% |
| gk3-...-vwm5 | 708m | 4% | 9,939 Mi | 17% |
| gk3-...-m9cx | 1399m | 8% | 11,880 Mi | 20% |
| gk3-...-kcdx | 697m | 4% | 13,324 Mi | 22% |
| gk3-...-q78h | 1009m | 6% | 8,879 Mi | 15% |
| gk3-...-h2t8 | 770m | 4% | 9,887 Mi | 16% |
| gk3-...-sw4q | 903m | 5% | 7,624 Mi | 13% |
| **TOTAL** | **7,022m** | **~5%** | **86,796 Mi (~85 GB)** | **~18%** |

### Pod Resource Usage

| Service | Replicas | CPU Total | RAM Total | Notes |
|---------|----------|-----------|-----------|-------|
| chipp-admin (Next.js) | 20 | ~3,500m | ~35 GB | Memory leaks, 60-130 restarts/44h |
| caddy (reverse proxy) | 3 | ~43m | 420 MB | Handles custom domain TLS |
| chipp-mcp-server | 3 | ~6m | 516 MB | MCP integration server |
| chipp-landing | 2 | ~5m | 1.2 GB | Landing page |
| temporal-* (all) | 5 | ~136m | 666 MB | Workflow orchestration |
| chipp-temporal-worker | 1 | 6m | 1.17 GB | Workflow worker |
| **chipp-deno** | **1** | **1m** | **309 MB** | **New API -- zero restarts** |
| chipp-extract | 1 | 8m | 122 MB | Document extraction |
| chipp-issues | 1 | 3m | 138 MB | Issue tracker |
| voice-agent-worker | 1 | 2m | 303 MB | Voice agent |
| client-mcp-hubspot-whatsapp | 2 | ~8m | 153 MB | WhatsApp MCP |
| temporal-admintools | 1 | 11m | ~0 MB | Admin tools |

### External GCE VMs

| VM | Type | Zone | Role |
|----|------|------|------|
| caddy-ingress-a1 | e2-medium (2 vCPU, 4 GB) | us-central1-a | Custom domain ingress |
| caddy-ingress-c1 | e2-medium (2 vCPU, 4 GB) | us-central1-c | Custom domain ingress |
| chipp-uptime | e2-micro | us-central1-a | Uptime monitor |

### Load Balancers & Forwarding Rules

| Endpoint | IP | Role |
|----------|-----|------|
| cdn-chipp-ai (Global HTTPS) | 34.54.87.86 | CDN for static assets |
| chipp-admin-production (GKE Ingress) | 34.149.154.110 | *.chipp.ai → chipp-admin |
| chipp-issues (GKE Ingress) | 136.110.232.40 | Chipp Issues |
| chipp-mcp-server (GKE Ingress) | 34.110.198.120 | MCP server |
| grafana (GKE Ingress) | 34.54.199.137 | Grafana monitoring |
| caddy-production (Regional NLB) | 34.46.64.245 | Custom domains → caddy pods |
| caddy-ingress (Regional) | 34.27.228.176 | HTTP/HTTPS custom domain entry |

### Databases & Storage

| Service | Type | Details |
|---------|------|---------|
| PostgreSQL 16 | Cloud SQL / In-cluster | `chipp_deno` DB, 4 schemas (app, chat, rag, billing), pgvector |
| Redis | In-cluster | Cache, pub/sub (WebSocket), rate limiting |
| Temporal DB | PostgreSQL | Separate database for workflow state |
| Cloudflare R2 | Object storage | Brand assets (logos, favicons) |
| Google Cloud Storage | Object storage | Files, images, Loki log chunks |
| Loki | In-cluster | Log aggregation, 30-day retention, GCS backend |
| Grafana | In-cluster | Dashboards, alerting |

### External Services (Cannot be self-hosted)

- Stripe (billing, payments, LLM token billing proxy at llm.stripe.com)
- OpenAI / Anthropic / Google AI (LLM inference)
- Cloudflare (DNS, CDN, R2 storage, Tunnel)
- Twilio (WhatsApp/SMS)
- PostMark / SMTP2GO (transactional email)
- LiveKit (voice/video real-time)
- Firecrawl (web scraping)
- Linear (issue tracking integration)

---

## Traffic & Bandwidth Analysis

### Data Sources

All data collected 2026-02-07 from production systems.

### caddy-ingress GCE VMs (Custom Domain Traffic)

These VMs are the external border for all custom domain traffic. Both have been running **491 days**.

| VM | Inbound (RX) | Outbound (TX) |
|----|-------------|---------------|
| caddy-ingress-a1 | 4,393,025,228,917 bytes (4.39 TB) | 4,650,745,634,513 bytes (4.65 TB) |
| caddy-ingress-c1 | 3,690,997,954,956 bytes (3.69 TB) | 3,977,956,512,243 bytes (3.98 TB) |
| **Combined** | **8.08 TB** | **8.63 TB** |

**Averages over 491 days:**
- Inbound: 16.5 GB/day (~1.5 Mbps sustained)
- Outbound: 17.6 GB/day (~1.6 Mbps sustained)

*Note: These VMs handle only custom domain traffic. *.chipp.ai traffic goes through GKE Ingress separately.*

### Caddy K8s Pod Network Stats (Current Rate)

| Pod | Uptime | RX | TX |
|-----|--------|-----|-----|
| caddy-7fb6b4fb46-8lvw9 | 45h | 13.48 GB | 14.37 GB |
| caddy-7fb6b4fb46-bt8vg | 6h | 1.74 GB | 1.85 GB |
| caddy-7fb6b4fb46-snm9z | 6h | 1.57 GB | 1.68 GB |

Extrapolated current rate: ~20-27 GB/day through the caddy path.

### chipp-admin Pod Network (Includes Internal Traffic)

Sample of 3 long-running pods (45h):
- Average per pod: RX ~35.9 GB, TX ~20.9 GB
- 20 pods total: ~384 GB/day RX, ~224 GB/day TX
- Most of this is internal (DB queries, Temporal, health checks, inter-service)

### Log Volume (Loki, 24-hour window)

| App | Lines/24h | Lines/hr Avg |
|-----|-----------|-------------|
| chipp-admin | 1,828,655 | 228,582 |
| chipp-mcp-server | 296,395 | 49,399 |
| client-mcp | 206,938 | 34,490 |
| chipp-temporal-worker | 202,398 | 33,733 |
| temporal | 87,678 | 10,960 |
| caddy | 33,293 | 1,332 |
| voice-agent-worker | 23,961 | 1,997 |
| chipp-deno | 15,529 | 2,588 |
| chipp-landing | 4,950 | 198 |
| chipp-issues | 3,671 | 184 |
| chipp-extract | 30 | 30 |
| **TOTAL** | **~2,703,498** | **~363,493** |

**Peak burst:** 809,766 chipp-admin lines in a single hour (2026-02-07 17:00 UTC)

### 7-Day Log Volume (chipp-admin)

| Date | Lines |
|------|-------|
| 2026-02-06 | 215,749 |
| 2026-02-07 | 2,297,854 |

### Estimated Total External Bandwidth

Combining caddy-ingress VM traffic (custom domains) with GKE Ingress traffic (*.chipp.ai):

| Metric | Sustained Average | Peak (Burst) |
|--------|-------------------|--------------|
| Inbound from internet | ~25-40 GB/day (~2-4 Mbps) | ~10-20 Mbps |
| Outbound to internet | ~30-50 GB/day (~3-5 Mbps) | ~15-30 Mbps |
| Outbound to LLM APIs | ~5-15 GB/day (~0.5-1.5 Mbps) | ~5-10 Mbps |

### With Cloudflare in Front

Cloudflare caches static assets at edge, reducing origin bandwidth by 60-80% for page loads:

| Metric | Origin Server Needs |
|--------|-------------------|
| Sustained inbound | ~1-2 Mbps |
| Sustained outbound | ~2-4 Mbps |
| Peak inbound | ~10-15 Mbps |
| Peak outbound | ~15-25 Mbps |

### Available Bandwidth

**AT&T Fiber: 415 Mbps down / 425 Mbps up** (tested 2026-02-07)
- Ping: 15ms
- Location: Abbeville, SC (West Carolina)
- Connection: Multi-connection fiber
- **Headroom: 10-15x current peak requirements**

---

## Streaming Architecture Analysis

### Current Flow

```
Client (Svelte SPA)
  → POST /consumer/:appNameId/chat/stream
    → Deno API (Hono SSE)
      → Stripe Token Billing (llm.stripe.com)
        → LLM Provider (OpenAI/Anthropic/Google)
          → Streamed response back through all 3 hops
```

### Can We Delegate Streaming Directly to Stripe?

**No.** The server performs critical logic at every phase that cannot be moved to the client.

#### Phase 1: Before Streaming (~50-150ms)

1. **Consumer auth middleware** -- resolve app from slug, verify session cookie/bearer token
2. **Request validation** -- Zod schema for message, sessionId, audio, video
3. **Session management** -- validate ownership, create new session if needed, fire notifications
4. **Parallel context gathering** (4 concurrent DB queries):
   - `hasKnowledgeSources(app.id)` -- check for RAG
   - `chatService.getSessionMessages()` -- full chat history
   - `chatService.getUserMemories()` -- personalization
   - `chatService.getBillingContext()` -- Stripe customer ID + sandbox flag
5. **Credit check** -- 402 if consumer has no credits
6. **Model selection** -- app config + dev override header
7. **Audio processing** -- native audio or Whisper transcription fallback
8. **User message persistence** -- save to DB before LLM call
9. **Multiplayer broadcast** -- push user message to other participants via WebSocket
10. **Human takeover check** -- skip AI if session is in human mode
11. **System prompt construction** -- with RAG hints and current datetime
12. **History reconstruction** -- cross-model tool call format normalization
13. **Tool registration** -- RAG tools, custom actions, web tools

#### Phase 2: During Streaming

**Layer 1: StripeTokenBillingProvider.stream()** (`src/llm/providers/stripe-token-billing.ts`)
- Maps model names to Stripe format (e.g., `gpt-4o` → `openai/gpt-4o`)
- Routes to Stripe API key (production or sandbox)
- Sets `X-Stripe-Customer-ID` header for billing attribution
- **Gemini bypass**: Video/audio with Gemini skips Stripe entirely (1MB payload limit)
- **Responses API fork**: o1-pro, o3-pro, gpt-5 use `/responses` endpoint
- BYOK credential injection for OpenAI models
- Model parameter transformation (strip unsupported params)
- Parses tool calls incrementally from stream

**Layer 2: agentLoop()** (`src/agent/loop.ts`)
- Up to 10 iterations of LLM → tool execution → LLM
- Executes server-side tools (pgvector RAG search, custom HTTP actions, web browsing)
- Checks abort signal on client disconnect

**Layer 3: withOnComplete()** (`src/agent/completion.ts`)
- Transparent passthrough, accumulates full response
- Fires onComplete callback once stream exhausts

**Layer 4: SSE formatting** (`src/api/routes/consumer/chat.ts`)
- Hono `streamSSE()` for response
- Formats chunks as typed SSE events (text-delta, tool-input-start, tool-output-available, finish)
- **Multiplayer broadcasting**: every chunk pushed to other participants via WebSocket

#### Phase 3: After Streaming

1. **Message persistence** -- save assistant response + tool calls to DB
2. **Title generation** -- fire-and-forget LLM call for session title
3. **Token usage recording** -- insert into `billing.token_usage`
4. **Consumer credit deduction** -- per-message billing
5. **Multiplayer cleanup** -- unregister active stream

#### Hard Blockers for Direct Client Streaming

| Blocker | Why |
|---------|-----|
| Billing credentials | Stripe API key + customer ID would be exposed to browser |
| Tool execution | pgvector RAG, custom actions require server-side DB/network access |
| BYOK routing | Different billing paths per org |
| Gemini bypass | Some models skip Stripe entirely, route to Google |
| Responses API | Different endpoint/format for GPT-5/o-series |
| Message persistence | Must save to DB after streaming |
| History reconstruction | Cross-model format normalization requires DB |

#### Proxy Overhead Assessment

The actual overhead per stream chunk is **negligible**:

| Stage | Overhead |
|-------|----------|
| Stripe proxy receive (OpenAI SDK iterator) | ~1ms/chunk |
| Agent loop yield | Negligible |
| withOnComplete yield | Negligible |
| SSE JSON.stringify + writeSSE | ~0.1ms/chunk |

**The proxy is not the bottleneck.** Real latency comes from:
- Time to first token from LLM: 200ms-2s (model-dependent)
- Pre-stream DB queries: ~50-150ms

### Key Streaming Files

| File | Role |
|------|------|
| `src/api/routes/consumer/chat.ts` | Entry point, SSE formatting, session management |
| `src/services/chat.service.ts` | DB operations, billing context |
| `src/api/middleware/consumerAuth.ts` | App resolution, session verification |
| `src/llm/adapter.ts` | `createAdapterWithBilling()` |
| `src/llm/providers/stripe-token-billing.ts` | Core proxy to llm.stripe.com |
| `src/llm/providers/stripe-model-mapping.ts` | Model name translation, capability flags |
| `src/llm/types.ts` | StreamChunk, BillingContext, LLMProvider |
| `src/agent/loop.ts` | Tool execution loop |
| `src/agent/completion.ts` | withOnComplete() for persistence |
| `web/src/stores/consumerChat.ts` | Client-side SSE parsing, UI state |

---

## Hardware Specifications

### Available Hardware

| Machine | Chip | Memory | CPU Cores | Role |
|---------|------|--------|-----------|------|
| MacBook Pro 16" (Nov 2023) | Apple M3 Max | 128 GB | 16 (12P + 4E) | **Development machine** (not in cluster) |
| MacBook Pro #2 | Apple M4 | 64 GB | ~12-14 | k3s server + primary services |
| MacBook Pro #3 | Apple M4 | 64 GB | ~12-14 | k3s worker -- data services |
| MacBook Pro #4 | Apple M4 | 64 GB | ~12-14 | k3s worker -- ops (monitoring, CI, PG replica) |
| **Production cluster** | | **192 GB** | **~36-42 cores** | 3-node k3s cluster |

**The M3 Max is the dev machine.** The production workload after chipp-admin retirement is ~7 vCPU and ~50 GB RAM -- the three M4s (192 GB total) handle that with massive headroom.

### Why MacBook Pros Work

| Concern | Assessment |
|---------|------------|
| Docker on macOS | OrbStack provides near-native Linux container performance |
| Thermal | ~5-10% CPU utilization -- fans won't spin up |
| Uptime | macOS is stable for server workloads; auto-restart on crash |
| ARM (Apple Silicon) | All containers are multi-arch or ARM-native (Deno, Node, PostgreSQL, Redis) |
| Power efficiency | M3 Max idles at ~15-20W vs 200-400W for a rack server |

### Recommended Configuration: 3-Node k3s Cluster + Dev Machine

The three M4s form a k3s cluster. The M3 Max stays as the development machine with `kubectl` access to the cluster. This preserves existing Helm charts, k8s manifests, and CI/CD pipelines from GKE with minimal changes.

#### k3s Cluster Setup

```bash
# On M4 #1 (k3s server + worker)
curl -sfL https://get.k3s.io | sh -

# Get the join token
cat /var/lib/rancher/k3s/server/node-token

# On M4 #2 and M4 #3 (k3s agents)
curl -sfL https://get.k3s.io | K3S_URL=https://10.0.1.10:6443 \
  K3S_TOKEN=<token> sh -

# On M3 Max (dev machine -- kubectl access only, not a cluster node)
# Copy kubeconfig from M4 #1:
scp m4-primary:/etc/rancher/k3s/k3s.yaml ~/.kube/config
# Edit server URL to point to M4 #1's IP:
sed -i '' 's/127.0.0.1/10.0.1.10/' ~/.kube/config
```

#### Node Labels (Control Placement)

```bash
kubectl label node m4-primary role=primary
kubectl label node m4-data role=data
kubectl label node m4-ops role=ops
```

#### M3 Max 128 GB -- Development Machine (NOT in the k3s cluster)

The M3 Max is reserved for active development. It is **not** a k3s node.

- Claude Code, IDE, browser, Docker, local dev server (`./scripts/dev.sh`)
- 128 GB RAM means Claude Code, multiple IDE windows, dozens of browser tabs, Docker containers, and a local dev server all run simultaneously without swapping
- `kubectl` access to the k3s cluster over the local network for deploys and debugging
- Can run a full local stack (`./scripts/dev.sh`) independently of the production cluster
- M3 Max GPU cores available for local ML experimentation if needed

The production workload after chipp-admin retirement is ~7 vCPU and ~50 GB RAM. Three M4s with 64 GB each (192 GB total) handle that with massive headroom.

#### M4 #1 (64 GB) -- Primary (k3s Server + App Services + PostgreSQL)

| Component | Resource Allocation | nodeSelector |
|-----------|-------------------|-------------|
| PostgreSQL 16 (primary) | 4 cores, 32 GB RAM | `role: primary` |
| chipp-deno | 1 core, 512 MB RAM | none |
| chipp-landing | 1 core, 512 MB RAM | none |
| chipp-mcp-server | 1 core, 512 MB RAM | none |
| voice-agent-worker | 1 core, 512 MB RAM | none |
| chipp-extract | 1 core, 256 MB RAM | none |
| client-mcp-hubspot-whatsapp | 1 core, 256 MB RAM | none |
| cloudflared (Tunnel daemon) | 1 core, 128 MB RAM | `role: primary` |
| k3s server + Traefik | 1 core, 512 MB RAM | built-in |
| **TOTAL** | **~11 cores, ~35 GB RAM** | |
| **Available** | **~12-14 cores, 64 GB RAM** | |
| **Headroom** | **~29 GB RAM free** | |

*Note: CPU overcommit is fine -- actual usage is ~2-3 cores. The "allocation" is limits, not requests. chipp-admin and Temporal are eliminated -- chipp-deno replaces chipp-admin, and Temporal workflows are replaced with direct async processing.*

#### M4 #2 (64 GB) -- Data Services + Client Namespaces

| Component | Resource Allocation | nodeSelector |
|-----------|-------------------|-------------|
| Redis | 1 core, 4 GB RAM | `role: data` |
| MinIO (object storage) | 1 core, 2 GB RAM | `role: data` |
| Client namespaces (alfredo, gener8tor, srg, etc.) | 4 cores, 8 GB RAM | none |
| k3s agent | 1 core, 256 MB RAM | built-in |
| **TOTAL** | **~7 cores, ~14 GB RAM** | |
| **Available** | **~12-14 cores, 64 GB RAM** | |
| **Headroom** | **~50 GB RAM free** | |

#### M4 #3 (64 GB) -- Ops (Monitoring + Dispatch + CI + PG Replica)

| Component | Resource Allocation | nodeSelector |
|-----------|-------------------|-------------|
| Loki | 2 cores, 2 GB RAM | `role: ops` |
| Grafana | 1 core, 1 GB RAM | `role: ops` |
| chipp-issues (Dispatch) | 1 core, 512 MB RAM | `role: ops` |
| PostgreSQL replica (streaming replication) | 4 cores, 16 GB RAM | `role: ops` |
| GitHub Actions self-hosted runner | 4 cores, 16 GB RAM | `role: ops` |
| k3s agent | 1 core, 256 MB RAM | built-in |
| **TOTAL** | **~13 cores, ~36 GB RAM** | |
| **Available** | **~12-14 cores, 64 GB RAM** | |
| **Headroom** | **~28 GB RAM free** | |

**Why monitoring is isolated from primary:** Loki is I/O heavy during log ingestion and Grafana dashboard queries. A `topk(10, ...)` query over 7 days scans hundreds of MB of compressed log chunks. On a separate machine, Loki can thrash without causing PostgreSQL query latency spikes.

**Why Dispatch is here:** chipp-issues receives Grafana alert webhooks. Keeping it on the same machine as Grafana means the webhook call is machine-local -- zero network latency for alert delivery.

**Why the GH Actions runner matters:** The autonomous error remediation pipeline (Loki errors -> Grafana alerts -> Chipp Issues -> GitHub Actions -> Claude Code -> fix PRs) runs Claude Code sessions inside GitHub Actions. A self-hosted runner means these sessions run on your own hardware with full local caching, no queuing behind GitHub's shared pool, and direct k8s API access for deploys. With 16 GB RAM allocated, multiple concurrent Claude Code investigation sessions can run simultaneously. This is the engine behind autonomous development -- the more headroom here, the more issues get fixed while you sleep.

**CI/CD benefit beyond autonomous dev:** Normal CI (Docker builds, deploys, tests) also runs locally with full layer caching. Deploys go directly to the local k3s cluster over the pod network -- no round-trip through the internet.

### Inter-Service Communication

**k3s handles everything automatically.** No manual IP management or firewall rules between services.

#### Service Discovery (CoreDNS -- built into k3s)

Every Kubernetes service gets a DNS name:

```
postgresql.default.svc.cluster.local      → M4 #1 (primary)
redis.default.svc.cluster.local           → M4 #2 (data)
minio.default.svc.cluster.local              → M4 #2 (data)
loki.monitoring.svc.cluster.local         → M4 #3 (ops)
grafana.monitoring.svc.cluster.local      → M4 #3 (ops)
chipp-issues.default.svc.cluster.local    → M4 #3 (ops)
```

Application configs don't change -- they already use Kubernetes service names from GKE.

#### Networking (Flannel VXLAN -- built into k3s)

Every pod gets a cluster IP. Traffic between machines is encrypted and routed automatically:

```
M4 #1 Primary (10.0.1.10)       M4 #2 Data (10.0.1.11)        M4 #3 Ops (10.0.1.12)
┌───────────────────────┐       ┌───────────────────────┐    ┌───────────────────────┐
│ Pod: chipp-deno       │       │ Pod: redis             │    │ Pod: loki              │
│   10.42.0.15     ─────│──────→│   10.42.1.8            │    │   10.42.2.5            │
│ Pod: postgresql       │       │ Pod: minio              │    │ Pod: grafana           │
│   10.42.0.16          │       │   10.42.1.9            │    │   10.42.2.6            │
│ Pod: cloudflared      │       │ Pod: minio              │    │ Pod: chipp-issues      │
│   10.42.0.17          │       │   10.42.1.10           │    │   10.42.2.7            │
└───────────────────────┘       └───────────────────────┘    └───────────────────────┘
         │                               │                            │
         └──────────── Flannel VXLAN overlay (automatic) ────────────┘
```

### Post-Migration (chipp-admin Removed)

Once chipp-admin is fully replaced by chipp-deno, resource needs drop dramatically:

| Component | Before (with chipp-admin) | After (chipp-deno only) |
|-----------|--------------------------|------------------------|
| App server CPU | ~14 cores | ~6 cores |
| App server RAM | ~30 GB | ~6 GB |
| Restarts/day | Dozens (memory leaks) | Zero |

**After migration, a single MacBook handles everything with >90% headroom.**

### Memory Leak Context

chipp-admin (Next.js) exhibits severe memory leaks:

```
Pod restarts over 44-45 hours:
  chipp-admin-...-9v2dm:  130 restarts
  chipp-admin-...-zqxkf:  122 restarts
  chipp-admin-...-zjhs9:   75 restarts
  chipp-admin-...-6swmh:   67 restarts
  chipp-admin-...-lvpr7:   69 restarts
```

That's a restart every **20-40 minutes** on the worst pods. Kubernetes is acting as a garbage collector.

chipp-deno by contrast: **309 MB RAM, 0 restarts, 56 minutes uptime and stable.** The migration to chipp-deno eliminates this problem entirely.

---

## Network Architecture

### Why Caddy Is No Longer Needed

Caddy exists in GCP only as a **legacy path for chipp-admin**. The new chipp-deno architecture already routes custom domains through Cloudflare:

1. **Cloudflare for SaaS** handles TLS provisioning for custom domains
2. **Cloudflare Worker** (`chipp-deno-spa`) handles hostname-based routing and branding injection
3. **Cloudflare KV** caches domain-to-app mappings at the edge
4. **Cloudflare R2** serves static SPA assets

The Caddy infrastructure (2 GCE VMs, 3 k8s pods, GCS cert storage) is only needed while chipp-admin still handles some custom domain traffic. Once chipp-admin is fully replaced by chipp-deno, Caddy is completely eliminated.

| Current (GCP) | Self-Hosted |
|--------------|-------------|
| caddy-ingress-a1 VM (491 days uptime, 4.39 TB traffic) | Gone |
| caddy-ingress-c1 VM (491 days uptime, 3.69 TB traffic) | Gone |
| caddy k8s pods (3 replicas, 420 MB RAM) | Gone |
| GCS cert storage (`chipp-caddy-storage`) | Gone |
| GKE Ingress + Google Managed Certs | Gone |
| 6 forwarding rules / load balancers | Gone |
| Cloudflare Worker (edge routing) | **Stays on Cloudflare (unchanged)** |
| Cloudflare for SaaS (custom domain TLS) | **Stays on Cloudflare (unchanged)** |
| Cloudflare KV (domain cache) | **Stays on Cloudflare (unchanged)** |
| Cloudflare R2 (static assets) | **Stays on Cloudflare (unchanged)** |
| **Only change:** | Worker's `API_ORIGIN` points at Tunnel instead of GKE |

### Custom Domain Routing Architecture

Custom domains are **NOT routed by Caddy or Traefik**. They're routed by the Cloudflare Worker at the edge, which stays on Cloudflare regardless of where the origin server lives.

#### Three-Layer Architecture

```
Layer 1: Cloudflare for SaaS     → TLS termination for custom domains (edge)
Layer 2: Cloudflare Worker        → Hostname lookup + routing + branding injection (edge)
Layer 3: Deno API (your server)   → Domain resolution from PostgreSQL (origin)
```

#### Two Types of Custom Domains

**Type 1: Consumer Chat Domains** (e.g., `expertpmmg.drmedprova.com` → specific chatbot)

```
1. Customer creates CNAME: expertpmmg.drmedprova.com → custom.chipp.ai
2. Cloudflare for SaaS provisions TLS cert at edge (~30 seconds)
3. Cloudflare Worker receives request, looks up hostname in 3-tier cache:
   a. In-memory Map (5 min TTL, per-isolate)
   b. Cloudflare KV namespace TENANT_CONFIG (5 min TTL)
   c. POST /api/internal/domain-lookup → Deno API → app.custom_domains table
4. Returns { type: "chat", appId, appNameId, brandStyles }
5. Worker calls proxyToAPIWithTrust() → adds trust headers:
   - X-Cloudflare-Worker: true
   - X-Worker-Auth: <shared secret>
   - X-Original-Host: expertpmmg.drmedprova.com
6. Request proxied to origin (API_ORIGIN) → Deno API consumer routes
7. Deno API reads appNameId from the trusted headers to serve correct chatbot
```

**Type 2: Whitelabel Dashboard Domains** (e.g., `dashboard.acme.com` → branded builder UI)

```
1. Customer creates CNAME: dashboard.acme.com → custom.chipp.ai
2. Cloudflare for SaaS provisions TLS cert
3. Worker looks up hostname → { type: "dashboard", tenantId, brandStyles, features }
4. Worker routes based on request path:
   - /api/*, /auth/*, /ws → proxyToAPIWithTrust() with X-Tenant-ID header
   - Static assets (.js, .css, images) → served directly from R2 bucket
   - SPA routes (everything else) → serve index.html from R2 WITH branding:
     * Injects: <script>window.__TENANT_CONFIG__={primaryColor, logoUrl, ...}</script>
     * Injects: <style>:root{--brand-color:#FF5500}</style>
     * Replaces: <title>, favicon, splash logo
5. SPA boots, reads window.__TENANT_CONFIG__, applies full whitelabel theme
```

#### Database Tables

```sql
-- app.custom_domains: one row per custom domain
hostname           | type      | app_id (chat) | tenant_id (dashboard) | ssl_status
-------------------|-----------|---------------|----------------------|----------
expert.dr.com      | chat      | uuid-123      | null                 | active
dashboard.acme.com | dashboard | null          | uuid-456             | active

-- app.whitelabel_tenants: one per Enterprise org
slug | name      | primary_color | logo_url    | features (auth/billing toggles)
-----|-----------|--------------|-------------|----------------------------------
acme | Acme Corp | #FF5500      | https://... | {isGoogleAuthDisabled: true, ...}
```

#### Two Branding Systems (Don't Conflict)

| Aspect | Platform Whitelabel | App Branding |
|--------|--------------------|----|
| CSS variable | `--brand-color` | `--consumer-primary` |
| Window global | `window.__TENANT_CONFIG__` | `window.__APP_BRAND__` |
| Scope | Entire builder dashboard | Single consumer chat |
| Target | Agencies/resellers (Enterprise) | Individual chatbots |
| Domain type | `dashboard` | `chat` / vanity subdomain |

CSS cascade: `var(--consumer-primary, var(--brand-color))` -- app branding overrides platform.

#### What Changes for Self-Hosting

**Almost nothing.** The entire custom domain system lives on Cloudflare (Worker, KV, R2, for SaaS). The only change is the `API_ORIGIN` environment variable in the Worker's `wrangler.toml`:

```
BEFORE:  API_ORIGIN = https://dino-mullet.chipp.ai  (GKE origin)
AFTER:   API_ORIGIN = https://origin.chipp.ai        (Cloudflare Tunnel → your MacBook)
```

The internal domain lookup endpoint (`POST /api/internal/domain-lookup`) continues to work because the Worker proxies to whatever `API_ORIGIN` is set to. The trust headers (`X-Worker-Auth`) work the same way. The KV cache, branding injection, R2 asset serving -- all unchanged.

#### Key Files

| File | Purpose |
|------|---------|
| `cloudflare-worker/src/index.ts` | Worker: hostname routing, domain lookup, SPA serving |
| `cloudflare-worker/src/tenant-inject.ts` | HTML injection for whitelabel dashboards |
| `cloudflare-worker/src/brand-inject.ts` | HTML injection for consumer chat branding |
| `src/services/domain.service.ts` | Domain CRUD, Cloudflare API, KV sync, domain lookup |
| `src/api/routes/domain/index.ts` | Domain REST API + internal lookup endpoint |
| `src/services/whitelabel.service.ts` | Whitelabel tenant CRUD, Enterprise tier gate |
| `src/api/middleware/workerTrust.ts` | Validates Worker trust headers |
| `web/src/stores/whitelabel.ts` | SPA-side whitelabel detection and theming |
| `db/migrations/010_add_custom_domains.sql` | custom_domains table |

### Traffic Flow

```
BEFORE (current GCP):
  Custom domain → caddy-ingress VM → Caddy (Let's Encrypt) → chipp-admin
  *.chipp.ai   → GKE Ingress (Google Managed Cert)         → chipp-admin

AFTER (self-hosted):
  ALL traffic  → Cloudflare Edge (TLS at edge)
               → Cloudflare Tunnel (encrypted)
               → cloudflared on M4 #1 (primary)
               → k3s Traefik Ingress
               → pods
```

Everything goes through one path. Cloudflare handles TLS for ALL domains at the edge. Traffic arrives at the MacBook already decrypted over the tunnel.

### Cloudflare Tunnel -- How External Traffic Reaches Your Local Network

The critical question: how does traffic from the internet get to machines sitting on a residential network with no static IP and no open ports?

**Answer: it doesn't come in. Your machines reach out.**

`cloudflared` is a daemon that runs on your MacBook and opens a persistent **outbound** connection (QUIC/HTTP2) to Cloudflare's edge network. From your ISP and router's perspective, it looks no different from a browser tab holding a long-lived HTTPS connection. No ports are opened. No firewall rules are needed. No static IP is required.

When a user hits `api.chipp.ai`, the request goes to Cloudflare's nearest edge PoP (there are 300+ worldwide). Cloudflare sees the DNS record pointing to a tunnel, and sends the request **down the already-open connection** that your `cloudflared` daemon established. `cloudflared` receives it and forwards it to the appropriate k3s service.

```
Internet User
     │
     ▼
Cloudflare Edge (nearest PoP, TLS termination, DDoS protection)
     │
     │  (Cloudflare routes based on DNS → tunnel mapping)
     ▼
Cloudflare Tunnel (persistent encrypted connection)
     ▲
     │  (outbound-only, initiated BY your MacBook)
     │
cloudflared daemon (running as k8s DaemonSet on M4 #1)
     │
     ▼
k3s Traefik Ingress Controller
     │
     ▼
Application pods (via k8s Service DNS)
```

**Why this works so well:**

1. **Zero open ports** -- your home network's attack surface is zero. No port forwarding, no NAT rules, no dynamic DNS
2. **IP changes don't matter** -- AT&T can change your IP anytime; the tunnel reconnects automatically because the connection is outbound
3. **DDoS protection for free** -- Cloudflare absorbs attacks at the edge before they ever reach your connection
4. **Your home IP is never exposed** -- users only see Cloudflare's IPs
5. **Works behind any router/ISP** -- if you can browse the web, the tunnel works
6. **Built-in redundancy** -- `cloudflared` maintains multiple connections to different Cloudflare PoPs simultaneously

**DNS setup is simple.** Instead of pointing DNS at a GCP IP, you point it at the tunnel:

```
api.chipp.ai  →  CNAME  →  <tunnel-id>.cfargotunnel.com
```

Cloudflare resolves the CNAME to the tunnel and routes the request through it. That's the entire networking setup.

### Cloudflare Tunnel Configuration

```yaml
# cloudflared tunnel config
tunnel: chipp-production
credentials-file: /etc/cloudflared/credentials.json

ingress:
  # Grafana (direct route to monitoring machine)
  - hostname: "grafana.chipp.ai"
    service: http://grafana.monitoring.svc.cluster.local:80

  # Dispatch (issue tracker)
  - hostname: "dispatch.chipp.ai"
    service: http://chipp-issues.default.svc.cluster.local:3000

  # MCP Server
  - hostname: "mcp.chipp.ai"
    service: http://chipp-mcp-server.default.svc.cluster.local:3002

  # Everything else (*.chipp.ai + custom domains) → Traefik
  - service: http://traefik.kube-system.svc.cluster.local:80
```

### k3s Traefik Ingress (Replaces Caddy + GKE Ingress)

k3s ships with Traefik as its built-in ingress controller. Hostname-based routing:

```yaml
# k8s Ingress resource (same format as GKE, works unchanged)
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: chipp-apps
spec:
  rules:
    - host: "app.chipp.ai"
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: chipp-admin
                port:
                  number: 3000
    - host: "*.chipp.ai"
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: chipp-admin
                port:
                  number: 3000
```

For custom domains, the customer adds a CNAME pointing to a Cloudflare hostname. Cloudflare for SaaS provisions a TLS cert at the edge automatically. The tunnel catch-all rule routes the request to Traefik, which routes to the correct backend based on hostname or a default catch-all.

### Custom Domain Flow (Cloudflare for SaaS)

```
1. Customer sets CNAME: expertpmmg.drmedprova.com → chipp-custom.chipp.ai
2. Cloudflare for SaaS detects the new hostname
3. Cloudflare provisions TLS certificate at edge (automatic, ~30 seconds)
4. Request hits Cloudflare edge → TLS terminated → Tunnel → Traefik → chipp-admin
5. chipp-admin reads Host header to identify the app (same logic as today)
```

No Let's Encrypt, no Caddy, no certificate storage, no rate limits.

### Local Network

```
AT&T Fiber Router (415/425 Mbps)
  │
  ├── M3 Max 128 GB (dev machine)          10.0.1.9
  │     ├── Claude Code, IDE, browser
  │     ├── kubectl access to cluster
  │     └── NOT a k3s node
  │
  ├── M4 #1 (k3s server + primary)        10.0.1.10
  │     ├── cloudflared tunnel daemon
  │     ├── k3s server + Traefik ingress
  │     ├── PostgreSQL primary
  │     ├── chipp-deno, chipp-landing
  │     └── All app service pods
  │
  ├── M4 #2 (k3s agent, data)             10.0.1.11
  │     ├── Redis
  │     ├── MinIO (object storage)
  │     └── Client namespace pods
  │
  └── M4 #3 (k3s agent, ops)              10.0.1.12
        ├── Loki (log aggregation)
        ├── Grafana (dashboards + alerting)
        ├── chipp-issues (Dispatch)
        ├── PostgreSQL replica
        └── GitHub Actions self-hosted runner
```

### Firewall Rules

- All machines: k3s Flannel handles inter-pod networking automatically
- M4 #1: Only machine with `cloudflared` (outbound tunnel only, no open inbound ports)
- All external traffic enters via Cloudflare Tunnel -- **zero open ports on the home network**
- Router firewall: Block all inbound, allow all outbound (default)
- macOS firewall: Enabled on all machines
- SSH: Key-based auth only, accessible only on local network

---

## Migration Plan

### Phase 1: k3s Cluster Setup (Week 1)

- [ ] Assign static local IPs to all 4 MacBooks (DHCP reservation on router)
- [ ] Install k3s server on M4 #1: `curl -sfL https://get.k3s.io | sh -`
- [ ] Join M4 #2 and M4 #3 as k3s agents with `K3S_URL` and `K3S_TOKEN`
- [ ] Copy kubeconfig to M3 Max (dev machine) for `kubectl` access
- [ ] Label nodes: `kubectl label node <name> role=primary|data|ops`
- [ ] Verify cluster: `kubectl get nodes` shows all 3 Ready
- [ ] Test Traefik ingress with a simple nginx deployment
- [ ] Set up Cloudflare Tunnel: install `cloudflared`, create tunnel, deploy as k8s DaemonSet on M4 #1
- [ ] Test tunnel: route a test subdomain through tunnel to nginx
- [ ] Set up GitHub Container Registry access (or keep using existing registry)

### Phase 2: Data Layer (Week 2)

- [ ] Deploy PostgreSQL 16 on M4 #1 (nodeSelector: `role: primary`)
- [ ] Configure pgvector extension
- [ ] Deploy Redis on M4 #2 (nodeSelector: `role: data`)
- [ ] Take production database dump from GKE PostgreSQL
- [ ] Restore to local PostgreSQL
- [ ] Deploy PostgreSQL replica on M4 #3 (nodeSelector: `role: ops`)
- [ ] Configure streaming replication, verify replica is in sync
- [ ] Verify data integrity

### Phase 3: Object Storage (Week 2-3)

- [ ] Deploy MinIO on M4 #2 (nodeSelector: `role: data`)
- [ ] Keep Cloudflare R2 as-is (it's already on Cloudflare, stays fast with Tunnel)
- [ ] Migrate GCS assets to MinIO or Backblaze B2
- [ ] Update application configs for new storage endpoints

### Phase 4: Application Deployment (Week 3)

- [ ] Deploy chipp-deno
- [ ] Deploy chipp-landing
- [ ] Deploy chipp-mcp-server
- [ ] Deploy voice-agent-worker, chipp-extract, chipp-issues
- [ ] Configure all k8s secrets and configmaps
- [ ] Configure Cloudflare Tunnel ingress rules (see tunnel config above)
- [ ] Set up Cloudflare for SaaS for custom domains
- [ ] Create k8s Ingress resources for Traefik routing

### Phase 5: Monitoring (Week 4)

- [ ] Deploy Loki on M4 #3 (nodeSelector: `role: ops`, local filesystem backend)
- [ ] Deploy Grafana on M4 #3 (nodeSelector: `role: ops`)
- [ ] Deploy chipp-issues (Dispatch) on M4 #3
- [ ] Import existing Grafana dashboards
- [ ] Configure alerting (webhook to chipp-issues, now machine-local)
- [ ] Deploy Promtail DaemonSet on all nodes
- [ ] Verify log ingestion from all pods

### Phase 6: CI/CD (Week 4)

- [ ] Set up GitHub Actions self-hosted runner on M4 #3 (nodeSelector: `role: ops`)
- [ ] Update deployment workflows to target local k3s cluster
- [ ] Test: push to staging branch, verify deployment reaches local cluster
- [ ] Set up Cloudflare Tunnel or WireGuard for CI → k3s API access

### Phase 7: Testing (Week 4-5)

- [ ] Smoke test all endpoints through Cloudflare Tunnel
- [ ] Test custom domain TLS via Cloudflare for SaaS (add a test domain)
- [ ] Test LLM streaming end-to-end
- [ ] Test WebSocket connections (multiplayer, real-time)
- [ ] Test webhook delivery (Stripe, WhatsApp, Slack)
- [ ] Load test with realistic traffic
- [ ] Test failover: kill M4 #1, verify M4 #3 DB replica is current
- [ ] Test monitoring: inject error, verify Grafana alert → chipp-issues webhook

### Phase 8: Cutover (Week 5-6)

- [ ] Put GKE in read-only mode
- [ ] Take final database dump
- [ ] Restore to local PostgreSQL, verify replica catches up
- [ ] Point DNS: update Cloudflare to route through Tunnel instead of GKE IPs
- [ ] Migrate custom domains: update Cloudflare for SaaS fallback origin
- [ ] Verify all traffic flowing through home infrastructure
- [ ] Monitor for 48 hours

### Phase 9: Decommission (Week 7-8)

- [ ] Keep GKE running as cold standby for 2 weeks
- [ ] Monitor stability and performance
- [ ] Decommission caddy-ingress GCE VMs
- [ ] Decommission GKE cluster
- [ ] Delete forwarding rules and load balancers
- [ ] Cancel/downsize GCP project (keep GCS/R2 if still used for backups)
- [ ] Archive final GCP data

---

## Operational Considerations

### Container Orchestration

**k3s** (lightweight Kubernetes) across all 4 MacBooks.

- 3-node cluster: 1 server (M4 #1) + 2 agents (M4 #2, M4 #3) + M3 Max as dev machine with kubectl access
- Preserves existing Helm charts, k8s manifests, and CI/CD pipelines from GKE
- Built-in: Traefik ingress, CoreDNS, Flannel networking, local storage
- Changes needed: point `kubectl` at k3s, update CI/CD deploy target
- k3s Traefik replaces both Caddy and GKE Ingress

### Backup Strategy

| What | How | Frequency | Retention |
|------|-----|-----------|-----------|
| PostgreSQL | pg_dump → Backblaze B2 | Daily (full) + hourly (WAL) | 30 days |
| Redis | RDB snapshots → local disk | Hourly | 7 days |
| MinIO objects | Sync to B2 | Daily | 30 days |
| Application configs | Git (already versioned) | On change | Forever |
| Loki data | Local only (logs are ephemeral) | N/A | 30 days |

### UPS / Power

Already in place:
- Uninterruptible power supply (UPS)
- Generator backup
- Solar power

Recommended: Configure macOS Energy Settings to restart after power failure.

### Monitoring & Alerting

- Loki + Grafana continue as-is (just running locally instead of GKE)
- Grafana alerting → Chipp Issues webhook (already built)
- Add: uptime monitoring from external service (e.g., Cloudflare Health Checks, free)
- Add: disk space alerts (local SSD filling up)

### Security

| Measure | Implementation |
|---------|---------------|
| Network isolation | Cloudflare Tunnel (zero open ports on home network) |
| TLS | Cloudflare edge (external) + k3s internal (pod-to-pod encrypted via Flannel) |
| SSH | Key-based only, no password auth |
| Secrets | Environment variables (migrate from k8s secrets) |
| Updates | macOS auto-update + container image updates |
| Firewall | macOS firewall + Cloudflare WAF |

### Cost Comparison

**GCP costs calculated from actual Autopilot resource requests** (collected 2026-02-07). GKE Autopilot bills per-pod based on resource requests, not node count.

#### GCP Compute Breakdown (Autopilot Pricing: $0.0445/vCPU/hr + $0.00490/GB/hr)

| Category | Pods | vCPU | RAM (GB) | Cost/mo |
|----------|------|------|----------|---------|
| GKE System (kube-system) | 136 | 73.9 | 15.5 | $2,455 |
| chipp-admin (Next.js) | 20 | 24.6 | 160.0 | $1,373 |
| Client namespaces (alfredo, gener8tor, srg, ifda, nexalab, cstudio) | 14 | 12.7 | 38.0 | $546 |
| Monitoring (Loki/Grafana) | 11 | 3.8 | 9.5 | $156 |
| Temporal | 7 | 2.9 | 8.0 | $124 |
| Other (caddy, landing, issues, MCP, deno, voice, extract) | 24 | 1.9 | 7.8 | $90 |
| **Compute Subtotal** | **212** | **119.7** | **238.8** | **$4,744/mo** |

#### Full Cost Summary

| Item | GCP (Current) | Self-Hosted |
|------|--------------|-------------|
| Autopilot compute (119.7 vCPU, 238.8 GB) | $4,744/mo | $0 (owned MacBooks) |
| Autopilot cluster management fee | $73/mo | $0 |
| Load balancers (6 active forwarding rules) | $110/mo | $0 (Cloudflare Tunnel + Traefik) |
| Static IPs (6 idle) | $44/mo | $0 |
| Persistent disks (437 GB) | $44/mo | $0 (local NVMe) |
| GCS storage (~50 GB) | $20/mo | $0 (local MinIO / keep R2) |
| Network egress (~500 GB/mo) | $50/mo | $0 (Cloudflare caches + Tunnel) |
| Cloud Logging/Monitoring | $30/mo | $0 (local Loki/Grafana) |
| **Subtotal GCP** | **~$5,114/mo** | -- |
| *With sustained use discounts (~20%)* | *~$3,835-4,347/mo* | -- |
| Cloudflare (Pro plan + for SaaS) | -- | $20/mo |
| Backblaze B2 (backups) | -- | ~$5/mo |
| Electricity (4 MacBooks, mostly idle at 15-20W each) | -- | ~$15-25/mo |
| Internet (AT&T Fiber 415/425) | -- | Existing cost |
| **Subtotal Self-Hosted** | -- | **~$40-50/mo** |
| | | |
| **Monthly Savings** | -- | **~$3,790-5,070/mo** |
| **Annual Savings** | -- | **~$45,500-60,800/yr** |

#### What Drives the GCP Cost

The two biggest line items — and the biggest savings opportunities:

1. **GKE System overhead ($2,455/mo):** Autopilot runs 136 system pods (kube-dns, metrics-server, fluentbit, gke-metadata-server per node, etc.) and bills for their resource requests. k3s system components are negligible by comparison.

2. **chipp-admin ($1,373/mo):** The legacy Next.js app requires 20 replicas with 8 GB RAM each due to memory leaks (60-130 restarts per 44 hours). Once chipp-deno fully replaces it, this entire cost disappears — chipp-deno uses 0.1 vCPU and 309 MB with zero restarts.

Together these two items account for **$3,828/mo (75%)** of the compute bill. Even before self-hosting, completing the chipp-deno migration and finding a way to reduce kube-system overhead would cut costs dramatically.

*Note: Costs calculated from Autopilot list pricing (us-central1, Feb 2026). Sustained use discounts (SUDs) typically reduce compute by ~20%. Your actual bill may be in the $3,835-4,347/mo range after SUDs. Check GCP Console > Billing for exact invoiced amounts.*

---

## Appendix: Raw Data Collection Commands

### Network stats from caddy-ingress VMs (via IAP tunnel)

```bash
gcloud compute ssh caddy-ingress-a1 --zone=us-central1-a --project=chippai-398019 \
  --tunnel-through-iap --command="cat /proc/net/dev && uptime"
```

### Pod network stats

```bash
kubectl exec -n default <pod-name> -- cat /proc/net/dev
```

### Loki log volume query

```bash
kubectl port-forward -n monitoring svc/loki-gateway 3100:80
curl -s 'http://localhost:3100/loki/api/v1/query_range' \
  --data-urlencode 'query=sum by (app) (count_over_time({namespace="default"} [1h]))' \
  --data-urlencode "start=$(date -u -v-24H +%Y-%m-%dT%H:%M:%SZ)" \
  --data-urlencode "end=$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --data-urlencode 'step=3600'
```

### Node resource usage

```bash
kubectl top nodes
kubectl top pods -n default --sort-by=memory
```
