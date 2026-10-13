// delete_account_test.ts -- the plan of a deletion, checked without a database.
//
// Build it 26. It imports the REAL supabase/functions/delete-account/index.ts
// and calls its exported pieces, so a run here says something about the function
// that will be deployed rather than about a copy written for a test.
//
// WHAT IT CAN AND CANNOT SAY. Everything in `delete-account` that DECIDES is a
// pure function -- who confirmed, which tasks are in which group, which of the
// caller's own tasks are not being kept, and what a storage listing says. Those
// are what this file drives. What it cannot reach is the four things that only a
// real project can answer, and they are named here so nobody reads a green run
// as more than it is:
//
//   * that the migration lets the cascade null an owner_id at all;
//   * that the new storage policy really admits a team owner for a former
//     member's task;
//   * that `auth.admin.deleteUser` removes what the six cascades say it does;
//   * and that step 3's policy-as-filter deletes exactly the caller's uploads,
//     which no listing can confirm because a listing does not say who uploaded a
//     file.
//
// The owner's run on staging is what answers those four. Nothing in this
// repository is deployed by the change that adds this file.
//
//   deno test --no-lock --allow-env \
//     --config supabase/functions/create-team/deno.json \
//     supabase/functions/_tests/delete_account_test.ts

import {
  CONFIRM_PHRASE,
  checkSuspension,
  confirmed,
  MAX_TASKS_SCANNED,
  namesOf,
  splitTasks,
  suspendedRefusal,
  tasksToDelete,
} from "../delete-account/index.ts";

// Made-up values. Every one of them belongs to nobody.
const DAVE = "11111111-2222-4333-8444-555555555555";
const ALICE = "99999999-8888-4777-8666-555555555555";
const DAVES_TEAM = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const ALICES_TEAM = "12121212-3434-4565-8787-9a9a9a9a9a9a";

// ---------------------------------------------------------------------------
// 1. The typed confirmation -- step 1, and the only guard on an irreversible act
// ---------------------------------------------------------------------------

Deno.test("the confirmation accepts the phrase, trimmed and in any case", () => {
  const good = [
    CONFIRM_PHRASE,
    `  ${CONFIRM_PHRASE}  `,
    CONFIRM_PHRASE.toUpperCase(),
    "Delete My Account",
  ];
  const problems = good.filter((typed) => !confirmed({ confirm: typed }));
  if (problems.length > 0) {
    throw new Error(`these should have been accepted: ${JSON.stringify(problems)}`);
  }
});

Deno.test("AND NOTHING ELSE IS A CONFIRMATION -- a truthy value is not a typed one", () => {
  const bad: unknown[] = [
    // The shapes a single click would produce.
    { confirm: true },
    { confirm: 1 },
    { confirm: "yes" },
    { confirm: "ok" },
    // The phrase with something else attached.
    { confirm: `${CONFIRM_PHRASE} please` },
    { confirm: `really ${CONFIRM_PHRASE}` },
    // Missing, empty, and not an object at all.
    { confirm: "" },
    {},
    null,
    undefined,
    "delete my account",
    [CONFIRM_PHRASE],
  ];

  const accepted = bad.filter((body) => confirmed(body));
  if (accepted.length > 0) {
    throw new Error(
      `these were accepted as a confirmation and must not be: ${JSON.stringify(accepted)}`,
    );
  }
});

Deno.test("CAN THIS FAIL: a truthy check would accept every one of those", () => {
  // The implementation this guards against, written out so the test above is
  // demonstrably about something. If `confirmed` is ever loosened to a truthy
  // test, the case list above goes red -- and this says what "loosened" means.
  const truthy = (body: unknown) =>
    Boolean((body as { confirm?: unknown } | null)?.confirm);

  if (!truthy({ confirm: true })) {
    throw new Error("the guard's own example does not behave as described");
  }
  if (confirmed({ confirm: true })) {
    throw new Error("confirmed() accepts a boolean, which is a single click");
  }
});

