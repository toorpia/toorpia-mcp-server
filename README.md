# Toorpia MCP Server

TypeScript MCP Server for toorpia - Provides secure access to high-dimensional manufacturing/process analysis with preprocessing workflow and JWT authentication.

## Overview

This MCP server provides AI assistants with secure, workflow-driven access to toorpia's high-dimensional process analysis capabilities. Version 2.0 introduces a mandatory preprocessing workflow, JWT authentication, and comprehensive audit logging.

## Key Features

### 🔄 Preprocessing Workflow
- **Mandatory preprocessing**: All analyses require preprocessing workflow completion
- **Smart suggestions**: AI-powered preprocessing recommendations based on data profiling
- **Session management**: Stateful sessions track preprocessing progress
- **READY gate**: Analysis execution only permitted after preprocessing confirmation

### 🔐 Security & Authentication
- **JWT Authentication**: Bearer token authentication with scope-based access control
- **Audit logging**: Comprehensive structured logging of all operations
- **Tenant isolation**: Multi-tenant support with data segregation
- **Development mode**: Optional authentication bypass for development

### 📊 Analysis Tools
- **Data upload**: CSV data ingestion with validation
- **Status monitoring**: Real-time analysis progress tracking
- **Result retrieval**: Structured analysis result access
- **Feedback collection**: User experience feedback system

## Installation and Setup

### Prerequisites

- Node.js 18.0.0 or higher
- npm
- toorpia backend (optional for development)

### Installation

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env file to configure settings
```

### Environment Variables

```env
# Backend API
TOORPIA_API_URL=http://localhost:3000
TOORPIA_API_KEY=your_api_key_here

# JWT Authentication (choose one)
AUTH_JWKS_URL=https://your-auth-provider.com/.well-known/jwks.json
# OR
AUTH_PUBLIC_KEY="-----BEGIN CERTIFICATE-----..."

# Development settings
NODE_ENV=development
SKIP_AUTH=true

# Logging
LOG_LEVEL=info
VERBOSE_LOGGING=false
ENABLE_FILE_LOGGING=false
```

> **Safety**: `SKIP_AUTH=true` is **for local development only**.  
> In CI/CD and production images, ensure `SKIP_AUTH` is **unset**.

## Usage

### Development Mode

```bash
# Start server in development mode
npm run dev

# Build TypeScript
npm run build

# Start production server
npm start

# Type check without compilation
npm run check
```

### Run Modes
- **stdio** (local development; default): MCP clients spawn this process.
- **WSS** (remote): Expose `wss://` endpoint via reverse proxy (Nginx/ALB).  
  Set `MCP_TRANSPORT=wss`, `PORT=3001`.  
  Clients connect with `Authorization: Bearer <JWT>`.

### MCP Client Configuration

**Claude Desktop:**
```json
{
  "mcpServers": {
    "toorpia": {
      "command": "node",
      "args": ["path/to/toorpia-mcp-server/dist/server.js"],
      "env": {
        "TOORPIA_API_URL": "http://localhost:3000",
        "NODE_ENV": "production"
      }
    }
  }
}
```

**VS Code Cline settings.json:**
```json
{
  "mcpServers": {
    "toorpia": {
      "command": "node",
      "args": ["path/to/toorpia-mcp-server/dist/server.js"],
      "env": {
        "TOORPIA_API_URL": "http://localhost:3000",
        "NODE_ENV": "production"
      }
    }
  }
}
```

## Preprocessing Workflow

### Required Flow: suggest → confirm → analyze

The new preprocessing workflow ensures data quality and analysis reliability:

1. **Upload Data**: `toorpia_upload_data` → get `dataset_id`
2. **Get Suggestions**: `toorpia_suggest_preprocess` → receive preprocessing candidates
3. **Process Data**: Apply suggested preprocessing (external to this system)
4. **Confirm Processing**: `toorpia_confirm_preprocessed` → create analysis session (READY state)
5. **Run Analysis**: `toorpia_run_analysis` → execute analysis with preprocessed data
6. **Check Results**: `toorpia_get_status` → monitor progress and retrieve results

### Error Handling

If you attempt analysis without completing preprocessing, you'll receive:

```json
{
  "error": "PREPROCESS_REQUIRED",
  "message": "前処理の提案と処理済み確認を完了してください。",
  "next": [
    { "tool": "toorpia_suggest_preprocess", "args": { "dataset_id": "..." } },
    { "tool": "toorpia_confirm_preprocessed", "args": { "dataset_id": "...", "processed_uri": "..." } }
  ]
}
```

## Available Tools

