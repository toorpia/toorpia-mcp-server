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
import { writeFileSync, existsSync, mkdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { createLogger } from './utils/logger.js';
import { ToorpiaBackendClient } from './utils/backendClient.js';

// Load environment variables
dotenv.config();

// Initialize logger and client
const logger = createLogger('ToorpiaMCPServer');
const backendClient = new ToorpiaBackendClient();

// Simple file-based feedback storage
const FEEDBACK_DIR = './feedback';
if (!existsSync(FEEDBACK_DIR)) {
  mkdirSync(FEEDBACK_DIR, { recursive: true });
}

class ToorpiaMCPServer {
  constructor() {
    this.server = new Server(
      {
        name: 'toorpia-mcp-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          resources: {},
          tools: {},
        },
      }
    );

    // Define minimal tool set
    this.tools = {
      toorpia_upload_data: {
        description: 'Upload CSV data to toorpia backend for analysis',
        inputSchema: {
          type: 'object',
          properties: {
            csv_data: {
              type: 'string',
              description: 'CSV data content as string',
            },
            filename: {
              type: 'string',
              description: 'Optional filename for the uploaded data',
              default: 'data.csv',
            },
          },
          required: ['csv_data'],
        },
      },

      toorpia_run_analysis: {
        description: 'Run analysis on uploaded data',
        inputSchema: {
          type: 'object',
          properties: {
            data_id: {
              type: 'string',
              description: 'ID of previously uploaded data',
            },
            analysis_type: {
              type: 'string',
              enum: ['clustering', 'anomaly_detection'],
              default: 'clustering',
              description: 'Type of analysis to perform',
            },
            parameters: {
              type: 'object',
              description: 'Optional analysis parameters',
              default: {},
            },
          },
          required: ['data_id'],
        },
      },

      toorpia_get_status: {
        description: 'Get analysis status and results',
        inputSchema: {
          type: 'object',
          properties: {
            analysis_id: {
              type: 'string',
              description: 'ID of the analysis to check',
            },
          },
          required: ['analysis_id'],
        },
      },

      toorpia_collect_feedback: {
        description: 'Collect user feedback about toorpia experience',
        inputSchema: {
          type: 'object',
          properties: {
            feedback_type: {
              type: 'string',
              enum: ['bug_report', 'feature_request', 'usage_experience', 'performance_issue'],
              description: 'Type of feedback',
            },
            title: {
              type: 'string',
              description: 'Brief title for the feedback',
            },
            description: {
              type: 'string',
              description: 'Detailed description of the feedback',
            },
            context: {
              type: 'object',
              description: 'Additional context (data type, analysis used, etc.)',
              default: {},
            },
            rating: {
              type: 'number',
              minimum: 1,
              maximum: 5,
              description: 'Rating from 1 (poor) to 5 (excellent)',
            },
          },
          required: ['feedback_type', 'title', 'description'],
        },
      },
    };

    // Define minimal resources
    this.resources = {
      'toorpia://status': {
        name: 'Toorpia Status',
        description: 'Current status of toorpia backend API',
        mimeType: 'application/json',
      },
      'toorpia://help': {
        name: 'Toorpia Help',
        description: 'Basic usage guide for toorpia MCP server',
        mimeType: 'text/markdown',
      },
    };
  }

  async initialize() {
    try {
      logger.info('Initializing minimal toorpia MCP Server...');
      
      // Test backend connection
      const connectionTest = await backendClient.testConnection();
      if (connectionTest.status === 'error') {
        logger.warn('Backend connection test failed:', connectionTest.error);
      } else {
        logger.info('Backend connection successful');
      }

      this.setupHandlers();
      logger.info('Minimal toorpia MCP Server initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize server:', error);
      throw error;
    }
  }

  setupHandlers() {
    // List tools handler
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      const tools = Object.entries(this.tools).map(([name, tool]) => ({
        name,
        description: tool.description,
        inputSchema: tool.inputSchema,
      }));

      return { tools };
    });

    // Call tool handler
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      if (!this.tools[name]) {
        throw new McpError(ErrorCode.MethodNotFound, `Tool not found: ${name}`);
      }

      try {
        logger.info(`Executing tool: ${name}`);
        const result = await this.executeTool(name, args);
        logger.info(`Tool ${name} executed successfully`);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        logger.error(`Error executing tool ${name}:`, error);
        throw new McpError(
          ErrorCode.InternalError,
          `Error executing tool ${name}: ${error.message}`
        );
      }
    });

    // List resources handler
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      const resources = Object.entries(this.resources).map(([uri, resource]) => ({
        uri,
        name: resource.name,
        description: resource.description,
        mimeType: resource.mimeType,
      }));

      return { resources };
    });

    // Read resource handler
    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const { uri } = request.params;

      if (!this.resources[uri]) {
        throw new McpError(ErrorCode.InvalidRequest, `Resource not found: ${uri}`);
      }

      try {
        logger.info(`Reading resource: ${uri}`);
        const content = await this.readResource(uri);
        
        return {
          contents: [
            {
              uri,
              mimeType: this.resources[uri].mimeType,
              text: content,
            },
          ],
        };
      } catch (error) {
        logger.error(`Error reading resource ${uri}:`, error);
        throw new McpError(
          ErrorCode.InternalError,
          `Error reading resource ${uri}: ${error.message}`
        );
      }
    });
  }

  async executeTool(toolName, args) {
    switch (toolName) {
      case 'toorpia_upload_data':
        return await this.uploadData(args.csv_data, args.filename);
        
      case 'toorpia_run_analysis':
        return await this.runAnalysis(args.data_id, args.analysis_type, args.parameters);
        
      case 'toorpia_get_status':
        return await this.getAnalysisStatus(args.analysis_id);
        
      case 'toorpia_collect_feedback':
        return await this.collectFeedback(args);
        
      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  }

  async readResource(uri) {
    switch (uri) {
      case 'toorpia://status':
        return await this.getSystemStatus();
        
      case 'toorpia://help':
        return await this.getHelpGuide();
        
      default:
        throw new Error(`Unknown resource: ${uri}`);
    }
  }

  // Tool implementations
  async uploadData(csvData, filename = 'data.csv') {
    try {
      const result = await backendClient.uploadData(csvData, filename);
      return {
        tool: 'toorpia_upload_data',
        timestamp: new Date().toISOString(),
        ...result,
      };
    } catch (error) {
      return {
        tool: 'toorpia_upload_data',
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  async runAnalysis(dataId, analysisType = 'clustering', parameters = {}) {
    try {
      const result = await backendClient.runAnalysis(dataId, analysisType, parameters);
      return {
        tool: 'toorpia_run_analysis',
        timestamp: new Date().toISOString(),
        ...result,
      };
    } catch (error) {
      return {
        tool: 'toorpia_run_analysis',
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  async getAnalysisStatus(analysisId) {
    try {
      const result = await backendClient.getAnalysisStatus(analysisId);
      return {
        tool: 'toorpia_get_status',
        timestamp: new Date().toISOString(),
        ...result,
      };
    } catch (error) {
      return {
        tool: 'toorpia_get_status',
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  async collectFeedback(feedbackData) {
    try {
      const feedback = {
        id: `feedback_${Date.now()}`,
        timestamp: new Date().toISOString(),
        ...feedbackData,
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
      };
    } catch (error) {
      return {
        tool: 'toorpia_collect_feedback',
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  // Resource implementations
  async getSystemStatus() {
    const connectionTest = await backendClient.testConnection();
    const analysisTypes = await backendClient.getAnalysisTypes();
    
    const status = {
      server: 'toorpia-mcp-server',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      backend: connectionTest,
      available_analysis_types: analysisTypes.types,
      tools_count: Object.keys(this.tools).length,
      resources_count: Object.keys(this.resources).length,
    };

    return JSON.stringify(status, null, 2);
  }

  async getHelpGuide() {
    return `# Toorpia MCP Server - Basic Usage Guide

## Overview
This is a minimal MCP server that provides access to toorpia backend analysis capabilities.

## Available Tools

### 1. toorpia_upload_data
Upload CSV data to toorpia backend for analysis.
- **csv_data**: String containing CSV data
- **filename**: Optional filename (default: "data.csv")

### 2. toorpia_run_analysis  
Start analysis on uploaded data.
- **data_id**: ID from upload response
- **analysis_type**: "clustering" or "anomaly_detection" 
- **parameters**: Optional analysis parameters

### 3. toorpia_get_status
Check analysis progress and get results.
- **analysis_id**: ID from run_analysis response

### 4. toorpia_collect_feedback
Submit feedback about your toorpia experience.
- **feedback_type**: "bug_report", "feature_request", "usage_experience", or "performance_issue"
- **title**: Brief feedback title
- **description**: Detailed description
- **context**: Optional additional context
- **rating**: Optional rating 1-5

## Basic Workflow

1. Upload your CSV data with \`toorpia_upload_data\`
2. Start analysis with \`toorpia_run_analysis\` using the data_id from step 1
3. Check progress with \`toorpia_get_status\` using the analysis_id from step 2
4. Optionally provide feedback with \`toorpia_collect_feedback\`

## Available Resources

- **toorpia://status**: Current system status and backend connectivity
- **toorpia://help**: This help guide

## Configuration

Set these environment variables:
- \`TOORPIA_API_URL\`: Backend API URL (default: http://localhost:3000)
- \`TOORPIA_API_KEY\`: Optional API key for authentication
- \`LOG_LEVEL\`: Logging level (default: info)

## Support

Feedback is collected locally in the \`./feedback/\` directory and will be used to improve the system.
`;
  }

  async start() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    logger.info('Minimal toorpia MCP Server started');
  }

  async stop() {
    logger.info('Stopping toorpia MCP Server...');
  }
}

// Main execution
async function main() {
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
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export default ToorpiaMCPServer;
