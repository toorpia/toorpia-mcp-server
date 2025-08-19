import { z } from "zod";

export const RunAnalysisInput = z.object({
  session_id: z.string().min(1),
  analysis_type: z.enum(["clustering", "anomaly_detection"]).default("clustering"),
  parameters: z.record(z.any()).default({}).optional()
});

export type RunAnalysisInputT = z.infer<typeof RunAnalysisInput>;

export const RunAnalysisOutput = z.object({
  success: z.boolean(),
  analysisId: z.string().optional(),
  status: z.string().optional(),
  estimatedTime: z.string().optional(),
  error: z.string().optional(),
  tool: z.string(),
  timestamp: z.string(),
  audit_id: z.string()
});

export type RunAnalysisOutputT = z.infer<typeof RunAnalysisOutput>;
