#!/bin/bash

# UDB Installation Script
# Checks and installs dependencies, then builds the project

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
DIM='\033[2m'
NC='\033[0m' # No Color

echo "=========================================="
echo "  UDB - Personal Knowledge Base Installer"
echo "=========================================="
echo ""

# Detect OS
OS="unknown"
if [[ "$OSTYPE" == "darwin"* ]]; then
    OS="macos"
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    OS="linux"
fi

# Check for Node.js
echo "Checking Node.js..."
if command -v node &> /dev/null; then
    NODE_VERSION=$(node -v)
    echo -e "${GREEN}✓${NC} Node.js installed: $NODE_VERSION"

    # Check version >= 18
    NODE_MAJOR=$(echo "$NODE_VERSION" | sed 's/v\([0-9]*\).*/\1/')
    if [ "$NODE_MAJOR" -lt 18 ]; then
        echo -e "${RED}✗${NC} Node.js 18+ required, found $NODE_VERSION"
        exit 1
    fi
else
    echo -e "${RED}✗${NC} Node.js not found"
    echo "  Please install Node.js 18+ from https://nodejs.org/"
    exit 1
fi

# Check for Ollama
echo ""
echo "Checking Ollama..."
if command -v ollama &> /dev/null; then
    echo -e "${GREEN}✓${NC} Ollama installed"
else
    echo -e "${YELLOW}!${NC} Ollama not found (required for embeddings)"

    if [[ "$OS" == "macos" ]] && command -v brew &> /dev/null; then
        read -p "  Install Ollama via Homebrew? [Y/n] " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]] || [[ -z $REPLY ]]; then
            brew install ollama
            echo -e "${GREEN}✓${NC} Ollama installed"
        else
            echo -e "${DIM}  Skipping. Install later: brew install ollama${NC}"
        fi
    else
        echo "  Install from: https://ollama.ai/download"
    fi
fi

# Check for yt-dlp (optional)
echo ""
echo "Checking yt-dlp (optional, for YouTube videos)..."
if command -v yt-dlp &> /dev/null; then
    echo -e "${GREEN}✓${NC} yt-dlp installed"
else
    echo -e "${YELLOW}!${NC} yt-dlp not found (optional)"

    if [[ "$OS" == "macos" ]] && command -v brew &> /dev/null; then
        read -p "  Install yt-dlp via Homebrew? [Y/n] " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]] || [[ -z $REPLY ]]; then
            brew install yt-dlp
            echo -e "${GREEN}✓${NC} yt-dlp installed"
        else
            echo -e "${DIM}  Skipping. Install later: brew install yt-dlp${NC}"
        fi
    elif command -v pip &> /dev/null || command -v pip3 &> /dev/null; then
        read -p "  Install yt-dlp via pip? [Y/n] " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]] || [[ -z $REPLY ]]; then
            pip3 install yt-dlp || pip install yt-dlp
            echo -e "${GREEN}✓${NC} yt-dlp installed"
        else
            echo -e "${DIM}  Skipping. Install later: pip install yt-dlp${NC}"
        fi
    else
        echo "  Install later: pip install yt-dlp"
    fi
fi

# Install npm dependencies
echo ""
echo "Installing npm dependencies..."
npm install
echo -e "${GREEN}✓${NC} npm dependencies installed"

# Build project
echo ""
echo "Building project..."
npm run build
echo -e "${GREEN}✓${NC} Project built"

# Start Ollama and pull model (if available)
echo ""
if command -v ollama &> /dev/null; then
    echo "Setting up Ollama embedding model..."

    # Check if Ollama is running
    if ! curl -s http://127.0.0.1:11434/api/tags &> /dev/null; then
        echo -e "${DIM}  Starting Ollama server...${NC}"
        ollama serve &> /dev/null &
        sleep 2
    fi

    echo "  Pulling nomic-embed-text model (this may take a minute)..."
    ollama pull nomic-embed-text
    echo -e "${GREEN}✓${NC} Embedding model ready"
fi

# Done!
echo ""
echo "=========================================="
echo -e "${GREEN}Installation complete!${NC}"
echo "=========================================="
echo ""
echo "To use UDB, either:"
echo ""
echo "  1. Link globally (may need sudo):"
echo "     npm link"
echo "     udb"
echo ""
echo "  2. Or add an alias to your shell config:"
echo "     alias udb=\"node $(pwd)/dist/cli.js\""
echo ""
echo "Make sure Ollama is running before using UDB:"
echo "  ollama serve"
echo ""
