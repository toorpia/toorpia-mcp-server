import { z } from "zod";

export const ConfirmPreprocessedInput = z.object({
  dataset_id: z.string().min(1),
  processed_uri: z.string().regex(/^(file|s3|gs):\/\/.+/),
  manifest: z.object({
    preset_id: z.string().min(1),
    profile_id: z.string().min(1),
    recipe_version: z.string().min(1),
    checksum: z.string().regex(/^sha(256|512):[a-f0-9]{64,128}$/),
    row_count: z.number().int().min(1),
    schema: z.object({
      time_col: z.string().min(1),
      value_cols: z.array(z.string().min(1)).min(1)
    })
  })
});

export type ConfirmPreprocessedInputT = z.infer<typeof ConfirmPreprocessedInput>;

export const ConfirmPreprocessedOutput = z.object({
  ready: z.boolean(),
  session_id: z.string(),
  audit_id: z.string()
});

export type ConfirmPreprocessedOutputT = z.infer<typeof ConfirmPreprocessedOutput>;
