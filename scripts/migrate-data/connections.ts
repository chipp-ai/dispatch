/**
 * Database Connections
 *
 * Handles connections to all source and target databases.
 */

import postgres from "postgres";

// Types for MySQL compatibility layer
interface MySQLConnection {
  query: <T>(sql: string, params?: unknown[]) => Promise<T[]>;
  end: () => Promise<void>;
}

/**
 * MySQL connection using fetch to connect via a simple HTTP bridge
 * In production, we'd use a proper MySQL driver for Deno
 * For now, we'll document the expected interface
 */
export async function createMySQLConnection(
  connectionUrl: string
): Promise<MySQLConnection> {
  // Parse connection URL
  const url = new URL(connectionUrl);
  const config = {
    host: url.hostname,
    port: parseInt(url.port || "3306"),
    user: url.username,
    password: url.password,
    database: url.pathname.slice(1),
  };

  console.log(
    `[mysql] Connecting to ${config.host}:${config.port}/${config.database}`
  );

  // For Deno, we'll use mysql2 via npm
  // Note: This requires Deno 1.28+ with npm: support
  const mysql = await import("npm:mysql2@3.6.0/promise");

  const pool = mysql.createPool({
    ...config,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
  });

  return {
    query: async <T>(sql: string, params?: unknown[]): Promise<T[]> => {
      // Use query() instead of execute() for better compatibility with Deno
      const [rows] = await pool.query(sql, params);
      return rows as T[];
    },
    end: async () => {
      await pool.end();
    },
  };
}

/**
 * PostgreSQL connection using postgres.js
 */
export function createPostgresConnection(connectionUrl: string) {
  console.log(`[postgres] Connecting to database`);
  return postgres(connectionUrl, { max: 10 });
}

/**
 * Connection manager for all databases
 */
export interface Connections {
  mysqlMain: MySQLConnection;
  mysqlChat: MySQLConnection;
  pgEmbeddings: ReturnType<typeof postgres>;
  pgTarget: ReturnType<typeof postgres>;
}

export async function initConnections(): Promise<Connections> {
  const mysqlMainUrl = Deno.env.get("DATABASE_URL");
  const mysqlChatUrl = Deno.env.get("CHAT_DATABASE_URL");
  const pgEmbeddingsUrl = Deno.env.get("PG_DATABASE_URL");
  const pgTargetUrl = Deno.env.get("DENO_DATABASE_URL");

  if (!mysqlMainUrl) throw new Error("DATABASE_URL required");
  if (!mysqlChatUrl) throw new Error("CHAT_DATABASE_URL required");
  if (!pgEmbeddingsUrl) throw new Error("PG_DATABASE_URL required");
  if (!pgTargetUrl) throw new Error("DENO_DATABASE_URL required");

  console.log("\n[connections] Initializing database connections...\n");

  const [mysqlMain, mysqlChat] = await Promise.all([
    createMySQLConnection(mysqlMainUrl),
    createMySQLConnection(mysqlChatUrl),
  ]);

  const pgEmbeddings = createPostgresConnection(pgEmbeddingsUrl);
  const pgTarget = createPostgresConnection(pgTargetUrl);

  // Test connections
  await mysqlMain.query("SELECT 1");
  console.log("[mysql-main] Connected");

  await mysqlChat.query("SELECT 1");
  console.log("[mysql-chat] Connected");

  await pgEmbeddings`SELECT 1`;
  console.log("[pg-embeddings] Connected");

  await pgTarget`SELECT 1`;
  console.log("[pg-target] Connected");

  console.log("\n[connections] All connections established\n");

  return { mysqlMain, mysqlChat, pgEmbeddings, pgTarget };
}

export async function closeConnections(conns: Connections): Promise<void> {
  console.log("\n[connections] Closing connections...");
  await Promise.all([
    conns.mysqlMain.end(),
    conns.mysqlChat.end(),
    conns.pgEmbeddings.end(),
    conns.pgTarget.end(),
  ]);
  console.log("[connections] All connections closed\n");
}
