# revive-mcp-gateway

Wrap any MCP server with Revive: every tool call gets exactly-once execution,
replay verdicts, human approvals for high-risk actions, and a full audit ledger.
Zero dependencies, Node 18+.

## What it does

Sits between your MCP client (Claude Desktop, Cursor, any MCP host) and a
downstream MCP server. Every `tools/call` is registered with the Revive ledger
before it runs:

| Ledger verdict | What happens |
| --- | --- |
| `safe_to_execute` | Forwarded to the server; result recorded. |
| `already_committed` | The stored result is returned. **The tool never runs twice.** |
| `reconcile_first` | A previous attempt's outcome is unknown — blocked by default. |
| approval pending | High-risk tools (payments, email, deletes) pause until a human approves in the Revive console. |

Everything else — `initialize`, `tools/list`, notifications, server→client
requests — passes through untouched.

### Typed action contracts

The gateway also sends a deliberately small risk context for common tool calls:
outbound-message recipient count, money movement, destructive change, and a
production target. It does **not** send message bodies, recipient addresses, or
raw tool arguments to Revive. Workspace admins can use these facts to require
approval for every outbound send or only sends above a chosen recipient count.

## Setup

Claude Desktop (`claude_desktop_config.json`) or any MCP host:

```json
{
  "mcpServers": {
    "my-server-via-revive": {
      "command": "npx",
      "args": ["revive-mcp-gateway", "--", "npx", "-y", "@some/mcp-server"],
      "env": { "REVIVE_API_KEY": "rv_live_..." }
    }
  }
}
```

That is the whole integration: one config line in front of the server you
already use. Remove the wrapper to remove Revive.

## Configuration

| Flag | Env | Default | |
| --- | --- | --- | --- |
| `--api-key` | `REVIVE_API_KEY` | — | required |
| `--api-url` | `REVIVE_API_URL` | `https://revivelabs.app/api` | |
| `--connection-id` | `REVIVE_CONNECTION_ID` | `mcp` | |
| `--run-id` | `REVIVE_RUN_ID` | `mcp-session` | stable id ⇒ duplicates caught across restarts |
| `--approvals` | `REVIVE_APPROVALS` | `auto` | `off` disables the approval gate |
| `--on-uncertain` | `REVIVE_ON_UNCERTAIN` | `block` | `execute` overrides fail-closed |
| `--approval-timeout` | `REVIVE_APPROVAL_TIMEOUT` | `600` (seconds) | |

## Test

```
npm test
```

Spins up a fake Revive API and a fake MCP server, then asserts exactly-once,
approval gating, deny handling, and passthrough.
