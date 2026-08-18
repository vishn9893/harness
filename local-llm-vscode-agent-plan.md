# Plan: Build a Minimal Local LLM Coding Agent for VS Code

## Goal

Build a lightweight VS Code extension that provides a Kilo/ZooCode-style
coding agent experience, but uses a user's own local `llama.cpp`
OpenAI-compatible endpoint as the model backend.

The first version should prioritize a small, understandable agent core
over framework complexity.

Example backend:

``` text
http://localhost:8080/v1
```

The extension should be able to:

1.  Chat with the local model.
2.  Inspect the current VS Code workspace.
3.  Read and search files.
4.  Create and modify files.
5.  Run terminal commands with user approval.
6.  Show proposed changes as VS Code diffs.
7.  Iterate through tool calls until the task is complete.
8.  Keep a per-session conversation/history.
9.  Allow the model endpoint and model name to be configured.
10. Keep the agent engine sufficiently decoupled from VS Code so it can
    later be reused elsewhere.

------------------------------------------------------------------------

## Product Principles

### Keep the core small

Do not copy the architecture of Kilo/ZooCode wholesale.

The initial implementation should have four major layers:

``` text
VS Code UI
    |
    v
Agent Engine
    |
    +--> Tool Registry
    |
    +--> Session / Context
    |
    v
OpenAI-compatible Model Provider
    |
    v
llama.cpp
```

Avoid adding MCP, RAG, embeddings, sub-agents, complex planning
frameworks, or provider-specific abstractions in v1.

### Local-first

The primary target is:

``` text
VS Code Extension
        |
        | HTTP
        v
llama.cpp OpenAI-compatible API
```

No cloud dependency should be required.

### Human-in-the-loop

Reads can be automatically approved.

Writes and shell commands should have configurable approval behavior.

Never silently execute arbitrary shell commands by default.

------------------------------------------------------------------------

# 1. Repository Structure

Create a VS Code extension using TypeScript.

Suggested structure:

``` text
local-agent/
├── package.json
├── tsconfig.json
├── README.md
├── LICENSE
├── src/
│   ├── extension.ts
│   ├── agent/
│   │   ├── Agent.ts
│   │   ├── Session.ts
│   │   ├── ContextManager.ts
│   │   └── types.ts
│   ├── llm/
│   │   ├── OpenAICompatibleClient.ts
│   │   └── types.ts
│   ├── tools/
│   │   ├── ToolRegistry.ts
│   │   ├── ReadFileTool.ts
│   │   ├── WriteFileTool.ts
│   │   ├── SearchTool.ts
│   │   ├── ListFilesTool.ts
│   │   ├── TerminalTool.ts
│   │   └── GitDiffTool.ts
│   ├── permissions/
│   │   └── PermissionManager.ts
│   └── ui/
│       └── ChatPanel.ts
└── media/
    └── ...
```

Keep modules small and independently testable.

------------------------------------------------------------------------

# 2. VS Code Extension

Create an extension activation entry point.

Commands:

``` text
Local Agent: Open Chat
Local Agent: New Session
Local Agent: Clear Session
Local Agent: Configure Model
```

Add an Activity Bar or sidebar view if practical.

For the first implementation, a Webview-based chat panel is acceptable
and preferred over trying to fully integrate with VS Code's native AI
APIs.

The UI should support:

-   User messages
-   Assistant messages
-   Tool calls
-   Tool results
-   Loading/running state
-   Approval prompts
-   Errors
-   New session
-   Clear session

Example:

``` text
You:
Fix the failing authentication tests.

Agent:
I'll inspect the authentication implementation.

🔧 search
   authenticate

🔧 read_file
   src/auth.ts

🔧 terminal
   npm test

⚠ Approval required
   npm test

[Allow] [Deny]
```

------------------------------------------------------------------------

# 3. OpenAI-Compatible LLM Client

Implement a small client around the OpenAI Chat Completions API.

Configuration:

