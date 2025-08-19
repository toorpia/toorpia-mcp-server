import { z } from "zod";

export const GetStatusInput = z.object({
  analysis_id: z.string().min(1)
});

export type GetStatusInputT = z.infer<typeof GetStatusInput>;

export const GetStatusOutput = z.object({
  success: z.boolean(),
  analysis_id: z.string(),
  status: z.string().optional(),
  progress: z.number().optional(),
  eta: z.string().optional(),
  error_code: z.string().optional().nullable(),
  results: z.any().optional(),
  error: z.string().optional(),
  tool: z.string(),
  timestamp: z.string(),
  audit_id: z.string()
});

export type GetStatusOutputT = z.infer<typeof GetStatusOutput>;
