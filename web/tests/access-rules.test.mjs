// access-rules.test.mjs -- the Alice / Carol / Bob access-rule tests, run
// against STAGING on every pull request. Build it 17, issue #145.
//
// WHAT IT IS FOR. Every rule in this database is a decision about who may do
// what, and the only way to know a rule works is to be the person it is meant
// to refuse. Five rules, both sides of each:
//
//   Alice and Carol can read Alice's team tasks; Bob cannot.
//   Bob cannot read, change or delete Alice's personal task; Alice can.
//   Carol cannot delete Alice's team task; Alice can.
//   Bob cannot invite anyone to Alice's team; Alice can.
//   Signed out, every table returns nothing.
//
// AND SINCE BUILD IT 23 PART 2 (issue #242), a sixth rule with both sides:
//
//   Alice can attach a file to her team task and Carol can list and open it;
//   Bob and a signed-out stranger can do none of the three. The bucket refuses a
//   file over 5 MB and one of the wrong type. A task with a file on it cannot be
//   deleted, and deletes once the file is gone.
//
// EVERY "CANNOT" TEST FIRST PROVES THE MATCHING "CAN" FOUND DATA, in the same
// test, so an empty result means refused and not broken. A test that asked
// about a row which was never created would pass while testing nothing, which
// is the failure mode this whole file exists to avoid.
//
// ONE FILE, ON PURPOSE. Node runs test FILES in parallel processes, so three
// files would mean three sign-ins per account; staging's auth endpoint is rate
// limited and these tests run on every pull request. One file also makes the
// order real: "Carol cannot delete it" has to run before "Alice can".
//
// WHAT IT CREATES, AND GIVES BACK. Three tasks -- one team task, one personal
// one, and a second team task for the file tests -- all deleted again by their
// creator in an after() hook that runs even when a test fails, plus ONE FILE of
// 70 bytes in the `attachments` bucket, removed by the test that proves its
// uploader may remove it and by that same hook if the run dies first. Two
// uploads are also ATTEMPTED and refused on purpose, one of them 5 MB, which is
// nearly all of what a run sends. It never changes or deletes a row or a file it
// did not create. The one exception is the invitation below, which cannot be
// deleted with a publishable key and is created once in the lifetime of the
// project -- see INVITE_ADDRESS in staging.mjs.
//
// WHAT IT NEVER PRINTS: a password, an access token, a refresh token, the
// publishable key, the project URL, a user id, or an email address. Statuses
// are shown, and so are the `error` and `code` fields the tests assert on --
// but not a whole response body. See describeAnswer below for what changed
// there in Build it 18 and why.
//
// AND NEVER A FILE'S BYTES, nor a storage answer's whole body (describeStorage
// in staging.mjs). The ONE place a file's path is printed is the cleanup's
// report of a leftover, and that is deliberate: it is a file this run created,
// with RUN_ID in the name this file invented, and somebody has to be able to
// find it in the dashboard. docs/plan.md's rule is about a name somebody's phone
// chose or somebody typed, which this is not.

import { after, before, test } from "node:test";
import { strict as assert } from "node:assert";
import { randomUUID } from "node:crypto";

import {
  BUCKET,
  callFunction,
  describeStorage,
  INVITE_ADDRESS,
  isTeamMember,
  MAX_FILE_BYTES,
  oversizeBytes,
  PEOPLE,
  PNG_BYTES,
  read,
  rest,
  signIn,
  signOut,
  STAGING_DESCRIPTION,
  storageDelete,
  storageDownload,
  storageList,
  storageUpload,
  SVG_BYTES,
  TASK_COLUMNS,
} from "./staging.mjs";

// One marker per run, so every row this file creates is recognisable as its
// own and two runs cannot be confused. Not personal data and not a secret: a
// random uuid in a task title.
const RUN_ID = randomUUID();
const title = (what) => `build-it-17 access-rule test ${RUN_ID} -- ${what}`;

// Sessions, created once each in before() and reused by every test.
const sessions = {};

// The team Alice owns and Carol belongs to, found in test 2 rather than
// configured: there is no setting for it, and the tests cannot create one --
// a team cannot be deleted through the app and one person may own at most 3.
let sharedTeamId = null;

// How an invite-member answer is described in a log line or an assertion
// message. Added by the log-line audit in Build it 18 (issue #157).
//
// WHAT IT REPLACED, and why. These lines used to print `answer.text` -- the
// whole response body. On the 201 path that body is
// `{"invitation":{"id":...,"email":...,"expires_at":...}}`
// (supabase/functions/invite-member/index.ts), so an EMAIL ADDRESS went into
// this repository's run logs, which are public. The address in question is
// INVITE_ADDRESS, a staging test address that staging.mjs and
// docs/environments.md both publish on purpose, so nothing belonging to a real
// person has leaked -- but the line printed whatever the function returned, and
// "nothing real went out" was luck about which address the test uses rather
// than a decision anybody made.
//
// So: the status, and the two fields every test here actually asserts on. Never
// the invitation object, which is the only part that holds an address. This is
// used in the assertion messages too, not only the log lines, because an
// assertion message is printed on failure and a failure is public as well.
const describeAnswer = (answer) =>
  `HTTP ${answer.status} error=${JSON.stringify(answer.json?.error)} ` +
  `code=${JSON.stringify(answer.json?.code)}`;

