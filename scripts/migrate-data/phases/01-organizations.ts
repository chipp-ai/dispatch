/**
 * Phase 1: Migrate Organizations
 *
 * Source: MySQL main DB (Organization table)
 * Target: app.organizations
 *
 * Must run first as other entities reference organizations.
 */

import type { Connections } from "../connections.ts";
import type { IdMapper, ProgressTracker } from "../id-mapper.ts";
import { generateVanitySlug } from "../utils/slug-generator.ts";

interface OldOrganization {
  id: number;
  name: string;
  subscriptionTier: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  usageBasedBillingEnabled: number; // MySQL tinyint(1)
}

const BATCH_SIZE = 1000;

export async function migrateOrganizations(
  conns: Connections,
  idMapper: IdMapper,
  progress: ProgressTracker,
  dryRun = false,
  limit = 0
): Promise<void> {
  console.log("\n[phase-1] Migrating organizations...\n");

  // Get total count
  const countResult = await conns.mysqlMain.query<{ count: number }>(
    "SELECT COUNT(*) as count FROM Organization WHERE isDeleted = 0"
  );
  const totalCount = countResult[0]?.count ?? 0;

  console.log(`[phase-1] Found ${totalCount} organizations to migrate`);

  if (totalCount === 0) {
    console.log("[phase-1] No organizations to migrate");
    return;
  }

  // Apply limit if set
  const effectiveTotal = limit > 0 ? Math.min(totalCount, limit) : totalCount;

  await progress.start("organization", effectiveTotal);

  // Check for resume point
  const existingProgress = await progress.getProgress("organization");
  let offset = existingProgress?.migratedCount ?? 0;

  if (offset > 0) {
    console.log(`[phase-1] Resuming from offset ${offset}`);
  }

  let migratedCount = offset;

  try {
    while (offset < totalCount && (limit === 0 || migratedCount < limit)) {
      // Fetch batch from source
      const batch = await conns.mysqlMain.query<OldOrganization>(
        `SELECT id, name, subscriptionTier, stripeCustomerId,
                stripeSubscriptionId, usageBasedBillingEnabled
         FROM Organization
         WHERE isDeleted = 0
         ORDER BY id
         LIMIT ? OFFSET ?`,
        [BATCH_SIZE, offset]
      );

      if (batch.length === 0) break;

      for (const org of batch) {
        // Check if already migrated
        if (idMapper.get("organization", org.id)) {
          continue;
        }

        if (dryRun) {
          console.log(
            `[dry-run] Would migrate organization ${org.id}: ${org.name}`
          );
          continue;
        }

        // Generate a secure vanity slug from org name
        const slug = generateVanitySlug(org.name);

        // Insert into target
        const result = await conns.pgTarget`
          INSERT INTO app.organizations (
            name, slug, subscription_tier, stripe_customer_id,
            stripe_subscription_id,
            trial_ends_at, credits_balance
          ) VALUES (
            ${org.name},
            ${slug},
            ${org.subscriptionTier.toUpperCase()}::subscription_tier,
            ${org.stripeCustomerId},
            ${org.stripeSubscriptionId},
            ${null},
            ${0}
          )
          RETURNING id
        `;

        const newId = result[0].id as string;
        await idMapper.set("organization", org.id, newId);
        migratedCount++;
      }

      offset += batch.length;
      await progress.update(
        "organization",
        String(batch[batch.length - 1].id),
        migratedCount
      );
      console.log(`[phase-1] Progress: ${migratedCount}/${totalCount}`);
    }

    await progress.complete("organization");
    console.log(`[phase-1] Completed: ${migratedCount} organizations migrated`);
  } catch (error) {
    await progress.fail("organization", String(error));
    throw error;
  }
}
