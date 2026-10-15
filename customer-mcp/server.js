#!/usr/bin/env node
// Local MCP server for bank customer details.
// Stores customers in a JSON file and exposes add / list / get / update / delete tools over stdio.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.CUSTOMER_DB_PATH || path.join(here, "data", "customers.json");

// ---------- storage ----------

async function load() {
  try {
    const parsed = JSON.parse(await fs.readFile(DB_PATH, "utf8"));
    return Array.isArray(parsed.customers) ? parsed.customers : [];
  } catch (err) {
    if (err.code === "ENOENT") return [];
    throw new Error(`Could not read ${DB_PATH}: ${err.message}`);
  }
}

// Writes go through one queue so two tool calls never interleave a read-modify-write.
let queue = Promise.resolve();
function mutate(fn) {
  const run = queue.then(async () => {
    const customers = await load();
    const result = await fn(customers);
    await fs.mkdir(path.dirname(DB_PATH), { recursive: true });
    const tmp = DB_PATH + ".tmp";
    await fs.writeFile(tmp, JSON.stringify({ customers }, null, 2), "utf8");
    await fs.rename(tmp, DB_PATH);
    return result;
  });
  queue = run.catch(() => {});
  return run;
}

// ---------- validation (same rules as the web form) ----------

const fields = {
  name: z.string().trim().min(2, "Enter the customer's full name."),
  phone: z.string().trim().regex(/^[6-9]\d{9}$/, "Mobile number must be 10 digits starting with 6, 7, 8 or 9."),
  email: z.string().trim().email("Enter a valid email address.").or(z.literal("")).optional(),
  addr: z.string().trim().min(5, "Enter the house number and street."),
  city: z.string().trim().min(2, "Enter the city."),
  pin: z.string().trim().regex(/^[1-9]\d{5}$/, "PIN code must be 6 digits."),
};

const ok = (data) => ({ content: [{ type: "text", text: JSON.stringify(data, null, 2) }] });
const fail = (message) => ({ isError: true, content: [{ type: "text", text: message }] });

// ---------- server ----------

const server = new McpServer({ name: "customer-mcp", version: "1.0.0" });

server.registerTool(
  "add_customer",
  {
    title: "Add customer",
    description: "Save a new bank customer with name, 10-digit Indian mobile number, optional email, address, city and 6-digit PIN code.",
    inputSchema: fields,
  },
  async (input) => {
    const customer = await mutate((customers) => {
      if (customers.some((c) => c.phone === input.phone)) {
        throw new Error(`A customer with mobile number ${input.phone} already exists.`);
      }
      const now = new Date().toISOString();
      const c = { id: randomUUID(), ...input, email: input.email || "", createdAt: now, updatedAt: now };
      customers.push(c);
      return c;
    }).catch((e) => e);
    return customer instanceof Error ? fail(customer.message) : ok(customer);
  }
);

server.registerTool(
  "list_customers",
  {
    title: "List customers",
    description: "List saved customers, newest first. Optionally filter by text found in the name, phone or city.",
    inputSchema: {
      search: z.string().optional().describe("Text to match against name, phone or city"),
      limit: z.number().int().min(1).max(500).optional().describe("Maximum number of customers to return (default 100)"),
    },
  },
  async ({ search, limit = 100 }) => {
    const q = (search || "").trim().toLowerCase();
    const customers = (await load())
      .filter((c) => !q || [c.name, c.phone, c.city].join(" ").toLowerCase().includes(q))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return ok({ total: customers.length, customers: customers.slice(0, limit) });
  }
);

server.registerTool(
  "get_customer",
  {
    title: "Get customer",
    description: "Get one customer by id or by 10-digit mobile number.",
    inputSchema: {
      id: z.string().optional(),
      phone: z.string().optional(),
    },
  },
  async ({ id, phone }) => {
    if (!id && !phone) return fail("Give either an id or a phone number.");
    const c = (await load()).find((x) => (id && x.id === id) || (phone && x.phone === phone));
    return c ? ok(c) : fail("No customer found.");
  }
);

server.registerTool(
  "update_customer",
  {
    title: "Update customer",
    description: "Change some or all details of an existing customer. Only the fields you pass are changed.",
    inputSchema: {
      id: z.string(),
      name: fields.name.optional(),
      phone: fields.phone.optional(),
      email: fields.email,
      addr: fields.addr.optional(),
      city: fields.city.optional(),
      pin: fields.pin.optional(),
    },
  },
  async ({ id, ...changes }) => {
    const result = await mutate((customers) => {
      const c = customers.find((x) => x.id === id);
      if (!c) throw new Error(`No customer with id ${id}.`);
      if (changes.phone && customers.some((x) => x.id !== id && x.phone === changes.phone)) {
        throw new Error(`Another customer already uses mobile number ${changes.phone}.`);
      }
      for (const [k, v] of Object.entries(changes)) if (v !== undefined) c[k] = v;
      c.updatedAt = new Date().toISOString();
      return c;
    }).catch((e) => e);
    return result instanceof Error ? fail(result.message) : ok(result);
  }
);

server.registerTool(
  "delete_customer",
  {
    title: "Delete customer",
    description: "Permanently delete a customer by id.",
    inputSchema: { id: z.string() },
    annotations: { destructiveHint: true },
  },
  async ({ id }) => {
    const result = await mutate((customers) => {
      const i = customers.findIndex((x) => x.id === id);
      if (i === -1) throw new Error(`No customer with id ${id}.`);
      return customers.splice(i, 1)[0];
    }).catch((e) => e);
    return result instanceof Error ? fail(result.message) : ok({ deleted: result });
  }
);

await server.connect(new StdioServerTransport());
console.error(`customer-mcp running. Data file: ${DB_PATH}`);