// Rows this run created, so the after() hook can take them away again. `by` is
// who created the row, because only a task's creator can delete it -- which is
// one of the rules under test, so the cleanup is also the last proof of it.
const createdRows = [];
const remember = (id, by, what) => createdRows.push({ id, by, what, gone: false });
const forget = (id) => {
  const row = createdRows.find((r) => r.id === id);
  if (row) row.gone = true;
};

// ---------------------------------------------------------------------------
// Small helpers, so every test reads the same way
// ---------------------------------------------------------------------------

// An action that must be ALLOWED. Returns the rows, or fails the test with
// whatever the server said.
function allowed(result, what) {
  assert.ok(
    !result.refused,
    `${what}: refused with HTTP ${result.status} -- ${result.error}`,
  );
  assert.ok(result.rows, `${what}: the request did not complete -- ${result.error}`);
  return result.rows;
}

// An action that must be REFUSED. There are two shapes of no, and both count:
//
//   * the server answers 4xx, because a privilege or a trigger said no;
//   * no policy matches the row, so the statement changes nothing and the
//     answer is an empty list.
//
// Anything else is either a success -- which is a failure here -- or a reply
// this file did not expect, which is not a refusal and must not be read as
// one (AGENTS.md rule 8).
function refused(result, what) {
  if (result.refused) return `HTTP ${result.status} -- ${result.error}`;
  assert.ok(result.rows, `${what}: the request did not complete -- ${result.error}`);
  assert.equal(
    result.rows.length,
    0,
    `${what}: the database ALLOWED it -- ${result.rows.length} row(s) affected`,
  );
  return "no row matched, so nothing changed";
}

const teamOrFail = () => {
  assert.ok(
    sharedTeamId,
    "no team that Alice owns and Carol belongs to was found, so this test could not ask its question",
  );
  return sharedTeamId;
};

const taskOrFail = (id, which) => {
  assert.ok(id, `the ${which} was not created, so this test could not ask its question`);
  return id;
};

let teamTaskId = null;
let personalTaskId = null;

// ---------------------------------------------------------------------------
// Sign in -- once per account, for the whole run
// ---------------------------------------------------------------------------

before(async () => {
  console.log(`# project:  ${STAGING_DESCRIPTION}`);
  console.log(`# run marker: ${RUN_ID} (in the title of every row this run creates)`);
  console.log("# passwords, keys, tokens and user ids: not printed");
  sessions.alice = await signIn(PEOPLE.alice);
  sessions.carol = await signIn(PEOPLE.carol);
  sessions.bob = await signIn(PEOPLE.bob);
});

// ---------------------------------------------------------------------------
// 1-3. The ground these tests stand on
// ---------------------------------------------------------------------------

test("Alice, Carol and Bob each have a session, and they are three different people", () => {
  for (const who of ["alice", "carol", "bob"]) {
    assert.ok(sessions[who]?.accessToken, `${who} has no access token`);
    assert.ok(sessions[who]?.userId, `${who} has no user id`);
  }
  const ids = new Set([
    sessions.alice.userId,
    sessions.carol.userId,
    sessions.bob.userId,
  ]);
  assert.equal(ids.size, 3, "two of the three accounts are the same person");
});

test("Alice owns a team that Carol belongs to", async () => {
  const { alice, carol } = sessions;

  const owned = allowed(
    await read("teams", "id", { owner_id: alice.userId }, alice.accessToken),
    "Alice reads the teams she owns",
  );
  assert.ok(owned.length > 0, "Alice owns no team on staging, so nothing below can be tested");

  const memberships = allowed(
    await read("team_members", "team_id", { user_id: carol.userId }, carol.accessToken),
    "Carol reads her own memberships",
  );

  const carolIsIn = new Set(memberships.map((row) => row.team_id));
  // Sorted, so a project with more than one shared team still picks the same
  // team on every run.
  const shared = owned
    .map((row) => row.id)
    .filter((id) => carolIsIn.has(id))
    .sort();

  assert.ok(
    shared.length > 0,
    "no team is both owned by Alice and joined by Carol. Carol must accept an " +
      "invitation to one of Alice's teams before these tests mean anything.",
  );
  sharedTeamId = shared[0];

  const answer = await isTeamMember(carol.accessToken, sharedTeamId);
  assert.ok(!answer.error, `is_team_member for Carol: ${answer.error}`);
  assert.equal(answer.value, true, "Carol is not a member of the team that was chosen");
});

test("Bob is an outsider: he does not belong to Alice's team", async () => {
  const teamId = teamOrFail();
  const answer = await isTeamMember(sessions.bob.accessToken, teamId);
  assert.ok(!answer.error, `is_team_member for Bob: ${answer.error}`);
  assert.equal(
    answer.value,
    false,
    "Bob belongs to Alice's team, so he is not an outsider and nothing below tests one",
  );
});

// ---------------------------------------------------------------------------
// 4-9. Alice's team task: who may read it, who may delete it
// ---------------------------------------------------------------------------

test("Alice can create a task in her own team", async () => {
  const teamId = teamOrFail();
  const rows = allowed(
    await rest("POST", `tasks?select=${TASK_COLUMNS}`, {
      accessToken: sessions.alice.accessToken,
      body: { title: title("a team task"), team_id: teamId },
    }),
    "Alice creates a team task",
  );
  assert.equal(rows.length, 1, `${rows.length} rows came back, expected 1`);
  teamTaskId = rows[0].id;
  remember(teamTaskId, "alice", "the team task");

  assert.equal(rows[0].team_id, teamId, "the task is not in the team she asked for");
  assert.equal(rows[0].owner_id, sessions.alice.userId, "the task is not owned by Alice");
  assert.equal(rows[0].done, false, "a new task should not be ticked");
});