// ---------------------------------------------------------------------------
// 2. Which tasks are in which group -- steps 2, 3, 4a and 4b
// ---------------------------------------------------------------------------
//
// THE WHOLE OF DECISION 1 IS IN THIS SPLIT. A task Dave created in ALICE'S team
// must survive; a task he created in HIS OWN team must not; and a task Alice
// created in Dave's team must not be deleted by Dave's departure either -- it
// returns to her by `set null` on team_id, which is the database's business and
// not this function's.

const VISIBLE = [
  // Dave's own, personal.
  { id: "t-personal", owner_id: DAVE, team_id: null },
  // Dave's own, in Dave's own team. Goes with the team anyway; deleted
  // explicitly so step 6's set null leaves only what is meant to survive.
  { id: "t-in-own-team", owner_id: DAVE, team_id: DAVES_TEAM },
  // DAVE'S OWN, IN ALICE'S TEAM. This is the one that must survive.
  { id: "t-in-alices-team", owner_id: DAVE, team_id: ALICES_TEAM },
  // Alice's, in Dave's team. Not Dave's to delete; it returns to Alice.
  { id: "t-alices-in-daves-team", owner_id: ALICE, team_id: DAVES_TEAM },
  // Alice's, in Alice's team. Dave can see it as a member.
  { id: "t-alices-own-team", owner_id: ALICE, team_id: ALICES_TEAM },
  // A FORMER MEMBER'S, in Dave's team. Step 4b's whole reason.
  { id: "t-former-in-daves-team", owner_id: null, team_id: DAVES_TEAM },
  // A former member's, in Alice's team. NOT Dave's to remove: he does not own
  // that team, and it is not becoming unreachable because the team stays.
  { id: "t-former-in-alices-team", owner_id: null, team_id: ALICES_TEAM },
];

Deno.test("the split: own, elsewhere, and a former member's in a team he owns", () => {
  const split = splitTasks(VISIBLE, DAVE, [DAVES_TEAM]);

  const own = split.own.map((t) => t.id).sort();
  if (JSON.stringify(own) !== JSON.stringify(["t-in-alices-team", "t-in-own-team", "t-personal"])) {
    throw new Error(`own is wrong: ${JSON.stringify(own)}`);
  }

  const former = split.formerInOwnTeams.map((t) => t.id);
  if (JSON.stringify(former) !== JSON.stringify(["t-former-in-daves-team"])) {
    throw new Error(`formerInOwnTeams is wrong: ${JSON.stringify(former)}`);
  }

  // `elsewhere` is every task he can see and did not create -- four of them,
  // INCLUDING the former member's in his own team, which is in both lists on
  // purpose: step 3 clears its files and step 4b removes the row.
  const elsewhere = split.elsewhere.map((t) => t.id).sort();
  const wanted = [
    "t-alices-in-daves-team",
    "t-alices-own-team",
    "t-former-in-alices-team",
    "t-former-in-daves-team",
  ];
  if (JSON.stringify(elsewhere) !== JSON.stringify(wanted)) {
    throw new Error(`elsewhere is wrong: ${JSON.stringify(elsewhere)}`);
  }
});

Deno.test("THE TASK IN SOMEBODY ELSE'S TEAM IS NOT DELETED -- decision 1", () => {
  const split = splitTasks(VISIBLE, DAVE, [DAVES_TEAM]);
  const doomed = tasksToDelete(split.own, [DAVES_TEAM]);

  if (doomed.includes("t-in-alices-team")) {
    throw new Error(
      "the task Dave created in Alice's team is in the delete list, which reverses decision 1",
    );
  }
  const sorted = [...doomed].sort();
  if (JSON.stringify(sorted) !== JSON.stringify(["t-in-own-team", "t-personal"])) {
    throw new Error(`the delete list is wrong: ${JSON.stringify(sorted)}`);
  }
});