``` json
{
  "localAgent.endpoint": "http://localhost:8080/v1",
  "localAgent.apiKey": "local",
  "localAgent.model": "local-model"
}
```

Use the OpenAI-compatible endpoint:

``` text
POST /v1/chat/completions
```

Support:

-   `messages`
-   `model`
-   `temperature`
-   `stream`
-   `tools`
-   `tool_choice`

The implementation should not depend on OpenAI's hosted service.

The endpoint must be configurable so that other OpenAI-compatible local
servers can later be used, including vLLM or Ollama-compatible gateways.

------------------------------------------------------------------------

# 4. Agent Loop

Implement the smallest useful agent loop.

Pseudo-flow:

``` text
User message
    |
    v
Build messages
    |
    v
Call LLM
    |
    +---- normal response ----> display response
    |
    +---- tool calls
              |
              v
        Validate tool call
              |
              v
        Permission check
              |
        +-----+-----+
        |           |
      deny        allow
        |           |
        v           v
    return       execute tool
    denial           |
                     v
                tool result
                     |
                     v
                 LLM again
```

Set a configurable maximum iteration count:

``` text
localAgent.maxIterations = 30
```

Terminate safely if the limit is reached.

The agent should never recursively call itself without an explicit
iteration boundary.

------------------------------------------------------------------------

# 5. Tool System

Create a generic tool interface.

Conceptually:

``` typescript
interface AgentTool {
    name: string;
    description: string;
    schema: object;
    requiresApproval: boolean;
    execute(args: unknown): Promise<ToolResult>;
}
```

The tool registry should expose tool definitions to the model and map
tool-call names back to implementations.

Initial tools:

## `read_file`

Input:

``` json
{
  "path": "src/auth.ts"
}
```

Requirements:

-   Resolve paths relative to the workspace.
-   Prevent access outside the workspace.
-   Return useful errors.
-   Limit extremely large files/results.

## `write_file`

Input:

``` json
{
  "path": "src/auth.ts",
  "content": "..."
}
```

Requirements:

-   Workspace boundary validation.
-   Require approval by default.
-   Prefer showing a diff before committing the change.
-   Preserve encoding where practical.

## `search`

Search workspace text.

Input:

``` json
{
  "query": "authenticate",
  "path": "src"
}
```

Use VS Code APIs or a safe local search implementation.

Avoid searching:

``` text
.git
node_modules
dist
build
.venv
```

by default.

## `list_files`

Input:

``` json
{
  "path": "src"
}
```

Return a concise tree/list.

## `run_terminal`

Input:

``` json
{
  "command": "npm test"
}
```

Requirements:

-   Require approval by default.
-   Execute in workspace root.
-   Capture stdout/stderr.
-   Apply timeout.
-   Limit returned output.
-   Do not run through an unsafe shell abstraction unnecessarily.
-   Clearly show the command to the user before execution.

## `git_diff`

Return the current workspace diff.

This should help the model inspect changes before continuing.

------------------------------------------------------------------------

# 6. File Editing Strategy

Do not initially implement complicated AST-based editing.

Support two operations:

### Read

Model reads the complete file or bounded portions.

### Write

Model supplies the new file content.

Before applying an existing-file modification:

``` text
Current file
     |
     v
Generate proposed content
     |
     v
Show VS Code diff
     |
     v
User approval
     |
     v
Apply change
```

Later versions can introduce an `apply_patch` tool for more efficient
edits.

------------------------------------------------------------------------

# 7. Permissions

Implement a simple permission manager.

Default policy:

``` text
read_file       = auto
search          = auto
list_files      = auto
git_diff        = auto
write_file      = ask
run_terminal    = ask
```

Support settings such as:

``` json
{
  "localAgent.autoApproveReads": true,
  "localAgent.autoApproveWrites": false,
  "localAgent.autoApproveTerminal": false
}
```

For the first version, do not implement complicated policy languages.

------------------------------------------------------------------------

# 8. Context Management

