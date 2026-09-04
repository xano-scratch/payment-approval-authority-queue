import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowUpCircle,
  Building2,
  Check,
  ChevronLeft,
  ClipboardList,
  Clock,
  FileText,
  Gavel,
  LogOut,
  RefreshCw,
  Send,
  ShieldCheck,
  UserCircle,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  ApiError,
  approveRequest,
  escalateRequest,
  fetchQueue,
  fetchRequest,
  getToken,
  login,
  rejectRequest,
  resetDemo,
  setToken,
  submitRequest,
  type ApprovalEvent,
  type ApprovalStep,
  type PaymentRequest,
  type QueueItem,
  type RequestDetail,
  type SessionUser,
} from "@/lib/api";

// ── Personas (public demo credentials) ──────────────────────────────────────
const DEMO_PASSWORD = "password123";
const PERSONAS: Array<{
  key: string;
  email: string;
  name: string;
  role: string;
  limit: number;
  blurb: string;
}> = [
  { key: "requester", email: "requester@demo.co", name: "Riley Requester", role: "requester", limit: 0, blurb: "Submits requests. Cannot approve anything." },
  { key: "junior", email: "junior@demo.co", name: "Jamie Junior", role: "approver", limit: 25000, blurb: "Approves up to 25,000. Must escalate anything larger." },
  { key: "senior", email: "senior@demo.co", name: "Sam Senior", role: "approver", limit: 100000, blurb: "Approves up to 100,000." },
  { key: "admin", email: "admin@demo.co", name: "Alex Admin", role: "admin", limit: 100000000, blurb: "Unlimited authority. Sees every open request." },
];

// ── Formatting helpers ───────────────────────────────────────────────────────
function fmtAmount(n: number | null | undefined, currency?: string | null): string {
  if (n == null) return "—";
  return `${Number(n).toLocaleString("en-US")} ${currency || "USD"}`;
}
function fmtLimit(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 100000000) return "unlimited";
  return Number(n).toLocaleString("en-US");
}
function fmtTime(epochms: number | null | undefined): string {
  if (!epochms) return "—";
  return new Date(Number(epochms)).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, "secondary" | "success" | "destructive" | "warning"> = {
    pending: "secondary",
    approved: "success",
    rejected: "destructive",
    escalated: "warning",
  };
  return <Badge variant={map[status] ?? "secondary"}>{status}</Badge>;
}
function RoleBadge({ role }: { role: string | null | undefined }) {
  return <Badge variant="outline">{role ?? "—"}</Badge>;
}

const ACTION_ICON: Record<string, typeof Check> = {
  submitted: Send,
  routed: ClipboardList,
  approved: Check,
  rejected: X,
  escalated: ArrowUpCircle,
};

// ── Session ──────────────────────────────────────────────────────────────────
type Session = { token: string; user: SessionUser };
const SESSION_KEY = "paaq_session";

type View =
  | { name: "queue" }
  | { name: "submit" }
  | { name: "governance" }
  | { name: "detail"; id: number };

