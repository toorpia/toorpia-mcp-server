# toorPIA MCP Server - Production Docker Image
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Add metadata
LABEL org.opencontainers.image.title="toorPIA MCP Server"
LABEL org.opencontainers.image.description="TypeScript MCP Server for toorPIA - Provides secure access to high-dimensional manufacturing/process analysis"
LABEL org.opencontainers.image.url="https://github.com/toorpia/toorpia-mcp-server"
LABEL org.opencontainers.image.source="https://github.com/toorpia/toorpia-mcp-server"
LABEL org.opencontainers.image.vendor="toorPIA"
LABEL org.opencontainers.image.licenses="MIT"

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nextjs -u 1001

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --omit=dev --ignore-scripts && \
    npm cache clean --force

# Copy pre-built application (built in GitHub Actions)
COPY --chown=nextjs:nodejs dist/ ./dist/

# Copy environment example for reference
COPY --chown=nextjs:nodejs .env.example ./

# Create directories for runtime data
RUN mkdir -p ./var/logs ./feedback && \
    chown -R nextjs:nodejs ./var ./feedback

# Switch to non-root user
USER nextjs

# Set production environment
ENV NODE_ENV=production
ENV PORT=3000

# Health check - verify process is running and can respond
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD pgrep -f "node dist/server.js" > /dev/null || exit 1

# Expose port
EXPOSE 3000

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the application
CMD ["node", "dist/server.js"]
