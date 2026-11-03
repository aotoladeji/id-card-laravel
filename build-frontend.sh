#!/usr/bin/env bash
# Builds the React/Vite frontend straight into public, so Apache
# (pointed at public as its DocumentRoot) serves both the SPA and
# the Laravel API from one folder. Run this after any frontend change and
# before deploying / reloading Apache.
set -e

cd "$(dirname "$0")/frontend"

echo "Installing frontend dependencies..."
npm install

echo "Building frontend into ../public ..."
npm run build

echo "Done. public now contains index.html + assets/ alongside index.php."

