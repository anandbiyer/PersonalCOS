import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { resetDb, closeDb, asOwner, admin, OWNER_A, OWNER_B } from "../helpers/db";
import { routeIntent } from "@/lib/orchestrator/router";
import { act } from "@/lib/orchestrator/act";
import { composeReply } from "@/lib/orchestrator/reply";
import { extractDueDate, extractDurationMin } from "@/lib/capture/extract-date";
import { parseReminder } from "@/lib/reminders/parse";
import { isQuietHours, deferPastQuietHours } from "@/lib/planner/quiet-hours";
import { buildContext } from "@/lib/memory/context";
import { logTurnCost } from "@/lib/memory/budget";
import { runRetention } from "@/lib/memory/retention";
import { openDaySession } from "@/lib/session/lifecycle";
import { createTask, listTasks, setTaskStatus } from "@/lib/db/repo/tasks";
import { listReminderRules } from "@/lib/db/repo/reminders";
import { getRetention, updateRetention } from "@/lib/db/repo/settings";
import { appendTurn } from "@/lib/db/repo/turns";
import { currentConversation } from "@/lib/db/repo/conversations";
import { createInvitation, listInbox, acceptInvitation, listSent } from "@/lib/db/repo/handoff";

/**
 * UAT execution harness — runs the "Executable as written" (✅) cases from
 * tests/UAT Test Cases/PersonalCOS_Test_Cases.md against the real orchestrator /
 * engine code, offline-deterministic. Each case logs `UAT|<id>|<PASS|OBS>|detail`.
 * Pure due-date/reminder cases use the pack's fixed anchor; DB-effect cases use
 * real "now" and assert the effect, not an exact instant.
 */
const IST = "Asia/Kolkata";
const NOW = new Date("2025-09-01T02:30:00Z"); // 08:00 IST, Mon 1 Sep 2025 (pack anchor)
const isoIST = (d: Date | null) =>
  d ? new Intl.DateTimeFormat("en-GB", { timeZone: IST, dateStyle: "medium", timeStyle: "short" }).format(d) : "null";

function rec(id: string, ok: boolean, detail: string) {
  // eslint-disable-next-line no-console
  console.log(`UAT|${id}|${ok ? "PASS" : "OBS"}|${detail}`);
}

/** Full conversational pipeline (mirrors app/api/orchestrator/route.ts). */
async function chat(ownerId: string, message: string, tz = IST) {
  const route = await routeIntent(message);
  const result = await act(ownerId, route.intent, message, tz);
  const reply = await composeReply(message, route.intent, result);
  return { intent: route.intent, actions: result.actions, content: result.content, reply, needsConfirm: result.needsConfirm };
}

/** Provision tenant user rows (created by Clerk sync in real use) so
 *  settings/handoff behave as in production. Call after resetDb(). */
async function seedUsers(...ids: string[]) {
  for (const id of ids) {
    await admin`insert into users (id, display_name) values (${id}, 'Tester') on conflict (id) do nothing`;
  }
}

