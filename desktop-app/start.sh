#!/bin/bash

# RTMP Livestream Desktop App - Startup Script
# This script sets up and runs the application

set -e

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║       📡 Nirantar Live Desktop Manager                       ║"
echo "║       Standalone Offline Streaming Application                ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# Check Python version
PYTHON_CMD=""
if command -v python3 &> /dev/null; then
    PYTHON_CMD="python3"
elif command -v python &> /dev/null; then
    PYTHON_CMD="python"
else
    echo "❌ Python not found. Please install Python 3.9 or higher."
    exit 1
fi

PYTHON_VERSION=$($PYTHON_CMD -c 'import sys; print(".".join(map(str, sys.version_info[:2])))')
echo "✓ Python version: $PYTHON_VERSION"

# Check FFmpeg
if command -v ffmpeg &> /dev/null; then
    FFMPEG_VERSION=$(ffmpeg -version 2>&1 | head -n 1)
    echo "✓ FFmpeg: $FFMPEG_VERSION"
else
    echo "⚠️  FFmpeg not found in PATH. You can set the path in Settings."
fi

echo ""

# Check if virtual environment exists
if [ -d "venv" ]; then
    echo "✓ Virtual environment found"
    source venv/bin/activate
else
    echo "→ Creating virtual environment..."
    $PYTHON_CMD -m venv venv
    source venv/bin/activate
    echo "✓ Virtual environment created"
fi

# Install/Update dependencies
echo "→ Checking dependencies..."
pip install -q --upgrade pip
pip install -q -r requirements.txt
echo "✓ Dependencies installed"

echo ""
echo "🚀 Starting application..."
echo "───────────────────────────────────────────────────────────────"
echo ""

# Run the application
$PYTHON_CMD main.py
