import { Stat, Table, adminCard } from "@/components/admin-blocks";
import { adminDb, costUsd, listUsers, ukDayStart, usd } from "@/lib/admin/data";
import { env, hasAI } from "@/lib/env";

export const metadata = { title: "AI usage – Admin" };

type U = { user_id: string | null; purpose: string; model: string | null; prompt_tokens: number; completion_tokens: number; ok: boolean; created_at: string };
const PURPOSE: Record<string, string> = { cv_parse: "Reading CVs", cv_tailor: "Tailoring CVs", match_review: "Eligibility checks" };

function sum(rows: U[]) {
  const inT = rows.reduce((t, r) => t + r.prompt_tokens, 0);
  const outT = rows.reduce((t, r) => t + r.completion_tokens, 0);
  return { calls: rows.length, failed: rows.filter((r) => !r.ok).length, inT, outT, cost: costUsd(inT, outT) };
}
const n = (x: number) => x.toLocaleString("en-GB");

export default async function AdminAi({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const { db } = await adminDb();
  const days = ["1", "7", "30"].includes((await searchParams).days ?? "") ? Number((await searchParams).days) : 30;
  const e = env();
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const today = ukDayStart(Date.now());
  const [{ data }, users] = await Promise.all([
    db.from("ai_usage").select("user_id, purpose, model, prompt_tokens, completion_tokens, ok, created_at").gte("created_at", since < today ? since : today).limit(50000),
    listUsers(db),
  ]);
  const all = (data ?? []) as U[];
  const rows = all.filter((r) => r.created_at >= since);
  const total = sum(rows);
  const emailOf = new Map(users.map((u) => [u.id, u.email]));
  const group = (key: (r: U) => string) => {
    const m = new Map<string, U[]>();
    for (const r of rows) m.set(key(r), [...(m.get(key(r)) ?? []), r]);
    return [...m.entries()].map(([k, v]) => ({ k, ...sum(v) })).sort((a, b) => b.cost - a.cost);
  };
  const todayBy = new Map<string, number>();
  for (const r of all) if (r.created_at >= today && r.user_id) todayBy.set(r.user_id, (todayBy.get(r.user_id) ?? 0) + 1);
  const models = [...new Set(rows.map((r) => r.model).filter(Boolean))];

  return (
    <>
      <h1 className="text-3xl font-extrabold tracking-tight">AI usage and cost</h1>
      <p className="mt-2 text-sm text-muted">
        Costs are estimates from token counts at ${e.AI_PRICE_INPUT_PER_MTOK.toFixed(2)} per million input tokens and ${e.AI_PRICE_OUTPUT_PER_MTOK.toFixed(2)} per million
        output tokens (AI_PRICE_INPUT_PER_MTOK and AI_PRICE_OUTPUT_PER_MTOK). Check them against your provider&apos;s bill.
        {!hasAI(e) && " AI is not configured, so the app is using its non-AI fallbacks."}
      </p>
      <nav aria-label="Period" className="mt-4 flex gap-2">
        {[1, 7, 30].map((d) => (
          <a key={d} href={`/admin/ai?days=${d}`} aria-current={d === days ? "page" : undefined}
            className={`flex min-h-11 items-center rounded-full border px-4 text-sm font-bold ${d === days ? "border-accent bg-accent text-white" : "border-line bg-surface hover:border-accent"}`}>
            {d === 1 ? "24 hours" : `${d} days`}
          </a>
        ))}
      </nav>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="AI calls" value={n(total.calls)} hint={`${total.failed} failed`} />
        <Stat label="Tokens sent" value={n(total.inT)} />
        <Stat label="Tokens received" value={n(total.outT)} />
        <Stat label="Estimated cost" value={usd(total.cost)} hint={models.length ? `model: ${models.join(", ")}` : undefined} />
      </div>

      <section className={`mt-6 ${adminCard}`} aria-labelledby="p-h">
        <h2 id="p-h" className="text-lg font-bold">By purpose</h2>
        <div className="mt-3">
          <Table caption="AI usage by purpose" head={["Purpose", "Calls", "Failed", "Tokens in", "Tokens out", "Cost"]} empty="No AI calls in this period."
            rows={group((r) => r.purpose).map((g) => [PURPOSE[g.k] ?? g.k, n(g.calls), g.failed, n(g.inT), n(g.outT), usd(g.cost)])} />
        </div>
      </section>

      <section className={`mt-6 ${adminCard}`} aria-labelledby="u-h">
        <h2 id="u-h" className="text-lg font-bold">By user</h2>
        <p className="mt-1 text-sm text-muted">Daily limit: {e.AI_DAILY_LIMIT_PER_USER} calls per user, reset at midnight UK time. When it is reached, the app uses its non-AI fallbacks for that user.</p>
        <div className="mt-3">
          <Table caption="AI usage by user" head={["User", "Today / limit", "Calls", "Failed", "Cost"]} empty="No AI calls in this period."
            rows={group((r) => r.user_id ?? "").map((g) => [
              <span key="e" className="break-all">{g.k ? emailOf.get(g.k) ?? "Deleted user" : "System"}</span>,
              g.k ? (
                <span key="t" className={(todayBy.get(g.k) ?? 0) >= e.AI_DAILY_LIMIT_PER_USER ? "font-bold text-red-700 dark:text-red-300" : ""}>
                  {todayBy.get(g.k) ?? 0} / {e.AI_DAILY_LIMIT_PER_USER}
                </span>
              ) : "",
              n(g.calls),
              g.failed,
              usd(g.cost),
            ])} />
        </div>
      </section>
    </>
  );
}
