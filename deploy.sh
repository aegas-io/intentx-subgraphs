#!/bin/bash
set -e

# Wait for graph-node to be ready
echo "Waiting for graph-node..."
sleep 30

# Create the subgraph namespace
echo "Creating subgraph namespace..."
npx graph create --node http://graph-node:8020/ coti-analytics || true

# Deploy the pre-built subgraph
echo "Deploying subgraph..."
npx graph deploy --node http://graph-node:8020/ --ipfs http://ipfs:5001 coti-analytics --version-label v0.0.3

# Keep container running if needed for debugging
if [ "${KEEP_CONTAINER_ALIVE:-false}" = "true" ]; then
  echo "Deployment complete. Keeping container alive as requested..."
  tail -f /dev/null
else
  echo "Deployment complete."
fi 