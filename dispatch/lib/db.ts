// PostgreSQL client for chipp-issues
// Uses the same pattern as shared/utils-server/src/pgClient.ts

import pg from "pg";

const { Pool } = pg;

let poolOptions: pg.PoolConfig = {};

if (process.env.PG_DATABASE_URL) {
  poolOptions = {
    connectionString: process.env.PG_DATABASE_URL,
  };
} else if (process.env.PG_HOST && process.env.PG_PASSWORD) {
  poolOptions = {
    host: process.env.PG_HOST,
    port: 5432,
    user: "postgres",
    password: process.env.PG_PASSWORD,
    database: "postgres",
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  };
}

const pool = new Pool(poolOptions);

export const db = {
  query: async <T = Record<string, unknown>>(
    query: string,
    params?: unknown[]
  ): Promise<T[]> => {
    const client = await pool.connect();
    try {
      const result = await client.query(query, params);
      return result.rows as T[];
    } catch (e) {
      console.error("Database query error:", e);
      throw e;
    } finally {
      client.release();
    }
  },

  queryOne: async <T = Record<string, unknown>>(
    query: string,
    params?: unknown[]
  ): Promise<T | null> => {
    const rows = await db.query<T>(query, params);
    return rows[0] || null;
  },

  transaction: async <T>(
    callback: (client: pg.PoolClient) => Promise<T>
  ): Promise<T> => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await callback(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  },
};

export type { PoolClient } from "pg";
