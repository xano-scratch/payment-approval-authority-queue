import { table, f } from "@xanots/sdk";

/**
 * The auth table. Every governed endpoint reads the caller's `role` and
 * `approval_limit` from here, so the authority check lives at the API layer and
 * cannot be bypassed by whatever a generated frontend allows.
 *
 * `id` (int PK) + `created_at` (epochms) are auto-injected.
 */
export const users = table({
  name: "users",
  auth: true, // backs authentication (s.security.create_auth_token targets this table)
  schema: {
    email: f.email({ required: true }),
    // Plaintext in, hashed on write. Read it back only with an explicit `output`.
    password: f.password({ required: true }),
    name: f.text({ required: true }),
    role: f.enum(["requester", "approver", "admin"], { required: true }),
    // The largest amount this user may authorize. 0 for a pure requester.
    approval_limit: f.decimal({ default: 0 }),
    department: f.text(),
  },
  index: [{ type: "unique", fields: [{ name: "email" }] }],
});
