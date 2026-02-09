import { db } from "../db";

export interface CustomerUser {
  id: string;
  slackUserId: string;
  slackDisplayName: string;
  slackAvatarUrl: string | null;
  email: string | null;
  emailNotificationsEnabled: boolean;
  customerId: string;
  createdAt: Date;
  updatedAt: Date;
}

interface RawCustomerUser {
  id: string;
  slack_user_id: string;
  slack_display_name: string;
  slack_avatar_url: string | null;
  email: string | null;
  email_notifications_enabled: boolean;
  customer_id: string;
  created_at: Date;
  updated_at: Date;
}

function mapToCustomerUser(user: RawCustomerUser): CustomerUser {
  return {
    id: user.id,
    slackUserId: user.slack_user_id,
    slackDisplayName: user.slack_display_name,
    slackAvatarUrl: user.slack_avatar_url,
    email: user.email,
    emailNotificationsEnabled: user.email_notifications_enabled,
    customerId: user.customer_id,
    createdAt: user.created_at,
    updatedAt: user.updated_at,
  };
}

/**
 * Get or create a customer user by Slack user ID within a customer.
 * Updates display name, email, and avatar URL if they've changed.
 */
export async function getOrCreateCustomerUser(params: {
  customerId: string;
  slackUserId: string;
  slackDisplayName: string;
  slackAvatarUrl?: string;
  email?: string;
}): Promise<CustomerUser> {
  // Check if user exists
  const existing = await db.queryOne<RawCustomerUser>(
    `SELECT * FROM dispatch_customer_user
     WHERE customer_id = $1 AND slack_user_id = $2`,
    [params.customerId, params.slackUserId]
  );

  if (existing) {
    // Update display name, email, and avatar if changed
    const needsUpdate =
      existing.slack_display_name !== params.slackDisplayName ||
      (params.email && existing.email !== params.email) ||
      (params.slackAvatarUrl &&
        existing.slack_avatar_url !== params.slackAvatarUrl);

    if (needsUpdate) {
      const updated = await db.queryOne<RawCustomerUser>(
        `UPDATE dispatch_customer_user
         SET slack_display_name = $1,
             email = COALESCE($2, email),
             slack_avatar_url = COALESCE($3, slack_avatar_url),
             updated_at = NOW()
         WHERE id = $4
         RETURNING *`,
        [
          params.slackDisplayName,
          params.email || null,
          params.slackAvatarUrl || null,
          existing.id,
        ]
      );
      return mapToCustomerUser(updated!);
    }
    return mapToCustomerUser(existing);
  }

  // Create new user
  const newUser = await db.queryOne<RawCustomerUser>(
    `INSERT INTO dispatch_customer_user (
       id, customer_id, slack_user_id, slack_display_name, slack_avatar_url, email,
       email_notifications_enabled, created_at, updated_at
     ) VALUES (
       gen_random_uuid(), $1, $2, $3, $4, $5, true, NOW(), NOW()
     ) RETURNING *`,
    [
      params.customerId,
      params.slackUserId,
      params.slackDisplayName,
      params.slackAvatarUrl || null,
      params.email || null,
    ]
  );

  return mapToCustomerUser(newUser!);
}

/**
 * Get a customer user by ID.
 */
export async function getCustomerUserById(
  id: string
): Promise<CustomerUser | null> {
  const user = await db.queryOne<RawCustomerUser>(
    `SELECT * FROM dispatch_customer_user WHERE id = $1`,
    [id]
  );
  return user ? mapToCustomerUser(user) : null;
}

/**
 * Get all users for a customer who have email notifications enabled and a valid email.
 * Used for sending email notifications.
 */
export async function getUsersForNotification(
  customerId: string
): Promise<CustomerUser[]> {
  const users = await db.query<RawCustomerUser>(
    `SELECT * FROM dispatch_customer_user
     WHERE customer_id = $1
       AND email_notifications_enabled = true
       AND email IS NOT NULL`,
    [customerId]
  );
  return users.map(mapToCustomerUser);
}

/**
 * Update a customer user's email notification preference.
 */
export async function updateEmailNotificationPreference(
  userId: string,
  enabled: boolean
): Promise<CustomerUser | null> {
  const updated = await db.queryOne<RawCustomerUser>(
    `UPDATE dispatch_customer_user
     SET email_notifications_enabled = $1, updated_at = NOW()
     WHERE id = $2
     RETURNING *`,
    [enabled, userId]
  );
  return updated ? mapToCustomerUser(updated) : null;
}

/**
 * List all users for a customer.
 */
export async function listCustomerUsers(
  customerId: string
): Promise<CustomerUser[]> {
  const users = await db.query<RawCustomerUser>(
    `SELECT * FROM dispatch_customer_user
     WHERE customer_id = $1
     ORDER BY created_at ASC`,
    [customerId]
  );
  return users.map(mapToCustomerUser);
}
