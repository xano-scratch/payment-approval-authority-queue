import { query, input, s, ref, inp, auth, col, c, expr, or, withFilters, fl } from "@xanots/sdk";

import { api } from "./api.js";
import { users } from "../tables/users.js";
import { paymentRequests } from "../tables/payment-requests.js";
import { approvalSteps } from "../tables/approval-steps.js";
import { approvalEvents } from "../tables/approval-events.js";

/**
 * Approve the current step. The server enforces, regardless of what the
 * frontend allows:
 *   1. the caller's role permits approval (approver or admin),
 *   2. the amount is within the caller's authority limit,
 *   3. segregation of duties (the caller is not the requester).
 *
 * Each guard is checked AFTER the request is confirmed to exist, so a null row
 * never reaches a field read. On pass, the current step is marked approved and
 * the request is finalized when no pending steps remain. Every path writes an
 * audit event.
 */
export const approveQuery = query({
  name: "payments/approve",
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
      error: c.text("Only approvers and admins can approve requests."),
    }),
    s.precondition({
      expr: or(
        expr(ref("req.status"), "=", c.text("pending")),
        expr(ref("req.status"), "=", c.text("escalated")),
      ),
      error_type: "badrequest",
      error: c.text("This request is not awaiting approval."),
    }),
    // Segregation of duties: a requester cannot approve their own request.
    s.precondition({
      expr: expr(ref("caller.id"), "!=", ref("req.requester_id")),
      error_type: "accessdenied",
      error: c.text("You cannot approve your own request."),
    }),
    // Authority limit: the amount must be within the caller's approval_limit.
    s.precondition({
      expr: expr(ref("req.amount"), "<=", ref("caller.approval_limit")),
      error_type: "accessdenied",
      error: withFilters(
        c.text("Amount "),
        fl.concat(ref("req.amount")),
        fl.concat(c.text(" exceeds your approval limit ")),
        fl.concat(ref("caller.approval_limit")),
        fl.concat(c.text(". Escalate it to a higher tier.")),
      ),
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
        decision: "approved",
        decided_by: ref("caller.id"),
        decided_at: c.now(),
        note: inp("note"),
      },
      as: "updatedStep",
    }),
    // Any pending steps left? If none, the request is fully approved.
    s.db.query({
      table: approvalSteps,
      where: [
        expr(col("payment_request_id"), "=", inp("id")),
        expr(col("decision"), "=", c.text("pending")),
      ],
      returnType: "count",
      as: "remaining",
    }),
    s.set_var("toStatus", c.text("pending")),
    s.conditional({
      when: expr(ref("remaining"), "=", c.int(0)),
      then: [
        s.db.edit({
          table: paymentRequests,
          fieldValue: inp("id"),
          row: { status: "approved" },
        }),
        s.update_var("toStatus", c.text("approved")),
      ],
    }),
    s.db.add({
      table: approvalEvents,
      row: {
        payment_request_id: inp("id"),
        actor_id: ref("caller.id"),
        action: "approved",
        from_status: ref("req.status"),
        to_status: ref("toStatus"),
        detail: withFilters(
          c.text("Approved by "),
          fl.concat(ref("caller.name")),
          fl.concat(c.text(" at tier ")),
          fl.concat(ref("step.tier")),
          fl.concat(c.text(".")),
        ),
      },
    }),
  ],
  response: {
    step: ref("updatedStep"),
    status: ref("toStatus"),
  },
  responseShape: null as unknown as {
    step: { id: number; tier: number; decision: string };
    status: "approved" | "pending";
  },
});
