# NIGHTFALL // Local Agent

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
./llama-server -m /path/to/model.gguf --host 127.0.0.1 --port 8082
```

The extension calls `/v1/chat/completions` and sends the configured API key as a bearer token.

## Configuration

The defaults are `http://127.0.0.1:8082/v1`, API key `local`, model `LFM2.5-2.6B-Q4_K_M`, temperature `0.2`, and a 30-iteration limit. Configure `localAgent.endpoint`, `localAgent.model`, and the approval settings in VS Code settings. Reads are approved automatically; writes, terminal commands, and MCP tools require approval by default. Context is compacted automatically at 80% of the configured 32,768-token model window; adjust `localAgent.autoCompactionLimit`, `localAgent.contextWindow`, or enable `localAgent.pruneOldOutputs` as needed. Set the compaction limit to `null` to use only the safety buffer.

Set `localAgent.enableSnapshots` to create checkpoints before existing file edits. Use **Local Agent: Restore Last Snapshot** to restore the most recent checkpoint; snapshots are stored under `.nightfall/snapshots` and excluded from file search/list results.

## Example prompts

- Find the authentication implementation and explain how it works.
- Fix the failing tests.
- Refactor this function and show me the diff.
- Find all TODOs related to error handling.

## Context, skills, and MCP

The chat panel includes **Stop**, **Add files**, **Add skill**, and **Add MCP** actions. Attached files are kept in the current in-memory session and included in the next model request. Skills are workspace-relative Markdown files whose instructions are included in the agent context.

MCP server definitions are persisted in the `localAgent.mcpServers` workspace setting. Each configured server is started when an agent run begins, its tools are discovered and exposed to the model with an `mcp__server__tool` name, and every MCP call requires approval unless `localAgent.autoApproveTools` is enabled. Local servers use `command`, `args`, `env`, and `cwd`; remote servers use `url`, `transport` (`streamable-http` or legacy `sse`), and optional `apiKey`/`headers`. Failed servers are reported in the chat while other servers continue to load.

For example:

```json
{
	"localAgent.mcpServers": [
		{
			"name": "atlassian-bb",
			"command": "uvx",
			"args": ["--from", "bitbucket-mcp-atlassian", "bitbucket-mcp"],
			"env": {
				"BITBUCKET_URL": "https://your-bitbucket.example",
				"BITBUCKET_TOKEN": "use-a-secret-not-checked-into-workspace-settings",
				"BITBUCKET_VERIFY_TLS": "false"
			}
		}
	]
}
```

## Development

```bash
npm run compile
npm test
```

The agent core is split from the VS Code adapter so the loop, client, and tools can be tested independently. Sessions are intentionally in-memory in v1.
