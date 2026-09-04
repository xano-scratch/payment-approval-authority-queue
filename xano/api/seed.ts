import { query, s, ref, c } from "@xanots/sdk";

import { api } from "./api.js";
import { users } from "../tables/users.js";
import { approvalPolicies } from "../tables/approval-policies.js";
import { paymentRequests } from "../tables/payment-requests.js";
import { approvalSteps } from "../tables/approval-steps.js";
import { approvalEvents } from "../tables/approval-events.js";

/**
 * Reset and seed the demo. Truncates every table (resetting id sequences), then
 * writes the personas, one active policy version with three amount bands, and a
 * spread of requests across states so the live app is browsable and every
 * governance path has data to act on. Public so a reviewer can reset the demo
 * from the frontend. Every persona password is "password123".
 */
export const seedQuery = query({
  name: "seed",
  verb: "POST",
  apiGroup: api,
  stack: [
    // Children first, then parents. reset: true restarts the id sequences.
    s.db.truncate({ table: approvalEvents, reset: true }),
    s.db.truncate({ table: approvalSteps, reset: true }),
    s.db.truncate({ table: paymentRequests, reset: true }),
    s.db.truncate({ table: approvalPolicies, reset: true }),
    s.db.truncate({ table: users, reset: true }),

    // ── Personas ──────────────────────────────────────────────────────────
    s.db.add({
      table: users,
      row: {
        email: "requester@demo.co",
        password: "password123",
        name: "Riley Requester",
        role: "requester",
        approval_limit: 0,
        department: "Marketing",
      },
      as: "reqUser",
    }),
    s.db.add({
      table: users,
      row: {
        email: "junior@demo.co",
        password: "password123",
        name: "Jamie Junior",
        role: "approver",
        approval_limit: 25000,
        department: "Finance",
      },
      as: "juniorUser",
    }),
    s.db.add({
      table: users,
      row: {
        email: "senior@demo.co",
        password: "password123",
        name: "Sam Senior",
        role: "approver",
        approval_limit: 100000,
        department: "Finance",
      },
      as: "seniorUser",
    }),
    s.db.add({
      table: users,
      row: {
        email: "admin@demo.co",
        password: "password123",
        name: "Alex Admin",
        role: "admin",
        // Effectively unlimited authority: an admin sees and can approve any
        // open request.
        approval_limit: 100000000,
        department: "IT",
      },
      as: "adminUser",
    }),

    // ── Active policy version 1 (three amount bands) ─────────────────────────
    s.db.add({
      table: approvalPolicies,
      row: {
        version: 1,
        active: true,
        min_amount: 0,
        max_amount: 5000,
        required_role: "approver",
        min_required_limit: 5000,
        label: "Standard (team approver)",
      },
      as: "bandA",
    }),
    s.db.add({
      table: approvalPolicies,
      row: {
        version: 1,
        active: true,
        min_amount: 5000,
        max_amount: 25000,
        required_role: "approver",
        min_required_limit: 25000,
        label: "Elevated (department approver)",
      },
      as: "bandB",
    }),
    s.db.add({
      table: approvalPolicies,
      row: {
        version: 1,
        active: true,
        min_amount: 25000,
        // High sentinel ceiling models the open-ended top band.
        max_amount: 100000000,
        required_role: "admin",
        min_required_limit: 100000,
        label: "Executive (admin approver)",
      },
      as: "bandC",
    }),

    // ── R1: small, pending (band A) ─────────────────────────────────────────
    s.db.add({
      table: paymentRequests,
      row: {
        requester_id: ref("reqUser.id"),
        vendor: "Acme Office Supplies",
        amount: 850,
        currency: "USD",
        memo: "Quarterly stationery restock",
        status: "pending",
        matched_policy_id: ref("bandA.id"),
        policy_version: 1,
      },
      as: "r1",
    }),
    s.db.add({
      table: approvalSteps,
      row: {
        payment_request_id: ref("r1.id"),
        tier: 1,
        assigned_role: "approver",
        required_limit: 5000,
        decision: "pending",
        note: "",
      },
    }),
    s.db.add({
      table: approvalEvents,
      row: { payment_request_id: ref("r1.id"), actor_id: ref("reqUser.id"), action: "submitted", from_status: "", to_status: "pending", detail: "Request submitted." },
    }),
    s.db.add({
      table: approvalEvents,
      row: { payment_request_id: ref("r1.id"), actor_id: ref("reqUser.id"), action: "routed", from_status: "pending", to_status: "pending", detail: "Routed to Standard (team approver) (requires role approver, authority 5000)" },
    }),

    // ── R2: mid, pending (band B) ───────────────────────────────────────────
    s.db.add({
      table: paymentRequests,
      row: {
        requester_id: ref("reqUser.id"),
        vendor: "Initech Analytics",
        amount: 18000,
        currency: "USD",
        memo: "Annual analytics platform license",
        status: "pending",
        matched_policy_id: ref("bandB.id"),
        policy_version: 1,
      },
      as: "r2",
    }),
    s.db.add({
      table: approvalSteps,
      row: { payment_request_id: ref("r2.id"), tier: 1, assigned_role: "approver", required_limit: 25000, decision: "pending", note: "" },
    }),
    s.db.add({
      table: approvalEvents,
      row: { payment_request_id: ref("r2.id"), actor_id: ref("reqUser.id"), action: "submitted", from_status: "", to_status: "pending", detail: "Request submitted." },
    }),
    s.db.add({
      table: approvalEvents,
      row: { payment_request_id: ref("r2.id"), actor_id: ref("reqUser.id"), action: "routed", from_status: "pending", to_status: "pending", detail: "Routed to Elevated (department approver) (requires role approver, authority 25000)" },
    }),

    // ── R3: large, pending (band C) — the over-limit target for the junior ──
    s.db.add({
      table: paymentRequests,
      row: {
        requester_id: ref("reqUser.id"),
        vendor: "Umbrella Logistics",
        amount: 42000,
        currency: "USD",
        memo: "Warehouse relocation project",
        status: "pending",
        matched_policy_id: ref("bandC.id"),
        policy_version: 1,
      },
      as: "r3",
    }),
    s.db.add({
      table: approvalSteps,
      row: { payment_request_id: ref("r3.id"), tier: 1, assigned_role: "admin", required_limit: 100000, decision: "pending", note: "" },
    }),
    s.db.add({
      table: approvalEvents,
      row: { payment_request_id: ref("r3.id"), actor_id: ref("reqUser.id"), action: "submitted", from_status: "", to_status: "pending", detail: "Request submitted." },
    }),
    s.db.add({
      table: approvalEvents,
      row: { payment_request_id: ref("r3.id"), actor_id: ref("reqUser.id"), action: "routed", from_status: "pending", to_status: "pending", detail: "Routed to Executive (admin approver) (requires role admin, authority 100000)" },
    }),

    // ── R4: small, already approved (a completed trail) ─────────────────────
    s.db.add({
      table: paymentRequests,
      row: {
        requester_id: ref("reqUser.id"),
        vendor: "Soylent Catering",
        amount: 3200,
        currency: "USD",
        memo: "Team offsite catering",
        status: "approved",
        matched_policy_id: ref("bandA.id"),
        policy_version: 1,
      },
      as: "r4",
    }),
    s.db.add({
      table: approvalSteps,
      row: { payment_request_id: ref("r4.id"), tier: 1, assigned_role: "approver", required_limit: 5000, decision: "approved", decided_by: ref("seniorUser.id"), decided_at: c.now(), note: "Within budget" },
    }),
    s.db.add({
      table: approvalEvents,
      row: { payment_request_id: ref("r4.id"), actor_id: ref("reqUser.id"), action: "submitted", from_status: "", to_status: "pending", detail: "Request submitted." },
    }),
    s.db.add({
      table: approvalEvents,
      row: { payment_request_id: ref("r4.id"), actor_id: ref("reqUser.id"), action: "routed", from_status: "pending", to_status: "pending", detail: "Routed to Standard (team approver) (requires role approver, authority 5000)" },
    }),
    s.db.add({
      table: approvalEvents,
      row: { payment_request_id: ref("r4.id"), actor_id: ref("seniorUser.id"), action: "approved", from_status: "pending", to_status: "approved", detail: "Approved by Sam Senior at tier 1." },
    }),

    // ── R5: large, escalated (awaiting a higher tier) ───────────────────────
    s.db.add({
      table: paymentRequests,
      row: {
        requester_id: ref("reqUser.id"),
        vendor: "Wayne Industrial",
        amount: 76000,
        currency: "USD",
        memo: "Backup generator purchase",
        status: "escalated",
        matched_policy_id: ref("bandC.id"),
        policy_version: 1,
      },
      as: "r5",
    }),
    s.db.add({
      table: approvalSteps,
      row: { payment_request_id: ref("r5.id"), tier: 2, assigned_role: "admin", required_limit: 76000, decision: "pending", note: "Raised past department authority" },
    }),
    s.db.add({
      table: approvalEvents,
      row: { payment_request_id: ref("r5.id"), actor_id: ref("reqUser.id"), action: "submitted", from_status: "", to_status: "pending", detail: "Request submitted." },
    }),
    s.db.add({
      table: approvalEvents,
      row: { payment_request_id: ref("r5.id"), actor_id: ref("reqUser.id"), action: "routed", from_status: "pending", to_status: "pending", detail: "Routed to Executive (admin approver) (requires role admin, authority 100000)" },
    }),
    s.db.add({
      table: approvalEvents,
      row: { payment_request_id: ref("r5.id"), actor_id: ref("juniorUser.id"), action: "escalated", from_status: "pending", to_status: "escalated", detail: "Escalated by Jamie Junior to a higher tier (needs authority for amount 76000)." },
    }),

    // ── R6: small, pending, submitted BY an approver — the SoD target ────────
    s.db.add({
      table: paymentRequests,
      row: {
        requester_id: ref("seniorUser.id"),
        vendor: "Stark Consulting",
        amount: 3000,
        currency: "USD",
        memo: "Advisory retainer (submitted by Sam Senior)",
        status: "pending",
        matched_policy_id: ref("bandA.id"),
        policy_version: 1,
      },
      as: "r6",
    }),
    s.db.add({
      table: approvalSteps,
      row: { payment_request_id: ref("r6.id"), tier: 1, assigned_role: "approver", required_limit: 5000, decision: "pending", note: "" },
    }),
    s.db.add({
      table: approvalEvents,
      row: { payment_request_id: ref("r6.id"), actor_id: ref("seniorUser.id"), action: "submitted", from_status: "", to_status: "pending", detail: "Request submitted." },
    }),
    s.db.add({
      table: approvalEvents,
      row: { payment_request_id: ref("r6.id"), actor_id: ref("seniorUser.id"), action: "routed", from_status: "pending", to_status: "pending", detail: "Routed to Standard (team approver) (requires role approver, authority 5000)" },
    }),

    // Summary counts for the caller.
    s.db.query({ table: users, returnType: "count", as: "userCount" }),
    s.db.query({ table: paymentRequests, returnType: "count", as: "reqCount" }),
  ],
  response: {
    users: ref("userCount"),
    requests: ref("reqCount"),
  },
});
