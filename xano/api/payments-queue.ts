import { query, s, ref, auth, col, c, expr, or } from "@xanots/sdk";

import { api } from "./api.js";
import { users } from "../tables/users.js";
import { paymentRequests } from "../tables/payment-requests.js";

/**
 * The approval queue, scoped server-side to what the caller may act on. The
 * scope IS the authority limit: a caller sees open requests whose amount is
 * within their `approval_limit`. An admin carries an effectively unlimited
 * limit, so an admin sees every open request. A requester (limit 0) is blocked
 * by the role guard, and would see nothing anyway. This scoping cannot be
 * widened from the frontend.
 */
export const queueQuery = query({
  name: "payments/queue",
  verb: "GET",
  apiGroup: api,
  auth: users,
  stack: [
    s.db.get({ table: users, fieldValue: auth("id"), as: "caller" }),
    s.precondition({
      expr: or(
        expr(ref("caller.role"), "=", c.text("approver")),
        expr(ref("caller.role"), "=", c.text("admin")),
      ),
      error_type: "accessdenied",
      error: c.text("Only approvers and admins can view the approval queue."),
    }),
    s.db.query({
      table: paymentRequests,
      where: [
        or(
          expr(col("status"), "=", c.text("pending")),
          expr(col("status"), "=", c.text("escalated")),
        ),
        expr(col("amount"), "<=", ref("caller.approval_limit")),
      ],
      sort: [{ sortBy: "created_at", dir: "desc" }],
      as: "rows",
    }),
  ],
  response: {
    role: ref("caller.role"),
    approval_limit: ref("caller.approval_limit"),
    requests: ref("rows"),
  },
});
