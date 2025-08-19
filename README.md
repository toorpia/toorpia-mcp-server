# Toorpia MCP Server

A minimal Model Context Protocol (MCP) server providing access to the toorpia backend API.

## Overview

This MCP server is designed to allow AI assistants to naturally use toorpia's analysis capabilities. It provides 4 essential tools and 2 resources, supporting the basic workflow from data upload to analysis execution, result retrieval, and feedback collection.

## Features

### Available Tools

1. **`toorpia_upload_data`** - Upload CSV data to toorpia backend for analysis
2. **`toorpia_run_analysis`** - Execute analysis on uploaded data
3. **`toorpia_get_status`** - Check analysis progress and retrieve results
4. **`toorpia_collect_feedback`** - Collect user feedback about toorpia experience

### Available Resources

1. **`toorpia://status`** - System status and backend connectivity
2. **`toorpia://help`** - Basic usage guide

## Installation and Setup

### Prerequisites

- Node.js 18.0.0 or higher
- npm
- toorpia backend (optional)

### Installation

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env file to configure toorpia backend URL and other settings
```

### Environment Variables

```env
# Toorpia Backend API URL
TOORPIA_API_URL=http://localhost:3000

# Optional API key for authentication
TOORPIA_API_KEY=your_api_key_here

# Logging level (error, warn, info, debug)
LOG_LEVEL=info
```

## Usage

### Basic Startup

```bash
# Start server
npm start

# Development mode (using nodemon)
npm run dev
```

### Usage with MCP Clients

Add the following to your MCP client (Claude Desktop, etc.) configuration file:

```json
{
  "mcpServers": {
    "toorpia": {
      "command": "node",
      "args": ["path/to/toorpia-mcp-server/server.js"],
      "env": {
        "TOORPIA_API_URL": "http://localhost:3000"
      }
    }
  }
}
```

### Basic Workflow

1. **Data Upload**
   ```
   Use toorpia_upload_data to upload CSV data
   → Get data_id
   ```

2. **Run Analysis**
   ```
   Use toorpia_run_analysis to start analysis
   → Get analysis_id
   ```

3. **Check Results**
   ```
   Use toorpia_get_status to check progress and results
   ```

4. **Provide Feedback**
   ```
   Use toorpia_collect_feedback to share your experience
   ```

## Design Philosophy

### Minimal MVP (Minimum Viable Product)

- **Simple Structure**: Eliminates complex module systems
- **Practical Focus**: Minimal feature set that actually works
- **Gradual Growth**: Expansion based on actual usage patterns

### Feedback-Driven Development

- Local filesystem feedback collection
- Improvements based on real usage data
- User-centered feature expansion

## File Structure

```
toorpia-mcp-server/
├── server.js              # Main MCP server
├── package.json
├── .env.example           # Environment variable template
├── README.md
├── utils/
│   ├── backendClient.js   # Toorpia Backend API client
│   ├── logger.js          # Logging system
│   └── validator.js       # Validation utilities
└── feedback/              # Collected feedback (auto-generated)
```

## Technical Specifications

- **MCP SDK**: @modelcontextprotocol/sdk ^0.5.0
- **HTTP Client**: axios
- **Logging**: winston
- **Environment Variables**: dotenv

## Troubleshooting

### Common Issues

1. **Backend Connection Error**
   - Verify `TOORPIA_API_URL` is correctly set
   - Ensure toorpia backend is running

2. **Dependency Error**
   ```bash
   npm install
   ```

3. **Permission Error**
   - Check write permissions for feedback directory

### Log Checking

Adjust log level to get debug information:

```env
LOG_LEVEL=debug
```

## Development and Testing

### Development Mode

```bash
npm run dev
```

### Basic Testing

```bash
# Server startup test
npm start

# Manual tool testing (via MCP client)
```

## Feedback and Improvement

This MCP server is continuously improved:

- Feedback is automatically saved in `./feedback/` directory
- Feature expansion based on actual usage patterns
- Optimization according to user needs

## Future Plans

### Phase 1: Basic Features (Completed)
- [x] Minimal tool set
- [x] Basic toorpia backend connection
- [x] Feedback collection system

### Phase 2: Usability Improvements (Planned)
- [ ] Real usage pattern analysis
- [ ] Enhanced error handling
- [ ] Performance optimization

### Phase 3: Advanced Features (Future)
- [ ] Knowledge base expansion
- [ ] Parameter optimization support
- [ ] Advanced guidance features

## License

MIT License

## Contributing

For feedback and improvement suggestions, please use the `toorpia_collect_feedback` tool or GitHub Issues.

---

**Note**: This server is designed as a minimal MVP and requires connection to an actual toorpia backend. Even if the backend is unavailable, the MCP server itself will start and basic functionality testing is possible.
