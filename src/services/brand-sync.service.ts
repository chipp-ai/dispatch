/**
 * Brand Sync Service
 *
 * Syncs application branding (logo, color, OG image) to R2 for instant
 * consumer chat loading. Config is served from edge, eliminating database
 * lookups and enabling instant branded splash screens.
 *
 * Uses native fetch with AWS Signature V4 for R2 access (no AWS SDK needed).
 *
 * R2 Storage Structure:
 * /brands/{slug}/config.json  - Branding metadata
 * /brands/{slug}/logo.png     - App logo
 * /brands/{slug}/og.png       - Social share image
 */

import * as Sentry from "@sentry/deno";

export interface BrandConfig {
  slug: string;
  name: string;
  description?: string;
  primaryColor: string;
  backgroundColor?: string;
  logoUrl: string;
  ogImageUrl?: string;
  faviconUrl?: string;
  updatedAt: string;
}

export interface SyncAppBrandingParams {
  slug: string;
  name: string;
  description?: string;
  brandStyles?: {
    primaryColor?: string;
    backgroundColor?: string;
    logoUrl?: string;
  } | null;
}

/**
 * Lightweight R2 client using native fetch with AWS Signature V4
 * Avoids AWS SDK dependency and --allow-sys requirement
 */
class R2Client {
  private endpoint: string;
  private accessKeyId: string;
  private secretAccessKey: string;
  private bucket: string;
  private region = "auto";

  constructor(config: {
    endpoint: string;
    accessKeyId: string;
    secretAccessKey: string;
    bucket: string;
  }) {
    this.endpoint = config.endpoint;
    this.accessKeyId = config.accessKeyId;
    this.secretAccessKey = config.secretAccessKey;
    this.bucket = config.bucket;
  }

