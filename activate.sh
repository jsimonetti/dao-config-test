#!/bin/bash
# Quick activation script for both Python and Node.js virtual environments

# Activate Python environment
source .venv/bin/activate

# Activate Node.js environment
source .nodeenv/bin/activate

# Navigate to frontend project
cd config-gui

echo "✅ Both environments activated. Ready to work!"
echo ""
echo "Available commands:"
echo "  npm run dev    - Start development server"
echo "  npm run build  - Build for production"
echo "  npm install    - Install dependencies"
