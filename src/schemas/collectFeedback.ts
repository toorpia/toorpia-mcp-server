import { z } from "zod";

export const CollectFeedbackInput = z.object({
  feedback_type: z.enum(["bug_report", "feature_request", "usage_experience", "performance_issue"]),
  title: z.string().min(1),
  description: z.string().min(1),
  context: z.record(z.any()).default({}).optional(),
  rating: z.number().int().min(1).max(5).optional()
});

export type CollectFeedbackInputT = z.infer<typeof CollectFeedbackInput>;

export const CollectFeedbackOutput = z.object({
  success: z.boolean(),
  feedback_id: z.string().optional(),
  message: z.string().optional(),
  error: z.string().optional(),
  tool: z.string(),
  timestamp: z.string(),
  audit_id: z.string()
});

export type CollectFeedbackOutputT = z.infer<typeof CollectFeedbackOutput>;