The agent needs workspace context, but should not dump the entire
repository into every prompt.

Initial context should include:

-   Workspace root
-   Current file
-   Current selection
-   Open editors
-   Relevant user request

When tools are used, append their results to the conversation.

Example:

``` text
System
  |
  +-- Agent instructions
  +-- Workspace information

User
  |
  +-- task

Assistant
  |
  +-- tool call

Tool
  |
  +-- result

Assistant
  |
  +-- next tool call
```

Add basic truncation for very large tool outputs.

Do not build embeddings/RAG in v1.

------------------------------------------------------------------------

# 9. System Prompt

Create a concise configurable system prompt.

It should establish that the model is a coding agent operating inside a
VS Code workspace.

Important behaviors:

-   Inspect before modifying.
-   Prefer small changes.
-   Use tools rather than guessing file contents.
-   Run relevant tests after modifications.
-   Explain failures.
-   Do not claim a change was made unless the tool succeeded.
-   Ask for approval when required.
-   Never access files outside the workspace.
-   Never execute destructive commands without approval.

Keep the system prompt short.

------------------------------------------------------------------------

# 10. Session Management

Implement in-memory sessions first.

A session contains:

``` typescript
interface AgentSession {
    id: string;
    messages: Message[];
    createdAt: number;
    updatedAt: number;
}
```

Support:

``` text
New Session
Clear Session
```

Persistence can be added later using VS Code's
`ExtensionContext.globalState` or workspace storage.

Do not over-engineer persistence in v1.

------------------------------------------------------------------------

# 11. Streaming

If llama.cpp supports streaming, implement streaming assistant text into
the UI.

However:

**Do not block the first implementation on streaming.**

First make non-streaming tool calling reliable.

Then add streaming.

------------------------------------------------------------------------

# 12. Error Handling

Handle:

-   llama.cpp unavailable
-   connection timeout
-   invalid endpoint
-   malformed model response
-   unsupported tool calls
-   invalid tool arguments
-   permission denied
-   file not found
-   workspace boundary violation
-   terminal timeout
-   maximum agent iterations exceeded

Errors should be shown in the UI without crashing the extension.

------------------------------------------------------------------------

# 13. Configuration

Add VS Code settings:

``` text
localAgent.endpoint
localAgent.apiKey
localAgent.model
localAgent.temperature
localAgent.maxIterations
localAgent.requestTimeout
localAgent.autoApproveReads
localAgent.autoApproveWrites
localAgent.autoApproveTerminal
```

Reasonable defaults:

``` text
endpoint       = http://localhost:8080/v1
apiKey         = local
model          = local-model
temperature    = 0.2
maxIterations  = 30
timeout        = 120000
```

Do not hard-code a specific model name.

------------------------------------------------------------------------

# 14. Testing

Create unit tests for:

-   Tool registry
-   Path validation
-   File reading
-   File writing
-   Search
-   Permission manager
-   LLM client request construction
-   Agent loop termination
-   Tool-call parsing

Create an integration test for:

``` text
User request
    ↓
Mock LLM
    ↓
read_file
    ↓
Mock LLM
    ↓
final answer
```

The tests should not require a real llama.cpp server.

Add an optional manual test against:

``` text
http://localhost:8080/v1
```

------------------------------------------------------------------------

# 15. Security Requirements

Treat the local model as untrusted input.

Never allow:

``` text
../../outside-workspace
```

or equivalent path traversal.

Do not expose arbitrary filesystem access.

Do not automatically execute:

``` text
rm -rf
sudo
curl | sh
chmod -R
git reset --hard
git push
```

or similarly destructive commands.

The first version should require explicit approval for terminal
execution.

Do not store API keys in plaintext logs.

Do not log complete file contents by default.

------------------------------------------------------------------------

# 16. README

Document:

## Installation

How to install dependencies and launch the extension in VS Code.

## llama.cpp

Example:

``` bash
./llama-server \
  -m /path/to/model.gguf \
  --host 127.0.0.1 \
  --port 8080
```