Deno.test("CAN THIS FAIL: deleting every task he created would take Alice's team's copy", () => {
  // The obvious wrong implementation, written out: delete everything in `own`.
  const split = splitTasks(VISIBLE, DAVE, [DAVES_TEAM]);
  const everything = split.own.map((t) => t.id);

  if (!everything.includes("t-in-alices-team")) {
    throw new Error("the guard's own example does not behave as described");
  }
  if (tasksToDelete(split.own, [DAVES_TEAM]).length === everything.length) {
    throw new Error("tasksToDelete keeps nothing back, so decision 1 is not enforced");
  }
});

Deno.test("NOBODY ELSE'S TASK IS EVER IN THE DELETE LIST, whoever owns which team", () => {
  // Dave owning BOTH teams is the widest case, and even then the two tasks
  // Alice created are not his to delete -- they return to her by set null.
  const split = splitTasks(VISIBLE, DAVE, [DAVES_TEAM, ALICES_TEAM]);
  const doomed = tasksToDelete(split.own, [DAVES_TEAM, ALICES_TEAM]);

  const alices = doomed.filter((id) => id.includes("alices-in") || id.includes("alices-own"));
  if (alices.length > 0) {
    throw new Error(`somebody else's task is in the delete list: ${JSON.stringify(alices)}`);
  }
  // And with both teams his, all three of his own go.
  if (doomed.length !== 3) {
    throw new Error(`expected his three tasks, got ${doomed.length}`);
  }
});

Deno.test("a failed read is not an empty plan: anything that is not an array gives nothing", () => {
  for (const rows of [null, undefined, {}, "t-personal", 7]) {
    const split = splitTasks(rows, DAVE, [DAVES_TEAM]);
    if (split.own.length + split.elsewhere.length + split.formerInOwnTeams.length !== 0) {
      throw new Error(`a non-array produced a plan: ${JSON.stringify(rows)}`);
    }
  }
});

Deno.test("a row with no usable id is dropped rather than planned against", () => {
  const split = splitTasks(
    [{ owner_id: DAVE, team_id: null }, { id: "", owner_id: DAVE }, { id: 7, owner_id: DAVE }, null],
    DAVE,
    [],
  );
  if (split.own.length !== 0) throw new Error("an unusable row reached the plan");
});

Deno.test("a null owner is NEVER treated as the caller, whatever the caller's id is", () => {
  // The shape PR 4's migration introduces, and the one way it could be read
  // wrongly: `owner_id === callerId` is false for null, and a loose check would
  // make a former member's task look like the caller's own.
  const split = splitTasks([{ id: "t-former", owner_id: null, team_id: null }], DAVE, []);
  if (split.own.length !== 0) {
    throw new Error("a task with no owner was planned as the caller's own");
  }
  // And with no team it is not step 4b's either -- it is already the orphan
  // docs/deletion.md section 6.2 says only the dashboard can produce.
  if (split.formerInOwnTeams.length !== 0) {
    throw new Error("an orphan with no team was planned as a team owner's to remove");
  }
});

// ---------------------------------------------------------------------------
// 3. What a storage listing says
// ---------------------------------------------------------------------------

Deno.test("the names in a listing, with a folder and anything unusable dropped", () => {
  const got = namesOf([
    { name: "receipt.pdf", id: "o1" },
    // Supabase marks a FOLDER with a null id, and a folder is not a file to
    // delete.
    { name: "sub", id: null },
    { name: "  ", id: "o2" },
    { name: 7, id: "o3" },
    { id: "o4" },
    null,
    { name: "photo.jpg", id: "o5" },
  ]);
  if (JSON.stringify(got) !== JSON.stringify(["receipt.pdf", "photo.jpg"])) {
    throw new Error(`names are wrong: ${JSON.stringify(got)}`);
  }
});

