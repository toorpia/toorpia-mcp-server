import { Session, State, errorNext, AuthContext } from '../types';
import { createLogger } from '../utils/logger';

const logger = createLogger('Guard');

// In-memory session storage (for MVP - replace with persistent storage later)
const sessions = new Map<string, Session>();
const sessionsByDataset = new Map<string, string>(); // datasetId -> sessionId

/**
 * Create a new session
 */
export function createSession(
  datasetId: string,
  suggestedPresetIds: string[],
  owner: { user: string; tenant: string }
): string {
  const sessionId = `sess_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  const session: Session = {
    datasetId,
    state: "SUGGESTED",
    suggestedPresetIds,
    owner
  };
  
  sessions.set(sessionId, session);
  sessionsByDataset.set(datasetId, sessionId);
  
  logger.info(`Created session ${sessionId} for dataset ${datasetId}`);
  return sessionId;
}

/**
 * Get session by ID
 */
export function getSession(sessionId: string): Session | undefined {
  return sessions.get(sessionId);
}

/**
 * Get session by dataset ID
 */
export function getSessionByDataset(datasetId: string): Session | undefined {
  const sessionId = sessionsByDataset.get(datasetId);
  return sessionId ? sessions.get(sessionId) : undefined;
}

/**
 * Update session state and processed data
 */
export function updateSession(
  sessionId: string,
  state: State,
  processed?: Session['processed']
): boolean {
  const session = sessions.get(sessionId);
  if (!session) {
    return false;
  }
  
  session.state = state;
  if (processed) {
    session.processed = processed;
  }
  
  sessions.set(sessionId, session);
  logger.info(`Updated session ${sessionId} state to ${state}`);
  return true;
}

/**
 * READY gate guard - checks if session is in READY state
 */
export function checkReadyGate(
  sessionId: string,
  auth: AuthContext,
  auditId: string
): { passed: boolean; session?: Session; error?: any } {
  
  const session = sessions.get(sessionId);
  
  if (!session) {
    return {
      passed: false,
      error: errorNext(
        "SESSION_NOT_FOUND",
        "指定されたセッションが見つかりません。",
        [
          {
            tool: "toorpia_upload_data",
            args: { csv_data: "your_csv_data" }
          }
        ],
        auditId
      )
    };
  }
  
  // Check ownership
  if (session.owner.user !== auth.user || session.owner.tenant !== auth.tenant) {
    return {
      passed: false,
      error: errorNext(
        "ACCESS_DENIED",
        "このセッションにアクセスする権限がありません。",
        [],
        auditId
      )
    };
  }
  
  // Check if session is READY
  if (session.state !== "READY") {
    const nextActions = [];
    
    if (session.state === "REGISTERED") {
      nextActions.push({
        tool: "toorpia_suggest_preprocess",
        args: { dataset_id: session.datasetId }
      });
    } else if (session.state === "SUGGESTED") {
      nextActions.push({
        tool: "toorpia_confirm_preprocessed",
        args: {
          dataset_id: session.datasetId,
          processed_uri: "your_processed_file_uri",
          manifest: {
            preset_id: session.suggestedPresetIds[0] || "preset_id",
            profile_id: "profile_id",
            recipe_version: "v1.0",
            checksum: "sha256:your_checksum",
            row_count: 1000,
            schema: {
              time_col: "timestamp",
              value_cols: ["value1", "value2"]
            }
          }
        }
      });
    }
    
    return {
      passed: false,
      error: errorNext(
        "PREPROCESS_REQUIRED",
        "前処理の提案と処理済み確認を完了してください。",
        nextActions,
        auditId
      )
    };
  }
  
  return {
    passed: true,
    session
  };
}

/**
 * Check if user has required scope
 */
export function checkScope(auth: AuthContext, requiredScope: string): boolean {
  return auth.scopes.includes(requiredScope) || auth.scopes.includes('*');
}

/**
 * Generate audit ID
 */
export function generateAuditId(): string {
  const timestamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 15);
  const random = Math.random().toString(36).substr(2, 9);
  return `audit_${timestamp}_${random}`;
}

/**
 * List all active sessions for debugging
 */
export function listSessions(): { sessionId: string; session: Session }[] {
  return Array.from(sessions.entries()).map(([sessionId, session]) => ({
    sessionId,
    session
  }));
}

/**
 * Clean up expired sessions (simple TTL implementation)
 */
export function cleanupSessions(maxAgeMs: number = 24 * 60 * 60 * 1000): void {
  const now = Date.now();
  const expired: string[] = [];
  
  sessions.forEach((session, sessionId) => {
    // Extract timestamp from session ID (sess_timestamp_random)
    const parts = sessionId.split('_');
    if (parts.length >= 2) {
      const timestamp = parseInt(parts[1]);
      if (now - timestamp > maxAgeMs) {
        expired.push(sessionId);
      }
    }
  });
  
  expired.forEach(sessionId => {
    const session = sessions.get(sessionId);
    if (session) {
      sessionsByDataset.delete(session.datasetId);
      sessions.delete(sessionId);
      logger.info(`Cleaned up expired session ${sessionId}`);
    }
  });
}