test("Alice can read her team task", async () => {
  const id = taskOrFail(teamTaskId, "team task");
  const rows = allowed(
    await read("tasks", TASK_COLUMNS, { id }, sessions.alice.accessToken),
    "Alice reads her team task",
  );
  assert.equal(rows.length, 1, `${rows.length} rows, expected 1`);
});

test("Carol can read Alice's team task", async () => {
  const id = taskOrFail(teamTaskId, "team task");
  const rows = allowed(
    await read("tasks", TASK_COLUMNS, { id }, sessions.carol.accessToken),
    "Carol reads Alice's team task",
  );
  assert.equal(
    rows.length,
    1,
    `${rows.length} rows, expected 1 -- being in the team is what should make it visible`,
  );
});

test("Bob CANNOT read Alice's team task", async () => {
  const id = taskOrFail(teamTaskId, "team task");

  // The "can" half first, in this same test: if Alice cannot see the row
  // either, Bob seeing nothing proves nothing.
  const asAlice = allowed(
    await read("tasks", TASK_COLUMNS, { id }, sessions.alice.accessToken),
    "Alice reads her team task",
  );
  assert.equal(asAlice.length, 1, "the row Bob is being refused does not exist");

  const asBob = await read("tasks", TASK_COLUMNS, { id }, sessions.bob.accessToken);
  const how = refused(asBob, "Bob reads Alice's team task");
  console.log(`# Bob reading Alice's team task: ${how}`);
});

test("Carol CANNOT delete Alice's team task", async () => {
  const id = taskOrFail(teamTaskId, "team task");

  const beforeRows = allowed(
    await read("tasks", TASK_COLUMNS, { id }, sessions.carol.accessToken),
    "Carol reads the task she is about to try to delete",
  );
  assert.equal(beforeRows.length, 1, "Carol cannot see the task, so a refused delete proves nothing");

  const attempt = await rest("DELETE", `tasks?id=eq.${id}&select=id`, {
    accessToken: sessions.carol.accessToken,
  });
  const how = refused(attempt, "Carol deletes Alice's team task");
  console.log(`# Carol deleting Alice's team task: ${how}`);

  // "0 rows deleted" and "the row is gone" would otherwise be told apart by
  // hope, so the row is read back.
  const afterRows = allowed(
    await read("tasks", TASK_COLUMNS, { id }, sessions.alice.accessToken),
    "Alice reads the task back",
  );
  assert.equal(afterRows.length, 1, "the team task did not survive Carol's delete");
});

test("Alice CAN delete her own team task", async () => {
  const id = taskOrFail(teamTaskId, "team task");

  const rows = allowed(
    await rest("DELETE", `tasks?id=eq.${id}&select=id`, {
      accessToken: sessions.alice.accessToken,
    }),
    "Alice deletes her team task",
  );
  assert.equal(rows.length, 1, `the delete matched ${rows.length} rows, expected 1`);

  const afterRows = allowed(
    await read("tasks", TASK_COLUMNS, { id }, sessions.alice.accessToken),
    "Alice reads the task back",
  );
  assert.equal(afterRows.length, 0, "the task is still there after Alice deleted it");
  forget(id);
});

// ---------------------------------------------------------------------------
// 10-16. Alice's personal task: hers alone
// ---------------------------------------------------------------------------

test("Alice can create a personal task", async () => {
  const rows = allowed(
    await rest("POST", `tasks?select=${TASK_COLUMNS}`, {
      accessToken: sessions.alice.accessToken,
      body: { title: title("a personal task") },
    }),
    "Alice creates a personal task",
  );
  assert.equal(rows.length, 1, `${rows.length} rows came back, expected 1`);
  personalTaskId = rows[0].id;
  remember(personalTaskId, "alice", "the personal task");

  assert.equal(rows[0].team_id, null, "a personal task must belong to no team");
  assert.equal(rows[0].owner_id, sessions.alice.userId, "the task is not owned by Alice");
});

test("Alice can read her personal task", async () => {
  const id = taskOrFail(personalTaskId, "personal task");
  const rows = allowed(
    await read("tasks", TASK_COLUMNS, { id }, sessions.alice.accessToken),
    "Alice reads her personal task",
  );
  assert.equal(rows.length, 1, `${rows.length} rows, expected 1`);
});

test("Alice CAN change her personal task", async () => {
  const id = taskOrFail(personalTaskId, "personal task");
  const renamed = title("a personal task, renamed by Alice");
  const rows = allowed(
    await rest("PATCH", `tasks?id=eq.${id}&select=${TASK_COLUMNS}`, {
      accessToken: sessions.alice.accessToken,
      body: { title: renamed },
    }),
    "Alice renames her personal task",
  );
  assert.equal(rows.length, 1, `${rows.length} row(s) changed, expected 1`);
  assert.equal(rows[0].title, renamed, "the title is not what Alice sent");
});

test("Bob CANNOT read Alice's personal task", async () => {
  const id = taskOrFail(personalTaskId, "personal task");

  const asAlice = allowed(
    await read("tasks", TASK_COLUMNS, { id }, sessions.alice.accessToken),
    "Alice reads her personal task",
  );
  assert.equal(asAlice.length, 1, "the row Bob is being refused does not exist");

  const asBob = await read("tasks", TASK_COLUMNS, { id }, sessions.bob.accessToken);
  const how = refused(asBob, "Bob reads Alice's personal task");
  console.log(`# Bob reading Alice's personal task: ${how}`);
});

