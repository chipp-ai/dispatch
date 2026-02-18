#!/usr/bin/env -S deno run --allow-net --allow-env --allow-read

/**
 * Chipp Deno Database MCP Server (Read-Only)
 *
 * Stripped-down MCP server for querying the chipp-deno PostgreSQL database.
 * This version is designed for use in CI/CD (GitHub Actions) and only supports
 * read-only operations. No hardcoded credentials -- connection string comes
 * from the DATABASE_URL environment variable.
 *
 * Tools:
 * - db_connect: Connect to database (from DATABASE_URL or custom URL)
 * - db_disconnect: Disconnect from database
 * - db_list_tables: List tables by schema
 * - db_describe_table: Show column details for a table
 * - db_query: Execute read-only SQL (SELECT only)
 * - db_find_table: Find tables by name pattern
 * - db_find_column: Find columns by name pattern across all tables
 * - db_sample_rows: Get sample rows from a table
 * - db_help: Database schema reference
 *
 * Environment Variables:
 *   DATABASE_URL - PostgreSQL connection URL (required)
 */

import { Server } from "npm:@modelcontextprotocol/sdk@1.0.0/server/index.js";
import { StdioServerTransport } from "npm:@modelcontextprotocol/sdk@1.0.0/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "npm:@modelcontextprotocol/sdk@1.0.0/types.js";
import postgres from "npm:postgres@3.4.4";

// Types
interface TableInfo {
  schema: string;
  name: string;
  type: string;
  rowCount?: number;
}

interface ColumnInfo {
  name: string;
  type: string;
  nullable: boolean;
  default: string | null;
  isPrimaryKey: boolean;
}

// Database connection (lazy initialized)
let sql: ReturnType<typeof postgres> | null = null;
let currentConnectionUrl: string | null = null;

function log(msg: string) {
  console.error(`[mcp-chipp-db] ${msg}`);
}

function getConnectionConfig(): string {
  const databaseUrl = Deno.env.get("DATABASE_URL");
  if (databaseUrl) {
    log("Using DATABASE_URL from environment");
    return databaseUrl;
  }
  throw new Error(
    "DATABASE_URL environment variable is required. No hardcoded connection presets in this read-only build."
  );
}

function getConnection(): ReturnType<typeof postgres> {
  if (!sql) {
    const connectionString = getConnectionConfig();
    currentConnectionUrl = connectionString;
    sql = postgres(connectionString, {
      max: 3,
      idle_timeout: 60,
      connect_timeout: 10,
    });
  }
  return sql;
}

async function disconnect(): Promise<void> {
  if (sql) {
    await sql.end();
    sql = null;
    currentConnectionUrl = null;
  }
}

