#!/bin/sh
set -e

# Ensure data directory exists and has correct permissions
if [ ! -d "/data" ]; then
  echo "Creating /data directory..."
  mkdir -p /data/uploads
fi

# Initialize/migrate database (idempotent - safe to run every time)
echo "Syncing database schema..."
node ./node_modules/prisma/build/index.js db push --skip-generate --accept-data-loss
echo "Database ready."

# Start the application
exec node server.js
