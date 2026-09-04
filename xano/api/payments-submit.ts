import { query, input, s, ref, inp, auth, col, c, expr, withFilters, fl } from "@xanots/sdk";

import { api } from "./api.js";
import { users } from "../tables/users.js";
import { paymentRequests } from "../tables/payment-requests.js";
import { approvalPolicies } from "../tables/approval-policies.js";
import { approvalSteps } from "../tables/approval-steps.js";
import { approvalEvents } from "../tables/approval-events.js";

/**
 * A requester submits a payment request. The server matches the amount against
 * the active policy version, pins the version onto the request, creates the
 * first approval step at the routed tier, and writes the submitted + routed
 * audit events. Any authenticated user may submit (requester and up).
 */
export const submitQuery = query({
  name: "payments/submit",
  verb: "POST",
  apiGroup: api,
  auth: users,
  input: {
    vendor: input.text({ required: true, methods: ["trim"] }),
    amount: input.decimal({ required: true }),
    currency: input.text({ default: "USD", methods: ["trim", "upper"] }),
    memo: input.text(),
  },
  stack: [
    s.precondition({
      expr: expr(inp("amount"), ">", c.decimal(0)),
      error_type: "badrequest",
      error: c.text("Amount must be greater than zero."),
    }),
    // Route: the active band whose [min_amount, max_amount] range contains the
    // amount. The open-ended top band carries a high sentinel ceiling, so the
    // match is a plain range test with no null-comparison semantics to depend on.
    s.db.query({
      table: approvalPolicies,
      where: [
        expr(col("active"), "=", c.bool(true)),
        expr(col("min_amount"), "<=", inp("amount")),
        expr(col("max_amount"), ">=", inp("amount")),
      ],
      sort: [{ sortBy: "min_amount", dir: "asc" }],
      returnType: "single",
      as: "band",
    }),
    s.precondition({
      expr: expr(ref("band"), "!=", c.null()),
      error_type: "badrequest",
      error: c.text("No active approval policy matches this amount."),
    }),
    s.db.add({
      table: paymentRequests,
      row: {
        requester_id: auth("id"),
        vendor: inp("vendor"),
        amount: inp("amount"),
        currency: inp("currency"),
        memo: inp("memo"),
        status: "pending",
        matched_policy_id: ref("band.id"),
        policy_version: ref("band.version"),
      },
      as: "req",
    }),
    s.db.add({
      table: approvalSteps,
      row: {
        payment_request_id: ref("req.id"),
        tier: 1,
        assigned_role: ref("band.required_role"),
        required_limit: ref("band.min_required_limit"),
        decision: "pending",
        note: "",
      },
      as: "step",
    }),
    s.db.add({
      table: approvalEvents,
      row: {
        payment_request_id: ref("req.id"),
        actor_id: auth("id"),
        action: "submitted",
        from_status: "",
        to_status: "pending",
        detail: "Request submitted.",
      },
    }),
    s.db.add({
      table: approvalEvents,
      row: {
        payment_request_id: ref("req.id"),
        actor_id: auth("id"),
        action: "routed",
        from_status: "pending",
        to_status: "pending",
        detail: withFilters(
          c.text("Routed to "),
          fl.concat(ref("band.label")),
          fl.concat(c.text(" (requires role ")),
          fl.concat(ref("band.required_role")),
          fl.concat(c.text(", authority ")),
          fl.concat(ref("band.min_required_limit")),
          fl.concat(c.text(")")),
        ),
      },
    }),
  ],
  response: {
    request: ref("req"),
    routed: {
      tier: 1,
      assigned_role: ref("band.required_role"),
      required_limit: ref("band.min_required_limit"),
      policy_label: ref("band.label"),
      policy_version: ref("band.version"),
    },
  },
});
