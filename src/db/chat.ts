/**
 * Chat Database Export
 *
 * In the consolidated PostgreSQL schema, chat tables are in the 'chat' schema
 * but accessed through the same database connection.
 */

export { db as chatDb } from "./client.ts";
