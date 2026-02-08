#!/usr/bin/env -S deno run --allow-net --allow-env --allow-read

/**
 * Chipp Deno Database MCP Server
 *
 * MCP server for querying the chipp-deno PostgreSQL database.
 * Provides tools for:
 * - Listing tables by schema
 * - Describing table columns
 * - Running read-only queries
 * - Finding tables/columns by pattern
 *
 * Environment Variables:
 *   DATABASE_URL - PostgreSQL connection URL (required)
 *   or individual:
 *   PG_HOST, PG_PORT, PG_USER, PG_PASSWORD, PG_DATABASE
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

// Default development database URL for chipp-deno
// Docker exposes postgres on port 5433 to avoid conflicts with local postgres
const DEFAULT_DEV_DATABASE_URL = "postgresql://postgres:supersecret@localhost:5433/chipp";

function getConnectionConfig(): string {
  // Priority order:
  // 1. DATABASE_URL env var (from .mcp.json or shell)
  // 2. Individual PG_* env vars
  // 3. Default development URL (port 5433 for Docker)

  const databaseUrl = Deno.env.get("DATABASE_URL");
  if (databaseUrl) {
    console.error(`[mcp-chipp-database] Using DATABASE_URL from environment`);
    return databaseUrl;
  }

  // Check for individual env vars
  const host = Deno.env.get("PG_HOST");
  const port = Deno.env.get("PG_PORT");
  if (host || port) {
    const finalHost = host || "localhost";
    const finalPort = port || "5432";
    const user = Deno.env.get("PG_USER") || "postgres";
    const password = Deno.env.get("PG_PASSWORD") || "";
    const database = Deno.env.get("PG_DATABASE") || "chipp";
    const url = `postgresql://${user}:${password}@${finalHost}:${finalPort}/${database}`;
    console.error(`[mcp-chipp-database] Using individual PG_* env vars: ${finalHost}:${finalPort}`);
    return url;
  }

  // Default to development URL
  console.error(`[mcp-chipp-database] No DATABASE_URL found, using default dev URL (port 5433)`);
  return DEFAULT_DEV_DATABASE_URL;
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

async function reconnect(newUrl?: string): Promise<{ success: boolean; message: string; url?: string }> {
  await disconnect();

  if (newUrl) {
    // Override the connection with a specific URL
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
    // Mask password in URL for logging
    const maskedUrl = currentConnectionUrl?.replace(/:([^@]+)@/, ':****@') || 'unknown';
    return {
      success: true,
      message: `Connected to database`,
      url: maskedUrl,
    };
  } catch (error) {
    return {
      success: false,
      message: `Connection failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

// Tool definitions
const tools = [
  {
    name: "db_connect",
    description:
      "Connect to the database. Call this before other database operations.",
    inputSchema: {
      type: "object",
      properties: {
        connectionUrl: {
          type: "string",
          description:
            "Optional PostgreSQL connection URL. Uses DATABASE_URL env var if not provided.",
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
    description: "List all tables in the database, optionally filtered by schema.",
    inputSchema: {
      type: "object",
      properties: {
        schema: {
          type: "string",
          description: "Filter by schema name (app, chat, rag, billing). Omit for all schemas.",
        },
        includeRowCount: {
          type: "boolean",
          description: "Include approximate row counts (slower). Default: false",
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
          description: "Table name with schema prefix (e.g., 'app.users', 'chat.messages')",
        },
      },
      required: ["table"],
    },
  },
  {
    name: "db_query",
    description:
      "Execute a read-only SQL query. Only SELECT statements are allowed.",
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
    name: "db_execute",
    description:
      "Execute a write SQL statement (INSERT, UPDATE, DELETE). Returns affected row count and any RETURNING data. Use with caution - changes are immediate and permanent.",
    inputSchema: {
      type: "object",
      properties: {
        sql: {
          type: "string",
          description: "SQL statement to execute (INSERT, UPDATE, DELETE, or other DDL)",
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
          description: "Table name with schema prefix (e.g., 'app.users')",
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
  {
    name: "db_migrate",
    description: "Run pending database migrations. Shows status if dryRun is true.",
    inputSchema: {
      type: "object",
      properties: {
        dryRun: {
          type: "boolean",
          description: "If true, only show pending migrations without applying them. Default: false",
        },
      },
    },
  },
  {
    name: "db_reconnect",
    description: "Reconnect to the database with a fresh connection. Use after schema changes.",
    inputSchema: {
      type: "object",
      properties: {
        connectionUrl: {
          type: "string",
          description: "Optional PostgreSQL connection URL. Uses current or default URL if not provided.",
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
    // Get approximate row counts from pg_stat
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

  return tables as TableInfo[];
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

  return columns as ColumnInfo[];
}

async function executeWrite(
  sql: string
): Promise<{ success: boolean; rowCount: number; rows?: unknown[]; executionTimeMs: number }> {
  const db = getConnection();

  // Security: Block obviously dangerous operations
  const normalizedSql = sql.trim().toLowerCase();
  const dangerousPatterns = [
    /^drop\s+database/i,
    /^drop\s+schema/i,
    /^truncate\s+/i,
    /;\s*drop\s+/i,  // SQL injection attempt
  ];

  for (const pattern of dangerousPatterns) {
    if (pattern.test(normalizedSql)) {
      throw new Error(`Dangerous operation blocked: ${sql.substring(0, 50)}...`);
    }
  }

  const start = Date.now();
  const result = await db.unsafe(sql);
  const executionTimeMs = Date.now() - start;

  return {
    success: true,
    rowCount: result.count ?? result.length ?? 0,
    rows: result.length > 0 ? (result as unknown[]) : undefined,
    executionTimeMs,
  };
}

async function executeQuery(
  query: string,
  limit: number = 100
): Promise<{ rows: unknown[]; rowCount: number; executionTimeMs: number }> {
  const db = getConnection();

  // Security: Only allow SELECT statements
  const normalizedQuery = query.trim().toLowerCase();
  if (
    !normalizedQuery.startsWith("select") &&
    !normalizedQuery.startsWith("with")
  ) {
    throw new Error("Only SELECT queries are allowed. Use db_execute for writes.");
  }

  // Ensure limit
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

  return tables as TableInfo[];
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

async function runMigrations(dryRun: boolean): Promise<{
  success: boolean;
  message: string;
  applied?: string[];
  pending?: string[];
  error?: string;
}> {
  const db = getConnection();

  // Get migrations directory - relative to the chipp-deno project root
  const projectRoot = Deno.cwd();
  const migrationsDir = `${projectRoot}/db/migrations`;

  try {
    // Ensure _migrations table exists
    await db.unsafe(`
      CREATE TABLE IF NOT EXISTS public._migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        applied_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Get applied migrations
    const applied = await db.unsafe(`
      SELECT name FROM public._migrations ORDER BY id
    `);
    const appliedNames = new Set(applied.map((r: { name: string }) => r.name));

    // Get migration files
    const files: string[] = [];
    for await (const entry of Deno.readDir(migrationsDir)) {
      if (entry.isFile && entry.name.endsWith('.sql')) {
        files.push(entry.name);
      }
    }
    files.sort();

    // Find pending migrations
    const pending = files.filter(f => !appliedNames.has(f));

    if (pending.length === 0) {
      return {
        success: true,
        message: "No pending migrations",
        applied: Array.from(appliedNames) as string[],
        pending: [],
      };
    }

    if (dryRun) {
      return {
        success: true,
        message: `${pending.length} pending migration(s) found`,
        applied: Array.from(appliedNames) as string[],
        pending,
      };
    }

    // Apply pending migrations
    const newlyApplied: string[] = [];
    for (const migration of pending) {
      const filePath = `${migrationsDir}/${migration}`;
      const content = await Deno.readTextFile(filePath);

      try {
        await db.unsafe(content);
        await db.unsafe(`
          INSERT INTO public._migrations (name) VALUES ('${migration}')
        `);
        newlyApplied.push(migration);
      } catch (error) {
        return {
          success: false,
          message: `Failed to apply migration: ${migration}`,
          applied: newlyApplied,
          pending: pending.filter(p => !newlyApplied.includes(p)),
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }

    return {
      success: true,
      message: `Applied ${newlyApplied.length} migration(s)`,
      applied: newlyApplied,
      pending: [],
    };
  } catch (error) {
    return {
      success: false,
      message: "Migration failed",
      error: error instanceof Error ? error.message : String(error),
    };
  }
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
- User belongs to Organization (user.organization_id → organization.id)
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
# chipp-deno Database Help

Available topics:
- schemas: Database schema overview
- tables: Key tables and their purpose
- queries: Common SQL queries
- relationships: Table relationships

Use: db_help(topic: "schemas")
`;
  }

  return help[topic] || `Unknown topic: ${topic}. Try: schemas, tables, queries, relationships`;
}

// Tool handler
async function handleTool(
  name: string,
  args: Record<string, unknown>
): Promise<unknown> {
  switch (name) {
    case "db_connect": {
      try {
        if (args.connectionUrl) {
          // Disconnect existing connection
          await disconnect();
          sql = postgres(args.connectionUrl as string, {
            max: 3,
            idle_timeout: 60,
            connect_timeout: 10,
          });
        }

        // Test connection
        const db = getConnection();
        await db`SELECT 1`;

        return {
          success: true,
          message: "Connected to database",
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

    case "db_execute": {
      const result = await executeWrite(args.sql as string);
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

    case "db_migrate": {
      const dryRun = args.dryRun as boolean | undefined;
      return await runMigrations(dryRun ?? false);
    }

    case "db_reconnect": {
      return await reconnect(args.connectionUrl as string | undefined);
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// Create and run server
const server = new Server(
  {
    name: "mcp-chipp-database",
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
    const result = await handleTool(name, (args || {}) as Record<string, unknown>);
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
  console.error("[mcp-chipp-database] Starting server...");

  // Auto-connect to database on startup
  try {
    const result = await reconnect();
    if (result.success) {
      console.error(`[mcp-chipp-database] ${result.message} (${result.url})`);
    } else {
      console.error(`[mcp-chipp-database] Warning: ${result.message}`);
      console.error("[mcp-chipp-database] Use db_connect or db_reconnect to establish connection");
    }
  } catch (error) {
    console.error(`[mcp-chipp-database] Warning: Auto-connect failed: ${error}`);
  }

  const transport = new StdioServerTransport();

  server.onerror = (error) => {
    console.error(`[mcp-chipp-database] Error: ${error}`);
  };

  await server.connect(transport);

  console.error("[mcp-chipp-database] Server running on stdio");
}

main().catch((error) => {
  console.error(`[mcp-chipp-database] Fatal error: ${error}`);
  Deno.exit(1);
});
