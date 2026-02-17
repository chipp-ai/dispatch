/**
 * Orchestrator Service
 *
 * Agent loop that streams Anthropic responses and executes tool calls.
 * Yields SSE events: text_delta, tool_start, tool_result, error, done.
 */

import Anthropic from "@anthropic-ai/sdk";
import { tools, executeTool } from "./orchestratorTools";
import {
  getSession,
  createSession,
  saveMessages,
} from "./orchestratorSessionService";
import { getOrCreateDefaultWorkspace } from "./workspaceService";

const MODEL = process.env.ORCHESTRATOR_MODEL || "claude-opus-4-6";
const MAX_TOKENS = parseInt(process.env.ORCHESTRATOR_MAX_TOKENS || "4096", 10);
const MAX_TOOL_ROUNDS = parseInt(
  process.env.ORCHESTRATOR_MAX_TOOL_ROUNDS || "10",
  10
);

const ISSUE_PREFIX = process.env.DEFAULT_ISSUE_PREFIX || "DISPATCH";

const SYSTEM_PROMPT = `You are the Dispatch orchestrator — a command center for autonomous agent missions.

Your personality:
- Terminal native. Short, direct responses. No fluff.
- Use markdown for structure: headers, lists, code blocks, bold.
- When showing mission identifiers, always use the ${ISSUE_PREFIX}-XXX format.

You dispatch five types of agents:
- **Investigation** — explores the codebase, produces an implementation plan
- **Implementation** — executes an approved plan, opens a PR
- **QA** — tests an implementation end-to-end, writes a test report
- **Deep Research** — searches the internet + codebase, produces a research report
- **Triage** — lightweight agent that evaluates a backlog item and decides: close it (stale/fixed/duplicate), fix it (<50 lines), or escalate it (needs full plan)

Workflow:
1. User describes work → you search for existing missions → dispatch investigation agent
2. Agent posts a plan → user approves → you dispatch implementation agent
3. Optionally dispatch QA agent to verify the implementation
4. For pure research questions, dispatch a research agent directly
5. For bulk backlog grooming, dispatch triage agents on backlog items one at a time

You can browse AND manage the board directly:
- **list_missions** — list missions filtered by board column (status), priority, or assignee
- **update_mission** — move missions between columns, change priority, edit title/description, **close or cancel missions**

You have full board management powers. You can:
- Close duplicates by moving them to "Canceled" with update_mission
- Mark stale/fixed issues as "Done" or "Canceled"
- Bulk-close duplicates when asked — use update_mission in a loop, no need to dispatch agents for this
- Move any mission to any column

Slash commands (handle these immediately without confirmation):
- /status → call get_fleet_status, display results
- /backlog → call list_missions with status="Backlog", display results
- /triage → call list_missions with status="Investigating", display results (items being triaged)
- /triage <${ISSUE_PREFIX}-XX> → call dispatch_triage with that identifier (dispatch a triage agent)
- /board [status] → call list_missions with optional status filter, display results
- /mission <${ISSUE_PREFIX}-XX> → call get_mission with that identifier, display results
- /search <query> → call search_missions with that query, display results
- /errors [source] → call loki_errors (optionally filtered by source), display results
- /stats → call loki_stats with 24h window, display results
- /dedup [statuses] → call deduplicate_missions with dry_run first, show results, ask user to confirm before executing with execute=true

You also have **production analytics tools** for answering data questions directly:

**Loki log tools** (production log queries):
- \`loki_errors\` — recent errors, filter by source/feature/requestId
- \`loki_search\` — search logs by text/regex pattern
- \`loki_stats\` — error counts grouped by source/feature/message/version
- \`loki_compare\` — compare error rates between time periods (deploy impact)
- \`loki_trace\` — trace a request across all services by requestId
- \`loki_user_activity\` — user behavioral analytics by userId/orgId/appId

Key source values for filtering: copilot, consumer-chat, builder-chat, billing, billing-webhook, stripe-webhook, llm, heartbeat, rag, voice, whatsapp-chat, slack-chat, email-chat.

**Database tools** (read-only queries against the chipp-deno product database):
- \`chipp_db_query\` — run SELECT queries (auto-limited to 100 rows)
- \`chipp_db_list_tables\` — list tables by schema (app, chat, rag, billing)
- \`chipp_db_describe_table\` — show column info for a table
- \`chipp_db_find_table\` — search for tables by name pattern

Key schemas: \`app\` (users, organizations, applications, consumers), \`chat\` (messages, sessions), \`rag\` (knowledge sources, embeddings), \`billing\` (subscriptions, invoices).

Rules:
- Always search_missions before dispatching to avoid duplicate work.
- Confirm with the user before dispatching any agent. Never auto-dispatch.
- You can create missions (via dispatch) AND manage existing ones (via update_mission). Use update_mission to close, cancel, or reorganize missions without dispatching agents.
- Be concise about fleet status — running agents, costs, outcomes.
- When presenting options, format them as a numbered list.
- If something fails, explain what happened and suggest next steps.
- For analytics questions, use the tools directly — no need to dispatch an agent.
- When querying the database, use \`chipp_db_list_tables\` or \`chipp_db_find_table\` first if unsure about table names.`;

