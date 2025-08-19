#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import dotenv from 'dotenv';
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

// Import our TypeScript modules
import { createLogger } from './utils/logger';
import { ToorpiaBackendClient } from './utils/backendClient';
import { authenticateRequest } from './middleware/auth';
import { 
  createSession, 
  getSession, 
  getSessionByDataset,
  updateSession,
  checkReadyGate,
  checkScope,
  generateAuditId,
  cleanupSessions
} from './middleware/guard';
import { createAuditContext } from './utils/audit';
import { errorNext, AuthContext, PreprocessCandidate } from './types';

// Import Zod schemas
import { UploadDataInput, UploadDataOutput } from './schemas/uploadData';
import { SuggestPreprocessInput, SuggestPreprocessOutput } from './schemas/suggestPreprocess';
import { ConfirmPreprocessedInput, ConfirmPreprocessedOutput } from './schemas/confirmPreprocessed';
import { RunAnalysisInput, RunAnalysisOutput } from './schemas/runAnalysis';
import { GetStatusInput, GetStatusOutput } from './schemas/getStatus';
import { CollectFeedbackInput, CollectFeedbackOutput } from './schemas/collectFeedback';

// Load environment variables
dotenv.config();

// Initialize logger and client
const logger = createLogger('ToorpiaMCPServer');
const backendClient = new ToorpiaBackendClient();

// Simple file-based feedback storage
const FEEDBACK_DIR = process.env.FEEDBACK_DIR || './feedback';
if (!existsSync(FEEDBACK_DIR)) {
  mkdirSync(FEEDBACK_DIR, { recursive: true });
}

// Cleanup sessions on startup and periodically
cleanupSessions();
setInterval(() => cleanupSessions(), 60 * 60 * 1000); // Every hour

class ToorpiaMCPServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: 'toorpia-mcp-server',
        version: '2.0.0',
      },
      {
        capabilities: {
          resources: {},
          tools: {},
        },
      }
    );
  }

  async initialize(): Promise<void> {
    try {
      logger.info('Initializing TypeScript toorpia MCP Server with preprocessing workflow...');
      
      // Test backend connection
      const connectionTest = await backendClient.testConnection();
      if (connectionTest.status === 'error') {
        logger.warn('Backend connection test failed:', connectionTest.error);
      } else {
        logger.info('Backend connection successful');
      }

      this.setupHandlers();
      logger.info('TypeScript toorpia MCP Server initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize server:', error);
      throw error;
    }
  }

  private setupHandlers(): void {
    // List tools handler
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      const tools = [
        {
          name: 'toorpia_upload_data',
          description: 'Upload CSV data to toorpia backend for analysis',
          inputSchema: UploadDataInput,
        },
        {
          name: 'toorpia_suggest_preprocess',
          description: 'Get preprocessing suggestions for uploaded data',
          inputSchema: SuggestPreprocessInput,
        },
        {
          name: 'toorpia_confirm_preprocessed',
          description: 'Confirm preprocessed data and create analysis session',
          inputSchema: ConfirmPreprocessedInput,
        },
        {
          name: 'toorpia_run_analysis',
          description: 'Run analysis on preprocessed data (requires READY session)',
          inputSchema: RunAnalysisInput,
        },
        {
          name: 'toorpia_get_status',
          description: 'Get analysis status and results',
          inputSchema: GetStatusInput,
        },
        {
          name: 'toorpia_collect_feedback',
          description: 'Collect user feedback about toorpia experience',
          inputSchema: CollectFeedbackInput,
        },
      ];

      return { tools };
    });

    // Call tool handler with authentication and audit logging
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name: toolName, arguments: args } = request.params;
      const auditId = generateAuditId();

      try {
        // Authenticate request
        const auth = await authenticateRequest(
          (request.params as any)._meta?.authorization as string | undefined,
          process.env.NODE_ENV === 'development'
        );

        logger.info(`Executing tool: ${toolName} by ${auth.user}@${auth.tenant}`);

        // Create audit context
        const audit = createAuditContext(auth, toolName, args, auditId);

        // Execute tool with authentication and auditing
        const result = await this.executeTool(toolName, args, auth, auditId);
        
        // Log success
        const sessionId = result.session_id || undefined;
        const presetId = result.preset_id || undefined;
        audit.logSuccess(presetId, sessionId);

        logger.info(`Tool ${toolName} executed successfully`);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };

      } catch (error: any) {
        logger.error(`Error executing tool ${toolName}:`, error);

        // Log error if auth was successful
        try {
          const auth = await authenticateRequest(
            (request.params as any)._meta?.authorization as string | undefined, 
            true
          );
          const audit = createAuditContext(auth, toolName, args, auditId);
          audit.logError(error.message);
        } catch (authError) {
          // Auth failed, skip audit logging
        }

        throw new McpError(
          ErrorCode.InternalError,
          `Error executing tool ${toolName}: ${error.message}`
        );
      }
    });

    // List resources handler
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      const resources = [
        {
          uri: 'toorpia://status',
          name: 'Toorpia Status',
          description: 'Current status of toorpia backend API and sessions',
          mimeType: 'application/json',
        },
        {
          uri: 'toorpia://help',
          name: 'Toorpia Help',
          description: 'Usage guide for preprocessing workflow',
          mimeType: 'text/markdown',
        },
      ];

      return { resources };
    });

    // Read resource handler
    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const { uri } = request.params;

      try {
        logger.info(`Reading resource: ${uri}`);
        const content = await this.readResource(uri);
        
        const mimeType = uri.includes('status') ? 'application/json' : 'text/markdown';
        
        return {
          contents: [
            {
              uri,
              mimeType,
              text: content,
            },
          ],
        };
      } catch (error: any) {
        logger.error(`Error reading resource ${uri}:`, error);
        throw new McpError(
          ErrorCode.InternalError,
          `Error reading resource ${uri}: ${error.message}`
        );
      }
    });
  }

  private async executeTool(
    toolName: string, 
    args: any, 
    auth: AuthContext, 
    auditId: string
  ): Promise<any> {
    switch (toolName) {
      case 'toorpia_upload_data':
        const uploadArgs = UploadDataInput.parse(args);
        return await this.uploadData(uploadArgs, auth, auditId);
        
      case 'toorpia_suggest_preprocess':
        if (!checkScope(auth, 'mcp:profile')) {
          throw new Error('Insufficient permissions: mcp:profile scope required');
        }
        const suggestArgs = SuggestPreprocessInput.parse(args);
        return await this.suggestPreprocess(suggestArgs, auth, auditId);
        
      case 'toorpia_confirm_preprocessed':
        if (!checkScope(auth, 'mcp:profile')) {
          throw new Error('Insufficient permissions: mcp:profile scope required');
        }
        const confirmArgs = ConfirmPreprocessedInput.parse(args);
        return await this.confirmPreprocessed(confirmArgs, auth, auditId);
        
      case 'toorpia_run_analysis':
        if (!checkScope(auth, 'mcp:analyze')) {
          throw new Error('Insufficient permissions: mcp:analyze scope required');
        }
        const runArgs = RunAnalysisInput.parse(args);
        return await this.runAnalysis(runArgs, auth, auditId);
        
      case 'toorpia_get_status':
        const statusArgs = GetStatusInput.parse(args);
        return await this.getAnalysisStatus(statusArgs, auth, auditId);
        
      case 'toorpia_collect_feedback':
        const feedbackArgs = CollectFeedbackInput.parse(args);
        return await this.collectFeedback(feedbackArgs, auth, auditId);
        
      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  }

  // Tool implementations
  private async uploadData(
    args: { csv_data: string; filename?: string }, 
    auth: AuthContext, 
    auditId: string
  ): Promise<any> {
    try {
      const result = await backendClient.uploadData(args.csv_data, args.filename);
      return {
        tool: 'toorpia_upload_data',
        success: result.success,
        dataId: result.dataId,
        message: result.message,
        filename: result.filename,
        error: result.error,
        timestamp: new Date().toISOString(),
        audit_id: auditId,
      };
    } catch (error: any) {
      return {
        tool: 'toorpia_upload_data',
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
        audit_id: auditId,
      };
    }
  }

  private async suggestPreprocess(
    args: { dataset_id: string; topk?: number }, 
    auth: AuthContext, 
    auditId: string
  ): Promise<any> {
    try {
      // Get data profile from backend
      const profileResult = await backendClient.getDataProfile(args.dataset_id);
      
      if (!profileResult.success) {
        throw new Error(profileResult.error || 'Failed to get data profile');
      }

      // Generate preprocessing suggestions based on profile
      const candidates = this.generatePreprocessSuggestions(profileResult.profile!);
      
      // Create session for tracking
      const sessionId = createSession(args.dataset_id, candidates.map(c => c.preset_id), {
        user: auth.user,
        tenant: auth.tenant
      });

      return {
        candidates,
        audit_id: auditId,
        session_id: sessionId,
      };
    } catch (error: any) {
      throw new Error(`Preprocessing suggestion failed: ${error.message}`);
    }
  }

  private async confirmPreprocessed(
    args: { dataset_id: string; processed_uri: string; manifest: any }, 
    auth: AuthContext, 
    auditId: string
  ): Promise<any> {
    try {
      // Get existing session
      const session = getSessionByDataset(args.dataset_id);
      if (!session) {
        return errorNext(
          "SESSION_NOT_FOUND",
          "データセットのセッションが見つかりません。先に suggest_preprocess を実行してください。",
          [{
            tool: "toorpia_suggest_preprocess",
            args: { dataset_id: args.dataset_id }
          }],
          auditId
        );
      }

      // Verify preset_id is in suggested list
      if (!session.suggestedPresetIds.includes(args.manifest.preset_id)) {
        throw new Error(`Invalid preset_id. Must be one of: ${session.suggestedPresetIds.join(', ')}`);
      }

      // Validate processed data with backend
      const validation = await backendClient.validateProcessedData(
        args.processed_uri, 
        args.manifest.checksum
      );

      if (!validation.valid) {
        throw new Error(validation.error || 'Processed data validation failed');
      }

      // Update session to READY state
      const sessionId = `sess_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const updated = updateSession(sessionId, "READY", {
        uri: args.processed_uri,
        checksum: args.manifest.checksum,
        presetId: args.manifest.preset_id,
        profileId: args.manifest.profile_id,
        recipeVersion: args.manifest.recipe_version,
        rowCount: args.manifest.row_count,
        schema: args.manifest.schema,
      });

      if (!updated) {
        throw new Error('Failed to update session state');
      }

      return {
        ready: true,
        session_id: sessionId,
        audit_id: auditId,
      };

    } catch (error: any) {
      throw new Error(`Preprocessing confirmation failed: ${error.message}`);
    }
  }

  private async runAnalysis(
    args: { session_id: string; analysis_type?: string; parameters?: any }, 
    auth: AuthContext, 
    auditId: string
  ): Promise<any> {
    // Check READY gate
    const gateCheck = checkReadyGate(args.session_id, auth, auditId);
    if (!gateCheck.passed) {
      return gateCheck.error;
    }

    const session = gateCheck.session!;

    try {
      // Run analysis with session and processed data
      const result = await backendClient.runAnalysisWithSession(
        args.session_id,
        session.processed!.uri,
        args.analysis_type || 'clustering',
        args.parameters || {}
      );

      // Update session to ANALYZED state
      updateSession(args.session_id, "ANALYZED");

      return {
        tool: 'toorpia_run_analysis',
        success: result.success,
        analysis_id: result.analysisId,
        status: result.status,
        started_at: new Date().toISOString(),
        error: result.error,
        session_id: args.session_id,
        audit_id: auditId,
      };
    } catch (error: any) {
      return {
        tool: 'toorpia_run_analysis',
        success: false,
        error: error.message,
        session_id: args.session_id,
        timestamp: new Date().toISOString(),
        audit_id: auditId,
      };
    }
  }

  private async getAnalysisStatus(
    args: { analysis_id: string }, 
    auth: AuthContext, 
    auditId: string
  ): Promise<any> {
    try {
      const result = await backendClient.getAnalysisStatus(args.analysis_id);
      
      // Calculate ETA if progress is available
      let eta = null;
      if (result.progress && result.progress > 0 && result.progress < 1) {
        const estimatedTotalTime = 300; // 5 minutes default estimation
        const remainingTime = (1 - result.progress) * estimatedTotalTime * 1000;
        eta = new Date(Date.now() + remainingTime).toISOString();
      }
      
      return {
        tool: 'toorpia_get_status',
        success: result.success,
        analysis_id: result.analysisId || args.analysis_id,
        status: result.status,
        progress: result.progress,
        eta: eta,
        error_code: result.error ? 'ANALYSIS_ERROR' : null,
        results: result.results,
        error: result.error,
        timestamp: new Date().toISOString(),
        audit_id: auditId,
      };
    } catch (error: any) {
      return {
        tool: 'toorpia_get_status',
        success: false,
        analysis_id: args.analysis_id,
        error_code: 'SYSTEM_ERROR',
        error: error.message,
        timestamp: new Date().toISOString(),
        audit_id: auditId,
      };
    }
  }

  private async collectFeedback(
    args: any, 
    auth: AuthContext, 
    auditId: string
  ): Promise<any> {
    try {
      const feedback = {
        id: `feedback_${Date.now()}`,
        timestamp: new Date().toISOString(),
        user: auth.user,
        tenant: auth.tenant,
        audit_id: auditId,
        ...args,
      };

      // Save to file
      const filename = join(FEEDBACK_DIR, `${feedback.id}.json`);
      writeFileSync(filename, JSON.stringify(feedback, null, 2));

      return {
        tool: 'toorpia_collect_feedback',
        success: true,
        feedback_id: feedback.id,
        message: 'Feedback collected successfully',
        timestamp: feedback.timestamp,
        audit_id: auditId,
      };
    } catch (error: any) {
      return {
        tool: 'toorpia_collect_feedback',
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
        audit_id: auditId,
      };
    }
  }

  // Helper: Generate preprocessing suggestions
  private generatePreprocessSuggestions(profile: any): PreprocessCandidate[] {
    const candidates: PreprocessCandidate[] = [];

    // Simple rule-based suggestions (can be enhanced with ML models)
    if (profile.missingRate > 0.2) {
      candidates.push({
        preset_id: "resample_1m_ffill5_iqr3_z_by_gtag",
        label: "1分集計 + 欠損ffill(5) + IQR=3.0 + gtag正規化",
        why: ["欠損率>20%", "1分間隔の時系列推定"],
        steps_brief: ["TZ付与→1分集計→ffill(5)→IQR3.0→Zスコア"],
        docs_uri: "toorpia://help#resample_1m_ffill5_iqr3_z_by_gtag"
      });
    }

    if (profile.dataType === 'sensor_data') {
      candidates.push({
        preset_id: "sensor_clean_outlier_norm",
        label: "センサーデータクリーニング + 外れ値除去 + 正規化",
        why: ["センサーデータ検出", "外れ値が想定される"],
        steps_brief: ["センサー校正→外れ値除去→正規化"],
        docs_uri: "toorpia://help#sensor_clean_outlier_norm"
      });
    }

    // Default suggestion if no specific matches
    if (candidates.length === 0) {
      candidates.push({
        preset_id: "basic_clean_norm",
        label: "基本クリーニング + 正規化",
        why: ["標準的な前処理"],
        steps_brief: ["欠損値処理→正規化"],
        docs_uri: "toorpia://help#basic_clean_norm"
      });
    }

    return candidates;
  }

  // Resource implementations
  private async readResource(uri: string): Promise<string> {
    switch (uri) {
      case 'toorpia://status':
        return await this.getSystemStatus();
        
      case 'toorpia://help':
        return await this.getHelpGuide();
        
      default:
        throw new Error(`Unknown resource: ${uri}`);
    }
  }

  private async getSystemStatus(): Promise<string> {
    const connectionTest = await backendClient.testConnection();
    const analysisTypes = await backendClient.getAnalysisTypes();
    
    const status = {
      server: 'toorpia-mcp-server',
      version: '2.0.0',
      timestamp: new Date().toISOString(),
      backend: connectionTest,
      available_analysis_types: analysisTypes.types,
      preprocessing_workflow: true,
      authentication: process.env.NODE_ENV !== 'development' || process.env.SKIP_AUTH !== 'true',
      tools_count: 6,
      resources_count: 2,
      active_sessions: Object.keys(getSession).length,
    };

    return JSON.stringify(status, null, 2);
  }

  private async getHelpGuide(): Promise<string> {
    return `# Toorpia MCP Server v2.0 - Preprocessing Workflow Guide

## Overview
This TypeScript MCP server provides secure access to toorpia analysis with mandatory preprocessing workflow.

## New Preprocessing Workflow

### Required Flow: suggest → confirm → analyze

1. **Upload Data**: \`toorpia_upload_data\` → get dataset_id
2. **Get Suggestions**: \`toorpia_suggest_preprocess\` → get preprocessing candidates  
3. **Process Data**: Use suggested preprocessing outside this system
4. **Confirm Processing**: \`toorpia_confirm_preprocessed\` → get session_id (READY state)
5. **Run Analysis**: \`toorpia_run_analysis\` → execute analysis
6. **Check Results**: \`toorpia_get_status\` → get results

## Available Tools

### 1. toorpia_upload_data
Upload CSV data to toorpia backend for analysis.
- **csv_data**: String containing CSV data
- **filename**: Optional filename (default: "data.csv")

### 2. toorpia_suggest_preprocess ⭐ NEW
Get preprocessing suggestions for uploaded data.
- **dataset_id**: ID from upload response
- **topk**: Optional number of suggestions (default: 5)

### 3. toorpia_confirm_preprocessed ⭐ NEW  
Confirm preprocessed data and create analysis session.
- **dataset_id**: ID from upload response
- **processed_uri**: URI to processed data file
- **manifest**: Preprocessing manifest with metadata

### 4. toorpia_run_analysis (Updated)
Run analysis on preprocessed data (requires READY session).
- **session_id**: Session ID from confirm_preprocessed (REQUIRED)
- **analysis_type**: "clustering" or "anomaly_detection"
- **parameters**: Optional analysis parameters

### 5. toorpia_get_status
Check analysis progress and get results.
- **analysis_id**: ID from run_analysis response

### 6. toorpia_collect_feedback
Submit feedback about your toorpia experience.
- **feedback_type**: "bug_report", "feature_request", "usage_experience", or "performance_issue"
- **title**: Brief feedback title
- **description**: Detailed description
- **context**: Optional additional context
- **rating**: Optional rating 1-5

## Authentication & Authorization

### JWT Token Required (Production)
- Include \`Authorization: Bearer <jwt-token>\` header
- Required scopes:
  - \`mcp:profile\`: For preprocessing tools
  - \`mcp:analyze\`: For analysis execution
  - \`*\`: All permissions

### Development Mode
Set \`NODE_ENV=development\` and \`SKIP_AUTH=true\` to disable authentication.

## Error Handling

### PREPROCESS_REQUIRED Error
If you try to run analysis without completing preprocessing:

\`\`\`json
{
  "error": "PREPROCESS_REQUIRED",
  "message": "前処理の提案と処理済み確認を完了してください。",
  "next": [
    { "tool": "toorpia_suggest_preprocess", "args": { "dataset_id": "..." } },
    { "tool": "toorpia_confirm_preprocessed", "args": { "dataset_id": "...", "processed_uri": "..." } }
  ],
  "audit_id": "audit_20250819..."
}
\`\`\`

### Other Error Codes
- \`SESSION_NOT_FOUND\`: Session expired or invalid
- \`ACCESS_DENIED\`: Insufficient permissions
- \`INVALID_MANIFEST\`: Preprocessing manifest validation failed
- \`BACKEND_UNREACHABLE\`: toorpia backend connection failed

## Configuration

### Environment Variables
- \`TOORPIA_API_URL\`: Backend API URL (default: https://dev.toorpia.com/api)
- \`TOORPIA_API_KEY\`: Optional API key for backend authentication
- \`AUTH_JWKS_URL\`: JWKS endpoint for JWT verification
- \`AUTH_PUBLIC_KEY\`: Direct public key for JWT verification
- \`LOG_LEVEL\`: Logging level (default: info)
- \`NODE_ENV\`: Environment (development/production)
- \`SKIP_AUTH\`: Skip authentication in development (true/false)

### Audit Logging
- Structured logs: \`./var/logs/tool_calls.jsonl\`
- Feedback storage: \`./feedback/\`

## Support

For help and feedback, use \`toorpia_collect_feedback\` or contact support.
`;
  }

  async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    logger.info('TypeScript toorpia MCP Server started with preprocessing workflow');
  }

  async stop(): Promise<void> {
    logger.info('Stopping toorpia MCP Server...');
  }
}

// Main execution
async function main(): Promise<void> {
  const server = new ToorpiaMCPServer();

  // Handle process signals
  process.on('SIGINT', async () => {
    logger.info('Received SIGINT, shutting down...');
    await server.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    logger.info('Received SIGTERM, shutting down...');
    await server.stop();
    process.exit(0);
  });

  try {
    await server.initialize();
    await server.start();
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Run the server
if (require.main === module) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export default ToorpiaMCPServer;