### 1. toorpia_upload_data
Upload CSV data to toorpia backend for analysis.

**Parameters:**
- `csv_data` (string): CSV data content
- `filename` (string, optional): Filename (default: "data.csv")

### 2. toorpia_suggest_preprocess ⭐ NEW
Get preprocessing suggestions for uploaded data.

**Parameters:**
- `dataset_id` (string): ID from upload response
- `topk` (number, optional): Number of suggestions (default: 5)

**Requires scope:** `mcp:profile`

### 3. toorpia_confirm_preprocessed ⭐ NEW
Confirm preprocessed data and create analysis session.

**Parameters:**
- `dataset_id` (string): ID from upload response
- `processed_uri` (string): URI to processed data file
- `manifest` (object): Preprocessing manifest with metadata
  - `preset_id` (string): Selected preprocessing preset
  - `profile_id` (string): Data profile identifier
  - `recipe_version` (string): Recipe version used
  - `checksum` (string): Data integrity checksum
  - `row_count` (number): Number of data rows
  - `schema` (object): Data schema information

**Requires scope:** `mcp:profile`

### 4. toorpia_run_analysis (Updated)
Run analysis on preprocessed data (requires READY session).

**Parameters:**
- `session_id` (string): Session ID from confirm_preprocessed (**REQUIRED**)
- `analysis_type` (string, optional): "clustering" or "anomaly_detection"
- `parameters` (object, optional): Analysis parameters

**Requires scope:** `mcp:analyze`

**Example:**
```javascript
// Example: toorpia_run_analysis (READY passed)
{
  "session_id": "sess_20250819_abc123",
  "analysis_type": "anomaly_detection",
  "parameters": { "z_thresh": 3.0 }
}
// → Response
{
  "analysis_id": "an_7f9c2",
  "started_at": "2025-08-19T01:02:03Z",
  "status": "running"
}
```

### 5. toorpia_get_status
Check analysis progress and get results.

**Parameters:**
- `analysis_id` (string): ID from run_analysis response

**Example Response:**
```javascript
{
  "analysis_id": "an_7f9c2",
  "status": "running",
  "progress": 0.65,
  "eta": "2025-08-19T01:05:30Z",
  "error_code": null,
  "results": null
}
```

### 6. toorpia_collect_feedback
Submit feedback about your toorpia experience.

**Parameters:**
- `feedback_type` (string): "bug_report", "feature_request", "usage_experience", or "performance_issue"
- `title` (string): Brief feedback title
- `description` (string): Detailed description
- `context` (object, optional): Additional context
- `rating` (number, optional): Rating 1-5

## Schemas (excerpt)

### confirm_preprocessed.input
- `dataset_id: string`
- `processed_uri: string (file|s3|gs://...)`
- `manifest: { preset_id, profile_id, recipe_version, checksum(sha256|512), row_count, schema{ time_col, value_cols[] } }`

### suggest_preprocess.input
- `dataset_id: string`
- `topk: number (1-10, default: 5, optional)`

### run_analysis.input
- `session_id: string` (**REQUIRED**)
- `analysis_type: enum ["clustering", "anomaly_detection"]` (default: "clustering")
- `parameters: object` (optional)

## Available Resources

### toorpia://status
Current system status and backend connectivity information.

### toorpia://help (includes prompt hints)
Complete usage guide for the preprocessing workflow.

**Prompt example:** "Profile dataset `<dataset_id>` and suggest safe preprocessing (top-3).  
If gaps>20% and 1m cadence, prefer `resample_1m_ffill5_iqr3_z_by_gtag`."

## Authentication & Authorization

### JWT Token Authentication

In production, include JWT token in requests:

```
Authorization: Bearer <jwt-token>
```

**Required Scopes:**
- `mcp:profile`: Preprocessing tools (suggest/confirm)
- `mcp:analyze`: Analysis execution
- `*`: All permissions

### JWT Requirements
- **aud**: `toorpia-mcp`
- **scope** (space-separated string): `mcp:profile`, `mcp:analyze`, …
- **sub/tenant**: user and tenant identifiers
- Token lifetime: **≤15 min**, clock skew tolerance **±2 min**  
- Verification: JWKS (`AUTH_JWKS_URL`) or static public key (`AUTH_PUBLIC_KEY`)

### Development Mode

Skip authentication for development:

```env
NODE_ENV=development
SKIP_AUTH=true
```

## Architecture

### File Structure

