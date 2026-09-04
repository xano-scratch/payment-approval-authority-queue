import { query, input, s, ref, inp, c, expr } from "@xanots/sdk";

import { api } from "./api.js";
import { users } from "../tables/users.js";

/**
 * Mint an auth token for a persona. Take the submitted password as `input.text`
 * (an `input.password` would hash it a second time and never match), read the
 * stored hash with an explicit `output`, then compare with
 * `s.security.check_password`. On success mint a token the frontend sends as a
 * Bearer credential on every later call.
 */
export const loginQuery = query({
  name: "auth/login",
  verb: "POST",
  apiGroup: api,
  input: {
    email: input.email({ required: true, methods: ["lower", "trim"] }),
    password: input.text({ required: true }),
  },
  stack: [
    s.db.get({
      table: users,
      fieldName: "email",
      fieldValue: inp("email"),
      // `output` overrides column visibility to pull the internal password hash.
      output: ["id", "email", "name", "role", "approval_limit", "department", "password"],
      as: "u",
    }),
    s.precondition({
      expr: expr(ref("u", { safe: true }), "!=", c.null()),
      error_type: "unauthorized",
      error: c.text("Invalid email or password."),
    }),
    s.security.check_password({
      text_password: inp("password"),
      hash_password: ref("u.password"),
      as: "ok",
    }),
    s.precondition({
      expr: expr(ref("ok"), "=", c.bool(true)),
      error_type: "unauthorized",
      error: c.text("Invalid email or password."),
    }),
    s.security.create_auth_token({
      table: users,
      id: ref("u.id"),
      expiration: c.int(86400),
      as: "token",
    }),
  ],
  response: {
    authToken: ref("token"),
    user: {
      id: ref("u.id"),
      name: ref("u.name"),
      email: ref("u.email"),
      role: ref("u.role"),
      approval_limit: ref("u.approval_limit"),
      department: ref("u.department"),
    },
  },
  // The auth token is minted by a statement whose output the response walk
  // cannot trace, so pin the response shape for the frontend's one contract.
  responseShape: null as unknown as {
    authToken: string;
    user: {
      id: number;
      name: string;
      email: string;
      role: "requester" | "approver" | "admin";
      approval_limit: number;
      department: string;
    };
  },
});
