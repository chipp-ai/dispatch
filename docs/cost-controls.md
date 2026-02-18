# Dispatch Cost Controls

After DISPATCH-31 (a single runaway agent run costing $257.90), Dispatch implemented a multi-layer cost control system.

## Architecture

```
                                    GitHub Actions
                                    ┌─────────────────────────────┐
                                    │  vars.MAX_AGENT_COST_PER_RUN│
                                    │  (default: $25)             │
                                    └─────────┬───────────────────┘
                                              │
    Server-side gates                         │ Per-run cap
    ┌─────────────────────┐                   │ (Claude CLI)
    │ canSpawn() gates:   │                   ▼
    │ 1. Kill switch      │    ┌──────────────────────────────┐
    │ 2. Concurrency      │    │  claude --print               │
    │ 3. Daily spawn count│    │    --max-budget-usd $25       │
    │ 4. Daily cost limit │    │    --output-format stream-json│
    │    ($200 default)   │    │                                │
    └─────────────────────┘    │  Self-terminates when budget  │
              │                │  exceeded. Emits result event  │
              │ blocks spawn   │  with subtype:                 │
              │ if limit hit   │  "error_max_budget_usd"        │
              ▼                └───────────┬──────────────────┘
    Agent doesn't start                    │
                                           │ cost_usd extracted
                                           │ from result event
                                           ▼
                               ┌──────────────────────────┐
                               │ dispatch_agent_runs table │
                               │ (cost_usd column)        │
                               └───────────┬──────────────┘
                                           │
                                           │ SUM(cost_usd)
                                           ▼
                               ┌──────────────────────────┐
                               │ Daily cost check feeds    │
                               │ back into canSpawn()      │
                               │ gate #4                   │
                               └──────────────────────────┘
```

## Per-Run Cap: `--max-budget-usd`

Claude CLI's `--max-budget-usd` flag tracks cost client-side by summing token usage from API responses. When the accumulated cost exceeds the budget, Claude stops making API calls and emits a final `result` event.

### How it works

1. Each API call returns token usage in the response
2. Claude CLI sums `input_tokens * price + output_tokens * price` after each call
3. If `total_cost >= max_budget`, Claude stops and emits a `result` event
4. The check happens **after** each API call, not before -- so the first call can exceed the budget

### Result event on budget termination

```json
{
  "type": "result",
  "subtype": "error_max_budget_usd",
  "is_error": false,
  "total_cost_usd": 24.87,
  "num_turns": 42,
  "duration_ms": 845200,
  "usage": { ... }
}
```

Key points:
- `subtype` is `"error_max_budget_usd"` (distinguishable from normal completion)
- `is_error` is `false` (won't trigger unexpected error handling)
- `total_cost_usd` contains the actual spend
- The existing cost extraction code in workflow files parses this correctly
- `.scratch/run-result.json` may not exist if budget killed the run before the agent wrote it -- workflow error handling already defaults to `outcome=failed` in this case

### Tested behavior (2026-02-17)

With `--max-budget-usd 0.01`:
- First API call cost $0.35 (exceeded budget immediately)
- Result event emitted with `total_cost_usd: 0.35` and `subtype: error_max_budget_usd`
- For $25 budgets, this edge case is negligible

### Configuration

The value comes from a GitHub Actions variable (not secret -- it's not sensitive):

```yaml
env:
  MAX_AGENT_COST_PER_RUN: ${{ vars.MAX_AGENT_COST_PER_RUN || '25' }}
```

In the shell:
```bash
exec claude --print ... --max-budget-usd "${MAX_AGENT_COST_PER_RUN:-25}" "$PROMPT"
```

The `${VAR:-25}` bash default ensures it works immediately without any GitHub Actions configuration.

## Daily Cost Limit (Server-Side)

The 4th gate in `canSpawn()` (`lib/services/spawnService.ts`) checks today's total agent spend:

```typescript
const dailyCostLimit = parseFloat(process.env.DAILY_COST_LIMIT_USD || "200");
if (dailyCostLimit > 0) {
  const dailyCost = await getDailyCost();
  if (dailyCost >= dailyCostLimit) {
    return false;
  }
}
```

`getDailyCost()` queries:
```sql
SELECT COALESCE(SUM(cost_usd), 0) as total
FROM dispatch_agent_runs
WHERE started_at >= CURRENT_DATE
```

Set `DAILY_COST_LIMIT_USD=0` to disable the daily cost gate.

## Slack Notifications

When a completed run's cost reaches 90% of the per-run cap, the Slack notification includes a warning:

```
Cost: $23.50 :warning: hit budget limit
```

This helps the team identify runs that may have been truncated by the budget cap.

## Stats Endpoint

`GET /api/spawns/stats` returns:
```json
{
  "active": 3,
  "budget": { ... },
  "dailyCost": 47.23,
  "dailyCostLimit": 200,
  "outcomes": { ... }
}
```

## Files Modified

| File | Change |
|------|--------|
| `.github/workflows/auto-investigate.yml` | `--max-budget-usd` + env var |
| `.github/workflows/auto-triage.yml` | `--max-budget-usd` + env var |
| `.github/workflows/prd-investigate.yml` | `--max-budget-usd` + env var |
| `.github/workflows/prd-implement.yml` | `--max-budget-usd` (3 invocations) + env var |
| `.github/workflows/qa-test.yml` | `--max-budget-usd` + env var |
| `.github/workflows/deep-research.yml` | `--max-budget-usd` + env var |
| `lib/services/spawnService.ts` | Daily cost gate + `getDailyCost()` |
| `app/api/spawns/stats/route.ts` | `dailyCostLimit` in response |
| `lib/services/internalSlackService.ts` | Budget-hit warning |
| `.env.example` | New env vars documented |
