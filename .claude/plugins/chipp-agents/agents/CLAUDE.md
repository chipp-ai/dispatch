# Chipp Agents

This directory contains specialized agents for the chipp-deno codebase.

## Available Agents

| Agent | Purpose |
|-------|---------|
| `comprehensive-pr-reviewer` | Full PR review covering code quality, patterns, and tests |
| `sentry-investigator` | Root cause analysis for Sentry errors |
| `test-generator` | Generate Deno tests for new code |

## Usage

These agents are invoked via the Task tool:

```typescript
Task({
  subagent_type: "chipp-agents:comprehensive-pr-reviewer",
  prompt: "Review the changes in this PR",
});
```
