// The one contract. Every path, request body, and response shape below is
// derived from the xanots query defs in ../../../xano — change a def and the
// types here follow. No URL or request body is hand-typed.

import type { InferInput, InferResponse } from "@xanots/sdk";

// Import the lean query defs for their getPath()/verb. None of these builds a
// heavy graph (no agents), so importing them for their route metadata is fine.
import { loginQuery } from "../../../xano/api/auth-login.js";
import { submitQuery } from "../../../xano/api/payments-submit.js";
import { queueQuery } from "../../../xano/api/payments-queue.js";
import { getRequestQuery } from "../../../xano/api/payments-get.js";
import { approveQuery } from "../../../xano/api/payments-approve.js";
import { rejectQuery } from "../../../xano/api/payments-reject.js";
import { escalateQuery } from "../../../xano/api/payments-escalate.js";
import { seedQuery } from "../../../xano/api/seed.js";

/**
 * The deployed Xano backend's base URL. Injected as `window.XANO_HOST` by
 * `xanots deploy <entry> --static <dir>`, or read from `VITE_XANO_HOST` in dev.
 */
export const XANO_HOST: string =
  (typeof window !== "undefined" && (window as { XANO_HOST?: string }).XANO_HOST) ||
  import.meta.env.VITE_XANO_HOST ||
  "";

// ── Types, all inferred from the defs ──────────────────────────────────────
export type LoginResponse = InferResponse<typeof loginQuery>;
export type SessionUser = LoginResponse["user"];
export type SubmitBody = InferInput<typeof submitQuery>;
export type SubmitResponse = InferResponse<typeof submitQuery>;
export type QueueResponse = InferResponse<typeof queueQuery>;
export type RequestDetail = InferResponse<typeof getRequestQuery>;
export type PaymentRequest = NonNullable<RequestDetail["request"]>;
export type ApprovalStep = RequestDetail["steps"][number];
export type ApprovalEvent = RequestDetail["events"][number];
export type ApprovalPolicy = NonNullable<RequestDetail["policy"]>;
export type QueueItem = QueueResponse["requests"][number];

// ── Session token ──────────────────────────────────────────────────────────
const TOKEN_KEY = "paaq_token";
let authToken: string | null =
  typeof localStorage !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null;

export function setToken(token: string | null): void {
  authToken = token;
  if (typeof localStorage === "undefined") return;
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export function getToken(): string | null {
  return authToken;
}

/** A failed API call. `message` carries the server's precondition error text. */
export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function call<T>(path: string, verb: string, body?: unknown): Promise<T> {
  const res = await fetch(XANO_HOST + path, {
    method: verb,
    headers: {
      "content-type": "application/json",
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    },
    body: verb === "GET" || verb === "HEAD" ? undefined : JSON.stringify(body ?? {}),
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const message =
      (data && typeof data === "object" && "message" in data && String(data.message)) ||
      res.statusText ||
      "Request failed";
    throw new ApiError(message, res.status);
  }
  return data as T;
}

// ── Endpoints ────────────────────────────────────────────────────────────
export function login(email: string, password: string): Promise<LoginResponse> {
  return call(loginQuery.getPath(), loginQuery.verb, { email, password });
}

export function submitRequest(body: SubmitBody): Promise<SubmitResponse> {
  return call(submitQuery.getPath(), submitQuery.verb, body);
}

export function fetchQueue(): Promise<QueueResponse> {
  return call(queueQuery.getPath(), queueQuery.verb);
}

export function fetchRequest(id: number): Promise<RequestDetail> {
  return call(getRequestQuery.getPath({ params: { id } }), getRequestQuery.verb);
}

export function approveRequest(id: number, note?: string): Promise<InferResponse<typeof approveQuery>> {
  return call(approveQuery.getPath(), approveQuery.verb, { id, note });
}

export function rejectRequest(id: number, reason: string): Promise<InferResponse<typeof rejectQuery>> {
  return call(rejectQuery.getPath(), rejectQuery.verb, { id, reason });
}

export function escalateRequest(id: number, note?: string): Promise<InferResponse<typeof escalateQuery>> {
  return call(escalateQuery.getPath(), escalateQuery.verb, { id, note });
}

export function resetDemo(): Promise<InferResponse<typeof seedQuery>> {
  return call(seedQuery.getPath(), seedQuery.verb, {});
}
