# Backend Dockerfile
FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY backend/package*.json ./

# Install dependencies
RUN npm install --omit=dev

# Copy source code
COPY backend/src/ ./src/

# Copy extension folder for download endpoint
COPY extension/ ./extension/

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Start with database initialization
CMD ["sh", "-c", "node src/db/init.js && node src/server.js"]