test("Bob CANNOT change Alice's personal task", async () => {
  const id = taskOrFail(personalTaskId, "personal task");

  const beforeRows = allowed(
    await read("tasks", TASK_COLUMNS, { id }, sessions.alice.accessToken),
    "Alice reads her personal task",
  );
  assert.equal(beforeRows.length, 1, "the row Bob is being refused does not exist");
  assert.equal(
    beforeRows[0].done,
    false,
    "the task is already ticked, so Bob's tick would prove nothing",
  );

  const attempt = await rest("PATCH", `tasks?id=eq.${id}&select=${TASK_COLUMNS}`, {
    accessToken: sessions.bob.accessToken,
    body: { done: true, title: title("Bob was here") },
  });
  const how = refused(attempt, "Bob changes Alice's personal task");
  console.log(`# Bob changing Alice's personal task: ${how}`);

  const afterRows = allowed(
    await read("tasks", TASK_COLUMNS, { id }, sessions.alice.accessToken),
    "Alice reads the task back",
  );
  assert.equal(afterRows.length, 1, "the task vanished");
  assert.equal(afterRows[0].done, false, "Bob ticked Alice's personal task");
  assert.equal(afterRows[0].title, beforeRows[0].title, "Bob renamed Alice's personal task");
});

test("Bob CANNOT delete Alice's personal task", async () => {
  const id = taskOrFail(personalTaskId, "personal task");

  const beforeRows = allowed(
    await read("tasks", TASK_COLUMNS, { id }, sessions.alice.accessToken),
    "Alice reads her personal task",
  );
  assert.equal(beforeRows.length, 1, "the row Bob is being refused does not exist");

  const attempt = await rest("DELETE", `tasks?id=eq.${id}&select=id`, {
    accessToken: sessions.bob.accessToken,
  });
  const how = refused(attempt, "Bob deletes Alice's personal task");
  console.log(`# Bob deleting Alice's personal task: ${how}`);

  const afterRows = allowed(
    await read("tasks", TASK_COLUMNS, { id }, sessions.alice.accessToken),
    "Alice reads the task back",
  );
  assert.equal(afterRows.length, 1, "the personal task did not survive Bob's delete");
});

test("Alice CAN delete her personal task", async () => {
  const id = taskOrFail(personalTaskId, "personal task");

  const rows = allowed(
    await rest("DELETE", `tasks?id=eq.${id}&select=id`, {
      accessToken: sessions.alice.accessToken,
    }),
    "Alice deletes her personal task",
  );
  assert.equal(rows.length, 1, `the delete matched ${rows.length} rows, expected 1`);

  const afterRows = allowed(
    await read("tasks", TASK_COLUMNS, { id }, sessions.alice.accessToken),
    "Alice reads the task back",
  );
  assert.equal(afterRows.length, 0, "the task is still there after Alice deleted it");
  forget(id);
});

// ---------------------------------------------------------------------------
// 17-18. Inviting: the owner may, an outsider may not
// ---------------------------------------------------------------------------
//
// Bob goes first. invite-member checks the suspension, then the body, then the
// team, then the owner -- so Bob's call creates nothing whatever the answer,
// and it cannot use up one of the team's 20 pending slots.

test("Bob CANNOT invite anyone to Alice's team (403)", async () => {
  const teamId = teamOrFail();
  const answer = await callFunction("invite-member", {
    accessToken: sessions.bob.accessToken,
    body: { team_id: teamId, email: INVITE_ADDRESS },
  });

  assert.equal(
    answer.status,
    403,
    `invite-member answered ${describeAnswer(answer)}, expected 403.`,
  );
  // The status alone is not enough: a suspended caller is also refused with
  // 403, and that would be a refusal for the wrong reason. The message is the
  // one written in supabase/functions/invite-member/index.ts.
  assert.equal(
    answer.json?.error,
    "Only the team's owner can invite people.",
    `403, but not the owner check. ${describeAnswer(answer)}`,
  );
  console.log(`# Bob inviting: ${describeAnswer(answer)}`);
});

test("Alice CAN invite to her own team (201, or 409 with code 23505)", async () => {
  const teamId = teamOrFail();
  const answer = await callFunction("invite-member", {
    accessToken: sessions.alice.accessToken,
    body: { team_id: teamId, email: INVITE_ADDRESS },
  });

  // Both answers mean the same thing about the rule under test: Alice got past
  // the owner check. 201 is the first run this project ever makes; every run
  // afterwards hits the partial unique index, which is 409 with the Postgres
  // code 23505. A 409 for any OTHER reason -- the 20-pending limit, say -- is
  // not a pass, which is why the code is checked and not just the status.
  if (answer.status === 201) {
    assert.ok(
      answer.json?.invitation?.id,
      `201 without an invitation id. ${describeAnswer(answer)}`,
    );
  } else {
    assert.equal(
      answer.status,
      409,
      `invite-member answered ${describeAnswer(answer)}, expected 201 or 409.`,
    );
    assert.equal(
      answer.json?.code,
      "23505",
      `409, but not the "already invited" one. ${describeAnswer(answer)}`,
    );
  }
  console.log(`# Alice inviting: ${describeAnswer(answer)}`);
});

