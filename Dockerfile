# Project: v3-subgraph
# Description: -

FROM node:18 AS builder

WORKDIR /build

# Copy package files and install dependencies
COPY package*.json ./
COPY analytics/package*.json ./analytics/
RUN npm install && cd analytics && npm install

# Copy all necessary files
COPY configs/ ./configs/
COPY analytics/ ./analytics/
COPY abis/ ./abis/

# Prepare the config
RUN cp -f configs/aggregated/coti.json configs/current.json

# Generate code and build
WORKDIR /build/analytics
RUN npm run codegen
RUN npm run build

# Stage 2: Create deployment image
FROM node:18-slim

WORKDIR /app

# Copy only necessary files from builder
COPY --from=builder /build/analytics/package*.json ./
COPY --from=builder /build/analytics/node_modules ./node_modules
COPY --from=builder /build/analytics/build ./build
COPY --from=builder /build/analytics/subgraph.yaml ./subgraph.yaml
COPY --from=builder /build/analytics/generated ./generated

# Add a deployment script
COPY deploy.sh ./
RUN chmod +x ./deploy.sh

# Set the entrypoint to deploy the pre-built subgraph
ENTRYPOINT ["./deploy.sh"]
