#!/bin/bash
set -ex

# Wait for graph-node to be ready
echo "Waiting for graph-node..."
sleep 30

# Verify graph-cli installation
graph --version

# Create the subgraph namespace
echo "Creating subgraph namespace..."
graph create --node http://graph-node:8020/ coti-analytics || true

# Deploy the pre-built subgraph
echo "Deploying subgraph..."
graph deploy --node http://graph-node:8020/ --ipfs http://ipfs:5001 coti-analytics --version-label v0.0.3

# Keep container running if needed for debugging
if [ "${KEEP_CONTAINER_ALIVE:-false}" = "true" ]; then
  echo "Deployment complete. Keeping container alive as requested..."
  tail -f /dev/null
else
  echo "Deployment complete."
fi 