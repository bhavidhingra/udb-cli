# UDB (YouDB) - Personal Knowledge Base

A local RAG (Retrieval-Augmented Generation) CLI that lets you save and search personal knowledge using natural language.

## What is UDB?

UDB is your personal knowledge assistant. You talk to it in plain English, and it can:

- **Save** notes, commands, and snippets
- **Ingest** web articles, YouTube videos, tweets, Confluence pages, and Google Docs
- **Search** your knowledge base semantically
- **Read** local files and add them to your KB
- **Answer** questions using only your saved knowledge

All data stays local on your machine. No cloud storage.

## Quick Start

```bash
# Add to your shell config (~/.zshrc or ~/.bashrc)
export AWS_PROFILE=dev

# Install dependencies
npm install

# Start Ollama (required for embeddings)
ollama serve
ollama pull nomic-embed-text

# Run UDB
npm run build

# Install globally (choose one):
npm link                    # Option 1: npm link (may need sudo)
# OR add to your shell config:
alias udb="node /path/to/udb-cli/dist/cli.js"  # Option 2: alias
```

## Usage

Just run `udb` to start chatting:

```bash
udb
```

```
UDB Chat - Your personal knowledge base assistant
Commands: "exit" to quit, "clear" to reset history
Multi-line input: end line with \ to continue
I can search, add, ingest URLs, list, and delete from your KB.

You: _
```

### Examples

**Save a note:**

```
You: Save this command: git stash -u saves all changes including untracked files
UDB: Added successfully!
  Source ID: kb-1234567890-abc
  Chunks: 1
```

**Ask a question:**

```
You: How do I stash untracked files in git?
UDB: git stash -u saves all changes including untracked files
```

**Ingest a URL:**

```
You: Add this article: https://example.com/blog/post
UDB: Ingested successfully!
  Source ID: kb-1234567890-xyz
  Chunks: 5
```

**Ingest a YouTube video:**

```
You: Save this video: https://www.youtube.com/watch?v=dQw4w9WgXcQ
UDB: Ingested successfully! (transcript extracted)
```

**Ingest a Confluence page:**

```
You: Save this Confluence page: https://mycompany.atlassian.net/wiki/spaces/TEAM/pages/123456/Meeting+Notes
UDB: Ingested successfully!
  Source ID: kb-1234567890-conf
  Chunks: 3
```

**Ingest a Google Doc:**

```
You: Save this doc: https://docs.google.com/document/d/1abc123xyz/edit
UDB: Ingested successfully!
  Source ID: kb-1234567890-gdoc
  Chunks: 4
```

**Read and save a local file:**

```
You: Read ~/notes/meeting.md and add it to my KB with title "Q1 Planning Meeting"
UDB: Added successfully!
```

**List all sources:**

```
You: What's in my knowledge base?
UDB: Sources (3):
  • kb-123... Git Commands [text]
  • kb-456... Blog Article [article]
  • kb-789... Meeting Notes [text]
```

**Delete a source:**

```
You: Delete source kb-123
UDB: Deleted source: kb-123
```

**Multi-line input:**

```
You: Save this: \
... # Docker Commands \
... docker ps - list containers \
... docker logs <id> - view logs \
... docker exec -it <id> bash - shell into container
UDB: Added successfully!
```

## How It Works

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   You       │────▶│   Claude    │────▶│  KB Tools   │
│  (chat)     │     │  (reasoning)│     │  (MCP)      │
└─────────────┘     └─────────────┘     └─────────────┘
                                              │
                    ┌─────────────────────────┴─────────────────────────┐
                    │                                                   │
              ┌─────▼─────┐    ┌─────────────┐    ┌─────────────┐
              │  Ollama   │    │   SQLite    │    │ sqlite-vss  │
              │ embeddings│    │  (storage)  │    │ (vectors)   │
              └───────────┘    └─────────────┘    └─────────────┘
