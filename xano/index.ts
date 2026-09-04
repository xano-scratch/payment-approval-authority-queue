import { workspace } from "@xanots/sdk";

import { users } from "./tables/users.js";
import { approvalPolicies } from "./tables/approval-policies.js";
import { paymentRequests } from "./tables/payment-requests.js";
import { approvalSteps } from "./tables/approval-steps.js";
import { approvalEvents } from "./tables/approval-events.js";

import { api } from "./api/api.js";
import { loginQuery } from "./api/auth-login.js";
import { submitQuery } from "./api/payments-submit.js";
import { queueQuery } from "./api/payments-queue.js";
import { getRequestQuery } from "./api/payments-get.js";
import { approveQuery } from "./api/payments-approve.js";
import { rejectQuery } from "./api/payments-reject.js";
import { escalateQuery } from "./api/payments-escalate.js";
import { seedQuery } from "./api/seed.js";

/**
 * The payment-approval-authority-queue backend: a governed payments approval
 * queue where routing, per-approver authority limits, and segregation of duties
 * are all enforced at the API layer, with a full versioned audit trail.
 */
export default workspace("payment-approval-authority-queue")
  .registerTables([
    users,
    approvalPolicies,
    paymentRequests,
    approvalSteps,
    approvalEvents,
  ])
  .registerApiGroups([api])
  .registerQueries([
    loginQuery,
    submitQuery,
    queueQuery,
    getRequestQuery,
    approveQuery,
    rejectQuery,
    escalateQuery,
    seedQuery,
  ]);
