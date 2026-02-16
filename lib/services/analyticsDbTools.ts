/**
 * Analytics Database Tools
 *
 * 4 read-only database tools for querying the chipp-deno product database.
 * Uses a separate pg.Pool from Dispatch's own database connection.
 *
 * Requires CHIPP_DENO_DATABASE_URL env var. Gracefully degrades if not configured.
 */

import type Anthropic from "@anthropic-ai/sdk";
import pg from "pg";

const { Pool } = pg;

type Tool = Anthropic.Tool;

// --- Database Connection ---

let chippPool: pg.Pool | null = null;

function getPool(): pg.Pool | null {
  if (chippPool) return chippPool;

  const url = process.env.CHIPP_DENO_DATABASE_URL;
  if (!url) return null;

  chippPool = new Pool({
    connectionString: url,
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  });

  return chippPool;
}

async function queryChippDb<T = Record<string, unknown>>(
  sql: string,
  params?: unknown[]
): Promise<T[]> {
  const pool = getPool();
  if (!pool) {
    throw new Error(
      "CHIPP_DENO_DATABASE_URL not configured. Cannot query chipp-deno database."
    );
  }

  const client = await pool.connect();
  try {
    const result = await client.query(sql, params);
    return result.rows as T[];
  } finally {
    client.release();
  }
}

// --- SQL Validation ---

