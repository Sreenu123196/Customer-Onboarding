# Customer-Onboarding

Bank customer onboarding details. Customer onboarding for a demo bank (Harbourline Bank): a web page to capture customer details and a local MCP server that stores them.

## What's here

| Path | What it is |
| --- | --- |
| [`customer-details.html`](customer-details.html) | Landing page with a customer details form (name, mobile, email, address, city, PIN) and a searchable register of saved customers with edit and delete. Built as a claude.ai artifact; it saves to the artifact's database, so saving only works when opened on claude.ai. |
| [`customer-mcp/`](customer-mcp) | Local MCP server (Node.js) with `add_customer`, `list_customers`, `get_customer`, `update_customer` and `delete_customer` tools. Stores customers in a JSON file. See its [README](customer-mcp/README.md). |

## Run the MCP server

```bash
cd customer-mcp
npm install
node test.js
```

## Validation rules

- Mobile number: 10 digits starting with 6, 7, 8 or 9
- PIN code: 6 digits, not starting with 0
- Email: optional