The exact llama.cpp flags should be documented according to the
installed version rather than assuming every version supports identical
options.

## Configuration

Show:

``` text
localAgent.endpoint
localAgent.model
```

## Example usage

``` text
"Find the authentication implementation and explain how it works."

"Fix the failing tests."

"Refactor this function and show me the diff."

"Find all TODOs related to error handling."
```

------------------------------------------------------------------------

# 17. Definition of Done

The MVP is complete when:

-   The extension launches successfully in VS Code.
-   A chat panel is available.
-   The extension can connect to a llama.cpp OpenAI-compatible endpoint.
-   A user can send a prompt.
-   The model can call tools.
-   `read_file` works.
-   `search` works.
-   `list_files` works.
-   `write_file` works with approval.
-   `run_terminal` works with approval.
-   `git_diff` works.
-   Tool results are returned to the model.
-   The model can perform multiple tool-call iterations.
-   The user can see tool activity.
-   Errors do not crash the extension.
-   Workspace boundary protection works.
-   Unit tests pass.
-   The extension can complete a simple coding task end-to-end using a
    local llama.cpp model.

Example acceptance test:

``` text
Prompt:

"Find the function responsible for X, change it so that Y,
run the relevant tests, and show me the resulting diff."

Expected:

1. Agent searches workspace.
2. Agent reads relevant file.
3. Agent proposes/modifies file.
4. User approves modification.
5. Agent runs tests after approval.
6. Agent inspects git diff.
7. Agent summarizes what changed and test results.
```

------------------------------------------------------------------------

# 18. Phase 2 --- Only After MVP Works

Do not implement these until the MVP is stable:

### Native VS Code Chat integration

Replace or supplement the Webview with VS Code's native
chat/language-model integration.

### `apply_patch`

Add efficient patch-based editing.

### Better context selection

Automatically identify relevant files based on the current task.

### Persistent sessions

Persist conversations across VS Code restarts.

### MCP

Add MCP as another tool provider:

``` text
Tool Registry
    |
    ├── Built-in tools
    │
    └── MCP tools
```

MCP should be an extension to the tool system, not the foundation of the
agent.

### Multiple model providers

Support:

``` text
llama.cpp
vLLM
Ollama
OpenAI-compatible remote servers
```

without changing the agent core.

### Model capability profiles

Allow configuration of whether a model supports:

``` text
tool calling
structured output
streaming
vision
reasoning
```

------------------------------------------------------------------------

# 19. Implementation Guidance for Codex

Implement this incrementally.

Recommended order:

``` text
1. Scaffold VS Code extension
2. Implement OpenAI-compatible client
3. Implement basic chat UI
4. Implement Agent loop
5. Implement ToolRegistry
6. Implement read_file
7. Implement list_files
8. Implement search
9. Implement permission system
10. Implement write_file + diff
11. Implement terminal
12. Implement git_diff
13. Add session handling
14. Add tests
15. Add streaming
16. Polish UI
```

After each major step, run tests/build and fix failures before
proceeding.

Do not introduce unnecessary dependencies.

Prefer VS Code APIs and Node.js standard functionality where practical.

Keep the architecture simple enough that one developer can understand
the entire agent core.

------------------------------------------------------------------------

# Final Target

The final experience should feel like a small personal coding agent:

``` text
                    VS CODE
                       |
                ┌──────▼──────┐
                │ Local Agent │
                └──────┬──────┘
                       |
          ┌────────────┼────────────┐
          │            │            │
       Context       Tools       Session
          │            │
          │       ┌────┼─────┬──────┐
          │       │    │     │      │
          │      FS  Search Shell  Git
          │
          └────────────┬────────────
                       │
                OpenAI-compatible
                       │
                       ▼
                    llama.cpp
```

The primary design goal is:

**A tiny, transparent agent harness that turns any OpenAI-compatible
local LLM endpoint into a practical VS Code coding agent.**
