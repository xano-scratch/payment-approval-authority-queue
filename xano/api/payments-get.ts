import { query, input, s, ref, inp, col, c, expr } from "@xanots/sdk";

import { api } from "./api.js";
import { users } from "../tables/users.js";
import { paymentRequests } from "../tables/payment-requests.js";
import { approvalSteps } from "../tables/approval-steps.js";
import { approvalEvents } from "../tables/approval-events.js";
import { approvalPolicies } from "../tables/approval-policies.js";

/**
 * One request with its approval steps, its full audit trail, and the policy
 * band that routed it (including the pinned policy version). This is the read
 * behind the request-detail screen.
 */
export const getRequestQuery = query({
  // `id` is a PATH segment (not a `?id=` query param), so the request addresses
  // the resource REST-style and `getPath({ params: { id } })` stays type-safe.
  name: "payments/get/{id}",
  verb: "GET",
  apiGroup: api,
  auth: users,
  input: {
    id: input.int({ required: true }),
  },
  stack: [
    s.db.get_by_id({ table: paymentRequests, id: inp("id"), as: "req" }),
    s.precondition({
      expr: expr(ref("req", { safe: true }), "!=", c.null()),
      error_type: "notfound",
      error: c.text("Request not found."),
    }),
    s.db.query({
      table: approvalSteps,
      where: expr(col("payment_request_id"), "=", inp("id")),
      sort: [{ sortBy: "tier", dir: "asc" }],
      as: "steps",
    }),
    s.db.query({
      table: approvalEvents,
      where: expr(col("payment_request_id"), "=", inp("id")),
      sort: [{ sortBy: "created_at", dir: "asc" }],
      as: "events",
    }),
    // Use db.query (not db.get) so a 0-sentinel matched_policy_id yields null,
    // not a 400 on a null field-match value.
    s.db.query({
      table: approvalPolicies,
      where: expr(col("id"), "=", ref("req.matched_policy_id")),
      returnType: "single",
      as: "policy",
    }),
  ],
  response: {
    request: ref("req"),
    steps: ref("steps"),
    events: ref("events"),
    policy: ref("policy"),
  },
});
