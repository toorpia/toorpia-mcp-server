import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';
import { AuditLog, AuthContext } from '../types';
import { createLogger } from './logger';

const logger = createLogger('Audit');

// Ensure audit log directory exists
const AUDIT_DIR = './var/logs';
const AUDIT_FILE = join(AUDIT_DIR, 'tool_calls.jsonl');

if (!existsSync(AUDIT_DIR)) {
  mkdirSync(AUDIT_DIR, { recursive: true });
}

/**
 * Hash input for privacy/security
 */
function hashInput(input: any): string {
  return createHash('sha256').update(JSON.stringify(input)).digest('hex').slice(0, 16);
}

/**
 * Write audit log entry
 */
export function writeAuditLog(
  auth: AuthContext,
  tool: string,
  input: any,
  success: boolean,
  auditId: string,
  presetId?: string,
  sessionId?: string,
  outputUri?: string,
  error?: string
): void {
  const auditEntry: AuditLog = {
    timestamp: new Date().toISOString(),
    user: auth.user,
    tenant: auth.tenant,
    scopes: auth.scopes,
    tool,
    input_hash: hashInput(input),
    preset_id: presetId,
    session_id: sessionId,
    output_uri: outputUri,
    audit_id: auditId,
    success,
    error
  };

  try {
    const logLine = JSON.stringify(auditEntry) + '\n';
    writeFileSync(AUDIT_FILE, logLine, { flag: 'a' });
    logger.debug(`Audit log written for ${tool} by ${auth.user}@${auth.tenant}`);
  } catch (writeError) {
    logger.error('Failed to write audit log:', writeError);
  }
}

/**
 * Create audit context for tool execution
 */
export function createAuditContext(
  auth: AuthContext,
  tool: string,
  input: any,
  auditId: string
): {
  logSuccess: (presetId?: string, sessionId?: string, outputUri?: string) => void;
  logError: (error: string, presetId?: string, sessionId?: string) => void;
} {
  return {
    logSuccess: (presetId?: string, sessionId?: string, outputUri?: string) => {
      writeAuditLog(auth, tool, input, true, auditId, presetId, sessionId, outputUri);
    },
    logError: (error: string, presetId?: string, sessionId?: string) => {
      writeAuditLog(auth, tool, input, false, auditId, presetId, sessionId, undefined, error);
    }
  };
}

export default {
  writeAuditLog,
  createAuditContext
};
