export type State = "REGISTERED" | "PROFILED" | "SUGGESTED" | "READY" | "ANALYZED";

export interface Session {
  datasetId: string;
  state: State;
  suggestedPresetIds: string[];
  processed?: {
    uri: string;
    checksum: string;
    presetId: string;
    profileId: string;
    recipeVersion: string;
    rowCount?: number;
    schema?: {
      time_col: string;
      value_cols: string[];
    };
  };
  owner: {
    user: string;
    tenant: string;
  };
}

export interface AuthContext {
  user: string;
  tenant: string;
  scopes: string[];
  token: string;
}

export interface ErrorResponse {
  error: string;
  message: string;
  next: NextAction[];
  audit_id?: string;
}

export interface NextAction {
  tool: string;
  args: Record<string, any>;
}

export interface PreprocessCandidate {
  preset_id: string;
  label: string;
  why: string[];
  steps_brief: string[];
  docs_uri: string;
}

export interface ToolExecutionContext {
  auth: AuthContext;
  sessionId?: string;
  auditId: string;
}

export interface AuditLog {
  timestamp: string;
  user: string;
  tenant: string;
  scopes: string[];
  tool: string;
  input_hash: string;
  preset_id?: string;
  session_id?: string;
  output_uri?: string;
  audit_id: string;
  success: boolean;
  error?: string;
}

export const errorNext = (
  code: string,
  message: string,
  next: NextAction[],
  auditId?: string
): ErrorResponse => ({
  error: code,
  message,
  next,
  audit_id: auditId,
});
