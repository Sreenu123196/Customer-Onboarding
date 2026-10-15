// Customers API for the Harbourline onboarding page.
// GET    /api/customers        list customers, newest first
// POST   /api/customers        add a customer
// PUT    /api/customers/:id    update a customer
// DELETE /api/customers/:id    delete a customer
// Every request must send the access code in the `x-access-code` header.

import type { Config, Context } from "@netlify/functions";
import { getStore } from "@netlify/blobs";
import { createHash, randomUUID, timingSafeEqual } from "node:crypto";

type Customer = {
  id: string;
  name: string;
  phone: string;
  email: string;
  addr: string;
  city: string;
  pin: string;
  createdAt: string;
  updatedAt: string;
};

const FIELDS = ["name", "phone", "email", "addr", "city", "pin"] as const;
type Input = Record<(typeof FIELDS)[number], string>;

const rules: Record<keyof Input, (v: string) => true | string> = {
  name: (v) => v.length >= 2 || "Enter the customer's full name.",
  phone: (v) => /^[6-9]\d{9}$/.test(v) || "Mobile number must be 10 digits starting with 6, 7, 8 or 9.",
  email: (v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) || "Enter a valid email address, or leave it blank.",
  addr: (v) => v.length >= 5 || "Enter the house number and street.",
  city: (v) => v.length >= 2 || "Enter the city.",
  pin: (v) => /^[1-9]\d{5}$/.test(v) || "PIN code must be 6 digits.",
};

const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "cache-control": "no-store" } });

const digest = (s: string) => createHash("sha256").update(s).digest();

function authorized(req: Request) {
  const expected = Netlify.env.get("ACCESS_CODE");
  if (!expected) return false;
  return timingSafeEqual(digest(req.headers.get("x-access-code") ?? ""), digest(expected));
}

function validate(body: unknown, partial: boolean): { data?: Partial<Input>; errors?: Record<string, string> } {
  if (!body || typeof body !== "object") return { errors: { body: "Send the customer details as JSON." } };
  const src = body as Record<string, unknown>;
  const data: Partial<Input> = {};
  const errors: Record<string, string> = {};
  for (const k of FIELDS) {
    if (partial && src[k] === undefined) continue;
    const v = typeof src[k] === "string" ? (src[k] as string).trim() : "";
    const r = rules[k](v);
    if (r === true) data[k] = v;
    else errors[k] = r;
  }
  return Object.keys(errors).length ? { errors } : { data };
}

const store = () => getStore({ name: "customers", consistency: "strong" });

async function all(): Promise<Customer[]> {
  const s = store();
  const { blobs } = await s.list();
  const items = await Promise.all(blobs.map((b) => s.get(b.key, { type: "json" }) as Promise<Customer | null>));
  return items.filter((c): c is Customer => !!c).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export default async (req: Request, context: Context) => {
  if (!authorized(req)) return json({ error: "Wrong or missing access code." }, 401);

  const id = context.params.id;
  try {
    if (req.method === "GET" && !id) return json({ customers: await all() });

    if (req.method === "POST" && !id) {
      const { data, errors } = validate(await req.json().catch(() => null), false);
      if (errors) return json({ errors }, 400);
      if ((await all()).some((c) => c.phone === data!.phone)) {
        return json({ errors: { phone: `A customer with mobile number ${data!.phone} already exists.` } }, 409);
      }
      const now = new Date().toISOString();
      const customer = { id: randomUUID(), ...(data as Input), createdAt: now, updatedAt: now };
      await store().setJSON(customer.id, customer, { onlyIfNew: true });
      return json({ customer }, 201);
    }

    if (req.method === "PUT" && id) {
      const existing = (await store().get(id, { type: "json" })) as Customer | null;
      if (!existing) return json({ error: "Customer not found." }, 404);
      const { data, errors } = validate(await req.json().catch(() => null), true);
      if (errors) return json({ errors }, 400);
      if (data!.phone && (await all()).some((c) => c.id !== id && c.phone === data!.phone)) {
        return json({ errors: { phone: `Another customer already uses mobile number ${data!.phone}.` } }, 409);
      }
      const customer = { ...existing, ...data, updatedAt: new Date().toISOString() };
      await store().setJSON(id, customer);
      return json({ customer });
    }

    if (req.method === "DELETE" && id) {
      await store().delete(id);
      return json({ deleted: id });
    }

    return json({ error: "Not supported." }, 405);
  } catch (err) {
    console.error("customers API error", err);
    return json({ error: "Something went wrong saving customers. Try again." }, 500);
  }
};

export const config: Config = {
  path: ["/api/customers", "/api/customers/:id"],
};
