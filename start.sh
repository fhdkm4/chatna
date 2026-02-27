#!/bin/bash
echo "Running database migrations..."
npx drizzle-kit push --force 2>&1 || echo "Warning: db:push failed, tables may already exist"
echo "Starting application..."
npm run start
