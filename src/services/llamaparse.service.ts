/**
 * LlamaParse Service for Deno
 *
 * Uses LlamaCloud REST API directly to extract and semantically chunk documents.
 * This provides intelligent splitting based on document structure rather than
 * fixed character counts, preserving meaning across chunks.
 *
 * Uses REST API directly instead of llamaindex SDK to avoid heavy Node.js dependencies.
 */

import { log } from "@/lib/logger.ts";

const LLAMA_CLOUD_API_KEY = Deno.env.get("LLAMA_CLOUD_API_KEY");
const LLAMA_PARSE_API_URL = "https://api.cloud.llamaindex.ai/api/parsing";

export interface LlamaParseResult {
  chunks: string[];
  pageCount: number;
}

interface ParseJobResponse {
  id: string;
  status: string;
}

interface ParseResultResponse {
  markdown: string;
  pages?: { page_number: number; markdown: string }[];
}

/**
 * Check if LlamaParse is available (API key configured)
 */
export function isLlamaParseAvailable(): boolean {
  return !!LLAMA_CLOUD_API_KEY;
}

/**
 * Extract text from a file using LlamaParse with semantic chunking.
 * Returns an array of chunks based on document structure (pages, sections).
 */
export async function extractWithLlamaParse(
  fileUrl: string,
  mimeType?: string
): Promise<LlamaParseResult> {
  if (!LLAMA_CLOUD_API_KEY) {
    throw new Error("LLAMA_CLOUD_API_KEY not configured");
  }

  log.info("Starting extraction", { source: "llamaparse", feature: "extract", fileUrl, mimeType });

  // Download file content
  const response = await fetch(fileUrl);
  if (!response.ok) {
    throw new Error(`Failed to download file: ${response.status}`);
  }
  const fileBuffer = await response.arrayBuffer();

  // Extract filename from URL
  const urlPath = new URL(fileUrl).pathname;
  const fileName = urlPath.split("/").pop() || "document";

  // Create multipart form data
  const formData = new FormData();
  const blob = new Blob([fileBuffer], {
    type: mimeType || "application/octet-stream",
  });
  formData.append("file", blob, fileName);

  // Configure parsing options
  formData.append("result_type", "markdown");
  formData.append("auto_mode", "true");
  formData.append("auto_mode_trigger_on_image_in_page", "true");
  formData.append("auto_mode_trigger_on_table_in_page", "true");

  // Submit parsing job
  log.debug("Submitting job", { source: "llamaparse", feature: "extract" });
  const uploadResponse = await fetch(`${LLAMA_PARSE_API_URL}/upload`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LLAMA_CLOUD_API_KEY}`,
    },
    body: formData,
  });

  if (!uploadResponse.ok) {
    const errorText = await uploadResponse.text();
    throw new Error(
      `LlamaParse upload failed: ${uploadResponse.status} - ${errorText}`
    );
  }

  const job: ParseJobResponse = await uploadResponse.json();
  log.debug("Job created", { source: "llamaparse", feature: "extract", jobId: job.id });

  // Poll for completion
  const result = await pollForResult(job.id);

  // Parse result into chunks
  let chunks: string[] = [];
  let pageCount = 0;

  if (result.pages && result.pages.length > 0) {
    // If we have page-level results, use them as semantic chunks
    chunks = result.pages
      .map((p) => p.markdown)
      .filter((text) => text && text.trim().length > 0);
    pageCount = result.pages.length;
  } else if (result.markdown) {
    // Single markdown result - split by headers for semantic chunks
    chunks = splitByHeaders(result.markdown);
    pageCount = 1;
  }

  log.info("Extraction complete", {
    source: "llamaparse",
    feature: "extract",
    pageCount,
    chunkCount: chunks.length,
    totalChars: chunks.reduce((sum, c) => sum + c.length, 0),
  });

  return { chunks, pageCount };
}

/**
 * Poll for parsing result with timeout
 */
async function pollForResult(jobId: string): Promise<ParseResultResponse> {
  const maxWaitMs = 10 * 60 * 1000; // 10 minutes
  const pollIntervalMs = 2000; // 2 seconds
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitMs) {
    const statusResponse = await fetch(`${LLAMA_PARSE_API_URL}/job/${jobId}`, {
      headers: {
        Authorization: `Bearer ${LLAMA_CLOUD_API_KEY}`,
      },
    });

    if (!statusResponse.ok) {
      throw new Error(`Failed to check job status: ${statusResponse.status}`);
    }

    const status: ParseJobResponse = await statusResponse.json();

    if (status.status === "SUCCESS") {
      // Get the result
      const resultResponse = await fetch(
        `${LLAMA_PARSE_API_URL}/job/${jobId}/result/markdown`,
        {
          headers: {
            Authorization: `Bearer ${LLAMA_CLOUD_API_KEY}`,
          },
        }
      );

      if (!resultResponse.ok) {
        throw new Error(`Failed to get result: ${resultResponse.status}`);
      }

      return await resultResponse.json();
    }

    if (status.status === "ERROR") {
      throw new Error(`LlamaParse job failed: ${jobId}`);
    }

    // Wait before polling again
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  throw new Error(`LlamaParse job timed out after ${maxWaitMs / 1000}s`);
}

/**
 * Split markdown content by headers for semantic chunking
 */
function splitByHeaders(markdown: string): string[] {
  // Split by h1 and h2 headers
  const chunks: string[] = [];
  const sections = markdown.split(/(?=^#{1,2}\s)/m);

  for (const section of sections) {
    const trimmed = section.trim();
    if (trimmed.length > 0) {
      chunks.push(trimmed);
    }
  }

  // If no headers found, return the whole content as one chunk
  if (chunks.length === 0 && markdown.trim().length > 0) {
    chunks.push(markdown.trim());
  }

  return chunks;
}

/**
 * Extract from a file buffer (for files already in memory)
 */
export async function extractFromBuffer(
  buffer: Uint8Array,
  fileName: string,
  mimeType?: string
): Promise<LlamaParseResult> {
  if (!LLAMA_CLOUD_API_KEY) {
    throw new Error("LLAMA_CLOUD_API_KEY not configured");
  }

  log.info("Starting extraction from buffer", {
    source: "llamaparse",
    feature: "extract-buffer",
    fileName,
    mimeType,
  });

  // Create multipart form data
  const formData = new FormData();
  // Create a new Uint8Array copy to ensure we have a proper ArrayBuffer
  const bufferCopy = new Uint8Array(buffer);
  const blob = new Blob([bufferCopy], {
    type: mimeType || "application/octet-stream",
  });
  formData.append("file", blob, fileName);

  // Configure parsing options
  formData.append("result_type", "markdown");
  formData.append("auto_mode", "true");

  // Submit parsing job
  const uploadResponse = await fetch(`${LLAMA_PARSE_API_URL}/upload`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LLAMA_CLOUD_API_KEY}`,
    },
    body: formData,
  });

  if (!uploadResponse.ok) {
    const errorText = await uploadResponse.text();
    throw new Error(
      `LlamaParse upload failed: ${uploadResponse.status} - ${errorText}`
    );
  }

  const job: ParseJobResponse = await uploadResponse.json();
  const result = await pollForResult(job.id);

  let chunks: string[] = [];
  let pageCount = 0;

  if (result.pages && result.pages.length > 0) {
    chunks = result.pages
      .map((p) => p.markdown)
      .filter((text) => text && text.trim().length > 0);
    pageCount = result.pages.length;
  } else if (result.markdown) {
    chunks = splitByHeaders(result.markdown);
    pageCount = 1;
  }

  return { chunks, pageCount };
}

/**
 * Check if a file type is supported by LlamaParse
 */
export function isSupportedFileType(mimeType: string): boolean {
  const supportedTypes = [
    // Documents
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    // Text
    "text/plain",
    "text/markdown",
    "text/csv",
    "text/html",
    // Data
    "application/json",
    "application/xml",
    "text/xml",
  ];

  return supportedTypes.some((t) => mimeType.includes(t)) || mimeType === "";
}

export const llamaParseService = {
  isLlamaParseAvailable,
  extractWithLlamaParse,
  extractFromBuffer,
  isSupportedFileType,
};
