import { z } from "zod";

export const UploadDataInput = z.object({
  csv_data: z.string().min(1),
  filename: z.string().default("data.csv").optional()
});

export type UploadDataInputT = z.infer<typeof UploadDataInput>;

export const UploadDataOutput = z.object({
  success: z.boolean(),
  dataId: z.string().optional(),
  message: z.string().optional(),
  filename: z.string().optional(),
  error: z.string().optional(),
  tool: z.string(),
  timestamp: z.string(),
  audit_id: z.string()
});

export type UploadDataOutputT = z.infer<typeof UploadDataOutput>;