```
toorpia-mcp-server/
├── src/
│   ├── server.ts              # Main MCP server
│   ├── types.ts               # Common TypeScript types
│   ├── middleware/
│   │   ├── auth.ts            # JWT authentication
│   │   └── guard.ts           # READY gate & session management
│   ├── utils/
│   │   ├── backendClient.ts   # Toorpia API client
│   │   ├── logger.ts          # Winston logging
│   │   └── audit.ts           # Audit logging
│   └── schemas/               # Zod validation schemas
├── dist/                      # Compiled TypeScript
├── var/logs/                  # Audit logs
├── feedback/                  # User feedback
├── tsconfig.json
├── package.json
└── README.md
```

### Technology Stack

- **TypeScript**: Type-safe server implementation
- **Zod**: Runtime schema validation and type inference
- **JWT**: JSON Web Token authentication
- **Winston**: Structured logging
- **Axios**: HTTP client for backend communication
- **MCP SDK**: Model Context Protocol implementation

### Future Extensions

**Resources**: `file:///var/profiles/`, `file:///var/recipes/` を列挙予定  
**Prompts**: `safe_preprocess`, `risk_report`, `root_cause_explain` を同梱予定

## Monitoring & Logging

### Audit Logging

Structured audit logs in JSON Lines format:

```
./var/logs/tool_calls.jsonl
```

Each audit entry contains:
- `audit_id` (propagated across tools)
- `session_id`, `dataset_id`, `preset_id`
- `input_hash` (privacy-preserving)
- User and tenant identification
- Tool execution details
- Success/failure status

### Feedback Collection

User feedback stored by default in:

```
./feedback/
```

For production deployments, configure a persistent storage directory using the `FEEDBACK_DIR` environment variable:

```env
# Production examples:
FEEDBACK_DIR=/var/toorpia-mcp/feedback
FEEDBACK_DIR=C:\ProgramData\toorpia-mcp\feedback
FEEDBACK_DIR=/opt/toorpia-mcp/feedback
```

This ensures feedback data persists across application updates and container restarts. Each feedback file contains user experience data for system improvement.

## Error Codes

| Code | Description | Action Required |
|------|-------------|-----------------|
| `PREPROCESS_REQUIRED` | Preprocessing workflow not completed | Complete suggest → confirm flow |
| `SESSION_NOT_FOUND` | Session expired or invalid | Start new preprocessing workflow |
| `ACCESS_DENIED` | Insufficient permissions | Check JWT token scopes |
| `INVALID_MANIFEST` | Preprocessing manifest validation failed | Verify manifest format |
| `BACKEND_UNREACHABLE` | toorpia backend connection failed | Check backend status |

## Development

### TypeScript Development

```bash
# Watch mode with auto-reload
npm run dev

# Type checking
npm run check

# Build for production
npm run build
```

### Adding New Tools

1. Define Zod schema in `src/schemas/`
2. Add tool handler in `src/server.ts`
3. Implement validation and business logic
4. Add authentication and audit logging
5. Update documentation

### Session Management

Sessions are stored in-memory with automatic cleanup:
- **Creation**: During `suggest_preprocess`
- **Updates**: During `confirm_preprocessed` and `run_analysis`
- **Cleanup**: Automatic expiry after 24 hours

## Deployment

### Production Deployment

1. **Build the application:**
   ```bash
   npm run build
   ```

2. **Set production environment variables:**
   ```env
   NODE_ENV=production
   SKIP_AUTH=false
   AUTH_JWKS_URL=https://your-auth-provider.com/.well-known/jwks.json
   TOORPIA_API_URL=https://api.toorpia.com
   LOG_LEVEL=info
   ENABLE_FILE_LOGGING=true
   ```

3. **Start the server:**
   ```bash
   npm start
   ```

### Docker Deployment

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist/ ./dist/
ENV NODE_ENV=production
ENV ENABLE_FILE_LOGGING=true
EXPOSE 3000
CMD ["npm", "start"]
```

## Contributing

### Development Setup

1. Clone the repository
2. Install dependencies: `npm install`
3. Set up environment: `cp .env.example .env`
4. Start development server: `npm run dev`

### Code Quality

- TypeScript strict mode enabled
- Zod for runtime validation
- Winston for structured logging
- Comprehensive error handling

### Testing

```bash
# Run type checks
npm run check

# Test server startup
npm run dev
```

## License

MIT License

## Support

For feedback and support:

1. Use the `toorpia_collect_feedback` tool within the MCP server
2. Create GitHub issues for bugs and feature requests
3. Check `toorpia://help` resource for usage guidance

---

**Version 2.0 introduces breaking changes.** The preprocessing workflow is now mandatory for all analysis operations. Update your integrations accordingly.
