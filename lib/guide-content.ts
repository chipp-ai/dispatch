/**
 * Full documentation content for the /guide page.
 * Based on docs/agent-orchestration.md with additional sections
 * for the terminal, deep research, and keyboard shortcuts.
 */

export const guideContent = `
# Dispatch Documentation

Dispatch is an agent orchestration platform that sends autonomous Claude Code agents to investigate, plan, implement, test, and research across your codebase. Every mission runs as a real Claude Code session in GitHub Actions, with live terminal streaming and structured activity tracking.

This guide covers everything: dispatching missions from the terminal, reviewing agent plans, monitoring your fleet, and advanced workflows.

---

## The Terminal

The terminal is your primary interface for dispatching agents. It works like a command line: type what you want done, and Chippy (the orchestrator) figures out the right workflow.

### Dispatching from the Terminal

Type a natural-language description of what you want:

- **"Investigate the auth middleware bug"** -- spawns an investigation agent
- **"Research the best approach for WebSocket scaling"** -- spawns a deep research agent
- **"Implement the user profile page based on CHIPP-42's plan"** -- spawns an implementation agent

Chippy parses your intent, creates or finds the relevant issue, selects the workflow type, and dispatches the agent. You'll see real-time status updates as the agent progresses.

### Terminal Commands

| Command | What It Does |
|---------|--------------|
| \`/status\` | Show fleet status (active agents, budget, costs) |
| \`/cancel <CHIPP-XX>\` | Cancel a running agent |
| \`/retry <CHIPP-XX>\` | Retry a failed agent with optional context |
| \`/approve <CHIPP-XX>\` | Approve a pending plan |
| \`/reject <CHIPP-XX>\` | Reject a plan with feedback |

### How Chippy Routes Your Request

When you type in the terminal, the orchestrator:

1. Determines intent (investigate, implement, research, or general question)
2. Searches for existing issues that match your description
3. Creates a new issue if none exists
4. Selects the appropriate workflow type
5. Checks budget and concurrency limits
6. Dispatches the GitHub Actions workflow
7. Streams progress back to the terminal

---

## The Agent Lifecycle

\`\`\`
                   Investigate
Issue Created ──────────────────► Agent Investigating
                                        │
                              Plan submitted
                                        │
                                        ▼
                               Awaiting Review ◄──── Reject (with feedback)
                                        │
                                  Approve Plan
                                  (auto-implement ✓)
                                        │
                                        ▼
                               Agent Implementing
                                        │
                              ┌─────────┼──────────┐
                              ▼         ▼          ▼
                          Completed   Blocked    Failed
                          (PR open)   (needs     (retry
                                      input)     available)
\`\`\`

### Agent Statuses

| Status | Meaning |
|--------|---------|
| **Idle** | No agent running. Ready to spawn. |
| **Investigating** | Agent is analyzing the issue, reading code, writing a plan. |
| **Awaiting Review** | Agent submitted a plan. Human must approve or reject. |
| **Implementing** | Agent is writing code based on the approved plan. |

### Run Outcomes

After each run, the agent declares an outcome:

| Outcome | Color | What It Means |
|---------|-------|---------------|
| **Completed** | Green | Made changes, PR opened |
| **No Changes Needed** | Blue | Already implemented or not applicable |
| **Investigation Done** | Purple | Findings posted, ready for plan review |
| **Blocked** | Red | Hit a stop condition, needs human input |
| **Needs Decision** | Yellow | Multiple valid approaches, human should choose |
| **Failed** | Red | Crashed or couldn't determine outcome |

---

## Spawning an Agent

### From the Terminal

Type your request naturally. The orchestrator handles issue creation and agent dispatch automatically.

### From the Issue Detail Page

1. Navigate to any issue (\`/issue/CHIPP-XX\`)
2. In the **AI Agent** sidebar section, click:
   - **Investigate** -- Spawn an investigation workflow (explores code, writes a plan)
   - **Start Implementation** -- Spawn implementation (only after plan is approved)

### Workflow Types

| Workflow | Trigger | What It Does |
|----------|---------|--------------|
| \`auto-investigate\` | Automatic (Loki/Sentry errors) | Investigates production errors, attempts quick fix |
| \`prd-investigate\` | Manual (click Investigate) | Deep investigation, produces implementation plan |
| \`prd-implement\` | Manual or auto-chain | Implements the approved plan, opens PR |
| \`deep-research\` | Manual (terminal or issue) | Web + codebase research, produces comprehensive report |

---

## Deep Research

Research agents are different from investigation agents. Instead of writing code, they search the internet and your codebase to produce comprehensive analysis reports.

### When to Use Research

- Architecture decisions ("Compare WebSocket vs SSE vs polling for our use case")
- Technology evaluation ("What's the best Deno ORM for our PostgreSQL setup?")
- Domain exploration ("How do other platforms handle multi-tenant billing?")
- Competitive analysis ("What features do Linear, Jira, and Shortcut offer for agent orchestration?")

### How It Works

1. Type your research question in the terminal (or create an issue with a \`research\` label)
2. The agent uses web search and codebase analysis
3. A structured report is posted to the issue with findings, recommendations, and trade-offs
4. No code changes are made -- research is purely informational

---

## Reviewing Plans

When an investigation completes, the agent posts an **Implementation Plan** on the issue detail page.

The plan includes:
- Summary of the approach
- Files to modify/create
- Database changes (if any)
- Testing strategy
- Estimated complexity

### Approving a Plan

1. Read the plan content
2. Toggle **Auto-implement** checkbox (checked by default):
   - **Checked**: Approving immediately spawns the implementation agent
   - **Unchecked**: Just marks the plan as approved without spawning
3. Click **Approve Plan**

### Requesting Changes

1. Click **Request Changes**
2. Provide feedback explaining what should change
3. The plan status changes to "Needs Revision" and the agent can be re-spawned

---

## Fleet Status Panel

The **Fleet** widget in the sidebar shows real-time fleet health at a glance:

- **Active count** (green pulsing dot) -- How many agents are running right now
- **Budget bars** -- Daily spawn limits by workflow type:
  - **EF** (Error Fix) -- Auto-spawned from Loki/Sentry errors (default: 10/day)
  - **PRD** (PRD workflows) -- Human-initiated investigate/implement (default: 5/day)
- **Daily cost** -- Total API spend today across all agent runs

Click to expand and see:
- List of active spawns with issue ID, title, and duration
- Today's outcome distribution (how many completed, failed, etc.)

---

## Cancelling a Running Agent

If an agent is doing the wrong thing or taking too long:

1. Go to the issue detail page
2. Click the red **Cancel Agent** button (visible when an agent is running)
3. Confirm cancellation

This calls the GitHub Actions API to cancel the workflow run. The issue returns to idle state.

You can also cancel from the terminal: \`/cancel CHIPP-42\`

---

## Retrying with Additional Context

When an agent's output isn't right, retry with more guidance:

1. Go to the issue detail page (agent must be idle with a previous run)
2. Click **Retry with Context**
3. In the dialog:
   - Choose workflow type (Investigate or Implement)
   - Write additional instructions: "Try a different approach...", "Focus on file X...", "The error is in the auth middleware..."
   - Optionally check **Force** to bypass budget/concurrency limits
4. Click **Spawn Agent**

The additional context is injected into Claude's prompt at the start of the run.

---

## Live Monitoring

### Terminal Output

The **Terminal Output** section on the issue detail page streams the agent's CLI output in real-time via SSE. You can see exactly what Claude is doing -- reading files, running commands, writing code.

- Click the **collapse/expand** arrow to toggle visibility
- Click **X** to disconnect the stream

### Agent Activity

The **Agent Activity** section shows structured events:
- Actions taken (file edits, commands run)
- Observations (code analysis, test results)
- Completions (plan posted, PR opened)

---

## Budget & Safety Controls

### Daily Spawn Budgets

Each workflow type has a daily spawn limit (configured in \`chipp_spawn_budget\` table):

| Type | Default Limit | Purpose |
|------|--------------|---------|
| \`error_fix\` | 10/day | Prevent runaway auto-remediation |
| \`prd_investigate\` | 5/day | Limit investigation costs |
| \`prd_implement\` | 5/day | Limit implementation costs |

The Fleet panel shows current usage. When a budget is exhausted, the bar turns red and new spawns of that type are blocked.

### Concurrency Limits

Only one agent can run per issue at a time. The spawn service checks for existing running workflows before dispatching new ones.

### Cooldown Periods

For auto-spawned error fixes, there's a cooldown per error fingerprint to prevent repeatedly spawning for the same recurring error.

---

## Common Workflows

### Bug Fix (Automatic)

\`\`\`
Production error detected in Loki
  → Grafana alert fires
  → Dispatch webhook creates/deduplicates issue
  → Agent auto-spawned (investigate + fix)
  → PR opened targeting staging
  → Fix verified over 48h monitoring window
\`\`\`

### Feature Implementation (Manual)

\`\`\`
Human creates issue with description
  → Click "Investigate" (or type in terminal)
  → Agent explores codebase, writes implementation plan
  → Human reviews plan, clicks "Approve" (auto-implement checked)
  → Agent implements the plan, opens PR
  → Human reviews PR, merges
\`\`\`

### Iterative Refinement

\`\`\`
Agent completes but output is wrong
  → Click "Retry with Context"
  → Add: "The approach should use X instead of Y"
  → Agent re-runs with additional guidance
  → Repeat until satisfied
\`\`\`

### Deep Research

\`\`\`
Human types research question in terminal
  → Research agent searches web + codebase
  → Comprehensive report posted to issue
  → Human uses findings to make decisions
  → Optionally spawn investigation based on research
\`\`\`

---

## Customer Portal

Each customer can be given a read-only portal link that shows their issues and agent activity. Manage customers from the **Customers** page (\`/customers\`).

Portal links include a unique token for authentication. Share the link with customers so they can track progress on their issues without needing a Dispatch account.

---

## Keyboard Shortcuts

| Key | Action | Context |
|-----|--------|---------|
| \`C\` | Create new issue | Board view |
| \`/\` | Open search | Anywhere |
| \`Ctrl+\\\`\` | Toggle terminal / board view | Anywhere |
| \`Esc\` | Close modal / search | Modals |
| \`Arrow keys\` | Navigate guide steps | Guide overlay |
| \`N\` | New customer | Customers page |

---

## Troubleshooting

### Agent spawn fails with "Budget limit reached"
The daily budget for that workflow type is exhausted. Wait until tomorrow, or use **Force** in the Retry dialog to bypass.

### Agent spawn fails with "Concurrency limit"
Another agent is already running on this issue. Cancel the existing run first, or wait for it to complete.

### Terminal Output shows "Connecting..."
The agent may not have started writing output yet, or the SSE connection dropped. Refresh the page.

### Agent completed but no PR
Check the run outcome -- it may be "No Changes Needed" or "Blocked". Read the outcome summary for details.

### Plan says "Awaiting Review" but I don't see it
Scroll down on the issue detail page. The Implementation Plan section appears between the description and Activity sections.

### Terminal input not working
Make sure you're not focused on another input element. Click the terminal area first, then type.

### Research agent returning shallow results
Try being more specific in your query. Instead of "compare databases", try "compare PostgreSQL vs CockroachDB for multi-tenant SaaS with <100 tenants and heavy JSON queries".
`;
