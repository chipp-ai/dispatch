# Chipp Agents Plugin (chipp-deno)

Project-specific agents for the chipp-deno codebase.

## Available Agents

### Development Agents

#### `chipp-agents:comprehensive-pr-reviewer`

A comprehensive PR review that covers:

- Code quality and project guideline compliance
- Silent failures and error handling issues
- Test coverage gaps
- Deno/Hono/Svelte pattern compliance

**When to use**: Before creating PRs, after significant code changes.

---

#### `chipp-agents:sentry-investigator`

Investigates Sentry errors to determine root cause through codebase exploration. Does NOT write fixes.

**When to use**: Given a Sentry issue ID or URL, or when debugging production errors.

---

#### `chipp-agents:test-generator`

Generates comprehensive tests for specified code, following Deno testing conventions.

**When to use**: After implementing features, fixing bugs, or when coverage is lacking.

---

## Agent Selection Guide

| Task                       | Recommended Agent                        |
| -------------------------- | ---------------------------------------- |
| PR review (any aspect)     | `chipp-agents:comprehensive-pr-reviewer` |
| Sentry error investigation | `chipp-agents:sentry-investigator`       |
| Generate tests             | `chipp-agents:test-generator`            |
| Codebase exploration       | `Explore` (built-in)                     |
| Feature understanding      | `feature-deep-dive` (built-in)           |
| Architecture review        | `refactoring-architect` (built-in)       |
| Implementation planning    | `Plan` (built-in)                        |

---

## Installation

This plugin is automatically loaded for the chipp-deno project. No manual installation needed.

## Agent Files

```
.claude/plugins/chipp-agents/
├── .claude-plugin/plugin.json
├── README.md
└── agents/
    ├── comprehensive-pr-reviewer.md
    ├── sentry-investigator.md
    └── test-generator.md
```
