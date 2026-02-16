/**
 * Interactive chat with RAG context using Claude Agent SDK
 */

import * as readline from "readline";
import { execSync } from "child_process";
import chalk from "chalk";
import { marked } from "marked";
import { markedTerminal } from "marked-terminal";
import {
  query,
  createSdkMcpServer,
  tool,
  type SDKMessage,
} from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import {
  search,
  ingestUrl,
  ingestContent,
  listKBSources,
  deleteKBSource,
  getChunksBySourceId,
  getSourceById,
} from "./kb/index.js";
import { config } from "./config.js";

// Configure marked with terminal renderer
marked.use(
  markedTerminal({
    reflowText: true,
    width: process.stdout.columns || 80,
  })
);

/**
 * Render markdown text for terminal display
 */
function renderMarkdown(text: string): string {
  // Use synchronous parsing with async: false
  const rendered = marked.parse(text, { async: false }) as string;
  return rendered.trimEnd(); // Remove trailing newlines from marked
}

// Find system Claude CLI path
function findClaudeCli(): string | undefined {
  try {
    const path = execSync("which claude", { encoding: "utf-8" }).trim();
    return path || undefined;
  } catch {
    return undefined;
  }
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * Create MCP server with KB tools for Claude
 */
function createKBMcpServer() {
  return createSdkMcpServer({
    name: "udb-kb",
    version: "1.0.0",
    tools: [
      // Search KB tool
      tool(
        "kb_search",
        "Search the knowledge base for relevant content. Returns matching documents with similarity scores.",
        {
          query: z.string().describe("The search query"),
          limit: z.number().optional().describe("Maximum results (default: 5)"),
          minSimilarity: z
            .number()
            .optional()
            .describe("Minimum similarity threshold 0-1 (default: 0.6)"),
        },
        async (args) => {
          const results = await search(args.query, {
            limit: args.limit ?? 5,
            minSimilarity: args.minSimilarity ?? 0.4, // Lower threshold for better recall
          });
          if (results.length === 0) {
            return { content: [{ type: "text", text: "No results found." }] };
          }
          const formatted = results
            .map((r, i) => {
              const source = r.source_title || r.source_url || "Unknown";
              // Show full chunk content (no truncation)
              return `${i + 1}. [${r.source_type}] ${source} (${(r.similarity * 100).toFixed(1)}%)\n${r.content}`;
            })
            .join("\n\n---\n\n");
          return {
            content: [
              {
                type: "text",
                text: `Found ${results.length} result(s):\n\n${formatted}`,
              },
            ],
          };
        },
      ),

      // Add text content tool
      tool(
        "kb_add",
        "Add text content directly to the knowledge base. Use this for notes, commands, snippets, or any text the user wants to save.",
        {
          content: z.string().describe("The text content to add"),
          title: z.string().describe("A descriptive title for the content"),
          tags: z
            .array(z.string())
            .optional()
            .describe("Optional tags for categorization"),
        },
        async (args) => {
          const result = await ingestContent(args.content, {
            title: args.title,
            tags: args.tags,
          });
          if (result.success) {
            return {
              content: [
                {
                  type: "text",
                  text: `Added successfully!\n  Source ID: ${result.source_id}\n  Chunks: ${result.chunks_count}`,
                },
              ],
            };
          }
          return {
            content: [{ type: "text", text: `Failed to add: ${result.error}` }],
            isError: true,
          };
        },
      ),

      // Ingest URL tool
      tool(
        "kb_ingest",
        "Ingest content from a URL into the knowledge base. Supports web articles, YouTube videos, and tweets.",
        {
          url: z.string().describe("The URL to ingest"),
          title: z.string().optional().describe("Optional custom title"),
          tags: z
            .array(z.string())
            .optional()
            .describe("Optional tags for categorization"),
        },
        async (args) => {
          const result = await ingestUrl(args.url, {
            title: args.title,
            tags: args.tags,
          });
          if (result.success) {
            return {
              content: [
                {
                  type: "text",
                  text: `Ingested successfully!\n  Source ID: ${result.source_id}\n  Chunks: ${result.chunks_count}`,
                },
              ],
            };
          }
          let errorMsg = `Failed to ingest: ${result.error}`;
          if (result.existingSourceId) {
            errorMsg += `\n  Already exists: ${result.existingSourceId}`;
          }
          return { content: [{ type: "text", text: errorMsg }], isError: true };
        },
      ),

      // List sources tool
      tool(
        "kb_list",
        "List all sources in the knowledge base.",
        {
          limit: z
            .number()
            .optional()
            .describe("Maximum results (default: 20)"),
        },
        async (args) => {
          const sources = listKBSources(args.limit ?? 20);
          if (sources.length === 0) {
            return {
              content: [{ type: "text", text: "Knowledge base is empty." }],
            };
          }
          const formatted = sources
            .map((s) => {
              const title = s.title || s.url || "Untitled";
              const date = new Date(s.created_at).toLocaleDateString();
              let entry = `• ${s.id}\n  ${title}\n  [${s.source_type}] ${date}`;
              if (s.url) entry += `\n  ${s.url}`;
              return entry;
            })
            .join("\n\n");
          return {
            content: [
              {
                type: "text",
                text: `Sources (${sources.length}):\n\n${formatted}`,
              },
            ],
          };
        },
      ),

      // Delete source tool
      tool(
        "kb_delete",
        "Delete a source from the knowledge base by its ID.",
        {
          id: z.string().describe("The source ID to delete"),
        },
        async (args) => {
          const result = await deleteKBSource(args.id);
          if (result.success) {
            return {
              content: [{ type: "text", text: `Deleted source: ${args.id}` }],
            };
          }
          return {
            content: [
              { type: "text", text: `Failed to delete: ${result.error}` },
            ],
            isError: true,
          };
        },
      ),

      // Get all chunks from a source tool
      tool(
        "kb_get_source_chunks",
        "Get ALL chunks from a specific source by its ID. Use this when you need to read through all content from a particular source (e.g., to find specific details like links, dates, or names that similarity search might miss).",
        {
          source_id: z.string().describe("The source ID to get chunks from (use kb_list to find source IDs)"),
        },
        async (args) => {
          const source = getSourceById(args.source_id);
          if (!source) {
            return {
              content: [{ type: "text", text: `Source not found: ${args.source_id}` }],
              isError: true,
            };
          }

          const chunks = getChunksBySourceId(args.source_id);
          if (chunks.length === 0) {
            return {
              content: [{ type: "text", text: `No chunks found for source: ${source.title || source.url || args.source_id}` }],
            };
          }

          const formatted = chunks
            .map((chunk, index) => {
              return `--- Chunk ${index + 1}/${chunks.length} ---\n${chunk.content}`;
            })
            .join("\n\n");

          const header = `Source: ${source.title || source.url || args.source_id}\nType: ${source.source_type}\nTotal chunks: ${chunks.length}\n\n`;

          return {
            content: [{ type: "text", text: header + formatted }],
          };
        },
      ),
    ],
  });
}

/**
 * Build system prompt for UDB chat
 */
function buildSystemPrompt(): string {
  return `You are UDB, a personal knowledge base assistant. Your job is to help users by answering questions based on their knowledge base.

You have access to these KB tools:
- kb_search: Search the knowledge base for relevant content
- kb_add: Add text content (notes, commands, snippets) to the KB
- kb_ingest: Ingest content from URLs (articles, YouTube videos, tweets)
- kb_list: List all sources in the KB
- kb_delete: Delete a source by ID
- kb_get_source_chunks: Get ALL chunks from a specific source by its ID

WORKFLOW FOR ANSWERING QUESTIONS:
1. First, use kb_search to find relevant content
2. If kb_search finds a relevant source BUT the specific answer is NOT in the returned chunks:
   - Note the source_id from the search results
   - IMMEDIATELY use kb_get_source_chunks with that source_id to read ALL chunks
   - The answer is likely in a chunk that wasn't returned by similarity search
3. Only after reading all relevant chunks, provide your answer

IMPORTANT RULES:
- Be CONCISE - give direct answers without excessive formatting, headers, or repetition
- Use the KB as your ONLY source of truth - NEVER make up information
- If you find a relevant source, ALWAYS use kb_get_source_chunks before saying "I couldn't find the specific information"
- Do NOT give up after kb_search alone - the information may be in other chunks of the same source
- Cite the source briefly when relevant

When the user wants to save information:
- Use kb_add for text or kb_ingest for URLs
- Confirm the action briefly

When the user asks to see raw KB content or list sources:
- Use kb_list to show sources
- You can show the raw search results if the user explicitly asks for them`;
}

/**
 * Extract text content from SDK message
 */
function extractTextFromMessage(message: SDKMessage): string {
  if (message.type === "assistant") {
    // SDKAssistantMessage - contains BetaMessage with content blocks
    const content = message.message.content;
    if (Array.isArray(content)) {
      return content
        .filter(
          (block): block is { type: "text"; text: string } =>
            block.type === "text",
        )
        .map((block) => block.text)
        .join("");
    }
  }
  return "";
}

/**
 * Stream Claude response for a user question with KB tools
 */
async function streamClaudeResponse(
  question: string,
  history: ChatMessage[],
  mcpServer: ReturnType<typeof createKBMcpServer>,
): Promise<string> {
  const systemPrompt = buildSystemPrompt();

  // Build conversation history as a formatted prompt
  let fullPrompt = "";
  for (const msg of history) {
    fullPrompt += `${msg.role === "user" ? "User" : "Assistant"}: ${msg.content}\n\n`;
  }
  fullPrompt += `User: ${question}`;

  let response = "";

  try {
    // Use Claude Agent SDK's query function
    const claudeCli = findClaudeCli();
    const q = query({
      prompt: fullPrompt,
      options: {
        model: config.CLAUDE_MODEL,
        systemPrompt,
        mcpServers: {
          "udb-kb": mcpServer,
        },
        allowedTools: [
          // KB tools
          "mcp__udb-kb__kb_search",
          "mcp__udb-kb__kb_add",
          "mcp__udb-kb__kb_ingest",
          "mcp__udb-kb__kb_list",
          "mcp__udb-kb__kb_delete",
          "mcp__udb-kb__kb_get_source_chunks",
          // File tools
          "Read",
          "Glob",
        ],
        maxTurns: 10, // Allow multiple turns for tool use
        includePartialMessages: true, // Enable streaming output
        env: process.env as { [key: string]: string | undefined }, // Pass through all env vars including auth
        pathToClaudeCodeExecutable: claudeCli, // Use system Claude CLI
      },
    });

    // Process messages
    // Buffer text to distinguish thoughts (muted) from final answer (normal)
    let textBuffer = "";
    let hasOutputText = false;

    for await (const message of q) {
      if (message.type === "stream_event") {
        // Handle streaming partial messages
        const event = message.event;

        if (event.type === "content_block_start") {
          // Check if this is a tool_use block - if so, flush buffer as muted thought
          const contentBlock = (event as { content_block?: { type: string } }).content_block;
          if (contentBlock?.type === "tool_use" && textBuffer) {
            // Print buffered text as muted thought with newline
            process.stdout.write(chalk.dim(textBuffer) + "\n");
            response += textBuffer + "\n";
            textBuffer = "";
          }
          // Add newline before new text blocks for readability (after previous muted thought)
          if (contentBlock?.type === "text" && hasOutputText && textBuffer === "") {
            // Don't add extra newline - already added after muted thought
          }
        }

        if (event.type === "content_block_delta" && "delta" in event) {
          const delta = event.delta;
          if ("text" in delta) {
            // Buffer text instead of printing immediately
            textBuffer += delta.text;
            hasOutputText = true;
          }
        }
      } else if (message.type === "assistant") {
        // Skip - we handle streaming via stream_event
        // Only use this if no streaming happened at all
        if (!hasOutputText && !textBuffer && !response) {
          const text = extractTextFromMessage(message);
          if (text) {
            process.stdout.write(text);
            response = text;
          }
        }
      }
    }

    // Flush remaining buffer as final answer with markdown rendering
    if (textBuffer) {
      const rendered = renderMarkdown(textBuffer);
      process.stdout.write(rendered);
      response += textBuffer;
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(chalk.red(`\nClaude error: ${errorMsg}`));
    response = `I encountered an error: ${errorMsg}`;
  }

  return response;
}

/**
 * Start interactive chat REPL with KB tools
 */
export async function startChat(): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log(chalk.blue("UDB Chat - Your personal knowledge base assistant"));
  console.log(chalk.gray('Commands: "exit" to quit, "clear" to reset history'));
  console.log(chalk.gray("Multi-line: end line with \\ to continue"));
  console.log(
    chalk.gray(
      "I can search, add, ingest URLs, list, and delete from your KB.",
    ),
  );
  console.log();

  // Create MCP server with KB tools
  const mcpServer = createKBMcpServer();

  const history: ChatMessage[] = [];
  let pendingOperation: Promise<void> | null = null;
  let isClosed = false;

  // Helper to collect multi-line input with backslash continuation
  const collectInput = (initialLine: string): Promise<string> => {
    return new Promise((resolve) => {
      let lines: string[] = [];

      const processLine = (line: string) => {
        if (line.endsWith("\\")) {
          // Continue to next line
          lines.push(line.slice(0, -1)); // Remove trailing backslash
          rl.question(chalk.gray("... "), processLine);
        } else {
          // Final line
          lines.push(line);
          resolve(lines.join("\n"));
        }
      };

      processLine(initialLine);
    });
  };

  const promptUser = (): void => {
    if (isClosed) return;

    rl.question(chalk.green("You: "), async (input) => {
      if (isClosed) return;

      // Handle multi-line input with backslash continuation
      const fullInput = input.endsWith("\\")
        ? await collectInput(input)
        : input;

      const question = fullInput.trim();

      if (!question) {
        promptUser();
        return;
      }

      // Handle special commands
      if (
        question.toLowerCase() === "exit" ||
        question.toLowerCase() === "quit"
      ) {
        console.log(chalk.blue("\nGoodbye!"));
        isClosed = true;
        rl.close();
        return;
      }

      if (question.toLowerCase() === "clear") {
        history.length = 0;
        console.log(chalk.yellow("Conversation history cleared.\n"));
        promptUser();
        return;
      }

      // Process question with Claude and KB tools
      pendingOperation = (async () => {
        try {
          // Stream Claude's response with KB tools
          process.stdout.write(chalk.cyan("UDB: "));
          const response = await streamClaudeResponse(
            question,
            history,
            mcpServer,
          );
          console.log("\n");

          // Maintain conversation history
          history.push({ role: "user", content: question });
          history.push({ role: "assistant", content: response });
        } catch (err) {
          console.error(chalk.red("\nError processing question:"), err);
        }
      })();

      await pendingOperation;
      pendingOperation = null;

      // Continue prompting if not closed
      if (!isClosed) {
        promptUser();
      }
    });
  };

  // Handle stdin close (e.g., piped input ends)
  rl.on("close", () => {
    isClosed = true;
  });

  // Start the conversation loop
  promptUser();

  // Return a promise that resolves when readline closes AND pending operations complete
  return new Promise((resolve) => {
    const checkAndResolve = async () => {
      if (isClosed) {
        // Wait for any pending operation to complete
        if (pendingOperation) {
          await pendingOperation;
        }
        resolve();
      } else {
        // Check again later
        setTimeout(checkAndResolve, 100);
      }
    };

    rl.on("close", checkAndResolve);
  });
}
