/**
 * Phase 4: Migrate Applications
 *
 * Source: MySQL main DB (Application table)
 * Target: app.applications
 *
 * Important: This phase also migrates old enumerable slugs (my-app-123)
 * to new secure slugs (my-app-x7k9) to prevent enumeration attacks.
 */

import type { Connections } from "../connections.ts";
import type { IdMapper, ProgressTracker } from "../id-mapper.ts";
import { migrateSlug, ensureUniqueSlug } from "../utils/slug-generator.ts";

interface OldApplication {
  id: number;
  name: string;
  appNameId: string;
  description: string | null;
  developerId: number;
  organizationId: number | null;
  workspaceId: string | null;
  systemPrompt: string | null;
  model: string;
  temperature: number;
  brandStyles: string | null;
  capabilities: string | null;
  welcomeMessages: string | null;
  suggestedMessages: string | null;
  leadFormConfig: string | null;
  isActive: boolean;
  isDeleted: boolean;
  isPublic: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const BATCH_SIZE = 500; // Smaller batches due to complex processing

// Track slug migrations for reporting
interface SlugMigrationRecord {
  appId: number;
  oldSlug: string;
  newSlug: string;
}

export async function migrateApplications(
  conns: Connections,
  idMapper: IdMapper,
  progress: ProgressTracker,
  dryRun = false,
  limit = 0
): Promise<{ slugMigrations: SlugMigrationRecord[] }> {
  console.log("\n[phase-4] Migrating applications...\n");

  const countResult = await conns.mysqlMain.query<{ count: number }>(
    "SELECT COUNT(*) as count FROM Application WHERE isDeleted = 0"
  );
  const totalCount = countResult[0]?.count ?? 0;

  console.log(`[phase-4] Found ${totalCount} applications to migrate`);

  if (totalCount === 0) {
    console.log("[phase-4] No applications to migrate");
    return { slugMigrations: [] };
  }

  await progress.start("application", totalCount);

  const existingProgress = await progress.getProgress("application");
  let offset = existingProgress?.migratedCount ?? 0;

  if (offset > 0) {
    console.log(`[phase-4] Resuming from offset ${offset}`);
  }

  let migratedCount = offset;
  let skippedCount = 0;
  const slugMigrations: SlugMigrationRecord[] = [];

  // Helper to check if slug exists in target
  async function slugExists(slug: string): Promise<boolean> {
    const result = await conns.pgTarget`
      SELECT 1 FROM app.applications WHERE app_name_id = ${slug} LIMIT 1
    `;
    return result.length > 0;
  }

  try {
    while (offset < totalCount) {
      const batch = await conns.mysqlMain.query<OldApplication>(
        `SELECT id, name, appNameId, description, developerId, organizationId,
                workspaceId, systemPrompt, model, temperature, brandStyles,
                capabilities, welcomeMessages, suggestedMessages, leadFormConfig,
                isActive, isDeleted, isPublic, createdAt, updatedAt
         FROM Application
         WHERE isDeleted = 0
         ORDER BY id
         LIMIT ? OFFSET ?`,
        [BATCH_SIZE, offset]
      );

      if (batch.length === 0) break;

      for (const app of batch) {
        if (idMapper.get("application", app.id)) {
          continue;
        }

        // Map developer ID to new user ID
        const userId = idMapper.get("developer", app.developerId);
        if (!userId) {
          console.warn(
            `[phase-4] Skipping app ${app.id}: developer ${app.developerId} not found`
          );
          skippedCount++;
          continue;
        }

        // Map organization ID if present
        const orgId = app.organizationId
          ? idMapper.get("organization", app.organizationId)
          : null;

        // Map workspace ID if present
        const workspaceId = app.workspaceId
          ? idMapper.get("workspace", app.workspaceId)
          : null;

        // Migrate slug to secure format
        let newSlug = migrateSlug(app.appNameId, app.name);

        // Ensure uniqueness
        if (newSlug !== app.appNameId) {
          newSlug = await ensureUniqueSlug(newSlug, slugExists);
          slugMigrations.push({
            appId: app.id,
            oldSlug: app.appNameId,
            newSlug,
          });
        }

        if (dryRun) {
          if (newSlug !== app.appNameId) {
            console.log(
              `[dry-run] Would migrate app ${app.id}: slug ${app.appNameId} -> ${newSlug}`
            );
          }
          continue;
        }

        // Parse JSON fields safely
        const brandStyles = app.brandStyles
          ? JSON.parse(app.brandStyles)
          : null;
        const capabilities = app.capabilities
          ? JSON.parse(app.capabilities)
          : null;
        const welcomeMessages = app.welcomeMessages
          ? JSON.parse(app.welcomeMessages)
          : null;
        const suggestedMessages = app.suggestedMessages
          ? JSON.parse(app.suggestedMessages)
          : null;
        const leadFormConfig = app.leadFormConfig
          ? JSON.parse(app.leadFormConfig)
          : null;

        const result = await conns.pgTarget`
          INSERT INTO app.applications (
            name, app_name_id, description, developer_id, organization_id,
            workspace_id, system_prompt, model, temperature, brand_styles,
            capabilities, welcome_messages, suggested_messages, lead_form_config,
            is_active, is_deleted, is_public, created_at, updated_at
          ) VALUES (
            ${app.name},
            ${newSlug},
            ${app.description},
            ${userId}::uuid,
            ${orgId ? `${orgId}::uuid` : null},
            ${workspaceId ? `${workspaceId}::uuid` : null},
            ${app.systemPrompt},
            ${app.model},
            ${app.temperature},
            ${brandStyles ? JSON.stringify(brandStyles) : null}::jsonb,
            ${capabilities ? JSON.stringify(capabilities) : null}::jsonb,
            ${welcomeMessages ? JSON.stringify(welcomeMessages) : null}::jsonb,
            ${suggestedMessages ? JSON.stringify(suggestedMessages) : null}::jsonb,
            ${leadFormConfig ? JSON.stringify(leadFormConfig) : null}::jsonb,
            ${app.isActive},
            ${app.isDeleted},
            ${app.isPublic},
            ${app.createdAt},
            ${app.updatedAt}
          )
          RETURNING id
        `;

        const newId = result[0].id as string;
        await idMapper.set("application", app.id, newId);
        migratedCount++;
      }

      offset += batch.length;
      await progress.update(
        "application",
        String(batch[batch.length - 1].id),
        migratedCount
      );
      console.log(
        `[phase-4] Progress: ${migratedCount}/${totalCount} (${skippedCount} skipped)`
      );
    }

    // Report slug migrations
    if (slugMigrations.length > 0) {
      console.log(
        `\n[phase-4] Migrated ${slugMigrations.length} enumerable slugs to secure format:`
      );
      for (const m of slugMigrations.slice(0, 10)) {
        console.log(`  ${m.oldSlug} -> ${m.newSlug}`);
      }
      if (slugMigrations.length > 10) {
        console.log(`  ... and ${slugMigrations.length - 10} more`);
      }
    }

    await progress.complete("application");
    console.log(
      `[phase-4] Completed: ${migratedCount} applications migrated, ${skippedCount} skipped`
    );

    return { slugMigrations };
  } catch (error) {
    await progress.fail("application", String(error));
    throw error;
  }
}

/**
 * Store slug migrations for later reference/redirect setup
 */
export async function saveSlugMigrations(
  conns: Connections,
  migrations: SlugMigrationRecord[]
): Promise<void> {
  if (migrations.length === 0) return;

  // Create redirect table if not exists
  await conns.pgTarget`
    CREATE TABLE IF NOT EXISTS _slug_redirects (
      old_slug VARCHAR(255) PRIMARY KEY,
      new_slug VARCHAR(255) NOT NULL,
      app_id INTEGER NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  // Batch insert
  for (const m of migrations) {
    await conns.pgTarget`
      INSERT INTO _slug_redirects (old_slug, new_slug, app_id)
      VALUES (${m.oldSlug}, ${m.newSlug}, ${m.appId})
      ON CONFLICT (old_slug) DO NOTHING
    `;
  }

  console.log(
    `[phase-4] Saved ${migrations.length} slug redirects for backward compatibility`
  );
}
