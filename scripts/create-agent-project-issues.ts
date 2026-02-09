/**
 * Create Agent-First Issue Tracker Project Issues
 *
 * Usage:
 *   npx tsx scripts/create-agent-project-issues.ts
 */

import { v4 as uuidv4 } from "uuid";
import pg from "pg";

const { Pool } = pg;

interface IssueToCreate {
  title: string;
  description: string;
  priority: "P1" | "P2" | "P3" | "P4";
  labels: string[];
}

// Project: Agent-First Issue Tracker
const projectIssues: IssueToCreate[] = [
  // ============ QUICK WINS (P1/P2) ============
  {
    title: "Add agent_status field to issues",
    description: `## Overview
Add a new field to track agent processing status on issues.

## Fields to Add
- \`agent_status\`: enum with values:
  - \`idle\` - No agent activity
  - \`investigating\` - Agent is analyzing the issue
  - \`implementing\` - Agent is writing code
  - \`blocked\` - Agent needs human input
  - \`awaiting_review\` - Agent completed, needs human review

## Implementation
1. Add column to \`dispatch_issue\` table
2. Update Prisma schema (if using) or raw SQL migration
3. Add to issue service types
4. Expose in API responses

## Acceptance Criteria
- [ ] Database column added
- [ ] API returns agent_status
- [ ] Default value is 'idle'`,
    priority: "P1",
    labels: ["Feature", "Agent", "Quick Win"],
  },
  {
    title: "Add agent_output JSON field for structured results",
    description: `## Overview
Store agent investigation/implementation results as structured JSON instead of just comments.

## Schema
\`\`\`typescript
interface AgentOutput {
  type: "investigation" | "implementation" | "pr_fix";
  timestamp: string;
  confidence: number; // 0-100
  summary: string;
  findings?: {
    rootCause?: string;
    affectedFiles?: string[];
    similarIssues?: string[];
    suggestedFix?: string;
  };
  implementation?: {
    prUrl?: string;
    filesChanged?: string[];
    testsAdded?: boolean;
  };
  tokensUsed?: number;
  durationMs?: number;
}
\`\`\`

## Implementation
1. Add \`agent_output\` JSONB column
2. Add \`agent_confidence\` integer column (0-100)
3. Add \`agent_tokens_used\` integer column
4. Update types and API

## Acceptance Criteria
- [ ] JSONB column stores structured output
- [ ] Confidence score extractable for filtering
- [ ] Token usage tracked per issue`,
    priority: "P1",
    labels: ["Feature", "Agent", "Quick Win"],
  },
  {
    title: "Build 'Assign to Agent' button in UI",
    description: `## Overview
Add a one-click button to assign an issue to the AI agent for investigation.

## UI Changes
- Add "Assign to Agent" button in issue detail sidebar
- Show in Assignee section when no assignee
- Confirmation dialog: "Agent will investigate this issue. Continue?"
- Button disabled if agent is already working

## Behavior
1. Click button
2. Set \`agent_status\` = 'investigating'
3. Set \`assignee\` to agent user
4. Trigger agent to start (via polling or webhook)

## Visual Design
- Use robot/AI icon
- Purple accent color (#5e6ad2)
- Loading state while agent picks up

## Acceptance Criteria
- [ ] Button visible in issue detail
- [ ] Triggers agent assignment
- [ ] Shows loading/progress state`,
    priority: "P1",
    labels: ["Feature", "Agent", "UI", "Quick Win"],
  },
  {
    title: "Show agent activity in real-time on issue detail",
    description: `## Overview
Display live updates when agent is working on an issue.

## UI Components
1. **Status Banner**: "Agent is investigating..." with animated indicator
2. **Progress Log**: Stream of what agent is doing
   - "Searching for similar issues..."
   - "Analyzing affected files..."
   - "Generating investigation report..."
3. **Live Output**: Show agent's thinking/output as it happens

## Technical Approach
- Option A: WebSocket connection for real-time updates
- Option B: Polling every 2-3 seconds while agent_status != 'idle'
- Option C: Server-Sent Events (SSE)

## Acceptance Criteria
- [ ] Live status visible when agent working
- [ ] Progress updates shown
- [ ] Final output displayed when complete`,
    priority: "P2",
    labels: ["Feature", "Agent", "UI", "Quick Win"],
  },
  {
    title: "Leverage embeddings to show 'Similar Issues' before investigation",
    description: `## Overview
Use existing issue embeddings to find and display similar issues before agent investigates.

## Behavior
1. When viewing an issue, query for semantically similar issues
2. Show "Similar Issues" section in sidebar or below description
3. Include resolution status - "Was fixed by PR #123"
4. Agent uses this context automatically

## Query
\`\`\`sql
SELECT id, identifier, title,
       1 - (embedding <=> $1) as similarity
FROM dispatch_issue
WHERE id != $2
  AND embedding IS NOT NULL
ORDER BY embedding <=> $1
LIMIT 5
\`\`\`

## UI
- Show top 3-5 similar issues
- Display similarity score as percentage
- Link to related issue
- Show if issue was resolved and how

## Acceptance Criteria
- [ ] Similar issues displayed on issue detail
- [ ] Similarity score shown
- [ ] Links to resolved issues show fix info`,
    priority: "P2",
    labels: ["Feature", "Agent", "Quick Win", "Embeddings"],
  },

  // ============ AGENT WORKFLOW STATES ============
  {
    title: "Design agent-specific workflow states",
    description: `## Overview
Create workflow states optimized for AI agent collaboration.

## Proposed States
\`\`\`
Triage
  ↓
Agent Investigating → Needs Human Input
  ↓
Agent Implementing → Agent Blocked
  ↓
PR Open
  ↓
Human Review
  ↓
Done / Canceled
\`\`\`

## State Definitions
- **Agent Investigating**: Agent is analyzing the issue
- **Agent Implementing**: Agent is writing code
- **Agent Blocked**: Agent cannot proceed (needs creds, clarification, etc.)
- **Needs Human Input**: Investigation complete but human decision needed
- **PR Open**: Agent created PR, awaiting review
- **Human Review**: Human reviewing agent's work

## Automatic Transitions
- Triage → Agent Investigating: When assigned to agent
- Agent Investigating → PR Open: When agent creates PR
- Agent Investigating → Needs Human Input: When confidence < 70%

## Acceptance Criteria
- [ ] States added to database
- [ ] Automatic transitions working
- [ ] UI shows appropriate actions per state`,
    priority: "P2",
    labels: ["Feature", "Agent", "Workflow"],
  },
  {
    title: "Implement automatic escalation rules",
    description: `## Overview
Automatically escalate issues to humans when agent confidence is low.

## Rules
1. **Low Confidence**: If agent_confidence < 70%, move to "Needs Human Input"
2. **Long Running**: If agent working > 30 minutes, notify human
3. **Multiple Failures**: If agent fails 2+ times, escalate
4. **Security Sensitive**: If issue mentions auth/security, require human approval

## Configuration
\`\`\`typescript
interface EscalationRules {
  minConfidence: number;        // Default: 70
  maxDurationMinutes: number;   // Default: 30
  maxRetries: number;           // Default: 2
  sensitiveKeywords: string[];  // ['auth', 'security', 'password']
}
\`\`\`

## UI
- Show escalation reason in issue
- "Agent escalated: Low confidence (45%)"
- Human can override and let agent continue

## Acceptance Criteria
- [ ] Confidence-based escalation working
- [ ] Timeout escalation working
- [ ] UI shows escalation reason`,
    priority: "P3",
    labels: ["Feature", "Agent", "Workflow"],
  },

  // ============ RICH CONTEXT ============
  {
    title: "Auto-link Sentry errors to issues",
    description: `## Overview
Automatically pull Sentry error details into issue context.

## Integration Points
1. When creating issue from Sentry, store Sentry issue ID
2. Fetch and embed stack trace, affected users, frequency
3. Agent sees full error context automatically

## Data to Include
- Error message and type
- Stack trace (formatted)
- Affected files
- User count and frequency
- First/last seen timestamps
- Tags and context

## Schema Addition
\`\`\`sql
ALTER TABLE dispatch_issue ADD COLUMN sentry_issue_id VARCHAR(255);
ALTER TABLE dispatch_issue ADD COLUMN sentry_context JSONB;
\`\`\`

## Acceptance Criteria
- [ ] Sentry errors linkable to issues
- [ ] Stack trace displayed in issue
- [ ] Agent receives Sentry context`,
    priority: "P3",
    labels: ["Feature", "Agent", "Integration"],
  },
  {
    title: "Auto-attach relevant code files to issues",
    description: `## Overview
When issue mentions files/components, automatically include them in context.

## Detection
1. Parse description for file paths (\`src/auth/login.ts\`)
2. Detect component names (\`LoginForm\`, \`AuthService\`)
3. Extract from stack traces
4. Use embeddings to find relevant files

## Attachment
- Store file paths in issue metadata
- Agent receives file contents automatically
- Show "Referenced Files" section in UI

## Schema
\`\`\`sql
ALTER TABLE dispatch_issue ADD COLUMN referenced_files TEXT[];
\`\`\`

## Acceptance Criteria
- [ ] Files auto-detected from description
- [ ] Files shown in issue detail
- [ ] Agent receives file contents`,
    priority: "P3",
    labels: ["Feature", "Agent", "Context"],
  },

  // ============ FEEDBACK & LEARNING ============
  {
    title: "Track resolution outcomes for agent fixes",
    description: `## Overview
Track whether agent fixes actually resolved issues to enable learning.

## Tracking Points
1. Issue marked Done → Record fix success
2. Issue reopened → Record fix failure
3. PR reverted → Record fix failure
4. Time to reopen → Measure fix durability

## Schema
\`\`\`sql
ALTER TABLE dispatch_issue ADD COLUMN resolution_outcome VARCHAR(50);
-- Values: 'success', 'reopened', 'reverted', 'unknown'

ALTER TABLE dispatch_issue ADD COLUMN resolution_durability_days INTEGER;
-- Days between Done and reopen (null if never reopened)
\`\`\`

## Metrics
- Agent fix success rate by category
- Average time to reopen
- Comparison: Agent vs Human fix durability

## Acceptance Criteria
- [ ] Outcomes tracked in database
- [ ] Reopens detected and recorded
- [ ] Success rate queryable`,
    priority: "P3",
    labels: ["Feature", "Agent", "Analytics"],
  },
  {
    title: "Build agent performance dashboard",
    description: `## Overview
Dashboard showing agent effectiveness metrics.

## Metrics to Display
1. **Issues Processed**: Total, this week, today
2. **Success Rate**: % of fixes that stayed fixed
3. **Average Confidence**: Mean confidence score
4. **Time Savings**: Estimated hours saved
5. **Token Usage**: Cost tracking

## Charts
- Issues by status over time
- Confidence distribution
- Success rate by issue type/label
- Token usage trend

## Filters
- Date range
- Issue labels
- Outcome type

## Acceptance Criteria
- [ ] Dashboard page created
- [ ] Key metrics displayed
- [ ] Charts showing trends`,
    priority: "P4",
    labels: ["Feature", "Agent", "Analytics", "UI"],
  },

  // ============ MULTI-AGENT ============
  {
    title: "Support multiple specialist agents",
    description: `## Overview
Allow different agents to specialize in different areas.

## Agent Types
- **General Agent**: Handles all issues
- **Security Agent**: Specializes in auth/security issues
- **Performance Agent**: Focuses on performance bugs
- **Test Agent**: Writes missing tests

## Routing Rules
\`\`\`typescript
interface AgentRouting {
  agentId: string;
  name: string;
  labels: string[];      // Matches these labels
  keywords: string[];    // Matches description keywords
  priority: number;      // Higher = checked first
}
\`\`\`

## Schema
\`\`\`sql
CREATE TABLE dispatch_agent_config (
  id UUID PRIMARY KEY,
  name VARCHAR(255),
  type VARCHAR(50),
  routing_rules JSONB,
  capabilities TEXT[],
  created_at TIMESTAMP
);
\`\`\`

## Acceptance Criteria
- [ ] Multiple agents configurable
- [ ] Automatic routing based on rules
- [ ] Agent handoffs supported`,
    priority: "P4",
    labels: ["Feature", "Agent", "Architecture"],
  },

  // ============ INFRASTRUCTURE ============
  {
    title: "Implement real-time updates via WebSocket",
    description: `## Overview
Add WebSocket support for real-time issue updates.

## Use Cases
1. Agent status changes (investigating → implementing)
2. New comments added
3. Issue field updates
4. Agent output streaming

## Technical Approach
- Socket.io or native WebSocket
- Room per issue: \`issue:{identifier}\`
- Broadcast on any issue mutation

## Events
\`\`\`typescript
interface WebSocketEvents {
  'issue:updated': { issueId: string; fields: string[] };
  'issue:comment': { issueId: string; comment: Comment };
  'agent:status': { issueId: string; status: AgentStatus };
  'agent:output': { issueId: string; chunk: string };
}
\`\`\`

## Acceptance Criteria
- [ ] WebSocket server running
- [ ] Issue detail subscribes to updates
- [ ] Real-time updates working`,
    priority: "P3",
    labels: ["Feature", "Infrastructure"],
  },
  {
    title: "Create dispatch-agent worker service",
    description: `## Overview
Build the agent worker that processes issues assigned to it.

## Architecture
- Standalone Node.js service
- Polls database for assigned issues (or WebSocket)
- Spawns Claude Code for investigation/implementation
- Posts results back to issue

## Core Loop
\`\`\`typescript
while (true) {
  const issues = await getAgentAssignedIssues();
  for (const issue of issues) {
    await processIssue(issue);
  }
  await sleep(POLL_INTERVAL);
}
\`\`\`

## Processing
1. Fetch issue with full context (similar issues, files, etc.)
2. Build prompt with context
3. Run Claude Code
4. Parse output
5. Update issue with results

## Configuration
- \`AGENT_USER_ID\`: Which user represents the agent
- \`POLL_INTERVAL_MS\`: How often to check (default: 30s)
- \`REPO_PATH\`: Path to codebase

## Acceptance Criteria
- [ ] Worker service created
- [ ] Polls for issues
- [ ] Runs Claude Code
- [ ] Posts results to issue`,
    priority: "P2",
    labels: ["Feature", "Agent", "Infrastructure"],
  },
];

