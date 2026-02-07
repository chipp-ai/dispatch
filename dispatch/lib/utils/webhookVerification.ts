import crypto from "crypto";

/**
 * Verify GitHub webhook signature
 * GitHub signs webhooks with HMAC-SHA256 using the secret you configure
 */
export function verifyGitHubWebhookSignature(
  payload: string,
  signature: string | null,
  secret: string
): boolean {
  if (!signature) {
    return false;
  }

  // GitHub sends signature as "sha256=<hash>"
  const [algorithm, hash] = signature.split("=");

  if (algorithm !== "sha256" || !hash) {
    return false;
  }

  const expectedHash = crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("hex");

  // Use timing-safe comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(
      Buffer.from(hash, "hex"),
      Buffer.from(expectedHash, "hex")
    );
  } catch {
    return false;
  }
}

/**
 * Generate a random webhook secret
 */
export function generateWebhookSecret(): string {
  return crypto.randomBytes(32).toString("hex");
}
