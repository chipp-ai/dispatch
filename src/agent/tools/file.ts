/**
 * File Tools for Chipp Deno Agent
 *
 * Provides file generation capabilities using OpenAI's Assistants API with Code Interpreter.
 */

import { z } from "zod";
import type { ToolRegistry } from "../registry.ts";
import { uploadFileFromBuffer } from "../../services/storage.service.ts";
import OpenAI from "openai";
import * as Sentry from "@sentry/deno";

/**
 * Get the OpenAI client instance
 */
function getOpenAIClient(): OpenAI {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY environment variable not set");
  }
  return new OpenAI({ apiKey });
}

/**
 * Ensure a filename has the correct extension
 */
function ensureFileExtension(fileName: string, fileType: string): string {
  const lastDotIndex = fileName.lastIndexOf(".");
  const nameWithoutExt =
    lastDotIndex > 0 ? fileName.substring(0, lastDotIndex) : fileName;
  return `${nameWithoutExt}.${fileType}`;
}

/**
 * Generate a file using OpenAI Code Interpreter
 */
async function generateFileWithCodeInterpreter(
  fileType: string,
  fileName: string,
  specifications: string,
  fileIds?: string[]
): Promise<{
  success: boolean;
  fileUrl?: string;
  fileName?: string;
  error?: string;
}> {
  const openai = getOpenAIClient();
  const normalizedFileName = ensureFileExtension(fileName, fileType);

  try {
    // Create an assistant with code interpreter
    const assistant = await openai.beta.assistants.create({
      name: "File Generator",
      instructions: `Generate a ${fileType} file named ${normalizedFileName} according to the given specifications. Use the Code Interpreter to create the file.
Only return the generated file - no extra text or explanations.`,
      model: "gpt-4o-2024-08-06",
      tools: [{ type: "code_interpreter" }],
      tool_resources: fileIds
        ? { code_interpreter: { file_ids: fileIds } }
        : undefined,
    });

    // Create a thread and send the message
    const thread = await openai.beta.threads.create();

    await openai.beta.threads.messages.create(thread.id, {
      role: "user",
      content: `Please generate a ${fileType} file named ${normalizedFileName} with the following specifications: ${specifications}`,
    });

    // Run the assistant
    const run = await openai.beta.threads.runs.create(thread.id, {
      assistant_id: assistant.id,
    });

    // Poll for completion
    let runStatus = await openai.beta.threads.runs.retrieve(thread.id, run.id);

    const maxAttempts = 60; // 60 seconds timeout
    let attempts = 0;

    while (
      runStatus.status !== "completed" &&
      runStatus.status !== "failed" &&
      attempts < maxAttempts
    ) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      runStatus = await openai.beta.threads.runs.retrieve(thread.id, run.id);
      attempts++;
    }

    if (runStatus.status === "failed") {
      await openai.beta.assistants.del(assistant.id);
      return {
        success: false,
        error: runStatus.last_error?.message || "File generation failed",
      };
    }

    if (attempts >= maxAttempts) {
      await openai.beta.assistants.del(assistant.id);
      return { success: false, error: "File generation timed out" };
    }

    // Get the messages and look for attachments
    const messages = await openai.beta.threads.messages.list(thread.id);
    const lastMessage = messages.data[0];

    if (!lastMessage.attachments || lastMessage.attachments.length === 0) {
      await openai.beta.assistants.del(assistant.id);
      return { success: false, error: "No file was generated" };
    }

    // Download and persist the first attachment
    const attachment = lastMessage.attachments[0];
    const fileContent = await openai.files.content(attachment.file_id!);
    const arrayBuffer = await fileContent.arrayBuffer();
    const buffer = new Uint8Array(arrayBuffer);

    // Determine content type based on file type
    const contentTypeMap: Record<string, string> = {
      csv: "text/csv",
      pdf: "application/pdf",
      docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      json: "application/json",
      txt: "text/plain",
    };
    const contentType =
      contentTypeMap[fileType.toLowerCase()] || "application/octet-stream";

    // Upload to cloud storage
    const timestamp = Date.now();
    const storagePath = `generated-files/${timestamp}-${normalizedFileName}`;
    const fileUrl = await uploadFileFromBuffer(
      buffer,
      storagePath,
      contentType
    );

    // Clean up
    await openai.beta.assistants.del(assistant.id);

    return {
      success: true,
      fileUrl,
      fileName: normalizedFileName,
    };
  } catch (error) {
    console.error("Error generating file:", error);
    Sentry.captureException(error, {
      tags: { source: "agent-file-tool", feature: "generate-file" },
      extra: { fileType, fileName },
    });
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Register file tools with the agent registry
 */
export function registerFileTools(registry: ToolRegistry): void {
  registry.register({
    name: "generateFile",
    description:
      "Generate a file (CSV, PDF, DOCX, XLSX, etc.) using AI code interpreter based on user specifications. Use this when the user asks to generate a document, spreadsheet, or data file. Images are not supported - use generateImage instead.",
    parameters: z.object({
      fileType: z
        .string()
        .refine(
          (type) =>
            !["image", "png", "jpg", "jpeg", "gif"].includes(
              type.toLowerCase()
            ),
          "Image generation is not supported by this tool. Use generateImage instead."
        )
        .describe(
          "The type of file to generate (e.g., 'csv', 'pdf', 'docx', 'xlsx', 'json', 'txt'). Images are not supported."
        ),
      fileName: z
        .string()
        .describe(
          "The desired name for the generated file (without extension). The extension will be added automatically based on fileType."
        ),
      specifications: z
        .string()
        .describe(
          "Detailed specifications for the file content and structure. Be specific about what data, format, and layout you need."
        ),
      fileIds: z
        .array(z.string())
        .optional()
        .describe(
          "Optional: File IDs from previously uploaded files to use as source data for generating the new file."
        ),
    }),
    execute: async ({ fileType, fileName, specifications, fileIds }) => {
      const result = await generateFileWithCodeInterpreter(
        fileType,
        fileName,
        specifications,
        fileIds
      );

      if (result.success) {
        return {
          success: true,
          message: `File "${result.fileName}" generated successfully`,
          downloadLink: `[${result.fileName}](${result.fileUrl})`,
          fileUrl: result.fileUrl,
          fileName: result.fileName,
        };
      } else {
        return {
          success: false,
          message: `Failed to generate file: ${result.error}`,
          error: result.error,
        };
      }
    },
  });
}
