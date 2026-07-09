// Minimal stdio MCP server for gateway tests: answers initialize and echoes
// tools/call arguments. Counts calls per tool on stderr-free JSON protocol.
let buffer = "";
let calls = 0;
process.stdin.on("data", (chunk) => {
  buffer += chunk.toString("utf8");
  let index;
  while ((index = buffer.indexOf("\n")) !== -1) {
    const line = buffer.slice(0, index).trim();
    buffer = buffer.slice(index + 1);
    if (!line) continue;
    const message = JSON.parse(line);
    if (message.method === "initialize") {
      respond(message.id, { protocolVersion: "2025-03-26", capabilities: { tools: {} }, serverInfo: { name: "fake-server", version: "1.0.0" } });
    } else if (message.method === "tools/call") {
      calls += 1;
      respond(message.id, { content: [{ type: "text", text: `echo#${calls}:${message.params.name}:${JSON.stringify(message.params.arguments)}` }] });
    } else if (message.id !== undefined) {
      respond(message.id, {});
    }
  }
});
function respond(id, result) {
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, result }) + "\n");
}
