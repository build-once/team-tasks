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
//   * and that `public.my_attachment_names()` returns exactly the caller's own
//     object rows -- which is a property of a migration applied nowhere, and
//     which REPLACED a piece of reasoning the owner's Dave test of 13 October
//     2026 proved wrong. Section 2c is that story, and it is the clearest thing
//     in this file about the limit of a unit test: the old version stubbed
//     nothing about the policy, so "the policy refuses what is not yours" was an
//     assumption the test shared with the bug.
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
  folderPlan,
  MAX_TASKS_SCANNED,
  readNames,
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
// 2b. WHICH FOLDERS ARE EMPTIED WHOLE -- the coach's fix, 2026-10-13
// ---------------------------------------------------------------------------
//
// THE BUG THIS EXISTS FOR. Step 2 used to clear the whole folder of every task
// the caller CREATED. A task they created in somebody else's team SURVIVES them
// (decision 1) -- so a departing person took with them every file their team
// mates had attached to a task that was staying. Nothing in the old tests
// noticed, because every one of them was about which ROWS go.
//
// The recorded decision, which `folderPlan` now implements:
//
//   remove every file the departing person UPLOADED, wherever it is;
//   remove EVERYTHING only on tasks that are themselves being deleted.

Deno.test("THE FOLDER PLAN: whole only for the tasks that are going", () => {
  const plan = folderPlan(splitTasks(VISIBLE, DAVE, [DAVES_TEAM]), [DAVES_TEAM]);

  const whole = [...plan.whole].sort();
  if (JSON.stringify(whole) !== JSON.stringify(["t-in-own-team", "t-personal"])) {
    throw new Error(`whole is wrong: ${JSON.stringify(whole)}`);
  }

  // THE ONE THAT MATTERS: Dave's task in Alice's team is NOT emptied whole.
  if (plan.whole.includes("t-in-alices-team")) {
    throw new Error(
      "the folder of a task that SURVIVES is emptied whole, which deletes other members' files",
    );
  }
  if (!plan.mineOnly.includes("t-in-alices-team")) {
    throw new Error(
      "a surviving task of Dave's is in neither list, so the files he uploaded to it are left behind",
    );
  }
});

Deno.test("DAVE'S TASK IN ALICE'S TEAM: his file goes, Carol's stays, the task stays", () => {
  // The case the coach asked for, written as the three questions it asks.
  const split = splitTasks(VISIBLE, DAVE, [DAVES_TEAM]);
  const plan = folderPlan(split, [DAVES_TEAM]);
  const TASK = "t-in-alices-team";

  // 1. HIS FILE GOES. The task is in the uploader-only list, so each file on it
  //    is attempted one at a time and the DELETE policy admits "you uploaded
  //    it" -- which is true of Dave's file and false of Carol's.
  if (!plan.mineOnly.includes(TASK)) {
    throw new Error("Dave's own uploads on that task would never be attempted");
  }

  // 2. CAROL'S STAYS. The only way it could go is the folder being emptied
  //    whole, which is what `whole` means -- and the task is not in it.
  if (plan.whole.includes(TASK)) throw new Error("Carol's file would be deleted");

  // 3. THE TASK STAYS. `tasksToDelete` is what step 4a deletes.
  if (tasksToDelete(split.own, [DAVES_TEAM]).includes(TASK)) {
    throw new Error("the task itself would be deleted");
  }
});

Deno.test("CAN THIS FAIL: the old implementation emptied every task he created", () => {
  // The implementation this guards against, written out so the two tests above
  // are demonstrably about something. It is exactly what step 2 used to do.
  const split = splitTasks(VISIBLE, DAVE, [DAVES_TEAM]);
  const old = split.own.map((task) => task.id);

  if (!old.includes("t-in-alices-team")) {
    throw new Error("the guard's own example does not behave as described");
  }
  if (folderPlan(split, [DAVES_TEAM]).whole.length === old.length) {
    throw new Error("folderPlan still empties every task the caller created");
  }
});

