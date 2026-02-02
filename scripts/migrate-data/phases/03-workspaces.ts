/**
 * Phase 3: Migrate Workspaces
 *
 * Source: MySQL main DB (Workspace table)
 * Target: app.workspaces
 */

import type { Connections } from "../connections.ts";
import type { IdMapper, ProgressTracker } from "../id-mapper.ts";

interface OldWorkspace {
  id: string; // UUIDs in old schema
  name: string;
  organizationId: number;
  createdAt: Date;
  updatedAt: Date;
}

const BATCH_SIZE = 1000;

export async function migrateWorkspaces(
  conns: Connections,
  idMapper: IdMapper,
  progress: ProgressTracker,
  dryRun = false,
  limit = 0
): Promise<void> {
  console.log("\n[phase-3] Migrating workspaces...\n");

  const countResult = await conns.mysqlMain.query<{ count: number }>(
    "SELECT COUNT(*) as count FROM Workspace"
  );
  const totalCount = countResult[0]?.count ?? 0;

  console.log(`[phase-3] Found ${totalCount} workspaces to migrate`);

  if (totalCount === 0) {
    console.log("[phase-3] No workspaces to migrate");
    return;
  }

  await progress.start("workspace", totalCount);

  const existingProgress = await progress.getProgress("workspace");
  let offset = existingProgress?.migratedCount ?? 0;

  if (offset > 0) {
    console.log(`[phase-3] Resuming from offset ${offset}`);
  }

  let migratedCount = offset;
  let skippedCount = 0;

  try {
    while (offset < totalCount) {
      const batch = await conns.mysqlMain.query<OldWorkspace>(
        `SELECT id, name, organizationId, createdAt, updatedAt
         FROM Workspace
         ORDER BY createdAt
         LIMIT ? OFFSET ?`,
        [BATCH_SIZE, offset]
      );

      if (batch.length === 0) break;

      for (const ws of batch) {
        if (idMapper.get("workspace", ws.id)) {
          continue;
        }

        const orgId = idMapper.get("organization", ws.organizationId);
        if (!orgId) {
          console.warn(
            `[phase-3] Skipping workspace ${ws.id}: org ${ws.organizationId} not found`
          );
          skippedCount++;
          continue;
        }

        if (dryRun) {
          console.log(`[dry-run] Would migrate workspace ${ws.id}: ${ws.name}`);
          continue;
        }

        const result = await conns.pgTarget`
          INSERT INTO app.workspaces (
            name, organization_id, created_at, updated_at
          ) VALUES (
            ${ws.name},
            ${orgId}::uuid,
            ${ws.createdAt},
            ${ws.updatedAt}
          )
          RETURNING id
        `;

        const newId = result[0].id as string;
        await idMapper.set("workspace", ws.id, newId);
        migratedCount++;
      }

      offset += batch.length;
      await progress.update(
        "workspace",
        batch[batch.length - 1].id,
        migratedCount
      );
      console.log(`[phase-3] Progress: ${migratedCount}/${totalCount}`);
    }

    await progress.complete("workspace");
    console.log(
      `[phase-3] Completed: ${migratedCount} workspaces migrated, ${skippedCount} skipped`
    );
  } catch (error) {
    await progress.fail("workspace", String(error));
    throw error;
  }
}