  private async sign(
    key: ArrayBuffer | Uint8Array,
    msg: string
  ): Promise<ArrayBuffer> {
    const enc = new TextEncoder();
    const keyData =
      key instanceof Uint8Array
        ? new Uint8Array(key).buffer
        : (key as ArrayBuffer);
    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      keyData,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    return await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(msg));
  }

  private async getSignatureKey(
    key: string,
    dateStamp: string,
    region: string,
    service: string
  ): Promise<ArrayBuffer> {
    const enc = new TextEncoder();
    const kDate = await this.sign(enc.encode("AWS4" + key), dateStamp);
    const kRegion = await this.sign(kDate, region);
    const kService = await this.sign(kRegion, service);
    const kSigning = await this.sign(kService, "aws4_request");
    return kSigning;
  }

  private toHex(buffer: ArrayBuffer): string {
    return [...new Uint8Array(buffer)]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  private async signRequest(
    method: string,
    path: string,
    body: string | Uint8Array = ""
  ): Promise<Headers> {
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
    const dateStamp = amzDate.slice(0, 8);

    const host = new URL(this.endpoint).host;
    const enc = new TextEncoder();
    const bodyBytes = typeof body === "string" ? enc.encode(body) : body;
    const digestData =
      bodyBytes instanceof Uint8Array
        ? new Uint8Array(bodyBytes).buffer
        : (bodyBytes as ArrayBuffer);
    const payloadHash = this.toHex(
      await crypto.subtle.digest("SHA-256", digestData)
    );

    const canonicalHeaders = `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
    const signedHeaders = "host;x-amz-content-sha256;x-amz-date";

    const canonicalRequest = [
      method,
      path,
      "",
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join("\n");
    const canonicalRequestHash = this.toHex(
      await crypto.subtle.digest("SHA-256", enc.encode(canonicalRequest))
    );

    const credentialScope = `${dateStamp}/${this.region}/s3/aws4_request`;
    const stringToSign = [
      "AWS4-HMAC-SHA256",
      amzDate,
      credentialScope,
      canonicalRequestHash,
    ].join("\n");

    const signingKey = await this.getSignatureKey(
      this.secretAccessKey,
      dateStamp,
      this.region,
      "s3"
    );
    const signature = this.toHex(await this.sign(signingKey, stringToSign));

    const authHeader = `AWS4-HMAC-SHA256 Credential=${this.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    return new Headers({
      Authorization: authHeader,
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": amzDate,
      Host: host,
    });
  }

  async putObject(
    key: string,
    body: string | Uint8Array,
    contentType: string,
    cacheControl?: string
  ): Promise<void> {
    const path = `/${this.bucket}/${key}`;
    const headers = await this.signRequest("PUT", path, body);
    headers.set("Content-Type", contentType);
    if (cacheControl) {
      headers.set("Cache-Control", cacheControl);
    }

    const response = await fetch(`${this.endpoint}${path}`, {
      method: "PUT",
      headers,
      body:
        typeof body === "string"
          ? body
          : (new Uint8Array(body).buffer as ArrayBuffer),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`R2 PUT failed: ${response.status} ${text}`);
    }
  }

  async deleteObject(key: string): Promise<void> {
    const path = `/${this.bucket}/${key}`;
    const headers = await this.signRequest("DELETE", path);

    const response = await fetch(`${this.endpoint}${path}`, {
      method: "DELETE",
      headers,
    });

    // 204 No Content is success for DELETE
    if (!response.ok && response.status !== 204) {
      const text = await response.text();
      throw new Error(`R2 DELETE failed: ${response.status} ${text}`);
    }
  }
}

class BrandSyncService {
  private r2: R2Client | null = null;
  private bucket: string;
  private publicUrl: string;
  private enabled: boolean;

  constructor() {
    this.bucket = Deno.env.get("R2_BUCKET_NAME") || "chipp-deno-spa";
    this.publicUrl = Deno.env.get("R2_PUBLIC_URL") || "https://r2.chipp.ai";
    this.enabled = !!Deno.env.get("R2_ENDPOINT");
  }

  /**
   * Get or create R2 client (lazy initialization)
   */
  private getClient(): R2Client | null {
    if (!this.enabled) {
      return null;
    }

    if (!this.r2) {
      const endpoint = Deno.env.get("R2_ENDPOINT");
      const accessKeyId = Deno.env.get("R2_ACCESS_KEY_ID");
      const secretAccessKey = Deno.env.get("R2_SECRET_ACCESS_KEY");

      if (!endpoint || !accessKeyId || !secretAccessKey) {
        console.warn(
          "[BrandSync] R2 credentials not configured, brand sync disabled"
        );
        this.enabled = false;
        return null;
      }

      this.r2 = new R2Client({
        endpoint,
        accessKeyId,
        secretAccessKey,
        bucket: this.bucket,
      });
    }

    return this.r2;
  }

  /**
   * Sync app branding to R2
   * Called when app is created or brandStyles are updated
   */
  async syncAppBranding(app: SyncAppBrandingParams): Promise<void> {
    const client = this.getClient();
    if (!client) {
      console.log("[BrandSync] Skipping sync - R2 not configured");
      return;
    }

    // Use the app's custom logo, or fall back to the PWA-generated icon
    // The PWA icon endpoint generates a branded icon with the app's initial letter
    const apiOrigin =
      Deno.env.get("API_ORIGIN") || "https://dino-mullet.chipp.ai";
    const generatedIconUrl = `${apiOrigin}/consumer/${app.slug}/pwa/icon/192`;

    const config: BrandConfig = {
      slug: app.slug,
      name: app.name,
      description: app.description,
      primaryColor: app.brandStyles?.primaryColor || "#F9DB00",
      backgroundColor: app.brandStyles?.backgroundColor || "#0a0a0a",
      logoUrl: app.brandStyles?.logoUrl || generatedIconUrl,
      ogImageUrl: `${this.publicUrl}/brands/${app.slug}/og.png`,
      updatedAt: new Date().toISOString(),
    };

    try {
      // Upload config.json
      await client.putObject(
        `brands/${app.slug}/config.json`,
        JSON.stringify(config),
        "application/json",
        "public, max-age=3600" // 1 hour cache
      );

      // If custom logo provided, sync it to R2
      if (
        app.brandStyles?.logoUrl &&
        !app.brandStyles.logoUrl.includes(this.publicUrl)
      ) {
        await this.syncLogoFromUrl(app.slug, app.brandStyles.logoUrl);
      }

      console.log(`[BrandSync] Synced branding for ${app.slug}`);
    } catch (error) {
      // Don't fail the app save if R2 sync fails
      console.error(
        `[BrandSync] Failed to sync branding for ${app.slug}:`,
        error
      );
      Sentry.captureException(error, {
        tags: { source: "brand-sync-service", feature: "sync-branding" },
        extra: { slug: app.slug, name: app.name },
      });
    }
  }

  /**
   * Sync a logo image from external URL to R2
   */
  private async syncLogoFromUrl(slug: string, logoUrl: string): Promise<void> {
    const client = this.getClient();
    if (!client) return;

    try {
      const response = await fetch(logoUrl);
      if (!response.ok) {
        console.warn(`[BrandSync] Failed to fetch logo from ${logoUrl}`);
        return;
      }

      const buffer = await response.arrayBuffer();
      const contentType = response.headers.get("content-type") || "image/png";

      // Determine file extension
      const ext = contentType.includes("svg") ? "svg" : "png";

      await client.putObject(
        `brands/${slug}/logo.${ext}`,
        new Uint8Array(buffer),
        contentType,
        "public, max-age=31536000, immutable" // 1 year
      );

      console.log(`[BrandSync] Synced logo for ${slug}`);
    } catch (error) {
      console.error(`[BrandSync] Failed to sync logo for ${slug}:`, error);
      Sentry.captureException(error, {
        tags: { source: "brand-sync-service", feature: "sync-logo" },
        extra: { slug },
      });
    }
  }

  /**
   * Delete all branding assets for an app
   * Called when app is deleted
   */
  async deleteBranding(slug: string): Promise<void> {
    const client = this.getClient();
    if (!client) return;

    const keys = [
      `brands/${slug}/config.json`,
      `brands/${slug}/logo.png`,
      `brands/${slug}/logo.svg`,
      `brands/${slug}/og.png`,
      `brands/${slug}/favicon.ico`,
    ];

    for (const key of keys) {
      try {
        await client.deleteObject(key);
      } catch {
        // Ignore if file doesn't exist
      }
    }

    console.log(`[BrandSync] Deleted branding for ${slug}`);
  }

  /**
   * Upload a tenant branding asset (logo or favicon) to R2.
   * Stores at tenants/{slug}/{type}.{ext} and returns the public URL.
   */
  async uploadTenantAsset(
    slug: string,
    type: "logo" | "favicon",
    body: Uint8Array,
    contentType: string
  ): Promise<string> {
    const client = this.getClient();
    if (!client) {
      throw new Error("R2 not configured - cannot upload assets");
    }

    // Determine file extension from content type
    const extMap: Record<string, string> = {
      "image/png": "png",
      "image/jpeg": "jpg",
      "image/svg+xml": "svg",
      "image/x-icon": "ico",
      "image/vnd.microsoft.icon": "ico",
    };
    const ext = extMap[contentType] || "png";
    const key = `tenants/${slug}/${type}.${ext}`;

    await client.putObject(
      key,
      body,
      contentType,
      "public, max-age=31536000, immutable"
    );

    return `${this.publicUrl}/${key}`;
  }

  /**
   * Check if R2 sync is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }
}

// Export singleton instance
export const brandSyncService = new BrandSyncService();