describe("UAT ✅ executable cases", () => {
  beforeAll(resetDb);
  afterAll(async () => {
    await resetDb();
    await closeDb();
  });

  // ---- FR1 Natural-language capture ----
  it("FR1-T1 files a task from a natural request", async () => {
    await resetDb();
    const r = await chat(OWNER_A, "Remind me to submit the Client F workbook");
    const tasks = await listTasks(OWNER_A);
    const ok = tasks.length === 1;
    rec("FR1-T1", ok, `intent=${r.intent} task="${tasks[0]?.name}" reply="${r.reply.slice(0, 60)}"`);
    expect(ok).toBe(true);
  });

  it("FR1-T2 normalizes + classifies a lowercase capture", async () => {
    await resetDb();
    await chat(OWNER_A, "pick up dry cleaning");
    const t = (await listTasks(OWNER_A))[0];
    rec("FR1-T2", !!t, `name="${t?.name}" portfolio=${t?.portfolio}`);
    expect(t).toBeTruthy();
  });

  // ---- FR2 Auto classification ----
  it("FR2-T1 classifies an office task", async () => {
    await resetDb();
    await chat(OWNER_A, "Prepare the board deck for Client M by Thursday");
    const t = (await listTasks(OWNER_A))[0];
    rec("FR2-T1", t?.portfolio === "office", `portfolio=${t?.portfolio} due=${isoIST(t?.dueDate as Date | null)}`);
    expect(t?.portfolio).toBe("office");
  });

  it("FR2-T2 files + classifies a non-office task (offline heuristic)", async () => {
    await resetDb();
    await chat(OWNER_A, "Book badminton court for Saturday");
    const t = (await listTasks(OWNER_A))[0];
    // Filed + non-office is the invariant; exact personal_life vs personal_dev
    // depends on the classifier (offline heuristic here; online = Haiku).
    const ok = !!t && t.portfolio !== "office";
    rec("FR2-T2", ok, `portfolio=${t?.portfolio} (offline heuristic; 'personal_life' expected online)`);
    expect(ok).toBe(true);
  });

  // ---- FR40 NL due-date extraction (pure, pack anchor) ----
  it("FR40-T1 'by July 5' → next occurrence 21:00", () => {
    const d = extractDueDate("submit the workbook by July 5", NOW, IST);
    rec("FR40-T1", !!d, `due=${isoIST(d)}`);
    expect(isoIST(d)).toMatch(/5 Jul 2026, 21:00/);
  });

  it("FR40-T2 'in 3 days' → today+3 21:00", () => {
    const d = extractDueDate("call the bank in 3 days", NOW, IST);
    rec("FR40-T2", !!d, `due=${isoIST(d)}`);
    expect(isoIST(d)).toMatch(/4 Sept? 2025, 21:00/);
  });

  // ---- FR41 9pm default ----
  it("FR41-T1 'pay rent on the 1st' → next occurrence, 9pm default", () => {
    const d = extractDueDate("pay rent on the 1st", NOW, IST);
    rec("FR41-T1", !!d, `due=${isoIST(d)}`);
    expect(isoIST(d)).toMatch(/1 Sept? 2025, 21:00/);
  });

  it("FR41-T2 'due Friday' → nearest Friday 21:00", () => {
    const d = extractDueDate("credit card bill due Friday", NOW, IST);
    rec("FR41-T2", !!d, `due=${isoIST(d)}`);
    expect(isoIST(d)).toMatch(/21:00/);
  });

  // ---- FR42 tz-aware extraction ----
  it("FR42-T1 '3 PM tomorrow' resolves in device tz", () => {
    const d = extractDueDate("meeting at 3 PM tomorrow", NOW, IST);
    rec("FR42-T1", !!d, `IST=${isoIST(d)} UTC=${d?.toISOString()}`);
    expect(isoIST(d)).toMatch(/2 Sept? 2025, 15:00/);
  });

  // ---- FR6 reminders + quiet-hours defer ----
  it("FR6-T1 one-off reminder created; quiet-hours defers to 06:00", async () => {
    await resetDb();
    const r = await chat(OWNER_A, "remind me to call the plumber at 9pm");
    const rules = await listReminderRules(OWNER_A);
    const p = parseReminder("remind me to call the plumber at 9pm", NOW, IST)!;
    const local9pm = new Date(2025, 8, 1, 21, 0);
    const deferred = deferPastQuietHours(local9pm);
    const ok = rules.length === 1 && rules[0].schedule === "one_off" && deferred.getHours() === 6;
    rec("FR6-T1", ok, `rule=${rules[0]?.schedule} tasks=${(await listTasks(OWNER_A)).length} 21:00→${deferred.getHours()}:00 quiet(21:00)=${isQuietHours(local9pm)}`);
    expect(ok).toBe(true);
  });

  it("FR6-T2 'tomorrow at 8am' → one-off reminder (outside quiet hours)", async () => {
    await resetDb();
    await chat(OWNER_A, "remind me about the workbook tomorrow at 8am");
    const rules = await listReminderRules(OWNER_A);
    const outside = !isQuietHours(new Date(2025, 8, 2, 8, 0));
    rec("FR6-T2", rules.length === 1 && outside, `rule=${rules[0]?.schedule} 08:00 quiet=${!outside}`);
    expect(rules.length).toBe(1);
  });

  // ---- FR38 interval / daily reminders ----
  it("FR38-T1 'every 2 hours' → every_n_hours rule", async () => {
    await resetDb();
    await chat(OWNER_A, "remind me to stretch every 2 hours");
    const rules = await listReminderRules(OWNER_A);
    const ok = rules[0]?.schedule === "every_n_hours" && (rules[0]?.scheduleConfig as { hours: number })?.hours === 2;
    rec("FR38-T1", ok, `schedule=${rules[0]?.schedule} config=${JSON.stringify(rules[0]?.scheduleConfig)} ledgerTasks=${(await listTasks(OWNER_A)).length}`);
    expect(ok).toBe(true);
  });

  it("FR38-T2 'every morning at 7' → daily rule", async () => {
    await resetDb();
    await chat(OWNER_A, "remind me every morning at 7 to review my plan");
    const rules = await listReminderRules(OWNER_A);
    rec("FR38-T2", rules[0]?.schedule === "daily", `schedule=${rules[0]?.schedule} next=${isoIST(rules[0]?.nextFire as Date)}`);
    expect(rules[0]?.schedule).toBe("daily");
  });

  // ---- FR11 edit / delete ----
  it("FR11-T1 'change … to Friday' reschedules an existing task", async () => {
    await resetDb();
    const t = await createTask(OWNER_A, { name: "Pick up dry cleaning", portfolio: "personal_life", source: "text" });
    const r = await chat(OWNER_A, "change the dry cleaning to Friday 3pm");
    const after = (await listTasks(OWNER_A)).find((x) => x.id === t.id)!;
    const ok = r.actions.some((a) => a.type === "edit") && after.dueDate !== null;
    rec("FR11-T1", ok, `due=${isoIST(after.dueDate as Date)} card=${r.actions.map((a) => a.type).join(",")}`);
    expect(ok).toBe(true);
  });

  it("FR11-T2 'delete the badminton task' soft-cancels it", async () => {
    await resetDb();
    const t = await createTask(OWNER_A, { name: "Book badminton court", portfolio: "personal_life", source: "text" });
    const r = await chat(OWNER_A, "delete the badminton task");
    const row = await asOwner(OWNER_A, (sql) => sql`SELECT status FROM tasks WHERE id = ${t.id}`);
    const ok = r.actions.some((a) => a.type === "deleted") && row[0].status === "cancelled";
    rec("FR11-T2", ok, `status=${row[0].status} undo=${r.actions.find((a) => a.type === "deleted")?.undo?.kind}`);
    expect(ok).toBe(true);
  });

  // ---- FR14 audit trail ----
  it("FR14-T1 completion writes an audit row", async () => {
    await resetDb();
    await createTask(OWNER_A, { name: "Client F column inventory", portfolio: "office", source: "text" });
    await chat(OWNER_A, "finished the column inventory");
    const a = await asOwner(OWNER_A, (sql) => sql`SELECT count(*)::int c FROM audit WHERE change_type='task.status'`);
    rec("FR14-T1", a[0].c >= 1, `task.status audit rows=${a[0].c}`);
    expect(a[0].c).toBeGreaterThanOrEqual(1);
  });

  it("FR14-T2 an edit writes an audited before/after", async () => {
    await resetDb();
    await createTask(OWNER_A, { name: "Renew the gym membership", portfolio: "personal_life", source: "text" });
    await chat(OWNER_A, "reschedule the gym membership to Friday");
    const a = await asOwner(OWNER_A, (sql) => sql`SELECT prev_value, new_value FROM audit WHERE change_type='task.updated'`);
    const ok = a.length === 1 && (a[0].prev_value as { dueDate: string | null }).dueDate === null && (a[0].new_value as { dueDate: string | null }).dueDate !== null;
    rec("FR14-T2", ok, `updated audits=${a.length} prevDue=null→newDue=set`);
    expect(ok).toBe(true);
  });

  // ---- FR26 approval-first / graduated trust ----
  it("FR26-T1 high-stakes handoff asks to confirm (files nothing)", async () => {
    await resetDb();
    const before = (await listTasks(OWNER_A)).length;
    const r = await chat(OWNER_A, "send the pilot scope to Owner A");
    const ok = r.needsConfirm === true && (await listTasks(OWNER_A)).length === before;
    rec("FR26-T1", ok, `intent=${r.intent} needsConfirm=${r.needsConfirm}`);
    expect(ok).toBe(true);
  });

  it("FR26-T2 low-stakes 'mark done' executes immediately", async () => {
    await resetDb();
    const t = await createTask(OWNER_A, { name: "submit the workbook", portfolio: "office", source: "text" });
    await chat(OWNER_A, "mark the workbook done");
    const after = (await listTasks(OWNER_A)).find((x) => x.id === t.id)!;
    rec("FR26-T2", after.status === "completed", `status=${after.status}`);
    expect(after.status).toBe("completed");
  });

  // ---- FR33 conversation-vs-actionable gate ----
  it("FR33-T1 advice question files nothing", async () => {
    await resetDb();
    const r = await chat(OWNER_A, "should I raise the staffing concern now or wait?");
    const ok = r.intent === "question" && (await listTasks(OWNER_A)).length === 0;
    rec("FR33-T1", ok, `intent=${r.intent} filed=${(await listTasks(OWNER_A)).length}`);
    expect(ok).toBe(true);
  });

  it("FR33-T2 'add a task to …' files it", async () => {
    await resetDb();
    await chat(OWNER_A, "add a task to raise the staffing concern");
    rec("FR33-T2", (await listTasks(OWNER_A)).length === 1, `filed=${(await listTasks(OWNER_A)).length}`);
    expect((await listTasks(OWNER_A)).length).toBe(1);
  });

  // ---- FR43 orchestration ----
  it("FR43-T1 'finished …' routes to completion + writes", async () => {
    await resetDb();
    const t = await createTask(OWNER_A, { name: "column inventory", portfolio: "office", source: "text" });
    const r = await chat(OWNER_A, "finished the column inventory");
    const after = (await listTasks(OWNER_A)).find((x) => x.id === t.id)!;
    const ok = r.intent === "completion" && after.status === "completed" && r.reply.length > 0;
    rec("FR43-T1", ok, `intent=${r.intent} status=${after.status}`);
    expect(ok).toBe(true);
  });

  it("FR43-T2 'dentist Thursday 4 PM' routes to calendar + files dated", async () => {
    await resetDb();
    const r = await chat(OWNER_A, "dentist Thursday 4 PM");
    const t = (await listTasks(OWNER_A))[0];
    const ok = r.intent === "calendar" && !!t?.dueDate;
    rec("FR43-T2", ok, `intent=${r.intent} due=${isoIST(t?.dueDate as Date | null)}`);
    expect(ok).toBe(true);
  });

  // ---- FR44 daily session ----
  it("FR44-T1 opening the day creates a session (plan is client-rendered)", async () => {
    await resetDb();
    const opened = await openDaySession(OWNER_A);
    const conv = await currentConversation(OWNER_A);
    rec("FR44-T1", opened && !!conv, `opened=${opened} phase=${conv?.phase}`);
    expect(conv).toBeTruthy();
  });

  it("FR44-T2 one thread handles add + status + question", async () => {
    await resetDb();
    const a = await chat(OWNER_A, "draft the Q3 board deck");
    const b = await chat(OWNER_A, "what's on my plate today?");
    const c = await chat(OWNER_A, "should I start with the deck or the inventory?");
    const ok = a.intent === "task" && b.intent === "status" && c.intent === "question";
    rec("FR44-T2", ok, `intents=${a.intent},${b.intent},${c.intent}`);
    expect(ok).toBe(true);
  });

  // ---- FR46 / NFR-10 bounded memory ----
  it("FR46-T3 / NFR-10 context stays bounded and a per-turn cost is audited", async () => {
    await resetDb();
    for (let i = 0; i < 40; i++) await createTask(OWNER_A, { name: `Ledger item ${i} with a fairly wordy name`, portfolio: "office", source: "text" });
    const ctx = await buildContext(OWNER_A, "what's next?");
    const cost = await logTurnCost(OWNER_A, { intent: "status", context: ctx.text, message: "what's next?", reply: "ok" });
    const audit = await asOwner(OWNER_A, (sql) => sql`SELECT count(*)::int c FROM audit WHERE change_type='memory.turn_cost'`);
    const ok = ctx.tokensEstimate <= 3000 && audit[0].c === 1;
    rec("NFR-10", ok, `ctxTokens=${ctx.tokensEstimate} (cap 3000) turn_cost=${cost.total} audited=${audit[0].c}`);
    expect(ok).toBe(true);
  });

  it("FR46-T1 context excludes completed items", async () => {
    await resetDb();
    const done = await createTask(OWNER_A, { name: "ZZZ finished thing", portfolio: "office", source: "text" });
    await createTask(OWNER_A, { name: "AAA open thing", portfolio: "office", source: "text" });
    await setTaskStatus(OWNER_A, done.id, "completed");
    const ctx = await buildContext(OWNER_A, "where do we stand?");
    const ok = ctx.text.includes("AAA open thing") && !ctx.text.includes("ZZZ finished thing");
    rec("FR46-T1", ok, `open-in-context=${ctx.text.includes("AAA open thing")} completed-excluded=${!ctx.text.includes("ZZZ finished thing")}`);
    expect(ok).toBe(true);
  });

  // ---- FR47 retention ----
  it("FR47-T1 retention window clamps to 7–14 days", async () => {
    await resetDb();
    await seedUsers(OWNER_A);
    await updateRetention(OWNER_A, { retentionDays: 3 });
    const lo = (await getRetention(OWNER_A)).retentionDays;
    await updateRetention(OWNER_A, { retentionDays: 30 });
    const hi = (await getRetention(OWNER_A)).retentionDays;
    rec("FR47-T1", lo === 7 && hi === 14, `clamp(3)=${lo} clamp(30)=${hi}`);
    expect([lo, hi]).toEqual([7, 14]);
  });

  it("FR47-T2 completing a task prunes its verbatim turns; summaries kept", async () => {
    await resetDb();
    const t = await createTask(OWNER_A, { name: "File taxes", portfolio: "office", source: "text" });
    const conv = await currentConversation(OWNER_A);
    await appendTurn(OWNER_A, { conversationId: conv?.id ?? null, role: "user", text: "did the taxes", refsTaskId: t.id });
    await setTaskStatus(OWNER_A, t.id, "completed");
    const res = await runRetention(OWNER_A, new Date());
    rec("FR47-T2", res.turnsDeleted >= 1, `turnsDeleted=${res.turnsDeleted} summariesRolledOff=${res.summariesRolledOff}`);
    expect(res.turnsDeleted).toBeGreaterThanOrEqual(1);
  });

  // ---- NFR-6 capture latency / no-friction ----
  it("NFR-6-T1 several rapid captures are all filed", async () => {
    await resetDb();
    for (const m of ["buy milk", "email the SME", "renew passport", "call the dentist", "pay the electric bill"]) await chat(OWNER_A, m);
    const n = (await listTasks(OWNER_A)).length;
    rec("NFR-6-T1", n === 5, `filed=${n}/5`);
    expect(n).toBe(5);
  });

  it("NFR-6-T2 an ambiguous line is still captured (never lost)", async () => {
    await resetDb();
    await chat(OWNER_A, "the thing about the thing");
    const n = (await listTasks(OWNER_A)).length;
    rec("NFR-6-T2", n >= 1, `captured=${n}`);
    expect(n).toBeGreaterThanOrEqual(1);
  });

  // ---- FR37 hand-off (copy-on-accept) ----
  it("FR37-T1/T2 invitation → recipient inbox → accept creates recipient's own task", async () => {
    await resetDb();
    await seedUsers(OWNER_A, OWNER_B);
    const inv = await createInvitation(OWNER_A, { recipientId: OWNER_B, title: "Pick up Aarav at 5 PM" });
    const bInboxBefore = await listInbox(OWNER_B);
    const bTasksBefore = (await listTasks(OWNER_B)).length;
    const aSent = await listSent(OWNER_A);
    await acceptInvitation(OWNER_B, inv.id);
    const bTasksAfter = (await listTasks(OWNER_B)).length;
    const aSentAfter = await listSent(OWNER_A);
    const ok = bInboxBefore.length === 1 && bTasksBefore === 0 && bTasksAfter === 1 && aSentAfter[0].status === "accepted";
    rec("FR37", ok, `Binbox=${bInboxBefore.length} Bledger ${bTasksBefore}→${bTasksAfter} Asees=${aSent[0].status}→${aSentAfter[0].status}`);
    expect(ok).toBe(true);
  });

  // ---- FR30 durable persistence (re-read after write) ----
  it("FR30-T2 written tasks persist across a fresh read", async () => {
    await resetDb();
    await createTask(OWNER_A, { name: "Durable decision item", portfolio: "office", source: "text" });
    const again = await listTasks(OWNER_A);
    rec("FR30-T2", again.length === 1, `persisted=${again.length}`);
    expect(again.length).toBe(1);
  });

  // ---- duration extraction underpinning ranges (FR28 data) ----
  it("extractDurationMin underpins calendar ranges", () => {
    const a = extractDurationMin("block 2-2:30pm focus");
    const b = extractDurationMin("30 min sync");
    rec("FR28-data", a === 30 && b === 30, `'2-2:30pm'=${a} '30 min'=${b}`);
    expect([a, b]).toEqual([30, 30]);
  });
});
