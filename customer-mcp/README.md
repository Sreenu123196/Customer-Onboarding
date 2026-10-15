# customer-mcp

A local MCP server that stores bank customer details (name, mobile number, email, address, city, PIN code) in a JSON file on your computer.

## Tools

| Tool | What it does |
| --- | --- |
| `add_customer` | Saves a new customer. Rejects a mobile number that is already saved. |
| `list_customers` | Lists customers, newest first. Optional `search` (name, phone or city) and `limit`. |
| `get_customer` | Finds one customer by `id` or `phone`. |
| `update_customer` | Changes only the fields you pass for a customer `id`. |
| `delete_customer` | Permanently deletes a customer by `id`. |

Validation matches the web form: mobile numbers are 10 digits starting with 6–9, and PIN codes are 6 digits.

## Setup

```bash
npm install
```

Data is saved to `data/customers.json` next to `server.js`. Set the `CUSTOMER_DB_PATH` environment variable to use a different file.

## Connect it to Claude

Claude Code:

```bash
claude mcp add customer-mcp -- node "C:/full/path/to/customer-mcp/server.js"
```

Claude Desktop: add this to `claude_desktop_config.json` (Settings → Developer → Edit Config), then restart the app:

```json
{
  "mcpServers": {
    "customer-mcp": {
      "command": "node",
      "args": ["C:/full/path/to/customer-mcp/server.js"]
    }
  }
}
```

## Test

```bash
node test.js
```

Runs every tool against a temporary data file, so your real customers are not touched.
