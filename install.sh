#!/bin/bash

# UDB Installation Script
# Installs dependencies and udb-cli from npm

set -e

# Colors for output (chosen for both dark and light terminals)
RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m' # No Color

echo "===================================================="
echo "  UDB (YouDB) - Personal Knowledge Base Installer"
echo "===================================================="
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
    echo -e "${CYAN}${BOLD}!${NC} Ollama not found (required for embeddings)"

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
    echo -e "${CYAN}${BOLD}!${NC} yt-dlp not found (optional)"

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

# Install udb-cli from npm
echo ""
echo "Installing udb-cli..."
npm install -g udb-cli
echo -e "${GREEN}✓${NC} udb-cli installed"

# Start Ollama and pull model (if available)
echo ""
if command -v ollama &> /dev/null; then
    echo "Setting up Ollama..."

    # Enable Ollama to start on boot (macOS with Homebrew)
    if [[ "$OS" == "macos" ]] && command -v brew &> /dev/null; then
        echo -e "${DIM}  Enabling Ollama to start on boot...${NC}"
        brew services start ollama &> /dev/null
        sleep 2
    else
        # Fallback: start manually if not using brew services
        if ! curl -s http://127.0.0.1:11434/api/tags &> /dev/null; then
            echo -e "${DIM}  Starting Ollama server...${NC}"
            ollama serve &> /dev/null &
            sleep 2
        fi
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
echo "Run 'udb' to start using your personal knowledge base."
echo ""

# Optional integrations setup
echo -e "${CYAN}${BOLD}Optional Integrations:${NC}"
echo ""
echo -e "  ${CYAN}${BOLD}Confluence${NC} - To ingest Confluence pages:"
echo "    1. Get an API token: https://id.atlassian.com/manage-profile/security/api-tokens"
echo "    2. Create ~/.udb/.env with:"
echo "       ATLASSIAN_EMAIL=your-email@example.com"
echo "       ATLASSIAN_API_TOKEN=your-token"
echo ""
echo -e "  ${CYAN}${BOLD}Google Docs${NC} - To ingest Google Docs:"
echo "    1. Go to https://console.cloud.google.com/"
echo "    2. Create a project and enable Google Docs API"
echo "    3. Create OAuth credentials (Desktop app)"
echo "    4. Download and save as ~/.udb/credentials.json"
echo ""