// ---------------------------------------------------------------------------
// 19-25. Signed out: every table returns nothing
// ---------------------------------------------------------------------------
//
// A stranger with nothing but the publishable key. Two answers are a pass and
// they are different things, so both are named rather than blurred:
//
//   * HTTP 200 with an empty list -- the table is reachable, and row-level
//     security matched no row. Every policy in this database is limited to the
//     authenticated role, so this is what tasks, teams and the rest should do.
//   * a refusal carrying the Postgres code 42501, permission denied -- the
//     role has no privilege on the table at all. account_status is built that
//     way on purpose.
//
// Any other error is NOT a pass. A mistyped column, for instance, answers 400
// with code 42703, which would otherwise look exactly like a refusal and would
// quietly turn this whole section into seven tests of nothing.

const SIGNED_OUT_RELATIONS = [
  ["tasks", "id"],
  ["teams", "id"],
  ["team_members", "team_id"],
  ["invitations", "id"],
  ["profiles", "user_id"],
  ["account_status", "user_id"],
  ["team_roster", "team_id"],
];

for (const [relation, column] of SIGNED_OUT_RELATIONS) {
  test(`Signed out: ${relation} returns nothing`, async () => {
    const result = await read(relation, column, {}, null);

    if (result.refused) {
      let code = null;
      try {
        code = JSON.parse(result.error)?.code ?? null;
      } catch {
        code = null;
      }
      assert.equal(
        code,
        "42501",
        `${relation} answered HTTP ${result.status} for a reason that is not ` +
          `"permission denied". Body: ${result.error}`,
      );
      console.log(`# signed out, ${relation}: HTTP ${result.status} permission denied (42501)`);
      return;
    }

    assert.ok(result.rows, `${relation}: the request did not complete -- ${result.error}`);
    assert.equal(
      result.rows.length,
      0,
      `${relation} returned ${result.rows.length} row(s) to a signed-out caller`,
    );
    console.log(`# signed out, ${relation}: HTTP ${result.status}, 0 rows`);
  });
}

// ---------------------------------------------------------------------------
// 26-40. A file attached to a task (Build it 23 part 2, issue #242)
// ---------------------------------------------------------------------------
//
// FIFTEEN NEW TESTS, AND NOT ONE EXISTING ONE CHANGED. The rules they ask about
// are the three policies on `storage.objects` in
// supabase/migrations/20261008191804_attachments_bucket.sql, which the owner
// applied to staging on 9 October 2026 and the pipeline applied to production on
// the merge of PR #241.
//
// WHY THEY ARE HERE AND NOT ONLY IN scripts/staging/build-it-23-attachment-
// checks.mjs, which asks more of the same bucket than this does. That script is
// run BY HAND, by the owner, before and after an apply. These run on EVERY PULL
// REQUEST -- so they are what would notice a later change quietly opening the
// bucket, and they are the only thing in this repository that would.
//
// THE SAME RULE AS EVERY TEST ABOVE: every "cannot" first proves, in the same
// test, that the matching "can" found the file. A refusal about a file that was
// never stored is a test of nothing, and it is the failure mode this whole file
// exists to avoid.
//
// THEY CLEAN UP AFTER THEMSELVES, INCLUDING ON FAILURE, and the ORDER of that is
// the migration's rule rather than tidiness: the database refuses to delete a
// task that still has files, and the right to delete those files comes FROM the
// task. So the after() hook removes files first and then tasks -- and because a
// file is removed through the Storage API rather than with SQL, a row deleted in
// PostgREST would leave the bytes behind, "orphaned" in Supabase's own word.
//
// NO SECRET KEY, ANYWHERE. Every request below carries one of the three test
// accounts' own sessions, or nothing at all. That is the whole point: a service
// key bypasses row-level security, so a test written with one would prove nothing
// about the policies these are about.

// The task these tests attach a file to. A SECOND team task, created here: the
// one the tests above use is deleted by test 9, and a file needs a task that is
// still there.
let fileTaskId = null;

// The file this run stores, and the paths built from it. The name carries the run
// marker like every row above, so a leftover is recognisable in the dashboard.
const FILE_NAME = `bi23-${RUN_ID}.png`;
const filePath = () => `${fileTaskId}/${FILE_NAME}`;

// Files this run stored, so the after() hook can take them away. Separate from
// createdRows because they are removed a different way, through a different API,
// and before the tasks.
const createdFiles = [];

const fileTaskOrFail = () => {
  assert.ok(
    fileTaskId,
    "the task for the file tests was not created, so none of them could ask its question",
  );
  return fileTaskId;
};

// A refusal that must be the BUCKET'S OWN, for a named reason. A refusal
// carrying something else is a FAIL and not a pass, because "refused" and
// "refused for the reason this test is about" are different results -- the
// commonest way they differ being a type or size probe refused by row-level
// security instead, which would mean the bucket's limits were never reached.
function refusedForCode(answer, code, what) {
  assert.ok(!answer.error, `${what}: the request did not complete -- ${answer.error}`);
  assert.ok(answer.refused, `${what}: IT WAS ACCEPTED -- ${describeStorage(answer)}`);
  assert.ok(
    (answer.text ?? "").includes(code),
    `${what}: refused, but not with "${code}", so this test did not reach the rule it is ` +
      `about. ${describeStorage(answer)}`,
  );
  return describeStorage(answer);
}

test("Alice can create a second team task, for the file tests to attach to", async () => {
  const teamId = teamOrFail();
  const rows = allowed(
    await rest("POST", `tasks?select=${TASK_COLUMNS}`, {
      accessToken: sessions.alice.accessToken,
      body: { title: title("a team task with a file on it"), team_id: teamId },
    }),
    "Alice creates the task the file tests use",
  );
  assert.equal(rows.length, 1, `${rows.length} rows came back, expected 1`);
  fileTaskId = rows[0].id;
  remember(fileTaskId, "alice", "the team task for the file tests");
  assert.equal(rows[0].team_id, teamId, "the task is not in the team she asked for");
});

