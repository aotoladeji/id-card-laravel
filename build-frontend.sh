#!/usr/bin/env bash
# Builds the React/Vite frontend straight into backend/public, so Apache
# (pointed at backend/public as its DocumentRoot) serves both the SPA and
# the Laravel API from one folder. Run this after any frontend change and
# before deploying / reloading Apache.
set -e

cd "$(dirname "$0")/frontend"

echo "Installing frontend dependencies..."
npm install

echo "Building frontend into ../backend/public ..."
npm run build

echo "Done. backend/public now contains index.html + assets/ alongside index.php."
