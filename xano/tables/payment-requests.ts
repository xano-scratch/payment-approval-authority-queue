import { table, f } from "@xanots/sdk";

import { users } from "./users.js";
import { approvalPolicies } from "./approval-policies.js";

/**
 * A payment request moving through the approval queue. `matched_policy_id` and
 * `policy_version` are pinned at submit, so the trail shows the exact rule band
 * and version that routed it even after the policy changes later.
 *
 * An optional foreign key stores a `0` sentinel (never a null), because a null
 * int FK is not a legal field-match value in Xano — `default: 0` is how "not set
 * yet" is spelled. Here every request is routed at submit, so it is always real.
 */
export const paymentRequests = table({
  name: "payment_requests",
  schema: {
    requester_id: f.tableRef(users, { required: true }),
    vendor: f.text({ required: true }),
    amount: f.decimal({ required: true }),
    currency: f.text({ default: "USD" }),
    memo: f.text(),
    status: f.enum(["pending", "approved", "rejected", "escalated"], {
      default: "pending",
    }),
    matched_policy_id: f.tableRef(approvalPolicies, { default: 0 }),
    policy_version: f.int({ default: 0 }),
  },
  index: [{ type: "btree", fields: [{ name: "status" }] }],
});