test("Alice CAN attach a file to her own team task", async () => {
  fileTaskOrFail();

  // The content type is SET BY THE CALLER, which is what the app does and the
  // reason it has to: Supabase works the declared type out from the extension
  // otherwise, and the owner's staging run of 9 October 2026 showed it does not
  // map `.heic`. This one is a `.png`, where the extension would have done --
  // sending the type anyway is the app's path, so it is the path tested.
  const answer = await storageUpload(filePath(), PNG_BYTES, "image/png", sessions.alice.accessToken);

  assert.ok(!answer.error, `the upload did not complete -- ${answer.error}`);
  assert.equal(answer.status, 200, `Alice's upload answered ${describeStorage(answer)}, expected 200`);
  createdFiles.push(filePath());

  // READ BACK, because an upload that answered 200 and stored nothing would
  // otherwise be counted as a success -- the same rule the writes above follow.
  const listed = await storageList(fileTaskId, sessions.alice.accessToken);
  assert.ok(!listed.error, `the list did not complete -- ${listed.error}`);
  assert.ok(
    listed.names?.includes(FILE_NAME),
    `the upload answered 200 but the file is not in the task's folder. ${describeStorage(listed)}`,
  );
  console.log(`# Alice attaching a file: HTTP ${answer.status}, and it is in the folder`);
});

test("Carol CAN list the file on Alice's team task", async () => {
  fileTaskOrFail();
  const listed = await storageList(fileTaskId, sessions.carol.accessToken);

  assert.ok(!listed.error, `the list did not complete -- ${listed.error}`);
  assert.equal(listed.status, 200, `Carol's list answered ${describeStorage(listed)}, expected 200`);
  assert.ok(
    listed.names?.includes(FILE_NAME),
    "Carol cannot see the file, and being in the team is what should make it visible",
  );
});

test("Carol CAN open the file, byte for byte", async () => {
  fileTaskOrFail();
  const got = await storageDownload(filePath(), sessions.carol.accessToken);

  assert.ok(!got.error, `the download did not complete -- ${got.error}`);
  assert.equal(got.status, 200, `Carol's download answered HTTP ${got.status}, expected 200`);
  assert.equal(
    got.byteLength,
    PNG_BYTES.length,
    `${got.byteLength} bytes came back, not ${PNG_BYTES.length}`,
  );
  assert.ok(got.sameAs(PNG_BYTES), "the right number of bytes came back, and they are not the file");
});

test("Bob CANNOT list the file", async () => {
  fileTaskOrFail();

  // The "can" half first, in this same test: if Carol cannot see it either, Bob
  // seeing nothing proves nothing.
  const asCarol = await storageList(fileTaskId, sessions.carol.accessToken);
  assert.ok(
    asCarol.names?.includes(FILE_NAME),
    "the file Bob is being refused is not there, so this test asked nothing",
  );

  const asBob = await storageList(fileTaskId, sessions.bob.accessToken);
  assert.ok(!asBob.error, `Bob's list did not complete -- ${asBob.error}`);

  // Two shapes of no, and both count: a refusal, or a 200 with the file not in
  // it. Supabase's own page says only that listing "may" want a different SELECT
  // policy from reading, so which one staging gives is reported rather than
  // required.
  if (asBob.refused) {
    console.log(`# Bob listing the file: ${describeStorage(asBob)} -- refused outright`);
    return;
  }
  assert.ok(Array.isArray(asBob.names), `Bob got HTTP 200 with a body that is not a list of files`);
  assert.ok(
    !asBob.names.includes(FILE_NAME),
    `BOB CAN SEE ALICE'S FILE: his list has ${asBob.names.length} entry(ies) and it is one of them`,
  );
  console.log(`# Bob listing the file: HTTP 200 with ${asBob.names.length} entry(ies), and it is not one`);
});

test("Bob CANNOT open the file", async () => {
  fileTaskOrFail();

  const asCarol = await storageDownload(filePath(), sessions.carol.accessToken);
  assert.equal(asCarol.status, 200, "the file Bob is being refused cannot be opened by Carol either");

  const asBob = await storageDownload(filePath(), sessions.bob.accessToken);
  assert.ok(!asBob.error, `Bob's download did not complete -- ${asBob.error}`);
  assert.ok(
    asBob.refused,
    `BOB OPENED ALICE'S FILE: HTTP ${asBob.status}, ${asBob.byteLength} bytes came back`,
  );
  console.log(`# Bob opening the file: HTTP ${asBob.status} -- refused`);
});

test("Bob CANNOT delete the file", async () => {
  fileTaskOrFail();

  const asBob = await storageDelete(filePath(), sessions.bob.accessToken);
  assert.ok(!asBob.error, `Bob's delete did not complete -- ${asBob.error}`);

  // THE FILE IS READ BACK, AND THAT IS THE WHOLE TEST. There are two shapes of
  // no -- a refusal, or an answer that matched no row because a policy leaves a
  // row out rather than complaining -- and **neither of them can be told from a
  // successful delete by reading the answer's body**: this endpoint says
  // `{"message":"Successfully deleted"}` either way. staging.mjs's note on
  // storageDelete has the citations. So the question is asked of the store.
  const after = await storageList(fileTaskId, sessions.alice.accessToken);
  assert.ok(
    after.names?.includes(FILE_NAME),
    "the file did not survive Bob's delete, so something let him remove it",
  );
  console.log(`# Bob deleting the file: ${describeStorage(asBob)}, and the file is still there`);
});