function isReadOnlyQuery(sql: string): boolean {
  const normalized = sql.trim().replace(/\/\*[\s\S]*?\*\//g, "").trim();
  const first = normalized.split(/\s+/)[0]?.toUpperCase();
  return first === "SELECT" || first === "WITH";
}

function ensureLimit(sql: string, maxRows: number): string {
  // If no LIMIT clause, add one
  if (!/\bLIMIT\b/i.test(sql)) {
    return `${sql.replace(/;\s*$/, "")} LIMIT ${maxRows}`;
  }
  return sql;
}

// --- Tool Definitions ---

export const dbTools: Tool[] = [
  {
    name: "chipp_db_query",
    description:
      "Execute a read-only SELECT query against the chipp-deno product database. Only SELECT/WITH statements allowed. Auto-limits to 100 rows if no LIMIT clause.",
    input_schema: {
      type: "object" as const,
      properties: {
        sql: {
          type: "string",
          description: "SQL SELECT query to execute",
        },
      },
      required: ["sql"],
    },
  },
  {
    name: "chipp_db_list_tables",
    description:
      "List all tables in the chipp-deno database, optionally filtered by schema (app, chat, rag, billing).",
    input_schema: {
      type: "object" as const,
      properties: {
        schema: {
          type: "string",
          description:
            'Filter by schema name (e.g. "app", "chat", "rag", "billing"). Omit for all schemas.',
        },
      },
      required: [],
    },
  },
  {
    name: "chipp_db_describe_table",
    description:
      'Show column information for a table including name, type, nullable, and default. Use schema-qualified name (e.g. "app.users").',
    input_schema: {
      type: "object" as const,
      properties: {
        table: {
          type: "string",
          description:
            'Table name with schema prefix (e.g. "app.users", "chat.messages")',
        },
      },
      required: ["table"],
    },
  },
  {
    name: "chipp_db_find_table",
    description:
      "Find tables matching a name pattern (case-insensitive partial match).",
    input_schema: {
      type: "object" as const,
      properties: {
        pattern: {
          type: "string",
          description: "Search pattern (case-insensitive, partial match)",
        },
      },
      required: ["pattern"],
    },
  },
];

// --- Tool Executors ---

interface ToolInput {
  [key: string]: unknown;
}

export async function executeDbTool(
  name: string,
  input: ToolInput
): Promise<string> {
  if (!process.env.CHIPP_DENO_DATABASE_URL) {
    return JSON.stringify({
      error: "CHIPP_DENO_DATABASE_URL not configured",
      hint: "The chipp-deno database connection is not available. Set the CHIPP_DENO_DATABASE_URL environment variable.",
    });
  }

  try {
    switch (name) {
      case "chipp_db_query":
        return await handleDbQuery(input);
      case "chipp_db_list_tables":
        return await handleDbListTables(input);
      case "chipp_db_describe_table":
        return await handleDbDescribeTable(input);
      case "chipp_db_find_table":
        return await handleDbFindTable(input);
      default:
        return JSON.stringify({ error: `Unknown DB tool: ${name}` });
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return JSON.stringify({ error: msg });
  }
}

// --- Handlers ---

async function handleDbQuery(input: ToolInput): Promise<string> {
  const sql = input.sql as string;

  if (!isReadOnlyQuery(sql)) {
    return JSON.stringify({
      error:
        "Only SELECT and WITH statements are allowed. Write operations are not permitted.",
    });
  }

  const safeSql = ensureLimit(sql, 100);
  const rows = await queryChippDb(safeSql);

  return JSON.stringify({
    sql: safeSql,
    rowCount: rows.length,
    rows: rows.slice(0, 1000),
  });
}

async function handleDbListTables(input: ToolInput): Promise<string> {
  const schema = input.schema as string | undefined;

  let sql = `
    SELECT table_schema, table_name
    FROM information_schema.tables
    WHERE table_type = 'BASE TABLE'
      AND table_schema NOT IN ('pg_catalog', 'information_schema')
  `;
  const params: unknown[] = [];

  if (schema) {
    sql += ` AND table_schema = $1`;
    params.push(schema);
  }

  sql += ` ORDER BY table_schema, table_name`;

  const rows = await queryChippDb<{
    table_schema: string;
    table_name: string;
  }>(sql, params);

  // Group by schema
  const bySchema: Record<string, string[]> = {};
  for (const row of rows) {
    if (!bySchema[row.table_schema]) bySchema[row.table_schema] = [];
    bySchema[row.table_schema].push(row.table_name);
  }

  return JSON.stringify({
    totalTables: rows.length,
    schemas: bySchema,
  });
}

async function handleDbDescribeTable(input: ToolInput): Promise<string> {
  const table = input.table as string;

  // Split schema.table
  const parts = table.split(".");
  if (parts.length !== 2) {
    return JSON.stringify({
      error:
        'Table name must be schema-qualified (e.g. "app.users", "chat.messages")',
    });
  }
  const [schema, tableName] = parts;

  const rows = await queryChippDb<{
    column_name: string;
    data_type: string;
    is_nullable: string;
    column_default: string | null;
    udt_name: string;
  }>(
    `SELECT column_name, data_type, is_nullable, column_default, udt_name
     FROM information_schema.columns
     WHERE table_schema = $1 AND table_name = $2
     ORDER BY ordinal_position`,
    [schema, tableName]
  );

  if (rows.length === 0) {
    return JSON.stringify({
      error: `Table ${table} not found or has no columns`,
    });
  }

  return JSON.stringify({
    table,
    columnCount: rows.length,
    columns: rows.map((r) => ({
      name: r.column_name,
      type: r.udt_name || r.data_type,
      nullable: r.is_nullable === "YES",
      default: r.column_default,
    })),
  });
}

async function handleDbFindTable(input: ToolInput): Promise<string> {
  const pattern = input.pattern as string;

  const rows = await queryChippDb<{
    table_schema: string;
    table_name: string;
  }>(
    `SELECT table_schema, table_name
     FROM information_schema.tables
     WHERE table_type = 'BASE TABLE'
       AND table_schema NOT IN ('pg_catalog', 'information_schema')
       AND table_name ILIKE $1
     ORDER BY table_schema, table_name`,
    [`%${pattern}%`]
  );

  return JSON.stringify({
    pattern,
    matchCount: rows.length,
    tables: rows.map((r) => `${r.table_schema}.${r.table_name}`),
  });
}
