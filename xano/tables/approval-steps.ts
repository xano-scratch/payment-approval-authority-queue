import { table, f } from "@xanots/sdk";

import { users } from "./users.js";
import { paymentRequests } from "./payment-requests.js";

/**
 * One approval step for a request at a given tier. A request starts with one
 * step at the routed tier; an escalation raises the step's tier, role, and
 * required authority. The step records who decided it and when.
 *
 * `decided_by` uses a `0` sentinel while a step is still pending (a null int FK
 * is unqueryable); `decided_at` stays nullable because no lookup ever matches
 * on it.
 */
export const approvalSteps = table({
  name: "approval_steps",
  schema: {
    payment_request_id: f.tableRef(paymentRequests, { required: true }),
    tier: f.int({ required: true }),
    assigned_role: f.enum(["requester", "approver", "admin"], { required: true }),
    required_limit: f.decimal({ required: true }),
    decision: f.enum(["pending", "approved", "rejected"], { default: "pending" }),
    decided_by: f.tableRef(users, { default: 0 }),
    decided_at: f.timestamp({ nullable: true }),
    note: f.text(),
  },
  index: [{ type: "btree", fields: [{ name: "payment_request_id" }] }],
});