async function reconnect(
  newUrl?: string
): Promise<{ success: boolean; message: string; url?: string }> {
  await disconnect();

  if (newUrl) {
    currentConnectionUrl = newUrl;
    sql = postgres(newUrl, {
      max: 3,
      idle_timeout: 60,
      connect_timeout: 10,
    });
  }

  const db = getConnection();
  try {
    await db`SELECT 1`;
    const maskedUrl =
      currentConnectionUrl?.replace(/:([^@]+)@/, ":****@") || "unknown";
    return {
      success: true,
      message: "Connected to database",
      url: maskedUrl,
    };
  } catch (error) {
    return {
      success: false,
      message: `Connection failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

// Tool definitions (read-only only)
const tools = [
  {
    name: "db_connect",
    description:
      "Connect to the database. Uses DATABASE_URL from environment by default, or provide a custom connectionUrl.",
    inputSchema: {
      type: "object",
      properties: {
        connectionUrl: {
          type: "string",
          description:
            "Custom PostgreSQL connection URL. Uses DATABASE_URL env var if not provided.",
        },
      },
    },
  },
  {
    name: "db_disconnect",
    description: "Disconnect from the database.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "db_list_tables",
    description:
      "List all tables in the database, optionally filtered by schema.",
    inputSchema: {
      type: "object",
      properties: {
        schema: {
          type: "string",
          description:
            "Filter by schema name (app, chat, rag, billing). Omit for all schemas.",
        },
        includeRowCount: {
          type: "boolean",
          description:
            "Include approximate row counts (slower). Default: false",
        },
      },
    },
  },
  {
    name: "db_describe_table",
    description: "Show column information for a table.",
    inputSchema: {
      type: "object",
      properties: {
        table: {
          type: "string",
          description:
            "Table name with schema prefix (e.g., 'app.users', 'chat.messages')",
        },
      },
      required: ["table"],
    },
  },
  {
    name: "db_query",
    description:
      "Execute a read-only SQL query. Only SELECT statements are allowed. This database is READ-ONLY -- no writes permitted.",
    inputSchema: {
      type: "object",
      properties: {
        sql: {
          type: "string",
          description: "SQL SELECT query to execute",
        },
        limit: {
          type: "number",
          description: "Maximum rows to return (default: 100, max: 1000)",
        },
      },
      required: ["sql"],
    },
  },
  {
    name: "db_find_table",
    description: "Find tables matching a pattern.",
    inputSchema: {
      type: "object",
      properties: {
        pattern: {
          type: "string",
          description: "Search pattern (case-insensitive, partial match)",
        },
      },
      required: ["pattern"],
    },
  },
  {
    name: "db_find_column",
    description: "Find columns matching a pattern across all tables.",
    inputSchema: {
      type: "object",
      properties: {
        pattern: {
          type: "string",
          description: "Search pattern (case-insensitive, partial match)",
        },
      },
      required: ["pattern"],
    },
  },
  {
    name: "db_sample_rows",
    description: "Get sample rows from a table.",
    inputSchema: {
      type: "object",
      properties: {
        table: {
          type: "string",
          description:
            "Table name with schema prefix (e.g., 'app.users')",
        },
        limit: {
          type: "number",
          description: "Number of rows to return (default: 5, max: 50)",
        },
      },
      required: ["table"],
    },
  },
  {
    name: "db_help",
    description: "Get help on database schemas and common queries.",
    inputSchema: {
      type: "object",
      properties: {
        topic: {
          type: "string",
          enum: ["schemas", "tables", "queries", "relationships"],
          description: "Help topic",
        },
      },
    },
  },
];

// Tool implementations
async function listTables(
  schema?: string,
  includeRowCount?: boolean
): Promise<TableInfo[]> {
  const db = getConnection();

  let query = `
    SELECT
      table_schema as schema,
      table_name as name,
      table_type as type
    FROM information_schema.tables
    WHERE table_schema IN ('app', 'chat', 'rag', 'billing', 'public')
  `;

  if (schema) {
    query += ` AND table_schema = '${schema}'`;
  }

  query += ` ORDER BY table_schema, table_name`;

  const tables = await db.unsafe(query);

  if (includeRowCount) {
    for (const table of tables) {
      try {
        const countResult = await db.unsafe(`
          SELECT reltuples::bigint as count
          FROM pg_class
          WHERE relname = '${table.name}'
          AND relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = '${table.schema}')
        `);
        table.rowCount = countResult[0]?.count || 0;
      } catch {
        table.rowCount = -1;
      }
    }
  }

  return tables as unknown as TableInfo[];
}

async function describeTable(fullTableName: string): Promise<ColumnInfo[]> {
  const db = getConnection();
  const [schema, table] = fullTableName.includes(".")
    ? fullTableName.split(".")
    : ["public", fullTableName];

  const columns = await db.unsafe(`
    SELECT
      c.column_name as name,
      c.data_type as type,
      c.is_nullable = 'YES' as nullable,
      c.column_default as default,
      COALESCE(
        (SELECT true FROM information_schema.table_constraints tc
         JOIN information_schema.key_column_usage kcu
           ON tc.constraint_name = kcu.constraint_name
         WHERE tc.table_schema = c.table_schema
           AND tc.table_name = c.table_name
           AND kcu.column_name = c.column_name
           AND tc.constraint_type = 'PRIMARY KEY'
         LIMIT 1),
        false
      ) as "isPrimaryKey"
    FROM information_schema.columns c
    WHERE c.table_schema = '${schema}'
      AND c.table_name = '${table}'
    ORDER BY c.ordinal_position
  `);

  return columns as unknown as ColumnInfo[];
}

async function executeQuery(
  query: string,
  limit: number = 100
): Promise<{ rows: unknown[]; rowCount: number; executionTimeMs: number }> {
  const db = getConnection();

  // Security: Only allow SELECT and WITH (CTE) statements
  const normalizedQuery = query.trim().toLowerCase();
  if (
    !normalizedQuery.startsWith("select") &&
    !normalizedQuery.startsWith("with")
  ) {
    throw new Error(
      "Only SELECT queries are allowed. This is a READ-ONLY database connection."
    );
  }

  // Block any write keywords even within CTEs
  const writeKeywords =
    /\b(insert|update|delete|drop|alter|create|truncate|grant|revoke)\b/i;
  if (writeKeywords.test(query)) {
    throw new Error(
      "Write operations are not permitted. This is a READ-ONLY database connection."
    );
  }

  const maxLimit = Math.min(limit, 1000);
  const limitedQuery = query.includes("limit")
    ? query
    : `${query} LIMIT ${maxLimit}`;

  const start = Date.now();
  const rows = await db.unsafe(limitedQuery);
  const executionTimeMs = Date.now() - start;

  return {
    rows: rows as unknown[],
    rowCount: rows.length,
    executionTimeMs,
  };
}

async function findTable(pattern: string): Promise<TableInfo[]> {
  const db = getConnection();

  const tables = await db.unsafe(`
    SELECT
      table_schema as schema,
      table_name as name,
      table_type as type
    FROM information_schema.tables
    WHERE table_schema IN ('app', 'chat', 'rag', 'billing', 'public')
      AND table_name ILIKE '%${pattern}%'
    ORDER BY table_schema, table_name
  `);

  return tables as unknown as TableInfo[];
}

async function findColumn(
  pattern: string
): Promise<{ table: string; column: ColumnInfo }[]> {
  const db = getConnection();

  const results = await db.unsafe(`
    SELECT
      c.table_schema || '.' || c.table_name as table,
      c.column_name as name,
      c.data_type as type,
      c.is_nullable = 'YES' as nullable,
      c.column_default as default
    FROM information_schema.columns c
    WHERE c.table_schema IN ('app', 'chat', 'rag', 'billing', 'public')
      AND c.column_name ILIKE '%${pattern}%'
    ORDER BY c.table_schema, c.table_name, c.ordinal_position
  `);

  return results.map((r: Record<string, unknown>) => ({
    table: r.table as string,
    column: {
      name: r.name as string,
      type: r.type as string,
      nullable: r.nullable as boolean,
      default: r.default as string | null,
      isPrimaryKey: false,
    },
  }));
}

async function sampleRows(
  fullTableName: string,
  limit: number = 5
): Promise<unknown[]> {
  const db = getConnection();
  const maxLimit = Math.min(limit, 50);

  const rows = await db.unsafe(
    `SELECT * FROM ${fullTableName} LIMIT ${maxLimit}`
  );

  return rows as unknown[];
}

function getHelp(topic?: string): string {
  const help: Record<string, string> = {
    schemas: `
## Database Schemas

chipp-deno uses PostgreSQL with these schemas:

| Schema  | Purpose |
|---------|---------|
| app     | Core application data (users, orgs, applications, workspaces) |
| chat    | Chat data (sessions, messages, memories, tags) |
| rag     | RAG/embeddings (knowledge_sources, text_chunks) |
| billing | Usage tracking (token_usage) |

Note: Tables are prefixed with schema in queries: \`app.users\`, \`chat.messages\`, etc.
`,
    tables: `
## Key Tables

### app schema
- \`app.users\` - Developer accounts
- \`app.organizations\` - Billing/subscription entities
- \`app.workspaces\` - Team workspaces
- \`app.applications\` - AI chatbot configurations
- \`app.sessions\` - Developer auth sessions

### chat schema
- \`chat.sessions\` - Chat conversations
- \`chat.messages\` - Individual messages
- \`chat.user_memories\` - Extracted user memories
- \`chat.tags\` - Conversation tags

### rag schema
- \`rag.knowledge_sources\` - Uploaded docs/URLs
- \`rag.text_chunks\` - Embedded text chunks

### billing schema
- \`billing.token_usage\` - LLM token tracking
`,
    queries: `
## Common Queries

### Find user by email
\`\`\`sql
SELECT * FROM app.users WHERE email = 'user@example.com';
\`\`\`

### Get app with owner info
\`\`\`sql
SELECT a.*, u.email as owner_email
FROM app.applications a
JOIN app.users u ON a.developer_id = u.id
WHERE a.app_name_id = 'my-app-slug';
\`\`\`

### Recent chat sessions for an app
\`\`\`sql
SELECT * FROM chat.sessions
WHERE application_id = 'app-uuid'
ORDER BY started_at DESC
LIMIT 10;
\`\`\`

### Message count by app
\`\`\`sql
SELECT a.name, COUNT(m.id) as message_count
FROM app.applications a
JOIN chat.sessions s ON s.application_id = a.id
JOIN chat.messages m ON m.session_id = s.id
GROUP BY a.id, a.name
ORDER BY message_count DESC;
\`\`\`
`,
    relationships: `
## Table Relationships

### User/Organization
- User belongs to Organization (user.organization_id -> organization.id)
- Organization has subscription tier and credits

### Workspace/Application
- Workspace belongs to Organization
- Application can belong to Workspace (optional)
- Application has developer (creator)

### Chat Flow
- ChatSession belongs to Application
- Message belongs to ChatSession
- Consumer (end-user) can own ChatSessions

### Knowledge/RAG
- KnowledgeSource belongs to Application
- TextChunk belongs to KnowledgeSource
- TextChunk has vector embedding

### Billing
- TokenUsage tracks per-request usage
- Links to Application, Organization, Session
`,
  };

  if (!topic) {
    return `
# chipp-deno Database Help (READ-ONLY)

Available topics:
- schemas: Database schema overview
- tables: Key tables and their purpose
- queries: Common SQL queries
- relationships: Table relationships

Use: db_help(topic: "schemas")
`;
  }

  return (
    help[topic] ||
    `Unknown topic: ${topic}. Try: schemas, tables, queries, relationships`
  );
}