// `what` is the word the test's NAME uses, and it is given rather than built
// from the verb: the first run of these in CI printed "the file cannot be
// deleteed", because `${what}ed` is fine for list and open and wrong for
// delete. A test's name is read by whoever is looking at a failure.
for (const [what, action] of [
  ["listed", async () => storageList(fileTaskId, null)],
  ["opened", async () => storageDownload(filePath(), null)],
  ["deleted", async () => storageDelete(filePath(), null)],
]) {
  test(`Signed out: the file cannot be ${what}`, async () => {
    fileTaskOrFail();

    // The "can" half first, as everywhere else in this file.
    const asAlice = await storageList(fileTaskId, sessions.alice.accessToken);
    assert.ok(
      asAlice.names?.includes(FILE_NAME),
      "the file a stranger is being refused is not there, so this test asked nothing",
    );

    const answer = await action();
    assert.ok(!answer.error, `the request did not complete -- ${answer.error}`);

    // Every policy on this bucket is `to authenticated`, so a signed-out caller
    // matches none of them. Two shapes of no -- a refusal, or an answer that
    // found or changed nothing -- and a success is the only wrong answer. The
    // delete is judged by the read-back below rather than by its body, for the
    // reason staging.mjs's note on storageDelete gives.
    if (!answer.refused) {
      if (what === "listed") {
        assert.ok(
          !answer.names?.includes(FILE_NAME),
          "A STRANGER WITH THE PUBLISHABLE KEY CAN LIST ALICE'S FILE",
        );
      } else if (what === "opened") {
        assert.fail(`A STRANGER OPENED ALICE'S FILE: ${answer.byteLength} bytes came back`);
      }
    }

    const after = await storageList(fileTaskId, sessions.alice.accessToken);
    assert.ok(
      after.names?.includes(FILE_NAME),
      `the file was ${what} by a signed-out caller, or did not survive it`,
    );
    console.log(`# signed out, ${what}: HTTP ${answer.status ?? "?"} -- nothing`);
  });
}

test("A file one byte over 5 MB is refused, and refused for its SIZE", async () => {
  fileTaskOrFail();

  // Alice, on her own task, so nothing but the bucket's own limit can refuse it.
  // A refusal from a policy here would mean the limit was never reached.
  const answer = await storageUpload(
    `${fileTaskId}/bi23-${RUN_ID}-too-big.png`,
    oversizeBytes(),
    "image/png",
    sessions.alice.accessToken,
  );

  const how = refusedForCode(answer, "EntityTooLarge", "an upload one byte over the limit");
  console.log(`# ${MAX_FILE_BYTES + 1} bytes: ${how}`);
});

test("An SVG is refused, and refused for its TYPE", async () => {
  fileTaskOrFail();

  // THE REASON THE BUCKET NAMES ITS SIX TYPES instead of saying `image/*`: an SVG
  // is not a picture, it is a document, and it can carry script -- served back
  // through a signed link to this project's own address. Alice, on her own task,
  // so again only the bucket can refuse it.
  const answer = await storageUpload(
    `${fileTaskId}/bi23-${RUN_ID}.svg`,
    SVG_BYTES,
    "image/svg+xml",
    sessions.alice.accessToken,
  );

  const how = refusedForCode(answer, "InvalidMimeType", "an SVG upload");
  console.log(`# an SVG: ${how}`);
});

test("Alice CANNOT delete her own task while a file is on it", async () => {
  const id = fileTaskOrFail();

  const listed = await storageList(id, sessions.alice.accessToken);
  assert.ok(
    listed.names?.includes(FILE_NAME),
    "there is no file on the task, so a refusal would prove nothing",
  );

  const attempt = await rest("DELETE", `tasks?id=eq.${id}&select=id`, {
    accessToken: sessions.alice.accessToken,
  });

  // THE TRIGGER, not a policy. tasks_refuse_delete_with_files() raises 23503 --
  // foreign_key_violation, which reads as "something still points at this row" --
  // and it is a trigger rather than a policy precisely so that it fires for
  // everybody, including a cascade and including service_role.
  assert.ok(attempt.refused, `the task WAS DELETED with a file still on it: HTTP ${attempt.status}`);
  assert.ok(
    (attempt.error ?? "").includes("23503"),
    `refused with HTTP ${attempt.status}, but not by the trigger: ${attempt.error}`,
  );

  // AND THE MESSAGE NAMES NO FILE, which is a rule rather than a nicety:
  // docs/plan.md forbids a file name in an error, because a name is free text
  // somebody's phone chose.
  assert.ok(
    !(attempt.error ?? "").includes(FILE_NAME),
    "the refusal names the file, which docs/plan.md forbids",
  );

  const afterRows = allowed(
    await read("tasks", TASK_COLUMNS, { id }, sessions.alice.accessToken),
    "Alice reads the task back",
  );
  assert.equal(afterRows.length, 1, "the task is gone, so the refusal did not hold it");
  console.log(`# deleting a task with a file on it: HTTP ${attempt.status} (23503), no file named`);
});