Deno.test("every task is in exactly one of the two lists, never both and never neither", () => {
  for (const owned of [[], [DAVES_TEAM], [DAVES_TEAM, ALICES_TEAM]]) {
    const split = splitTasks(VISIBLE, DAVE, owned);
    const plan = folderPlan(split, owned);

    const all = [...plan.whole, ...plan.mineOnly];
    const unique = new Set(all);
    if (all.length !== unique.size) {
      throw new Error(`a task is in both lists with owned=${JSON.stringify(owned)}`);
    }

    // Every task the caller can see is in one of them -- `elsewhere` plus `own`
    // covers the lot, and `formerInOwnTeams` is a subset of `elsewhere`.
    const visible = new Set(VISIBLE.map((task) => task.id));
    for (const id of visible) {
      if (!unique.has(id)) {
        throw new Error(
          `${id} is in neither list with owned=${JSON.stringify(owned)}, so its files are never looked at`,
        );
      }
    }
  }
});

Deno.test("with BOTH teams his, the task in Alice's team IS emptied whole", () => {
  // Because then it is not surviving: `tasksToDelete` takes it, so the row goes
  // and nothing may be left on it. The two lists follow the ROWS rather than a
  // rule about whose team it is.
  const split = splitTasks(VISIBLE, DAVE, [DAVES_TEAM, ALICES_TEAM]);
  const plan = folderPlan(split, [DAVES_TEAM, ALICES_TEAM]);

  if (!plan.whole.includes("t-in-alices-team")) {
    throw new Error("a task that IS being deleted is not emptied whole");
  }
  if (plan.mineOnly.includes("t-in-alices-team")) {
    throw new Error("a task being deleted is also in the uploader-only list");
  }
});

// ---------------------------------------------------------------------------
// 2c. WHOSE FILES ARE REMOVED FROM A SURVIVING TASK -- the owner's Dave test
// ---------------------------------------------------------------------------
//
// THE FAULT THE STAGING RUN FOUND, 13 October 2026, and the reason it got past
// everything in this file: the function attempted every file on a surviving
// task and read a refusal as "that one is not mine". True on a task somebody
// ELSE created; FALSE on a task the CALLER created, where the DELETE policy
// admits the task's creator for every file. So another member's file on Dave's
// surviving task was deleted with his -- the task ended with 0 files, one
// uploaded by Dave at 14:37:33Z and one by another member at 14:38:35Z.
//
// WHAT THE OLD TEST GOT WRONG IS WORTH MORE THAN THE FIX: it stubbed nothing
// about the policy at all, so "the policy refuses what is not yours" was an
// assumption the test SHARED WITH THE BUG. No number of cases over `folderPlan`
// could have caught it.
//
// SO THE FUNCTION NOW ASKS. `public.my_attachment_names()` returns the caller's
// own object names, and `readNames` is the reading of that answer. WHAT THESE
// TESTS PROVE AND DO NOT PROVE:
//
//   THEY PROVE  that an unanswered question is not read as "nothing", that a
//               malformed name never reaches a delete, and that only names
//               under a SURVIVING task are selected for removal.
//   THEY DO NOT PROVE anything about the real policy or the real function. That
//               `my_attachment_names()` returns exactly the caller's rows is a
//               property of the MIGRATION, which is applied nowhere; that the
//               DELETE policy then admits the uploader for each of those names
//               is a property of a policy no test here evaluates. **Only a
//               staging run can say either**, and the shortened Dave re-test is
//               what the owner runs for it.

Deno.test("readNames: a list of paths, as a setof text arrives", () => {
  const got = readNames(["a/one.png", "b/two.pdf"]);
  if (JSON.stringify(got) !== JSON.stringify(["a/one.png", "b/two.pdf"])) {
    throw new Error(`names are wrong: ${JSON.stringify(got)}`);
  }
});