// Tool handler
async function handleTool(
  name: string,
  args: Record<string, unknown>
): Promise<unknown> {
  switch (name) {
    case "db_connect": {
      try {
        const customUrl = args.connectionUrl as string | undefined;
        const connectionUrl = customUrl || getConnectionConfig();

        await disconnect();
        currentConnectionUrl = connectionUrl;
        sql = postgres(connectionUrl, {
          max: 3,
          idle_timeout: 60,
          connect_timeout: 10,
        });

        await sql`SELECT 1`;

        const maskedUrl = connectionUrl.replace(/:([^@]+)@/, ":****@");
        return {
          success: true,
          message: `Connected to database`,
          url: maskedUrl,
          readOnly: true,
        };
      } catch (error) {
        return {
          success: false,
          error: `Connection failed: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    }

    case "db_disconnect": {
      await disconnect();
      return { success: true, message: "Disconnected" };
    }

    case "db_list_tables": {
      const tables = await listTables(
        args.schema as string | undefined,
        args.includeRowCount as boolean | undefined
      );
      return {
        count: tables.length,
        tables,
      };
    }

    case "db_describe_table": {
      const columns = await describeTable(args.table as string);
      return {
        table: args.table,
        columnCount: columns.length,
        columns,
      };
    }

    case "db_query": {
      const result = await executeQuery(
        args.sql as string,
        args.limit as number | undefined
      );
      return result;
    }

    case "db_find_table": {
      const tables = await findTable(args.pattern as string);
      return {
        pattern: args.pattern,
        count: tables.length,
        tables,
      };
    }

    case "db_find_column": {
      const results = await findColumn(args.pattern as string);
      return {
        pattern: args.pattern,
        count: results.length,
        results,
      };
    }

    case "db_sample_rows": {
      const rows = await sampleRows(
        args.table as string,
        args.limit as number | undefined
      );
      return {
        table: args.table,
        rowCount: rows.length,
        rows,
      };
    }

    case "db_help": {
      return {
        content: getHelp(args.topic as string | undefined),
      };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// Create and run server
const server = new Server(
  {
    name: "mcp-chipp-db-readonly",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    const result = await handleTool(
      name,
      (args || {}) as Record<string, unknown>
    );
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              error: error instanceof Error ? error.message : String(error),
            },
            null,
            2
          ),
        },
      ],
      isError: true,
    };
  }
});

// Main
async function main() {
  log("Starting read-only database server...");

  const transport = new StdioServerTransport();

  server.onerror = (error) => {
    log(`Error: ${error}`);
  };

  await server.connect(transport);
  log("Server running on stdio (READ-ONLY mode)");

  // Auto-connect to database after MCP transport is ready
  try {
    const result = await reconnect();
    if (result.success) {
      log(`${result.message} (${result.url})`);
    } else {
      log(`Warning: ${result.message}`);
      log("Use db_connect to establish connection");
    }
  } catch (error) {
    log(`Warning: Auto-connect failed: ${error}`);
    log("Set DATABASE_URL environment variable and use db_connect");
  }
}

main().catch((error) => {
  log(`Fatal error: ${error}`);
  Deno.exit(1);
});