test("Alice CAN delete the file she attached", async () => {
  const id = fileTaskOrFail();

  // The file IS there to begin with, so a read-back finding it gone means this
  // delete is what removed it.
  const before = await storageList(id, sessions.alice.accessToken);
  assert.ok(
    before.names?.includes(FILE_NAME),
    "the file is not there, so a successful delete would prove nothing",
  );

  const answer = await storageDelete(filePath(), sessions.alice.accessToken);
  assert.ok(!answer.error, `the delete did not complete -- ${answer.error}`);
  assert.ok(!answer.refused, `Alice's delete was refused: ${describeStorage(answer)}`);

  // AND THE FOLDER IS READ BACK, which is the only thing that settles it: this
  // endpoint answers `{"message":"Successfully deleted"}` whether or not a
  // policy matched a row, so the body cannot tell "deleted" from "nothing
  // matched". staging.mjs's note on storageDelete has the citations.
  const after = await storageList(id, sessions.alice.accessToken);
  assert.ok(!after.error, `the list did not complete -- ${after.error}`);
  assert.ok(
    !after.names?.includes(FILE_NAME),
    "the file is still in the folder after Alice deleted it",
  );
  createdFiles.length = 0;
});

test("and the task deletes once its file is gone", async () => {
  const id = fileTaskOrFail();

  const rows = allowed(
    await rest("DELETE", `tasks?id=eq.${id}&select=id`, {
      accessToken: sessions.alice.accessToken,
    }),
    "Alice deletes the task the file was on",
  );
  assert.equal(rows.length, 1, `the delete matched ${rows.length} rows, expected 1`);

  const afterRows = allowed(
    await read("tasks", TASK_COLUMNS, { id }, sessions.alice.accessToken),
    "Alice reads the task back",
  );
  assert.equal(afterRows.length, 0, "the task is still there after Alice deleted it");
  forget(id);
});

// ---------------------------------------------------------------------------
// Cleanup -- only the rows this run created, by id, by their creator
// ---------------------------------------------------------------------------

after(async () => {
  const leftBehind = [];

  // ---- THE FILES GO FIRST (Build it 23 part 2, issue #242) ---------------
  //
  // Before the tasks, and the order is the database's rule rather than
  // tidiness: tasks_refuse_delete_with_files() refuses to delete a task while
  // any object remains under `attachments/<task id>/`, so a task loop running
  // first would simply be refused and every one of its rows would be reported as
  // left behind. And the right to delete these files comes FROM the task --
  // delete the task first and the right goes with it.
  //
  // `createdFiles` IS NORMALLY EMPTY BY NOW, because the test that deletes the
  // file clears it. This loop is for the run that died before getting there, and
  // it is the reason these tests clean up on failure as well as on success.
  //
  // Through the Storage API, never with SQL: a row deleted in PostgREST leaves
  // the bytes behind, "orphaned" in Supabase's own word.
  for (const path of createdFiles) {
    const removed = await storageDelete(path, sessions.alice?.accessToken ?? null);
    if (removed.error || removed.refused) {
      // The PATH is printed, and that is a decision rather than an oversight:
      // this is a file THIS RUN created, with RUN_ID in its name, and somebody
      // has to be able to find it in the dashboard. It is not anybody's file and
      // its name is this file's own invention.
      leftBehind.push({
        id: path,
        what: `a file in ${BUCKET}`,
        why: removed.error ?? describeStorage(removed),
      });
      continue;
    }
    // Read back, because this endpoint says "Successfully deleted" whether or
    // not a policy matched a row -- so a cleanup that trusted the status could
    // report success over a file still sitting in the bucket, which is the one
    // thing this hook exists to notice.
    const taskId = path.split("/")[0];
    const name = path.slice(taskId.length + 1);
    const left = await storageList(taskId, sessions.alice?.accessToken ?? null);
    if (left.error || left.names === null || left.names.includes(name)) {
      leftBehind.push({
        id: path,
        what: `a file in ${BUCKET}`,
        why: left.error ?? "the delete said it worked and the file is still in the folder",
      });
      continue;
    }
    console.log(`# cleanup: deleted a file this run attached`);
  }

  for (const row of createdRows) {
    if (row.gone) continue;
    const session = sessions[row.by];
    if (!session) {
      leftBehind.push({ ...row, why: `${row.by} has no session` });
      continue;
    }
    const deleted = await rest("DELETE", `tasks?id=eq.${row.id}&select=id`, {
      accessToken: session.accessToken,
    });
    if (deleted.error) {
      leftBehind.push({ ...row, why: `HTTP ${deleted.status} ${deleted.error}` });
      continue;
    }
    const afterRows = await read("tasks", "id", { id: row.id }, session.accessToken);
    if (afterRows.error) {
      leftBehind.push({ ...row, why: `deleted, but could not confirm: ${afterRows.error}` });
    } else if (afterRows.rows.length !== 0) {
      leftBehind.push({ ...row, why: "the row is still there after the delete" });
    } else {
      console.log(`# cleanup: deleted ${row.what}`);
    }
  }

  for (const who of ["alice", "carol", "bob"]) {
    if (sessions[who]) console.log(`# ${await signOut(sessions[who])}`);
  }

  if (leftBehind.length > 0) {
    // These are rows THIS RUN created, so their ids are printed: somebody has
    // to be able to find them. Every title also carries RUN_ID.
    const lines = leftBehind
      .map((row) => `    ${row.id} (${row.what}) -- ${row.why}`)
      .join("\n");
    throw new Error(
      `cleanup left ${leftBehind.length} row(s) behind in staging:\n${lines}\n` +
        `  Search the staging tasks table for ${RUN_ID} to find them.`,
    );
  }
});
