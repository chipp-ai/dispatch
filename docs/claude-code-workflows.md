# Claude Code Workflows

Detailed workflows and reference material for Claude Code. The main CLAUDE.md imports this file on demand.

## Claude Code Setup

```bash
# First time setup
./scripts/setup-service-account.sh && ./scripts/setup-shell-aliases.sh && source ~/.zshrc

# Daily usage
cc        # Normal mode
ccyolo    # Autonomous mode
ccc       # Continue session
```

| Command | Purpose |
|---------|---------|
| `/autonomous-investigation` | Investigate bugs without writing fixes |
| `/investigate` | Deep-dive feature investigation |
| `/release-notes` | Generate release notes |

| Skill | When to activate |
|-------|------------------|
| `chipp-database` | Before writing database queries |
| `chipp-design` | When building Svelte UI components |

## Subagents (Task Tool)

**Use subagents liberally to avoid context bloat.**

| Agent | When to Use |
|-------|-------------|
| `chipp-mono-explorer` | **Migration**: Explore ChippMono features, produce migration docs |
| `design-implementer` | Implementing features from specs/designs |
| `e2e-flow-tester` | QA testing, smoke tests, bug reproduction |
| `ux-flow-analyzer` | Debugging UI issues, understanding flows |
| `feature-deep-dive` | Understanding features before changes |
| `feature-dependency-mapper` | Planning refactors, understanding impact |
| `refactoring-architect` | Code review, architecture critique |

```
Task(subagent_type="e2e-flow-tester"):
"Test the app creation flow: navigate to Apps, create a new app, verify chat works."

Task(subagent_type="chipp-mono-explorer"):
"Document the subscription tiers feature: how tiers are defined, tier limits, upgrade/downgrade flows."
```

## Migration Workflow (Map-Reduce Pattern)

For large features, use parallel agents at each phase:

```
Phase 1: EXPLORE (parallel)          Phase 2: IMPLEMENT (parallel)       Phase 3: QA (parallel)
┌──────────────────────┐             ┌──────────────────────┐            ┌──────────────────────┐
│ chipp-mono-explorer  │             │ design-implementer   │            │ e2e-flow-tester      │
│ (plans page)         │──┐          │ (plans page)         │──┐         │ (plans flow)         │
├──────────────────────┤  │          ├──────────────────────┤  │         ├──────────────────────┤
│ chipp-mono-explorer  │──┼─→ reports│ design-implementer   │──┼─→ code  │ e2e-flow-tester      │
│ (billing settings)   │  │          │ (billing settings)   │  │         │ (billing flow)       │
├──────────────────────┤  │          ├──────────────────────┤  │         ├──────────────────────┤
│ chipp-mono-explorer  │──┘          │ design-implementer   │──┘         │ e2e-flow-tester      │
│ (upgrade modals)     │             │ (upgrade modals)     │            │ (upgrade flow)       │
└──────────────────────┘             └──────────────────────┘            └──────────────────────┘
         │                                    │                                   │
         ▼                                    ▼                                   ▼
docs/migrations/                     src/services/, web/src/              QA results aggregated
```

**Checkpoint System:** Migration state is tracked in `docs/migrations/CHECKPOINT.json`. Read this file when resuming after context clear to see current phase and component status.

**Phase 1: Parallel Exploration** - Launch multiple explorers in ONE message:
```
Task(subagent_type="chipp-mono-explorer"): "Document plans/pricing page UI"
Task(subagent_type="chipp-mono-explorer"): "Document billing settings page"
Task(subagent_type="chipp-mono-explorer"): "Document upgrade/downgrade modals"
```
Reports saved to `docs/migrations/<component>.md`

**Phase 2: Parallel Implementation** - After reports complete:
```
Task(subagent_type="design-implementer"): "Implement plans page from docs/migrations/plans-page.md"
Task(subagent_type="design-implementer"): "Implement billing settings from docs/migrations/billing-settings.md"
Task(subagent_type="design-implementer"): "Implement upgrade modals from docs/migrations/upgrade-modals.md"
```

**Phase 3: Integration** - Wire components together, resolve conflicts

**Phase 4: Parallel QA** - Test each flow:
```
Task(subagent_type="e2e-flow-tester"): "Test plans page: view tiers, click upgrade"
Task(subagent_type="e2e-flow-tester"): "Test billing settings: change plan, view invoices"
Task(subagent_type="e2e-flow-tester"): "Test upgrade flow: FREE→PRO with Stripe"
```

**Key principle**: Launch ALL parallel agents in a SINGLE message for true concurrency.

## Dev MCP Tools

| Tool | Purpose |
|------|---------|
| `dev_app_state` | Read current SPA state (route, user, org, stores) |
| `dev_set_tier` | Change subscription tier |
| `dev_reset_credits` | Set credit balance for testing |
| `dev_trigger_ws_event` | Push real-time events |
| `dev_simulate_webhook` | Fake Stripe webhooks |
| `dev_inject_error` | Inject errors for testing |

## Browser DevTools Workflow

```
1. browser_connection_status           → Check connection
2. If not connected:
   curl -X PUT "http://localhost:9222/json/new?http://localhost:5174"
3. browser_list_tabs → browser_switch_tab
4. browser_get_page_info               → Verify on localhost:5174
```

**Dev Panel:** Click `.dev-panel-toggle` (left edge, purple gear) to change tiers, clear caches, override models.

## Reading Logs

```bash
# Server logs (Deno API)
tail -f .scratch/logs/server.log
mcp__dev-server__dev_logs_errors

# Client logs (Svelte)
tail -f .scratch/logs/browser.log
mcp__browser-devtools__browser_get_console_logs(type:"error")
```

## Worktree-Based Parallelization

For true parallel development/testing, use Git worktrees with port offsets:

```bash
# Create worktrees for parallel work
git worktree add ../chipp-deno-plans -b feat/plans origin/staging
git worktree add ../chipp-deno-billing -b feat/billing origin/staging
git worktree add ../chipp-deno-upgrade -b feat/upgrade origin/staging

# Run dev servers on different ports
# Main worktree (default)
./scripts/dev.sh

# Plans worktree (ports +10)
cd ../chipp-deno-plans && ./scripts/dev.sh --port 5183 --api-port 8010 --worker-port 8798

# Billing worktree (ports +20)
cd ../chipp-deno-billing && ./scripts/dev.sh --port 5193 --api-port 8020 --worker-port 8808

# Upgrade worktree (ports +30)
cd ../chipp-deno-upgrade && ./scripts/dev.sh --port 5203 --api-port 8030 --worker-port 8818
```

**E2E testing with worktrees:** Each `e2e-flow-tester` targets its worktree's port:
```
Task(subagent_type="e2e-flow-tester"):
"Test plans page on http://localhost:5183 - view tiers, click upgrade"
```

**Cleanup when done:**
```bash
git worktree list                          # See all worktrees
git worktree remove ../chipp-deno-plans    # Remove when merged
```