async function main() {
  console.log("\n🚀 Creating Agent-First Issue Tracker Project Issues\n");

  const pool = new Pool({
    connectionString: process.env.PG_DATABASE_URL,
  });

  try {
    // Get workspace
    const workspaceResult = await pool.query(
      `SELECT * FROM dispatch_workspace LIMIT 1`
    );
    let workspace = workspaceResult.rows[0];

    if (!workspace) {
      const wsId = uuidv4();
      await pool.query(
        `INSERT INTO dispatch_workspace (id, name, issue_prefix, next_issue_number)
         VALUES ($1, process.env.DEFAULT_WORKSPACE_NAME || 'My Workspace', process.env.DEFAULT_ISSUE_PREFIX || 'DISPATCH', 1)`,
        [wsId]
      );
      workspace = { id: wsId, issue_prefix: process.env.DEFAULT_ISSUE_PREFIX || "DISPATCH", next_issue_number: 1 };
      console.log("✅ Created workspace\n");
    }

    // Get statuses
    const statusResult = await pool.query(
      `SELECT id, name FROM dispatch_status WHERE workspace_id = $1`,
      [workspace.id]
    );
    const statusMap = new Map<string, string>();
    statusResult.rows.forEach((r: { id: string; name: string }) => {
      statusMap.set(r.name.toLowerCase(), r.id);
    });

    // Get default status (Backlog or first)
    const defaultStatusId =
      statusMap.get("backlog") ||
      statusMap.get("triage") ||
      statusResult.rows[0]?.id;

    // Create/get labels
    console.log("🏷️  Ensuring labels exist...");
    const labelNames = new Set<string>();
    projectIssues.forEach((i) => i.labels.forEach((l) => labelNames.add(l)));

    const existingLabels = await pool.query(
      `SELECT id, name FROM dispatch_label WHERE workspace_id = $1`,
      [workspace.id]
    );
    const labelMap = new Map<string, string>();
    existingLabels.rows.forEach((r: { id: string; name: string }) => {
      labelMap.set(r.name, r.id);
    });

    const colors = [
      "#5e6ad2",
      "#10B981",
      "#F59E0B",
      "#EF4444",
      "#8B5CF6",
      "#EC4899",
      "#06B6D4",
    ];
    let colorIdx = 0;
    for (const labelName of labelNames) {
      if (!labelMap.has(labelName)) {
        const labelId = uuidv4();
        await pool.query(
          `INSERT INTO dispatch_label (id, workspace_id, name, color)
           VALUES ($1, $2, $3, $4)`,
          [labelId, workspace.id, labelName, colors[colorIdx % colors.length]]
        );
        labelMap.set(labelName, labelId);
        colorIdx++;
        console.log(`   Created label: ${labelName}`);
      }
    }

    // Create issues
    console.log("\n📝 Creating issues...\n");

    for (const issueData of projectIssues) {
      // Get next issue number
      const updateResult = await pool.query(
        `UPDATE dispatch_workspace
         SET next_issue_number = next_issue_number + 1
         WHERE id = $1
         RETURNING issue_prefix, next_issue_number - 1 as issue_number`,
        [workspace.id]
      );
      const { issue_prefix, issue_number } = updateResult.rows[0];
      const identifier = `${issue_prefix}-${issue_number}`;

      const issueId = uuidv4();
      await pool.query(
        `INSERT INTO dispatch_issue (
          id, identifier, issue_number, title, description,
          status_id, priority, workspace_id,
          created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())`,
        [
          issueId,
          identifier,
          issue_number,
          issueData.title,
          issueData.description,
          defaultStatusId,
          issueData.priority,
          workspace.id,
        ]
      );

      // Add labels
      for (const labelName of issueData.labels) {
        const labelId = labelMap.get(labelName);
        if (labelId) {
          await pool.query(
            `INSERT INTO dispatch_issue_label (issue_id, label_id)
             VALUES ($1, $2)
             ON CONFLICT DO NOTHING`,
            [issueId, labelId]
          );
        }
      }

      console.log(
        `   ✅ ${identifier}: ${issueData.title} [${issueData.priority}]`
      );
    }

    console.log(
      `\n🎉 Created ${projectIssues.length} issues for the Agent-First Issue Tracker project!\n`
    );
  } finally {
    await pool.end();
  }
}

main().catch(console.error);
