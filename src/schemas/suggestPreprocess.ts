import { z } from "zod";

export const SuggestPreprocessInput = z.object({
  dataset_id: z.string().min(1),
  topk: z.number().int().min(1).max(10).default(5).optional()
});

export type SuggestPreprocessInputT = z.infer<typeof SuggestPreprocessInput>;

export const PreprocessCandidateSchema = z.object({
  preset_id: z.string(),
  label: z.string(),
  why: z.array(z.string()),
  steps_brief: z.array(z.string()),
  docs_uri: z.string()
});

export const SuggestPreprocessOutput = z.object({
  candidates: z.array(PreprocessCandidateSchema),
  audit_id: z.string()
});

export type SuggestPreprocessOutputT = z.infer<typeof SuggestPreprocessOutput>;
