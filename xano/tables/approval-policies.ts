import { table, f } from "@xanots/sdk";

/**
 * The versioned routing matrix. Each row is one amount band in one policy
 * version: a request is routed to the band whose range contains its amount, and
 * the band names the role and authority that band requires. Exactly one version
 * is `active` at a time; the version is pinned onto a request at submit so the
 * audit trail always shows which rule fired.
 */
export const approvalPolicies = table({
  name: "approval_policies",
  schema: {
    version: f.int({ required: true }),
    active: f.bool({ default: false }),
    min_amount: f.decimal({ required: true }),
    // The open-ended top band carries a high sentinel ceiling, so routing is a
    // plain range test with no null-comparison semantics to depend on.
    max_amount: f.decimal({ required: true }),
    required_role: f.enum(["requester", "approver", "admin"], { required: true }),
    // The authority a request in this band needs to be approved.
    min_required_limit: f.decimal({ required: true }),
    label: f.text({ required: true }),
  },
  index: [{ type: "btree", fields: [{ name: "active" }] }],
});
