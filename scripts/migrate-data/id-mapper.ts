/**
 * ID Mapping Utilities
 *
 * Handles mapping old INT IDs to new UUIDs during migration.
 * Stores mappings in memory and optionally persists to target DB.
 */

import postgres from "postgres";

export type EntityType =
  | "organization"
  | "developer"
  | "application"
  | "consumer"
  | "workspace"
  | "chat_session"
  | "message"
  | "file"
  | "knowledge_source"
  | "whatsapp_config";

interface IdMapping {
  oldId: number | string;
  newId: string;
  entityType: EntityType;
}

/**
 * ID Mapper - tracks old→new ID mappings
 */
export class IdMapper {
  private mappings: Map<string, string> = new Map();
  private sql: ReturnType<typeof postgres>;
  private persistToDb: boolean;

  constructor(sql: ReturnType<typeof postgres>, persistToDb = true) {
    this.sql = sql;
    this.persistToDb = persistToDb;
  }

  /**
   * Generate composite key for lookup
   */
  private key(entityType: EntityType, oldId: number | string): string {
    return `${entityType}:${oldId}`;
  }

  /**
   * Add a mapping
   */
  async set(
    entityType: EntityType,
    oldId: number | string,
    newId: string
  ): Promise<void> {
    this.mappings.set(this.key(entityType, oldId), newId);

    if (this.persistToDb) {
      await this.sql`
        INSERT INTO _migration_id_map (entity_type, old_id, new_id)
        VALUES (${entityType}, ${String(oldId)}, ${newId})
        ON CONFLICT (entity_type, old_id) DO UPDATE SET new_id = ${newId}
      `;
    }
  }

  /**
   * Get mapped ID
   */
  get(entityType: EntityType, oldId: number | string | null): string | null {
    if (oldId === null) return null;
    return this.mappings.get(this.key(entityType, oldId)) ?? null;
  }

  /**
   * Get mapped ID, throwing if not found
   */
  getRequired(entityType: EntityType, oldId: number | string): string {
    const newId = this.get(entityType, oldId);
    if (!newId) {
      throw new Error(`No mapping found for ${entityType}:${oldId}`);
    }
    return newId;
  }

  /**
   * Load mappings from database
   */
  async loadFromDb(): Promise<void> {
    const rows = await this.sql<IdMapping[]>`
      SELECT entity_type, old_id, new_id FROM _migration_id_map
    `;

    for (const row of rows) {
      this.mappings.set(
        this.key(row.entityType as EntityType, row.oldId),
        row.newId
      );
    }

    console.log(`[id-mapper] Loaded ${this.mappings.size} existing mappings`);
  }

  /**
   * Get count of mappings for entity type
   */
  countByType(entityType: EntityType): number {
    let count = 0;
    for (const key of this.mappings.keys()) {
      if (key.startsWith(`${entityType}:`)) count++;
    }
    return count;
  }

  /**
   * Initialize migration tables
   */
  async initMigrationTables(): Promise<void> {
    await this.sql`
      CREATE TABLE IF NOT EXISTS _migration_id_map (
        entity_type VARCHAR(50) NOT NULL,
        old_id VARCHAR(255) NOT NULL,
        new_id UUID NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (entity_type, old_id)
      )
    `;

    await this.sql`
      CREATE TABLE IF NOT EXISTS _migration_progress (
        entity_type VARCHAR(50) PRIMARY KEY,
        last_processed_id VARCHAR(255),
        total_count INTEGER NOT NULL DEFAULT 0,
        migrated_count INTEGER NOT NULL DEFAULT 0,
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        error_message TEXT,
        started_at TIMESTAMPTZ,
        completed_at TIMESTAMPTZ,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;

    console.log("[id-mapper] Migration tables initialized");
  }
}

/**
 * Progress tracker for migration
 */
export class ProgressTracker {
  private sql: ReturnType<typeof postgres>;

  constructor(sql: ReturnType<typeof postgres>) {
    this.sql = sql;
  }

  async start(entityType: EntityType, totalCount: number): Promise<void> {
    await this.sql`
      INSERT INTO _migration_progress (entity_type, total_count, status, started_at, updated_at)
      VALUES (${entityType}, ${totalCount}, 'running', NOW(), NOW())
      ON CONFLICT (entity_type) DO UPDATE SET
        total_count = ${totalCount},
        status = 'running',
        started_at = NOW(),
        updated_at = NOW()
    `;
  }

  async update(
    entityType: EntityType,
    lastProcessedId: string,
    migratedCount: number
  ): Promise<void> {
    await this.sql`
      UPDATE _migration_progress
      SET last_processed_id = ${lastProcessedId},
          migrated_count = ${migratedCount},
          updated_at = NOW()
      WHERE entity_type = ${entityType}
    `;
  }

  async complete(entityType: EntityType): Promise<void> {
    await this.sql`
      UPDATE _migration_progress
      SET status = 'completed',
          completed_at = NOW(),
          updated_at = NOW()
      WHERE entity_type = ${entityType}
    `;
  }

  async fail(entityType: EntityType, error: string): Promise<void> {
    await this.sql`
      UPDATE _migration_progress
      SET status = 'failed',
          error_message = ${error},
          updated_at = NOW()
      WHERE entity_type = ${entityType}
    `;
  }

  async getProgress(entityType: EntityType): Promise<{
    lastProcessedId: string | null;
    migratedCount: number;
    status: string;
  } | null> {
    const rows = await this.sql`
      SELECT last_processed_id, migrated_count, status
      FROM _migration_progress
      WHERE entity_type = ${entityType}
    `;
    return rows[0] ?? null;
  }

  async printSummary(): Promise<void> {
    const rows = await this.sql`
      SELECT entity_type, total_count, migrated_count, status,
             EXTRACT(EPOCH FROM (COALESCE(completed_at, NOW()) - started_at)) as duration_secs
      FROM _migration_progress
      ORDER BY started_at
    `;

    console.log("\n=== Migration Progress ===\n");
    console.log(
      "Entity Type          | Total    | Migrated | Status    | Duration"
    );
    console.log("-".repeat(70));

    for (const row of rows) {
      const entity = row.entity_type.padEnd(20);
      const total = String(row.total_count).padStart(8);
      const migrated = String(row.migrated_count).padStart(8);
      const status = row.status.padEnd(10);
      const duration = row.duration_secs
        ? `${Math.round(row.duration_secs as number)}s`
        : "-";
      console.log(
        `${entity} | ${total} | ${migrated} | ${status} | ${duration}`
      );
    }
    console.log("");
  }
}
