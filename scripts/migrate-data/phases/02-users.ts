/**
 * Phase 2: Migrate Users (Developers)
 *
 * Source: MySQL main DB (Developer table)
 * Target: app.users
 *
 * Note: Developers become Users in the new schema.
 * We filter out inactive and deleted developers.
 */

import type { Connections } from "../connections.ts";
import type { IdMapper, ProgressTracker } from "../id-mapper.ts";

interface OldDeveloper {
  id: number;
  email: string;
  name: string | null;
  picture: string | null;
  role: string | null;
  organizationId: number | null;
  emailVerified: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  // OAuth fields
  googleId: string | null;
  microsoftId: string | null;
}

const BATCH_SIZE = 1000;

export async function migrateUsers(
  conns: Connections,
  idMapper: IdMapper,
  progress: ProgressTracker,
  dryRun = false,
  limit = 0
): Promise<void> {
  console.log("\n[phase-2] Migrating users (developers)...\n");

  // Get total count (only active developers with organizations)
  const countResult = await conns.mysqlMain.query<{ count: number }>(
    `SELECT COUNT(*) as count FROM Developer
     WHERE isBanned = 0 AND organizationId IS NOT NULL`
  );
  const totalCount = countResult[0]?.count ?? 0;

  console.log(`[phase-2] Found ${totalCount} developers to migrate`);

  if (totalCount === 0) {
    console.log("[phase-2] No developers to migrate");
    return;
  }

  await progress.start("developer", totalCount);

  const existingProgress = await progress.getProgress("developer");
  let offset = existingProgress?.migratedCount ?? 0;

  if (offset > 0) {
    console.log(`[phase-2] Resuming from offset ${offset}`);
  }

  let migratedCount = offset;
  let skippedCount = 0;

  try {
    while (offset < totalCount) {
      const batch = await conns.mysqlMain.query<OldDeveloper>(
        `SELECT id, email, name, picture, role, organizationId,
                emailVerified, lastLoginAt, createdAt, updatedAt,
                googleId, microsoftId
         FROM Developer
         WHERE isBanned = 0 AND organizationId IS NOT NULL
         ORDER BY id
         LIMIT ? OFFSET ?`,
        [BATCH_SIZE, offset]
      );

      if (batch.length === 0) break;

      for (const dev of batch) {
        // Check if already migrated
        if (idMapper.get("developer", dev.id)) {
          continue;
        }

        // Get mapped organization ID
        const orgId = idMapper.get("organization", dev.organizationId!);
        if (!orgId) {
          console.warn(
            `[phase-2] Skipping developer ${dev.id}: org ${dev.organizationId} not found`
          );
          skippedCount++;
          continue;
        }

        if (dryRun) {
          console.log(
            `[dry-run] Would migrate developer ${dev.id}: ${dev.email}`
          );
          continue;
        }

        // Determine OAuth provider
        let oauthProvider: string | null = null;
        let oauthId: string | null = null;
        if (dev.googleId) {
          oauthProvider = "google";
          oauthId = dev.googleId;
        } else if (dev.microsoftId) {
          oauthProvider = "microsoft";
          oauthId = dev.microsoftId;
        }

        // Map role (default to 'member' if not set)
        const role = dev.role?.toLowerCase() ?? "member";
        const validRoles = ["owner", "admin", "member", "viewer"];
        const mappedRole = validRoles.includes(role) ? role : "member";

        // Insert into target
        const result = await conns.pgTarget`
          INSERT INTO app.users (
            email, name, picture, role, organization_id,
            oauth_provider, oauth_id, email_verified,
            last_login_at, created_at, updated_at
          ) VALUES (
            ${dev.email},
            ${dev.name},
            ${dev.picture},
            ${mappedRole}::user_role,
            ${orgId}::uuid,
            ${oauthProvider},
            ${oauthId},
            ${dev.emailVerified},
            ${dev.lastLoginAt},
            ${dev.createdAt},
            ${dev.updatedAt}
          )
          RETURNING id
        `;

        const newId = result[0].id as string;
        await idMapper.set("developer", dev.id, newId);
        migratedCount++;
      }

      offset += batch.length;
      await progress.update(
        "developer",
        String(batch[batch.length - 1].id),
        migratedCount
      );
      console.log(
        `[phase-2] Progress: ${migratedCount}/${totalCount} (${skippedCount} skipped)`
      );
    }

    await progress.complete("developer");
    console.log(
      `[phase-2] Completed: ${migratedCount} users migrated, ${skippedCount} skipped`
    );
  } catch (error) {
    await progress.fail("developer", String(error));
    throw error;
  }
}
