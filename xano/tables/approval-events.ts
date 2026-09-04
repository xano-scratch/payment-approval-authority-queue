import { table, f } from "@xanots/sdk";

import { users } from "./users.js";
import { paymentRequests } from "./payment-requests.js";

/**
 * The append-only audit log. Every submit, route, approve, reject, and escalate
 * writes one row here with the actor, the action, the status change, and a
 * human-readable detail line, so a reviewer can read the full history of any
 * decision.
 *
 * `created_at` (epochms) is auto-injected and orders the trail.
 */
export const approvalEvents = table({
  name: "approval_events",
  schema: {
    payment_request_id: f.tableRef(paymentRequests, { required: true }),
    actor_id: f.tableRef(users, { default: 0 }),
    action: f.enum(
      ["submitted", "approved", "rejected", "escalated", "routed"],
      { required: true },
    ),
    from_status: f.text(),
    to_status: f.text(),
    detail: f.text(),
  },
  index: [{ type: "btree", fields: [{ name: "payment_request_id" }] }],
});
