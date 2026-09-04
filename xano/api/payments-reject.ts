import { query, input, s, ref, inp, auth, col, c, expr, or, withFilters, fl } from "@xanots/sdk";

import { api } from "./api.js";
import { users } from "../tables/users.js";
import { paymentRequests } from "../tables/payment-requests.js";
import { approvalSteps } from "../tables/approval-steps.js";
import { approvalEvents } from "../tables/approval-events.js";

/**
 * Reject a request with a reason. Rejecting moves no money, so it is allowed
 * regardless of the authority limit, but the role guard and segregation of
 * duties still apply. The current step is marked rejected, the request is set
 * rejected, and an audit event records the reason.
 */
export const rejectQuery = query({
  name: "payments/reject",
  verb: "POST",
  apiGroup: api,
  auth: users,
  input: {
    id: input.int({ required: true }),
    reason: input.text({ required: true, methods: ["trim"] }),
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
      error: c.text("Only approvers and admins can reject requests."),
    }),
    s.precondition({
      expr: or(
        expr(ref("req.status"), "=", c.text("pending")),
        expr(ref("req.status"), "=", c.text("escalated")),
      ),
      error_type: "badrequest",
      error: c.text("This request is not awaiting approval."),
    }),
    s.precondition({
      expr: expr(ref("caller.id"), "!=", ref("req.requester_id")),
      error_type: "accessdenied",
      error: c.text("You cannot decide your own request."),
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
      error: c.text("There is no pending approval step for this request."),
    }),
    s.db.edit({
      table: approvalSteps,
      fieldValue: ref("step.id"),
      row: {
        decision: "rejected",
        decided_by: ref("caller.id"),
        decided_at: c.now(),
        note: inp("reason"),
      },
      as: "updatedStep",
    }),
    s.db.edit({
      table: paymentRequests,
      fieldValue: inp("id"),
      row: { status: "rejected" },
    }),
    s.db.add({
      table: approvalEvents,
      row: {
        payment_request_id: inp("id"),
        actor_id: ref("caller.id"),
        action: "rejected",
        from_status: ref("req.status"),
        to_status: "rejected",
        detail: withFilters(
          c.text("Rejected by "),
          fl.concat(ref("caller.name")),
          fl.concat(c.text(": ")),
          fl.concat(inp("reason")),
        ),
      },
    }),
  ],
  response: {
    step: ref("updatedStep"),
  },
});