type MessageParam = Anthropic.MessageParam;

export interface SSEEvent {
  type:
    | "text_delta"
    | "tool_start"
    | "tool_result"
    | "usage"
    | "error"
    | "done"
    | "session_id";
  data: string;
}

/**
 * Run a single user turn through the orchestrator.
 * Yields SSE events as an async generator.
 */
export async function* orchestrate(
  userMessage: string,
  sessionId?: string
): AsyncGenerator<SSEEvent> {
  const client = new Anthropic();
  const workspace = await getOrCreateDefaultWorkspace();

  // Load existing session (for multi-turn within a page visit) or create fresh
  let session = sessionId ? await getSession(sessionId) : null;

  if (!session) {
    session = await createSession(workspace.id);
  }

  yield { type: "session_id", data: session.id };

  // Append user message
  const messages: MessageParam[] = [
    ...session.messages,
    { role: "user", content: userMessage },
  ];

  let toolRound = 0;

  while (toolRound < MAX_TOOL_ROUNDS) {
    toolRound++;

    // Stream the response, buffering complete content blocks
    let assistantContent: Anthropic.ContentBlock[] = [];
    let stopReason: string | null = null;
    let blockBuffer = ""; // Buffer text within a content block
    let currentBlockType: string | null = null;

    try {
      const stream = client.messages.stream({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: SYSTEM_PROMPT,
        tools,
        messages,
      });

      for await (const event of stream) {
        if (event.type === "content_block_start") {
          blockBuffer = "";
          currentBlockType = event.content_block.type;
          if (event.content_block.type === "tool_use") {
            yield {
              type: "tool_start",
              data: JSON.stringify({
                id: event.content_block.id,
                name: event.content_block.name,
              }),
            };
          }
        } else if (event.type === "content_block_delta") {
          if (event.delta.type === "text_delta") {
            blockBuffer += event.delta.text;
          }
        } else if (event.type === "content_block_stop") {
          // Flush the buffered text as a single atomic chunk
          if (currentBlockType === "text" && blockBuffer) {
            yield { type: "text_delta", data: blockBuffer };
            blockBuffer = "";
          }
          currentBlockType = null;
        } else if (event.type === "message_stop") {
          const finalMessage = await stream.finalMessage();
          assistantContent = finalMessage.content;
          stopReason = finalMessage.stop_reason;

          // Emit usage metrics for this API call
          const usage = finalMessage.usage;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const usageAny = usage as any;
          yield {
            type: "usage",
            data: JSON.stringify({
              input_tokens: usage?.input_tokens ?? 0,
              output_tokens: usage?.output_tokens ?? 0,
              cache_read_input_tokens:
                usageAny?.cache_read_input_tokens ?? 0,
              cache_creation_input_tokens:
                usageAny?.cache_creation_input_tokens ?? 0,
            }),
          };
        }
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      yield { type: "error", data: msg };
      break;
    }

    // Append assistant response to conversation
    messages.push({ role: "assistant", content: assistantContent });

    // If no tool calls, we're done
    if (stopReason !== "tool_use") {
      break;
    }

    // Execute tool calls
    const toolUseBlocks = assistantContent.filter(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
    );

    const toolResults: Anthropic.ToolResultBlockParam[] = [];

    for (const toolUse of toolUseBlocks) {
      const result = await executeTool(
        toolUse.name,
        toolUse.input as Record<string, unknown>
      );

      yield {
        type: "tool_result",
        data: JSON.stringify({
          tool_use_id: toolUse.id,
          name: toolUse.name,
          result,
        }),
      };

      toolResults.push({
        type: "tool_result",
        tool_use_id: toolUse.id,
        content: result,
      });
    }

    // Append tool results and continue the loop
    messages.push({ role: "user", content: toolResults });
  }

  // Save conversation
  await saveMessages(session.id, messages);

  yield { type: "done", data: session.id };
}
