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
// WHAT IT CREATES, AND GIVES BACK. One team task and one personal task, both
// deleted again by their creator in an after() hook that runs even when a test
// fails. It never changes or deletes a row it did not create. The one
// exception is the invitation below, which cannot be deleted with a
// publishable key and is created once in the lifetime of the project -- see
// INVITE_ADDRESS in staging.mjs.
//
// WHAT IT NEVER PRINTS: a password, an access token, a refresh token, the
// publishable key, the project URL, a user id, or an email address. Statuses
// are shown, and so are the `error` and `code` fields the tests assert on --
// but not a whole response body. See describeAnswer below for what changed
// there in Build it 18 and why.

import { after, before, test } from "node:test";
import { strict as assert } from "node:assert";
import { randomUUID } from "node:crypto";

import {
  callFunction,
  INVITE_ADDRESS,
  isTeamMember,
  PEOPLE,
  read,
  rest,
  signIn,
  signOut,
  STAGING_DESCRIPTION,
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
// Cleanup -- only the rows this run created, by id, by their creator
// ---------------------------------------------------------------------------

after(async () => {
  const leftBehind = [];

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
