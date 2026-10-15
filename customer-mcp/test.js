// End-to-end check: starts server.js over stdio with a throwaway data file and calls every tool.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const dbFile = path.join(os.tmpdir(), `customer-mcp-test-${Date.now()}.json`);
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [path.join(here, "server.js")],
  env: { ...process.env, CUSTOMER_DB_PATH: dbFile },
});
const client = new Client({ name: "test", version: "1.0.0" });
await client.connect(transport);

const call = async (name, args) => {
  let r;
  try { r = await client.callTool({ name, arguments: args }); }
  catch (e) { console.log(`ERR ${name}: rejected input (${e.message.match(/"message": "([^"]+)"/)?.[1] || e.message})`); return null; }
  const text = r.content[0].text;
  console.log(`${r.isError ? "ERR" : "ok "} ${name}: ${text.split("\n").join(" ").slice(0, 110)}`);
  return r.isError ? null : JSON.parse(text);
};

console.log("tools:", (await client.listTools()).tools.map((t) => t.name).join(", "));
const a = await call("add_customer", { name: "Ananya Rao", phone: "9845031212", email: "ananya@example.com", addr: "14, 3rd Cross, Koramangala", city: "Bengaluru", pin: "560095" });
await call("add_customer", { name: "Dup", phone: "9845031212", addr: "Somewhere 1", city: "Pune", pin: "411001" });
await call("add_customer", { name: "Bad", phone: "12345", addr: "Somewhere 1", city: "Pune", pin: "411001" });
await call("list_customers", { search: "benga" });
await call("update_customer", { id: a.id, city: "Mysuru", pin: "570001" });
await call("get_customer", { phone: "9845031212" });
await call("delete_customer", { id: a.id });
await call("list_customers", {});
await client.close();
