/**
 * Storage Service
 *
 * Handles file uploads to Google Cloud Storage.
 * Uses the Google Cloud Storage SDK for Deno.
 */

import { Storage } from "npm:@google-cloud/storage";
import { decode as base64Decode } from "https://deno.land/std@0.208.0/encoding/base64.ts";
import { log } from "@/lib/logger.ts";

let storageClient: Storage | null = null;

function getStorageClient(): Storage {
  if (!storageClient) {
    const bucketName = Deno.env.get("GCS_FILE_BUCKET");
    if (!bucketName) {
      throw new Error("GCS_FILE_BUCKET environment variable not set");
    }

    // Get service account credentials from base64-encoded env var
    const base64Key = Deno.env.get("GOOGLE_SERVICE_KEY_BASE_64");
    let credentials = {};

    if (base64Key && base64Key.trim() !== "") {
      try {
        const jsonString = new TextDecoder().decode(base64Decode(base64Key));
        credentials = JSON.parse(jsonString);
      } catch (error) {
        log.error("Failed to parse service key", {
          source: "storage",
          feature: "service-key-parse",
          bucket: bucketName,
        }, error);
      }
    } else {
      log.warn("GOOGLE_SERVICE_KEY_BASE_64 not set, using default credentials", {
        source: "storage",
        feature: "service-key-parse",
      });
    }

    storageClient = new Storage({
      credentials,
      projectId: Deno.env.get("GOOGLE_CLOUD_PROJECT") || "chippai-398019",
    });
  }
  return storageClient;
}

/**
 * Upload a file to Google Cloud Storage
 */
export async function uploadFile(
  filePath: string,
  destinationPath: string,
  contentType?: string
): Promise<string> {
  const storage = getStorageClient();
  const bucketName = Deno.env.get("GCS_FILE_BUCKET")!;
  const bucket = storage.bucket(bucketName);

  const file = bucket.file(destinationPath);

  // Upload options
  const options: {
    contentType?: string;
    metadata?: {
      cacheControl?: string;
    };
  } = {};

  if (contentType) {
    options.contentType = contentType;
  }

  // Set cache control for public files (1 year)
  if (destinationPath.startsWith("public/")) {
    options.metadata = {
      cacheControl: "public, max-age=31536000, immutable",
    };
  }

  // Upload file
  await file.save(await Deno.readFile(filePath), options);

  // Note: Bucket uses uniform bucket-level access, so individual ACLs aren't needed.
  // Public access is controlled by bucket IAM policies.

  // Return public URL
  return `https://storage.googleapis.com/${bucketName}/${destinationPath}`;
}

/**
 * Upload file from buffer/bytes
 */
export async function uploadFileFromBuffer(
  buffer: Uint8Array,
  destinationPath: string,
  contentType?: string
): Promise<string> {
  const storage = getStorageClient();
  const bucketName = Deno.env.get("GCS_FILE_BUCKET")!;
  const bucket = storage.bucket(bucketName);

  const file = bucket.file(destinationPath);

  const options: {
    contentType?: string;
    metadata?: {
      cacheControl?: string;
    };
  } = {};

  if (contentType) {
    options.contentType = contentType;
  }

  if (destinationPath.startsWith("public/")) {
    options.metadata = {
      cacheControl: "public, max-age=31536000, immutable",
    };
  }

  await file.save(buffer, options);

  // Note: Bucket uses uniform bucket-level access, so individual ACLs aren't needed.
  // Public access is controlled by bucket IAM policies.

  return `https://storage.googleapis.com/${bucketName}/${destinationPath}`;
}

/**
 * Upload image to the public images bucket (chipp-images)
 * This bucket is configured for public read access.
 */
export async function uploadImageToPublicBucket(
  buffer: Uint8Array,
  destinationPath: string,
  contentType?: string
): Promise<string> {
  const storage = getStorageClient();
  // Use the public images bucket (different from chipp-application-files)
  const publicBucket = Deno.env.get("PUBLIC_IMAGES_BUCKET") || "chipp-images";
  const bucket = storage.bucket(publicBucket);

  const file = bucket.file(destinationPath);

  const options: {
    contentType?: string;
    metadata?: {
      cacheControl?: string;
    };
  } = {
    metadata: {
      cacheControl: "public, max-age=31536000, immutable",
    },
  };

  if (contentType) {
    options.contentType = contentType;
  }

  await file.save(buffer, options);

  // Return public URL
  return `https://storage.googleapis.com/${publicBucket}/${destinationPath}`;
}

/**
 * Delete a file from Google Cloud Storage
 */
export async function deleteFile(filePath: string): Promise<void> {
  const storage = getStorageClient();
  const bucketName = Deno.env.get("GCS_FILE_BUCKET")!;
  const bucket = storage.bucket(bucketName);

  const file = bucket.file(filePath);
  await file.delete();
}

/**
 * Get a signed URL for temporary access to a private file
 */
export async function getSignedUrl(
  filePath: string,
  expiresInSeconds = 3600
): Promise<string> {
  const storage = getStorageClient();
  const bucketName = Deno.env.get("GCS_FILE_BUCKET")!;
  const bucket = storage.bucket(bucketName);

  const file = bucket.file(filePath);

  const [url] = await file.getSignedUrl({
    action: "read",
    expires: Date.now() + expiresInSeconds * 1000,
  });

  return url;
}
