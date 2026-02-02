/**
 * Upload Validation Schemas
 */

import { z } from "zod";

export const uploadFileSchema = z.object({
  applicationId: z.string().uuid("Invalid application ID"),
});

export type UploadFileInput = z.infer<typeof uploadFileSchema>;