```

1. **Chat Interface**: You talk to UDB in natural language
2. **Claude**: Understands your intent and calls the right KB tools
3. **KB Tools**: Add, search, ingest, list, delete operations
4. **Ollama**: Generates embeddings locally (nomic-embed-text, 768 dimensions)
5. **SQLite + sqlite-vss**: Stores content and enables vector similarity search

### Supported Content Types

| Type            | Source       | Extraction Method    |
| --------------- | ------------ | -------------------- |
| **Articles**    | Web URLs     | Mozilla Readability  |
| **Videos**      | YouTube      | yt-dlp (transcripts) |
| **Tweets**      | Twitter/X    | FxTwitter API        |
| **Confluence**  | Atlassian    | REST API             |
| **Google Docs** | Google Drive | OAuth 2.0 API        |
| **Text**        | Direct input | As-is                |
| **Files**       | Local paths  | Claude's Read tool   |

### Search

UDB uses semantic search, not keyword matching:

- Your query is converted to a 768-dimensional vector
- Cosine similarity finds the most relevant chunks
- Results are deduplicated by source
- Only content above 40% similarity is returned

## Configuration

Settings are in `src/config.ts`:

```typescript
{
  DATA_DIR: '~/.udb',              // Where data is stored
  DB_FILE: 'kb.db',                // SQLite database
  OLLAMA_URL: 'http://127.0.0.1:11434',
  OLLAMA_MODEL: 'nomic-embed-text',
  KB_CHUNK_SIZE: 800,              // Characters per chunk
  KB_CHUNK_OVERLAP: 200,           // Overlap between chunks
  KB_MIN_CHUNK: 50,                // Minimum chunk size
  KB_SEARCH_LIMIT: 10,             // Default search results
  KB_MIN_SIMILARITY: 0.7,          // Similarity threshold
  CLAUDE_MODEL: 'us.anthropic.claude-sonnet-4-20250514-v1:0',
}
```

### Environment Variables

Create a `.env` file in the project root (automatically loaded):

```bash
# Core settings
UDB_DATA_DIR=~/.udb          # Data directory
OLLAMA_URL=http://127.0.0.1:11434
OLLAMA_MODEL=nomic-embed-text
CLAUDE_MODEL=us.anthropic.claude-sonnet-4-20250514-v1:0

# Atlassian/Confluence (optional, for ingesting Confluence pages)
ATLASSIAN_EMAIL=your-email@example.com
ATLASSIAN_API_TOKEN=your-api-token
```

To get an Atlassian API token:

1. Go to https://id.atlassian.com/manage-profile/security/api-tokens
2. Create a new API token
3. Add it to your `.env` file along with your Atlassian email

### Google Docs Setup

To ingest Google Docs, you need to set up OAuth 2.0 credentials:

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create or select a project
3. Enable the **Google Docs API** (APIs & Services → Enable APIs)
4. Create OAuth credentials (APIs & Services → Credentials → Create Credentials → OAuth client ID)
   - Configure OAuth consent screen if prompted (External, add your email as test user)
   - Application type: **Desktop app**
5. Download the credentials JSON and save as `~/.udb/credentials.json`

On first use, UDB will open your browser for Google authorization. Tokens are stored in `~/.udb/google-tokens.json` and automatically refresh

## Data Storage

All data is stored locally in `~/.udb/`:

```
~/.udb/
├── kb.db              # SQLite database
├── kb.db-shm          # (if WAL mode enabled)
├── kb.db-wal          # (if WAL mode enabled)
├── credentials.json   # Google OAuth credentials (you create this)
├── google-tokens.json # Google OAuth tokens (auto-generated)
└── locks/             # Concurrency lock files
```

### Database Schema

**kb_sources** - Original content

```sql
id, url, title, source_type, summary, raw_content,
content_hash (UNIQUE), tags, created_at, updated_at
```

**kb_chunks** - Chunked content with embeddings

```sql
id, source_id (FK), chunk_index, content,
embedding (BLOB), created_at
```

**kb_chunks_vss** - Vector search index

```sql
embedding(768)  -- sqlite-vss virtual table
```

## Requirements

- **Node.js** 18+
- **Ollama** running locally with `nomic-embed-text` model
- **Claude CLI** authenticated (for the chat interface)
- **yt-dlp** (optional, for YouTube transcripts)

## Troubleshooting

### "Ollama not available"

```bash
# Start Ollama
ollama serve

# Pull the embedding model
ollama pull nomic-embed-text

# Verify it's running
curl http://127.0.0.1:11434/api/tags
```

### "sqlite-vss extension failed to load"

The native module may need rebuilding:

```bash
npm rebuild
```

### Search returns no results

1. Check if Ollama is running
2. Verify content was chunked: `sqlite3 ~/.udb/kb.db "SELECT COUNT(*) FROM kb_chunks;"`
3. Content may be below minimum chunk size (50 chars)

### Claude authentication errors

Ensure Claude CLI is authenticated:

```bash
claude --version
# If not logged in, authenticate first
```

## Development

```bash
# Build
npm run build

# Run in development
npm run dev

# Type check
npx tsc --noEmit
```

## License

MIT
