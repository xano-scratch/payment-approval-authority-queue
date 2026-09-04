import { query, input, s, ref, inp, auth, col, c, expr, or, withFilters, fl } from "@xanots/sdk";

import { api } from "./api.js";
import { users } from "../tables/users.js";
import { paymentRequests } from "../tables/payment-requests.js";
import { approvalSteps } from "../tables/approval-steps.js";
import { approvalEvents } from "../tables/approval-events.js";

/**
 * Escalate a request that exceeds the caller's authority to a higher tier. The
 * current step is raised one tier, reassigned to the admin role, and its
 * required authority is set to the request amount, so only an approver whose
 * limit covers the amount can then approve it. The request status becomes
 * escalated and an audit event records the move.
 */
export const escalateQuery = query({
  name: "payments/escalate",
  verb: "POST",
  apiGroup: api,
  auth: users,
  input: {
    id: input.int({ required: true }),
    note: input.text(),
  },
  stack: [
    s.db.get({ table: users, fieldValue: auth("id"), as: "caller" }),
    s.db.get_by_id({ table: paymentRequests, id: inp("id"), as: "req" }),
    s.precondition({
      expr: expr(ref("req", { safe: true }), "!=", c.null()),
      error_type: "notfound",
      error: c.text("Request not found."),
    }),
    s.precondition({
      expr: or(
        expr(ref("caller.role"), "=", c.text("approver")),
        expr(ref("caller.role"), "=", c.text("admin")),
      ),
      error_type: "accessdenied",
      error: c.text("Only approvers and admins can escalate requests."),
    }),
    s.precondition({
      expr: expr(ref("req.status"), "=", c.text("pending")),
      error_type: "badrequest",
      error: c.text("Only a pending request can be escalated."),
    }),
    s.db.query({
      table: approvalSteps,
      where: [
        expr(col("payment_request_id"), "=", inp("id")),
        expr(col("decision"), "=", c.text("pending")),
      ],
      sort: [{ sortBy: "tier", dir: "asc" }],
      returnType: "single",
      as: "step",
    }),
    s.precondition({
      expr: expr(ref("step"), "!=", c.null()),
      error_type: "badrequest",
      error: c.text("There is no pending approval step to escalate."),
    }),
    s.db.edit({
      table: approvalSteps,
      fieldValue: ref("step.id"),
      row: {
        tier: withFilters(ref("step.tier"), fl.add(c.int(1))),
        assigned_role: "admin",
        required_limit: ref("req.amount"),
        note: inp("note"),
      },
      as: "escalatedStep",
    }),
    s.db.edit({
      table: paymentRequests,
      fieldValue: inp("id"),
      row: { status: "escalated" },
    }),
    s.db.add({
      table: approvalEvents,
      row: {
        payment_request_id: inp("id"),
        actor_id: ref("caller.id"),
        action: "escalated",
        from_status: ref("req.status"),
        to_status: "escalated",
        detail: withFilters(
          c.text("Escalated by "),
          fl.concat(ref("caller.name")),
          fl.concat(c.text(" to a higher tier (needs authority for amount ")),
          fl.concat(ref("req.amount")),
          fl.concat(c.text(").")),
        ),
      },
    }),
  ],
  response: {
    step: ref("escalatedStep"),
  },
});
