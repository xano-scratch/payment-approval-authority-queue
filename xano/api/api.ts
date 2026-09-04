import { apiGroup } from "@xanots/sdk";

/**
 * The one API group. The canonical slug is pinned so public paths stay stable
 * and `getPath()` resolves in the browser bundle without a lock.
 *
 * Endpoints live under this group as `payments/*`, `auth/login`, and `seed`,
 * so their public paths are `/api:api/payments/submit`, `/api:api/auth/login`,
 * and so on.
 */
export const api = apiGroup({ name: "api", canonical: "api" });
