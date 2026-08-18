# Local Agent

A small, local-first VS Code coding agent for any OpenAI-compatible HTTP server, including `llama.cpp`.

## Install and run

```bash
npm install
npm run compile
```

Open this folder in VS Code, press `F5` to launch an Extension Development Host, and run **Local Agent: Open Chat**. The extension has no cloud dependency.

## llama.cpp

Start a compatible server using the flags supported by your installed version. A common current form is:

```bash
./llama-server -m /path/to/model.gguf --host 127.0.0.1 --port 8080
```

The extension calls `/v1/chat/completions` and sends the configured API key as a bearer token.

## Configuration

The defaults are `http://localhost:8080/v1`, API key `local`, model `local-model`, temperature `0.2`, and a 30-iteration limit. Configure `localAgent.endpoint`, `localAgent.model`, and the approval settings in VS Code settings. Reads are approved automatically; writes and terminal commands require approval by default.

## Example prompts

- Find the authentication implementation and explain how it works.
- Fix the failing tests.
- Refactor this function and show me the diff.
- Find all TODOs related to error handling.

## Context, skills, and MCP

The chat panel includes **Stop**, **Add files**, **Add skill**, and **Add MCP** actions. Attached files are kept in the current in-memory session and included in the next model request. Skills are workspace-relative Markdown files whose instructions are included in the agent context.

MCP server definitions can be registered with a name, command, and arguments. They are persisted in the `localAgent.mcpServers` workspace setting and shown to the model, but are not started automatically yet; MCP transport/tool bridging is the next isolated extension point.

## Development

```bash
npm run compile
npm test
```

The agent core is split from the VS Code adapter so the loop, client, and tools can be tested independently. Sessions are intentionally in-memory in v1.