function parseHash(): View {
  const h = window.location.hash.replace(/^#\/?/, "");
  const m = h.match(/^request\/(\d+)/);
  if (m) return { name: "detail", id: Number(m[1]) };
  if (h.startsWith("submit")) return { name: "submit" };
  if (h.startsWith("governance")) return { name: "governance" };
  return { name: "queue" };
}

export default function App() {
  const [session, setSession] = useState<Session | null>(() => {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(SESSION_KEY) : null;
    if (!raw) return null;
    try {
      const s = JSON.parse(raw) as Session;
      setToken(s.token);
      return s;
    } catch {
      return null;
    }
  });
  const [view, setView] = useState<View>(() => parseHash());
  const [banner, setBanner] = useState<string | null>(null);

  const applySession = useCallback((s: Session | null) => {
    setSession(s);
    setToken(s?.token ?? null);
    if (typeof localStorage !== "undefined") {
      if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
      else localStorage.removeItem(SESSION_KEY);
    }
  }, []);

  const signIn = useCallback(
    async (email: string) => {
      const res = await login(email, DEMO_PASSWORD);
      applySession({ token: res.authToken, user: res.user });
    },
    [applySession],
  );

  // Auto-login for a deep-linked promo/demo URL: ?demo=<persona>.
  useEffect(() => {
    if (session || getToken()) return;
    const demo = new URLSearchParams(window.location.search).get("demo");
    const persona = PERSONAS.find((p) => p.key === demo || p.email === demo);
    if (persona) void signIn(persona.email).catch(() => undefined);
  }, [session, signIn]);

  // Keep the view in sync with the URL hash.
  useEffect(() => {
    const onHash = () => setView(parseHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const go = useCallback((v: View) => {
    const hash =
      v.name === "detail" ? `#/request/${v.id}` : `#/${v.name}`;
    if (window.location.hash !== hash) window.location.hash = hash;
    setView(v);
  }, []);

  if (!session) {
    return <LoginScreen onSelect={signIn} />;
  }

  const role = session.user.role;
  const canReview = role === "approver" || role === "admin";

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header
        user={session.user}
        onSwitch={() => applySession(null)}
        onReset={async () => {
          const r = await resetDemo();
          setBanner(`Demo data reset: ${r.users} personas, ${r.requests} requests.`);
          go({ name: canReview ? "queue" : "submit" });
        }}
      />
      <main className="mx-auto w-full max-w-5xl px-4 py-6">
        <Nav view={view} go={go} canReview={canReview} />
        {banner && (
          <div className="mb-4 rounded-md border border-border bg-card px-3 py-2 text-sm text-muted-foreground">
            {banner}
          </div>
        )}
        {view.name === "queue" && (
          <QueueView canReview={canReview} onOpen={(id) => go({ name: "detail", id })} />
        )}
        {view.name === "submit" && <SubmitView onOpen={(id) => go({ name: "detail", id })} />}
        {view.name === "governance" && <GovernanceView user={session.user} />}
        {view.name === "detail" && (
          <DetailView
            id={view.id}
            user={session.user}
            onBack={() => go({ name: canReview ? "queue" : "submit" })}
          />
        )}
      </main>
    </div>
  );
}

// ── Login ────────────────────────────────────────────────────────────────────
function LoginScreen({ onSelect }: { onSelect: (email: string) => Promise<void> }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);
  const [seedNote, setSeedNote] = useState<string | null>(null);
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4 text-foreground">
      <div className="w-full max-w-2xl">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <ShieldCheck className="size-6" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Payment Approval Authority Queue</h1>
            <p className="text-sm text-muted-foreground">
              Choose a persona. Routing and authority limits are enforced at the API layer.
            </p>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {PERSONAS.map((p) => (
            <Card key={p.key} className="gap-3 py-4">
              <CardHeader className="px-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <UserCircle className="size-4 text-muted-foreground" />
                    {p.name}
                  </CardTitle>
                  <RoleBadge role={p.role} />
                </div>
                <CardDescription>{p.blurb}</CardDescription>
              </CardHeader>
              <CardContent className="px-4">
                <div className="mb-3 text-xs text-muted-foreground">
                  Authority limit: <span className="font-medium text-foreground">{fmtLimit(p.limit)}</span>
                </div>
                <Button
                  className="w-full"
                  disabled={busy !== null}
                  onClick={async () => {
                    setBusy(p.key);
                    setError(null);
                    try {
                      await onSelect(p.email);
                    } catch (e) {
                      setError(e instanceof Error ? e.message : "Sign-in failed");
                    } finally {
                      setBusy(null);
                    }
                  }}
                >
                  {busy === p.key ? "Signing in…" : `Sign in as ${p.name.split(" ")[0]}`}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
        {error && (
          <p className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}. On a fresh deploy the personas do not exist yet. Load the demo data below, then pick one.
          </p>
        )}
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3">
          <div className="text-sm text-muted-foreground">
            First run on a fresh deploy? Load the personas, policy, and sample requests.
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={seeding}
            onClick={async () => {
              setSeeding(true);
              setError(null);
              setSeedNote(null);
              try {
                const r = await resetDemo();
                setSeedNote(`Loaded ${r.users} personas and ${r.requests} requests. Pick a persona above.`);
              } catch (e) {
                setError(e instanceof Error ? e.message : "Could not load demo data");
              } finally {
                setSeeding(false);
              }
            }}
          >
            <RefreshCw className={seeding ? "animate-spin" : ""} /> Load demo data
          </Button>
        </div>
        {seedNote && (
          <p className="mt-3 rounded-md border border-emerald-600/40 bg-emerald-600/10 px-3 py-2 text-sm text-emerald-500">
            {seedNote}
          </p>
        )}
      </div>
    </div>
  );
}

// ── Header + Nav ─────────────────────────────────────────────────────────────
function Header({
  user,
  onSwitch,
  onReset,
}: {
  user: SessionUser;
  onSwitch: () => void;
  onReset: () => Promise<void>;
}) {
  const [resetting, setResetting] = useState(false);
  return (
    <header className="border-b border-border bg-card">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <ShieldCheck className="size-5" />
          </div>
          <span className="text-sm font-semibold tracking-tight">Payment Approval Authority Queue</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden text-right sm:block">
            <div className="text-sm font-medium leading-tight">{user.name}</div>
            <div className="text-xs text-muted-foreground">
              {user.role} · limit {fmtLimit(user.approval_limit)}
            </div>
          </div>
          <RoleBadge role={user.role} />
          <Button
            variant="outline"
            size="sm"
            disabled={resetting}
            onClick={async () => {
              setResetting(true);
              try {
                await onReset();
              } finally {
                setResetting(false);
              }
            }}
          >
            <RefreshCw className={resetting ? "animate-spin" : ""} /> Reset demo data
          </Button>
          <Button variant="ghost" size="sm" onClick={onSwitch}>
            <LogOut /> Switch persona
          </Button>
        </div>
      </div>
    </header>
  );
}

function Nav({
  view,
  go,
  canReview,
}: {
  view: View;
  go: (v: View) => void;
  canReview: boolean;
}) {
  const tabs: Array<{ name: View["name"]; label: string; icon: typeof ClipboardList }> = [
    ...(canReview ? [{ name: "queue" as const, label: "Approval queue", icon: ClipboardList }] : []),
    { name: "submit", label: "Submit request", icon: Send },
    { name: "governance", label: "Governance demo", icon: Gavel },
  ];
  return (
    <nav className="mb-5 flex gap-1 border-b border-border">
      {tabs.map((t) => {
        const active = view.name === t.name;
        const Icon = t.icon;
        return (
          <button
            key={t.name}
            onClick={() => go({ name: t.name } as View)}
            className={
              "flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium transition-colors " +
              (active
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground")
            }
          >
            <Icon className="size-4" />
            {t.label}
          </button>
        );
      })}
    </nav>
  );
}

// ── Queue ────────────────────────────────────────────────────────────────────
function QueueView({
  canReview,
  onOpen,
}: {
  canReview: boolean;
  onOpen: (id: number) => void;
}) {
  const [rows, setRows] = useState<QueueItem[] | null>(null);
  const [meta, setMeta] = useState<{ role: string | null; limit: number | null }>({ role: null, limit: null });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setError(null);
    setRows(null);
    fetchQueue()
      .then((r) => {
        if (!alive) return;
        setRows(r.requests);
        setMeta({ role: r.role, limit: r.approval_limit });
      })
      .catch((e) => alive && setError(e instanceof Error ? e.message : "Failed to load"));
    return () => {
      alive = false;
    };
  }, []);

  if (!canReview) {
    return (
      <EmptyState
        icon={AlertTriangle}
        title="Approvers only"
        body="The approval queue is scoped to approvers and admins. Switch to a reviewer persona to see it."
      />
    );
  }
  if (error) return <ErrorPanel message={error} />;
  if (!rows) return <p className="text-sm text-muted-foreground">Loading queue…</p>;

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Approval queue</h2>
          <p className="text-sm text-muted-foreground">
            Scoped server-side to what your authority ({fmtLimit(meta.limit)}) covers. Widening it from the
            frontend has no effect.
          </p>
        </div>
        <Badge variant="secondary">{rows.length} open</Badge>
      </div>
      {rows.length === 0 ? (
        <EmptyState icon={Check} title="Nothing awaiting you" body="No open request is within your authority right now." />
      ) : (
        <Card className="overflow-hidden py-0">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">Request</th>
                <th className="px-4 py-2.5 font-medium">Vendor</th>
                <th className="px-4 py-2.5 text-right font-medium">Amount</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium">Policy</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-border hover:bg-muted/30">
                  <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">#{r.id}</td>
                  <td className="px-4 py-2.5 font-medium">{r.vendor}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{fmtAmount(r.amount, r.currency)}</td>
                  <td className="px-4 py-2.5"><StatusBadge status={r.status} /></td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">v{r.policy_version}</td>
                  <td className="px-4 py-2.5 text-right">
                    <Button variant="ghost" size="sm" onClick={() => onOpen(r.id)}>
                      Review
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

// ── Submit ───────────────────────────────────────────────────────────────────
function SubmitView({ onOpen }: { onOpen: (id: number) => void }) {
  const [vendor, setVendor] = useState("");
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ id: number; routed: NonNullable<Awaited<ReturnType<typeof submitRequest>>["routed"]> } | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await submitRequest({ vendor, amount: Number(amount), memo });
      const req = res.request as PaymentRequest;
      setResult({ id: req.id, routed: res.routed });
      setVendor("");
      setAmount("");
      setMemo("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submit failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-5 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Submit a payment request</CardTitle>
          <CardDescription>
            The server routes it by amount against the active policy and pins the policy version to the trail.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={onSubmit}>
            <div className="space-y-1.5">
              <Label htmlFor="vendor">Vendor</Label>
              <Input id="vendor" value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder="Acme Office Supplies" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="amount">Amount</Label>
              <Input id="amount" type="number" min="1" step="1" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="18000" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="memo">Memo</Label>
              <Textarea id="memo" value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="What is this for?" />
            </div>
            <Button type="submit" disabled={busy} className="w-full">
              <Send /> {busy ? "Submitting…" : "Submit request"}
            </Button>
            {error && <ErrorPanel message={error} />}
          </form>
        </CardContent>
      </Card>

      <div>
        {result ? (
          <Card className="border-primary/40">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ClipboardList className="size-4 text-primary" /> Routed
              </CardTitle>
              <CardDescription>Request #{result.id} was created and routed by the policy engine.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Row label="Policy band" value={result.routed.policy_label} />
              <Row label="Policy version" value={`v${result.routed.policy_version}`} />
              <Row label="Routed tier" value={`Tier ${result.routed.tier}`} />
              <Row label="Required role" value={<RoleBadge role={result.routed.assigned_role} />} />
              <Row label="Authority required" value={fmtLimit(result.routed.required_limit)} />
              <Button variant="outline" size="sm" className="mt-2" onClick={() => onOpen(result.id)}>
                <FileText /> Open request detail
              </Button>
            </CardContent>
          </Card>
        ) : (
          <EmptyState
            icon={ClipboardList}
            title="Routing preview"
            body="Submit a request to see which tier and authority the active policy routes it to."
          />
        )}
      </div>
    </div>
  );
}

// ── Detail ───────────────────────────────────────────────────────────────────
function DetailView({
  id,
  user,
  onBack,
}: {
  id: number;
  user: SessionUser;
  onBack: () => void;
}) {
  const [data, setData] = useState<RequestDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setError(null);
    setData(null);
    fetchRequest(id)
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    setActionError(null);
    try {
      await fn();
      load();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  if (error) return <ErrorPanel message={error} />;
  if (!data || !data.request) return <p className="text-sm text-muted-foreground">Loading request…</p>;

  const req = data.request;
  const canReview = user.role === "approver" || user.role === "admin";
  const actionable = req.status === "pending" || req.status === "escalated";

  return (
    <div>
      <Button variant="ghost" size="sm" className="mb-3 -ml-2" onClick={onBack}>
        <ChevronLeft /> Back
      </Button>
      <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Building2 className="size-5 text-muted-foreground" />
                    {req.vendor}
                  </CardTitle>
                  <CardDescription className="mt-1">
                    Request #{req.id} · {fmtAmount(req.amount, req.currency)}
                  </CardDescription>
                </div>
                <StatusBadge status={req.status} />
              </div>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {req.memo && <p className="text-muted-foreground">{req.memo}</p>}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <Row label="Policy band" value={data.policy?.label ?? "—"} />
                <Row label="Policy version" value={`v${req.policy_version}`} />
                <Row label="Requester" value={`user #${req.requester_id}`} />
                <Row label="Submitted" value={fmtTime(req.created_at)} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Approval steps</CardTitle>
              <CardDescription>The routed tier and who decided it.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.steps.map((s: ApprovalStep) => (
                <div key={s.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs text-muted-foreground">Tier {s.tier}</span>
                    <RoleBadge role={s.assigned_role} />
                    <span className="text-xs text-muted-foreground">needs {fmtLimit(s.required_limit)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {s.decided_by ? <span className="text-xs text-muted-foreground">by user #{s.decided_by}</span> : null}
                    <StepDecision decision={s.decision} />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {canReview && actionable && (
            <Card className="border-primary/30">
              <CardHeader>
                <CardTitle className="text-base">Decide</CardTitle>
                <CardDescription>
                  Every action is re-checked at the API against your role, your authority limit, and segregation of
                  duties.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <Button disabled={busy} onClick={() => act(() => approveRequest(id, "Approved from queue"))}>
                    <Check /> Approve
                  </Button>
                  <Button variant="outline" disabled={busy} onClick={() => act(() => escalateRequest(id, "Above my authority"))}>
                    <ArrowUpCircle /> Escalate
                  </Button>
                  <Button variant="destructive" disabled={busy} onClick={() => act(() => rejectRequest(id, "Rejected from queue"))}>
                    <X /> Reject
                  </Button>
                </div>
                {actionError && <ErrorPanel message={actionError} />}
              </CardContent>
            </Card>
          )}
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock className="size-4 text-muted-foreground" /> Audit trail
            </CardTitle>
            <CardDescription>Every decision, in order, with the actor and detail.</CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="relative space-y-4 border-l border-border pl-5">
              {data.events.map((ev: ApprovalEvent) => {
                const Icon = ACTION_ICON[ev.action] ?? FileText;
                return (
                  <li key={ev.id} className="relative">
                    <span className="absolute -left-[27px] flex size-5 items-center justify-center rounded-full bg-muted text-muted-foreground ring-4 ring-card">
                      <Icon className="size-3" />
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium capitalize">{ev.action}</span>
                      <span className="text-xs text-muted-foreground">{fmtTime(ev.created_at)}</span>
                    </div>
                    <p className="text-sm text-muted-foreground">{ev.detail}</p>
                  </li>
                );
              })}
            </ol>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StepDecision({ decision }: { decision: string }) {
  if (decision === "approved") return <Badge variant="success">approved</Badge>;
  if (decision === "rejected") return <Badge variant="destructive">rejected</Badge>;
  return <Badge variant="secondary">pending</Badge>;
}

// ── Governance demo ──────────────────────────────────────────────────────────
function GovernanceView({ user }: { user: SessionUser }) {
  return (
    <div>
      <div className="mb-4">
        <h2 className="text-lg font-semibold">Governance demo</h2>
        <p className="text-sm text-muted-foreground">
          The frontend lets you click these actions. The API rejects the ones that break a control, no matter what
          the UI allows. That is the whole point: the rule lives in one governed API layer, not in the generated
          screen.
        </p>
      </div>
      <div className="grid gap-5 md:grid-cols-2">
        <OverLimitDemo user={user} />
        <SelfApprovalDemo user={user} />
      </div>
    </div>
  );
}

function DemoResult({ ok, message }: { ok: boolean; message: string }) {
  return (
    <div
      className={
        "flex items-start gap-2 rounded-md border px-3 py-2 text-sm " +
        (ok
          ? "border-emerald-600/40 bg-emerald-600/10 text-emerald-500"
          : "border-destructive/40 bg-destructive/10 text-destructive")
      }
    >
      {ok ? <Check className="mt-0.5 size-4 shrink-0" /> : <ShieldCheck className="mt-0.5 size-4 shrink-0" />}
      <span>{message}</span>
    </div>
  );
}

function OverLimitDemo({ user }: { user: SessionUser }) {
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<{ ok: boolean; message: string } | null>(null);
  const TARGET = 3; // Umbrella Logistics, 42,000 (executive tier) from the seed.
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="size-4 text-primary" /> Authority limit
        </CardTitle>
        <CardDescription>
          Your limit is {fmtLimit(user.approval_limit)}. Try to approve request #3 (Umbrella Logistics, 42,000). If it
          is above your limit, the API blocks it. Clearest as Jamie Junior (limit 25,000).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button
          variant="outline"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setRes(null);
            try {
              await approveRequest(TARGET, "Governance demo");
              setRes({ ok: true, message: "Approved. This persona's authority covers 42,000." });
            } catch (e) {
              const msg = e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Failed";
              setRes({ ok: false, message: `API rejected: ${msg}` });
            } finally {
              setBusy(false);
            }
          }}
        >
          <Gavel /> Attempt over-limit approval
        </Button>
        {res && <DemoResult ok={res.ok} message={res.message} />}
      </CardContent>
    </Card>
  );
}

function SelfApprovalDemo({ user }: { user: SessionUser }) {
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<{ ok: boolean; message: string } | null>(null);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <UserCircle className="size-4 text-primary" /> Segregation of duties
        </CardTitle>
        <CardDescription>
          Submit a small request as {user.name.split(" ")[0]}, then immediately try to approve your own request. The
          API blocks a self-approval.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button
          variant="outline"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setRes(null);
            try {
              const created = await submitRequest({
                vendor: "Self-Approval Test Co",
                amount: 500,
                memo: "Segregation-of-duties demo",
              });
              const newId = (created.request as PaymentRequest).id;
              await approveRequest(newId, "Trying to approve my own request");
              setRes({ ok: true, message: `Approved request #${newId}. (Unexpected: SoD should block this.)` });
            } catch (e) {
              const msg = e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Failed";
              setRes({ ok: false, message: `API rejected: ${msg}` });
            } finally {
              setBusy(false);
            }
          }}
        >
          <Gavel /> Submit, then self-approve
        </Button>
        {res && <DemoResult ok={res.ok} message={res.message} />}
      </CardContent>
    </Card>
  );
}

// ── Small shared pieces ──────────────────────────────────────────────────────
function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  );
}

function EmptyState({
  icon: Icon,
  title,
  body,
}: {
  icon: typeof ClipboardList;
  title: string;
  body: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-12 text-center">
      <Icon className="mb-3 size-8 text-muted-foreground" />
      <h3 className="text-sm font-medium">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{body}</p>
    </div>
  );
}

function ErrorPanel({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <span>{message}</span>
    </div>
  );
}