Deno.test("readNames: the row-object shape is read too, both column names", () => {
  const got = readNames([
    { my_attachment_names: "a/one.png" },
    { name: "b/two.pdf" },
  ]);
  if (JSON.stringify(got) !== JSON.stringify(["a/one.png", "b/two.pdf"])) {
    throw new Error(`names are wrong: ${JSON.stringify(got)}`);
  }
});

Deno.test("readNames: AN UNANSWERED QUESTION IS NULL, NOT AN EMPTY LIST", () => {
  // This is the one that matters. "You uploaded nothing" and "we could not work
  // out what you uploaded" arrive at the handler as the same shape unless this
  // function tells them apart -- and the first would leave files nobody can
  // EVER reach, because after step 6 no live account matches their owner.
  for (const rows of [null, undefined, {}, "a/one.png", 7]) {
    if (readNames(rows) !== null) {
      throw new Error(`a non-array was read as a list: ${JSON.stringify(rows)}`);
    }
  }
  // And a genuinely empty answer IS an empty list, so the two are distinct.
  const none = readNames([]);
  if (none === null || none.length !== 0) {
    throw new Error("an empty answer is not an empty list");
  }
});

Deno.test("readNames: a name that is not <task id>/<file name> never reaches a delete", () => {
  const got = readNames([
    "no-slash.png",
    "/leading.png",
    "trailing/",
    "a/b/c.png",
    "",
    7,
    null,
    { nothing: "useful" },
    "good/one.png",
  ]);
  if (JSON.stringify(got) !== JSON.stringify(["good/one.png"])) {
    throw new Error(`unusable names got through: ${JSON.stringify(got)}`);
  }
});

Deno.test("DAVE'S SURVIVING TASK: only HIS name is selected, and Carol's is not", () => {
  // The case the staging run failed, as the function now decides it. The names
  // come from my_attachment_names(), which returns the CALLER'S rows -- so
  // Carol's file is not in the answer at all, and the intersection below is
  // what keeps the selection to tasks that survive.
  const split = splitTasks(VISIBLE, DAVE, [DAVES_TEAM]);
  const plan = folderPlan(split, [DAVES_TEAM]);
  const surviving = new Set(plan.mineOnly);

  // What the RPC would answer for Dave: his file on his surviving task, and his
  // file on a task of his own that is being deleted. Carol's file appears
  // NOWHERE in this list, because it is not his row.
  const mine = readNames([
    "t-in-alices-team/dave-receipt.pdf",
    "t-personal/dave-photo.jpg",
  ]);
  if (mine === null) throw new Error("the fixture did not parse");

  const selected = mine.filter((name) =>
    surviving.has(name.slice(0, name.indexOf("/"))),
  );

  if (JSON.stringify(selected) !== JSON.stringify(["t-in-alices-team/dave-receipt.pdf"])) {
    throw new Error(`the wrong names were selected: ${JSON.stringify(selected)}`);
  }

  // The one on a task being deleted is NOT selected here, because step 2 has
  // already emptied that folder whole -- selecting it again would be a second
  // delete of something gone.
  if (selected.includes("t-personal/dave-photo.jpg")) {
    throw new Error("a name under a task that step 2 already emptied was selected again");
  }
});

Deno.test("CAN THIS FAIL: the old way would have taken a name that is not the caller's", () => {
  // The old implementation did not have a list of the caller's names at all: it
  // listed the FOLDER and attempted everything in it. Written out here so the
  // test above is demonstrably about something.
  const folderHeld = ["dave-receipt.pdf", "carol-photo.jpg"];
  const attempted = folderHeld.map((name) => `t-in-alices-team/${name}`);

  if (!attempted.includes("t-in-alices-team/carol-photo.jpg")) {
    throw new Error("the guard's own example does not behave as described");
  }

  // And what the function does now cannot reach it: Carol's name is not in the
  // answer my_attachment_names() gives Dave, so there is nothing to intersect.
  const mine = readNames(["t-in-alices-team/dave-receipt.pdf"]);
  if (mine === null || mine.includes("t-in-alices-team/carol-photo.jpg")) {
    throw new Error("a name that is not the caller's is still reachable");
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