Deno.test("a failed listing is not an empty folder", () => {
  for (const rows of [null, undefined, {}, "receipt.pdf"]) {
    if (namesOf(rows).length !== 0) {
      throw new Error(`a non-array produced names: ${JSON.stringify(rows)}`);
    }
  }
  // The distinction this cannot make, and the function is what makes it: both
  // give an empty list here, and `clearFolder` tells them apart by checking
  // `error` BEFORE reading the rows. That is why it returns ok:false on a failed
  // listing rather than "nothing to do".
});

// ---------------------------------------------------------------------------
// 4. The fifth door keeps the suspension check -- decision 7
// ---------------------------------------------------------------------------

Deno.test("a suspended caller is refused, and the refusal carries the code", async () => {
  const verdict = await checkSuspension(() =>
    Promise.resolve({ data: [{ user_id: DAVE }], error: null })
  );
  if (verdict.allowed) throw new Error("a suspended caller was allowed");

  const refusal = suspendedRefusal();
  if (refusal.status !== 403) throw new Error(`status ${refusal.status}, not 403`);

  const body = await refusal.json();
  if (body.code !== "account_suspended") {
    throw new Error(`the refusal carries no code: ${JSON.stringify(body)}`);
  }
  // AND IT NAMES NOTHING. No table, no reason, no timestamp.
  const said = JSON.stringify(body).toLowerCase();
  for (const word of ["account_status", "reason", "suspended_at", "postgres", "42501"]) {
    if (said.includes(word)) throw new Error(`the refusal names "${word}"`);
  }
});

Deno.test("AND AN UNREADABLE CHECK IS NOT A YES -- the fail-closed branch", async () => {
  const cases: Array<{ name: string; read: () => PromiseLike<{ data: unknown; error: { code?: string } | null }> }> = [
    { name: "an error", read: () => Promise.resolve({ data: null, error: { code: "08006" } }) },
    { name: "no array", read: () => Promise.resolve({ data: null, error: null }) },
    { name: "a throw", read: () => Promise.reject(new Error("network")) as never },
  ];

  for (const c of cases) {
    const verdict = await checkSuspension(c.read as never);
    if (verdict.allowed) throw new Error(`${c.name} was read as "not suspended"`);
    if (verdict.why !== "unknown") {
      throw new Error(`${c.name} came out as "${verdict.why}" rather than "unknown"`);
    }
  }
});

Deno.test("an empty answer IS a yes, so the check is not refusing everybody", async () => {
  const verdict = await checkSuspension(() => Promise.resolve({ data: [], error: null }));
  if (!verdict.allowed) throw new Error("an active caller was refused");
});

// ---------------------------------------------------------------------------
// 5. The ceiling refuses rather than truncating
// ---------------------------------------------------------------------------

Deno.test("the task ceiling is above the per-person cap, so a real list cannot meet it", () => {
  // docs/plan.md's cap is 500 live tasks per person. A ceiling at or below that
  // would refuse somebody with a full list, which is a refusal nobody could act
  // on; and one that truncated instead of refusing would leave files nobody can
  // ever reach, which is the whole reason step 3 exists.
  if (MAX_TASKS_SCANNED <= 500) {
    throw new Error(
      `MAX_TASKS_SCANNED is ${MAX_TASKS_SCANNED}, which a person at the 500-task cap could meet`,
    );
  }
});

Deno.test("the confirmation phrase names no company, no table and no code", () => {
  const said = CONFIRM_PHRASE.toLowerCase();
  for (const word of ["supabase", "postgres", "auth.users", "storage", "sql"]) {
    if (said.includes(word)) throw new Error(`the phrase names "${word}"`);
  }
  // And it is something a person can type: lower case, three words, no
  // punctuation to get wrong on a phone keyboard.
  if (!/^[a-z ]+$/.test(CONFIRM_PHRASE)) {
    throw new Error(`the phrase has something in it a phone will fight: ${CONFIRM_PHRASE}`);
  }
});
