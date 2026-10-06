// invitation_status_test.ts -- does invite-member say what it stored?
//
// Build it 18 part 2b, issue #166. Run it with Deno, from the repository root,
// and see the bottom of this file for the exact command.
//
// WHAT IT TESTS, and what makes that worth anything: it imports the REAL
// supabase/functions/invite-member/index.ts and calls the pure pieces that file
// exports -- the thing that decides whether an invitation may be sent again, the
// thing that reads the email service's answer, and the three builders that
// produce the responses a caller actually receives. Not a copy of any of them
// written out again here. A copy would pass happily while the deployed function
// did something else, which is the one failure a test like this must not have.
// The import is the point, and it is the same argument suspension_test.ts beside
// this file makes.
//
// WHY IT CAN BE RUN WITH NO DATABASE AND NO KEY. Every piece under test is pure:
//
//   retryVerdict          takes a row and a number of milliseconds
//   codeFromSendResponse  takes a Response, which a test can build
//   invitationAnswer      takes what was stored and returns a Response
//   sendFailureAnswer     takes a code and whether the row was marked
//   alreadyWaitingAnswer  takes a Postgres error code
//   stillSendingAnswer    takes a Postgres error code
//
// So there is no network, no Supabase project, no account and no email service
// involved, and nothing here proves anything about what the DEPLOYED function
// does. That is what scripts/staging/build-it-18-invitation-status-checks.mjs is
// for, run by the owner once the function is deployed to staging.
//
// THE SIX THINGS IT ASKS:
//
//   1. A SENT INVITATION IS REPORTED AS SENT: 201, the row's three facts, the
//      word 'sent', and nothing else in the body.
//   2. IT NEVER SAYS SENT WHEN THE ROW SAYS OTHERWISE. The email can go and the
//      status write can still fail, and then the row says 'queued' -- so the
//      answer says 'queued'. This is the heart of issue #166's "what the function
//      answers must match what it stored", and it is the case that cannot be seen
//      from the outside: both answers are 201.
//   3. EVERY FAILURE CODE PRODUCES ITS OWN ANSWER, with a plain sentence and the
//      code, and the four codes are exactly the four the migration allows -- read
//      out of the migration file itself rather than typed again here.
//   4. NOTHING THE EMAIL SERVICE SAID IS IN ANY BODY. No reply, no status number,
//      no address, no token, no hash, no id of anything but the invitation.
//   5. THE EMAIL SERVICE'S ANSWER IS READ STRICTLY. A 2xx with no id is not a
//      send, and a 2xx that is not JSON is not a send.
//   6. A RETRY IS OFFERED FOR A FAILED OR LONG-STUCK INVITATION AND REFUSED FOR
//      ONE THAT WENT -- and the refusal for one that went is byte-for-byte the
//      409 this function has always sent.
//
// AND IT CHECKS THAT IT CAN FAIL. The last section writes out the mistakes this
// file exists to catch -- an answer that reports 'sent' from a row that says
// 'queued', a 502 that quotes the email service, a verdict that sends a second
// email to somebody who already has the first -- and requires the checks above to
// refuse every one of them. A check that cannot fail reports a pass and means
// nothing.
//
// It writes nothing, makes no request, and reads one file: the migration, so that
// the list of failure codes is compared with the constraint that enforces it
// rather than with a second copy of itself.

import {
  alreadyWaitingAnswer,
  codeFromSendResponse,
  FAILURE_CODES,
  FAILURE_SENTENCES,
  INVITATION_STATUSES,
  invitationAnswer,
  type FailureCode,
  retryVerdict,
  sendFailureAnswer,
  STALE_QUEUED_MINUTES,
  stillSendingAnswer,
} from "../invite-member/index.ts";

// ---------------------------------------------------------------------------
// Made-up values. Every one of them belongs to nobody.
// ---------------------------------------------------------------------------

const MADE_UP_ID = "a1b2c3d4-0001-4e5f-8a9b-0c1d2e3f4a5b";
const MADE_UP_EMAIL = "invited-nobody@example.com";
const MADE_UP_EXPIRY = "2026-10-13T09:00:00.000Z";

// A token-shaped string and a hash-shaped string, so "no token reaches a body" is
// a measured fact rather than a reading of the code. Neither is a credential:
// nothing issued them and no row holds them.
//
// BOTH ARE BUILT RATHER THAN WRITTEN OUT, AND DELIBERATELY DULL. The first
// version of this line was a 51-character base64url blob, which is what a real
// token looks like -- and `.githooks/pre-commit` refused the commit, gitleaks
// reporting `generic-api-key, entropy 4.616`. It was right to: a scanner cannot
// tell a fixture from the real thing, and CI runs the same tool over the whole
// history on every pull request (.github/workflows/ci.yml, "Secret scan"), so
// committing it would have turned that job red for everybody afterwards. A
// repeated character has almost no entropy and serves this file just as well --
// the checks below look for the string, not for how random it is.
const TOKEN_SHAPED = `not-a-real-invitation-token-${"x".repeat(24)}`;
const HASH_SHAPED = "0".repeat(64);

// What a real email service reply looks like, written out so the disclosure
// checks have something to look for. THIS STRING MUST NEVER APPEAR IN A BODY:
// docs/plan.md's reason is that a reply "can quote the address, the subject and
// the message", and this one quotes all three.
const SERVICE_REPLY = JSON.stringify({
  statusCode: 422,
  name: "validation_error",
  message:
    `The recipient ${MADE_UP_EMAIL} is invalid for subject ` +
    `"You have been invited to Tuesday crew"`,
});

const NOW = Date.parse("2026-10-06T12:00:00.000Z");
const MINUTE = 60_000;

// ---------------------------------------------------------------------------
// Reading a response, and saying what is wrong with it
// ---------------------------------------------------------------------------

type Body = Record<string, unknown>;

async function readBody(answer: Response): Promise<{ text: string; body: Body | null }> {
  const text = await answer.text();
  try {
    const parsed = JSON.parse(text);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { text, body: null };
    }
    return { text, body: parsed as Body };
  } catch {
    return { text, body: null };
  }
}

// The checks that apply to EVERY answer this function builds, whatever it is
// about. Returns every problem it finds, not the first.
//
// `mayCarry` is the values this particular answer is allowed to contain: an
// invitation's own id and the address the owner typed belong in the 201, and
// nowhere else.
function disclosureProblems(text: string, mayCarry: string[] = []): string[] {
  const problems: string[] = [];
  const hidden = (value: string) => !mayCarry.includes(value) && text.includes(value);

  if (hidden(MADE_UP_EMAIL)) {
    problems.push("it contains an email address");
  }
  if (text.includes(TOKEN_SHAPED)) {
    problems.push("it contains the invitation token, which is a credential until it expires");
  }
  if (text.includes(HASH_SHAPED)) {
    problems.push("it contains the token hash");
  }
  if (text.includes(SERVICE_REPLY)) {
    problems.push("it contains the email service's own reply");
  }
  // The service's words, piece by piece, in case only part of the reply survived.
  for (const fragment of ["validation_error", "statusCode", "is invalid for subject"]) {
    if (text.includes(fragment)) {
      problems.push(`it contains "${fragment}", which only the email service says`);
    }
  }
  if (hidden(MADE_UP_ID)) {
    problems.push("it contains a uuid");
  }
  return problems;
}

// ---------------------------------------------------------------------------
// 1 and 2. What the function says about an invitation whose email went
// ---------------------------------------------------------------------------
//
// THE TWO CASES ARE ONE TEST ON PURPOSE. They differ in one field and in nothing
// else -- same status, same shape, same everything -- which is exactly why the
// second is easy to get wrong: a function that hard-coded 'sent' here would look
// right in every log, every browser and every staging run, and would be lying
// only in the case nobody can see from outside.

type AnswerCase = {
  name: string;
  status: "queued" | "sent";
  retried: boolean;
  redirected: boolean;
};

const ANSWER_CASES: AnswerCase[] = [
  {
    name: "the email went and the row says sent",
    status: "sent",
    retried: false,
    redirected: false,
  },
  {
    name: "the email went to the test inbox and the row says sent",
    status: "sent",
    retried: false,
    redirected: true,
  },
  {
    name: "a retry's email went and the row says sent",
    status: "sent",
    retried: true,
    redirected: false,
  },
  {
    name:
      "THE EMAIL WENT AND THE STATUS WRITE FAILED: the row still says queued, so the answer must say queued",
    status: "queued",
    retried: false,
    redirected: false,
  },
  {
    name: "a retry's email went and its status write failed: queued again, not sent",
    status: "queued",
    retried: true,
    redirected: false,
  },
];

for (const testCase of ANSWER_CASES) {
  Deno.test(`invitationAnswer: ${testCase.name}`, async () => {
    const answer = invitationAnswer({
      id: MADE_UP_ID,
      email: MADE_UP_EMAIL,
      expires_at: MADE_UP_EXPIRY,
      status: testCase.status,
      redirected: testCase.redirected,
      retried: testCase.retried,
    });

    const problems: string[] = [];

    if (answer.status !== 201) {
      problems.push(`the HTTP status is ${answer.status}, expected 201`);
    }

    const { text, body } = await readBody(answer);
    if (!body) {
      problems.push(`the body is not a JSON object: ${text}`);
    } else {
      const invitation = body.invitation as Body | undefined;
      if (!invitation || typeof invitation !== "object") {
        problems.push("the body has no invitation object");
      } else {
        if (invitation.id !== MADE_UP_ID) {
          problems.push(`invitation.id is ${JSON.stringify(invitation.id)}`);
        }
        if (invitation.email !== MADE_UP_EMAIL) {
          problems.push(`invitation.email is ${JSON.stringify(invitation.email)}`);
        }
        if (invitation.expires_at !== MADE_UP_EXPIRY) {
          problems.push(`invitation.expires_at is ${JSON.stringify(invitation.expires_at)}`);
        }
        // THE ASSERTION THIS WHOLE FILE IS NAMED AFTER.
        if (invitation.status !== testCase.status) {
          problems.push(
            `invitation.status is ${JSON.stringify(invitation.status)}, and the row says ` +
              `${JSON.stringify(testCase.status)} -- the answer must match what was stored`,
          );
        }
        const allowedOnInvitation = ["id", "email", "expires_at", "status"];
        const extraOnInvitation = Object.keys(invitation).filter(
          (key) => !allowedOnInvitation.includes(key),
        );
        if (extraOnInvitation.length > 0) {
          problems.push(`the invitation carries fields it should not: ${extraOnInvitation.join(", ")}`);
        }
      }

      if (body.redirected !== testCase.redirected) {
        problems.push(`redirected is ${JSON.stringify(body.redirected)}`);
      }
      if (body.retried !== testCase.retried) {
        problems.push(`retried is ${JSON.stringify(body.retried)}`);
      }
      // A success body must not carry `error`: web/src/app/teams/actions.ts reads
      // that field to decide whether anything went wrong.
      const allowed = ["invitation", "redirected", "retried"];
      const extra = Object.keys(body).filter((key) => !allowed.includes(key));
      if (extra.length > 0) {
        problems.push(`the body carries fields it should not: ${extra.join(", ")}`);
      }
    }

    // The id and the address are the two things this answer is allowed to carry:
    // it goes to the team's owner, who typed the address and may read the row.
    problems.push(...disclosureProblems(text, [MADE_UP_ID, MADE_UP_EMAIL]));

    if (problems.length > 0) {
      throw new Error(`invitationAnswer is wrong for "${testCase.name}": ${problems.join("; ")}`);
    }
  });
}

// ---------------------------------------------------------------------------
// 3 and 4. What the function says when the email did not go
// ---------------------------------------------------------------------------

for (const code of FAILURE_CODES) {
  for (const recorded of [true, false]) {
    Deno.test(
      `sendFailureAnswer: ${code}, ${recorded ? "recorded on the row" : "and the status write ALSO failed"}`,
      async () => {
        const answer = sendFailureAnswer({ code, recorded });
        const problems: string[] = [];

        // 502 when the row was marked failed; 500 when it was not, because then
        // the database is in a state nobody asked for.
        const expectedStatus = recorded ? 502 : 500;
        if (answer.status !== expectedStatus) {
          problems.push(`the HTTP status is ${answer.status}, expected ${expectedStatus}`);
        }

        const { text, body } = await readBody(answer);
        if (!body) {
          problems.push(`the body is not a JSON object: ${text}`);
        } else {
          if (body.code !== code) {
            problems.push(`code is ${JSON.stringify(body.code)}, expected ${JSON.stringify(code)}`);
          }
          const message = body.error;
          if (typeof message !== "string" || message.trim() === "") {
            problems.push(`error is ${JSON.stringify(message)}, expected a sentence`);
          } else {
            if (!message.includes(FAILURE_SENTENCES[code])) {
              problems.push(
                `the message does not contain this code's sentence ` +
                  `${JSON.stringify(FAILURE_SENTENCES[code])} -- it is ${JSON.stringify(message)}`,
              );
            }
            // WHAT THE ANSWER CLAIMS ABOUT THE ROW HAS TO MATCH THE ROW. When the
            // status write failed, the row still says 'queued', so the message
            // must not tell the owner it is marked as failed.
            const claimsItIsMarked = /shows as "could not be sent"/.test(message);
            if (claimsItIsMarked !== recorded) {
              problems.push(
                recorded
                  ? "the invitation IS marked as failed and the message does not say so"
                  : "the status write FAILED and the message still claims the invitation shows as could not be sent",
              );
            }
            const mentionsSending = message.includes('may still show as "sending"');
            if (mentionsSending === recorded) {
              problems.push(
                recorded
                  ? "the row says failed, so the message should not warn that it may show as sending"
                  : "the row still says queued, and the message does not warn that it may show as sending",
              );
            }
          }
          const allowed = ["error", "code"];
          const extra = Object.keys(body).filter((key) => !allowed.includes(key));
          if (extra.length > 0) {
            problems.push(`the body carries fields it should not: ${extra.join(", ")}`);
          }
        }

        // A failure body may carry NOTHING personal: not the address, not the id,
        // not the token, and above all nothing the email service said.
        problems.push(...disclosureProblems(text));

        if (problems.length > 0) {
          throw new Error(
            `sendFailureAnswer(${code}, recorded=${recorded}) is wrong: ${problems.join("; ")}`,
          );
        }
      },
    );
  }
}

Deno.test("every failure code has its own plain sentence, and no two share one", () => {
  const problems: string[] = [];
  const seen = new Map<string, FailureCode>();

  for (const code of FAILURE_CODES) {
    const sentence = FAILURE_SENTENCES[code];
    if (typeof sentence !== "string" || sentence.trim() === "") {
      problems.push(`${code} has no sentence`);
      continue;
    }
    const already = seen.get(sentence);
    if (already) {
      problems.push(`${code} and ${already} share the sentence ${JSON.stringify(sentence)}`);
    }
    seen.set(sentence, code);

    // A plain sentence, not a code and not a reply. Three things each sentence
    // must not contain, and each is a way the email service's answer leaks:
    if (/\d/.test(sentence)) {
      problems.push(
        `${code}'s sentence contains a digit, so possibly the status the service answered with: ` +
          JSON.stringify(sentence),
      );
    }
    if (sentence.includes("@")) {
      problems.push(`${code}'s sentence contains an @`);
    }
    if (sentence.includes(code)) {
      problems.push(`${code}'s sentence contains the raw code, which is not for a person to read`);
    }
    if (sentence.length > 120) {
      problems.push(`${code}'s sentence is ${sentence.length} characters, which is not a plain sentence`);
    }
  }

  // The sentence map must not have grown values for codes that do not exist.
  const extra = Object.keys(FAILURE_SENTENCES).filter(
    (key) => !(FAILURE_CODES as readonly string[]).includes(key),
  );
  if (extra.length > 0) {
    problems.push(`there are sentences for codes that are not in the list: ${extra.join(", ")}`);
  }

  if (problems.length > 0) {
    throw new Error(problems.join("; "));
  }
});

// THE LIST IS THE MIGRATION'S, AND THIS IS WHERE THAT IS PROVED.
//
// The four codes and the three statuses are enforced by two check constraints in
// 20261006095847_invitation_status.sql. If this file compared them with a second
// copy typed out here, the comparison would prove only that somebody typed the
// same thing twice. So the constraint is read out of the migration itself: a code
// added to the function without a migration fails here, which is exactly what the
// migration's own comment asks for ("ADDING A CODE NEEDS A NEW MIGRATION").
Deno.test("the statuses and the failure codes are the ones the migration allows", async () => {
  const path = new URL(
    "../../migrations/20261006095847_invitation_status.sql",
    import.meta.url,
  );
  const sql = await Deno.readTextFile(path);

  // The values inside each constraint's in (...) list, in the order they appear.
  function valuesInList(after: string): string[] {
    const at = sql.indexOf(after);
    if (at === -1) return [];
    const open = sql.indexOf("(", at + after.length);
    const close = sql.indexOf(")", open);
    if (open === -1 || close === -1) return [];
    return [...sql.slice(open, close).matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
  }

  const problems: string[] = [];

  const statusesInSql = valuesInList("check (status in");
  if (statusesInSql.length === 0) {
    problems.push("could not find `check (status in (...))` in the migration at all");
  } else if (statusesInSql.join(",") !== INVITATION_STATUSES.join(",")) {
    problems.push(
      `the migration allows the statuses ${statusesInSql.join(", ")} and the function names ` +
        `${INVITATION_STATUSES.join(", ")}`,
    );
  }

  const codesInSql = valuesInList("failure_code in");
  if (codesInSql.length === 0) {
    problems.push("could not find `failure_code in (...)` in the migration at all");
  } else if (codesInSql.join(",") !== FAILURE_CODES.join(",")) {
    problems.push(
      `the migration allows the codes ${codesInSql.join(", ")} and the function names ` +
        `${FAILURE_CODES.join(", ")}`,
    );
  }

  if (problems.length > 0) {
    throw new Error(problems.join("; "));
  }
});

// ---------------------------------------------------------------------------
// 5. How strictly the email service's answer is read
// ---------------------------------------------------------------------------
//
// Every case is a Response this test builds, so the one thing that cannot be
// faked -- the fetch itself -- is the one thing left out. Its single failure,
// a request that could not be made at all, is `unreachable`, and only the
// deployed function can produce it.

const SEND_CASES: Array<{
  name: string;
  build: () => Response;
  expect: { ok: true; id: string } | { ok: false; code: FailureCode };
}> = [
  {
    name: "200 with an id: the email exists",
    build: () => Response.json({ id: "b7e2c1a0-0000-4000-8000-000000000001" }, { status: 200 }),
    expect: { ok: true, id: "b7e2c1a0-0000-4000-8000-000000000001" },
  },
  {
    name: "a 2xx that is not 200, with an id: still a send",
    build: () => Response.json({ id: "b7e2c1a0-0000-4000-8000-000000000002" }, { status: 202 }),
    expect: { ok: true, id: "b7e2c1a0-0000-4000-8000-000000000002" },
  },
  {
    name: "422 with the service's own complaint: refused, and not one word of it kept",
    build: () => new Response(SERVICE_REPLY, { status: 422 }),
    expect: { ok: false, code: "refused" },
  },
  {
    name: "401, which is what a wrong key looks like: refused",
    build: () => Response.json({ message: "API key is invalid" }, { status: 401 }),
    expect: { ok: false, code: "refused" },
  },
  {
    name: "429, rate limited: refused",
    build: () => Response.json({ message: "Too many requests" }, { status: 429 }),
    expect: { ok: false, code: "refused" },
  },
  {
    name: "500 from the service: refused",
    build: () => new Response("internal error", { status: 500 }),
    expect: { ok: false, code: "refused" },
  },
  {
    name: "200 WITH A BODY THAT IS NOT JSON: nothing can be said to have been sent",
    build: () => new Response("<html>maintenance</html>", { status: 200 }),
    expect: { ok: false, code: "unconfirmed" },
  },
  {
    name: "200 WITH NO id AT ALL: unconfirmed, not a send",
    build: () => Response.json({ ok: true }, { status: 200 }),
    expect: { ok: false, code: "unconfirmed" },
  },
  {
    name: "200 with an empty id: unconfirmed",
    build: () => Response.json({ id: "" }, { status: 200 }),
    expect: { ok: false, code: "unconfirmed" },
  },
  {
    name: "200 with an id that is a number rather than a string: unconfirmed",
    build: () => Response.json({ id: 12345 }, { status: 200 }),
    expect: { ok: false, code: "unconfirmed" },
  },
  {
    name: "200 with a JSON body that is null: unconfirmed",
    build: () => new Response("null", { status: 200, headers: { "Content-Type": "application/json" } }),
    expect: { ok: false, code: "unconfirmed" },
  },
];

for (const testCase of SEND_CASES) {
  Deno.test(`codeFromSendResponse: ${testCase.name}`, async () => {
    const got = await codeFromSendResponse(testCase.build());
    const expected = testCase.expect;

    if (got.ok !== expected.ok) {
      throw new Error(
        `ok is ${got.ok}, expected ${expected.ok} -- for "${testCase.name}"`,
      );
    }
    if (expected.ok && got.ok && got.id !== expected.id) {
      throw new Error(`the id is ${JSON.stringify(got.id)}, expected ${JSON.stringify(expected.id)}`);
    }
    if (!expected.ok && !got.ok && got.code !== expected.code) {
      throw new Error(`the code is ${JSON.stringify(got.code)}, expected ${JSON.stringify(expected.code)}`);
    }

    // Nothing the service said may survive the reading of its answer.
    const asText = JSON.stringify(got);
    if (asText.includes("validation_error") || asText.includes(MADE_UP_EMAIL)) {
      throw new Error(`the result carries the service's reply: ${asText}`);
    }
  });
}

// ---------------------------------------------------------------------------
// 6. May this invitation be sent again?
// ---------------------------------------------------------------------------

const STALE_MS = STALE_QUEUED_MINUTES * MINUTE;
const iso = (ms: number) => new Date(ms).toISOString();

const RETRY_CASES: Array<{
  name: string;
  row: { status?: unknown; created_at?: unknown };
  expect: ReturnType<typeof retryVerdict>;
}> = [
  {
    name: "failed: the owner may ask again, and this is the case the button is for",
    row: { status: "failed", created_at: iso(NOW - MINUTE) },
    expect: { retry: true, why: "failed" },
  },
  {
    name: "failed and old: still a retry -- age is not what decides a failed row",
    row: { status: "failed", created_at: iso(NOW - 6 * 24 * 60 * MINUTE) },
    expect: { retry: true, why: "failed" },
  },
  {
    name: "SENT: REFUSED, because somebody has that link in their inbox",
    row: { status: "sent", created_at: iso(NOW - MINUTE) },
    expect: { retry: false, why: "sent" },
  },
  {
    name: "sent a week ago: still refused. A sent invitation is never re-sent by this path",
    row: { status: "sent", created_at: iso(NOW - 6 * 24 * 60 * MINUTE) },
    expect: { retry: false, why: "sent" },
  },
  {
    name: "queued a moment ago: the send is probably in flight, so no second email",
    row: { status: "queued", created_at: iso(NOW - MINUTE) },
    expect: { retry: false, why: "sending" },
  },
  {
    name: "queued, one minute inside the window: still refused",
    row: { status: "queued", created_at: iso(NOW - STALE_MS + MINUTE) },
    expect: { retry: false, why: "sending" },
  },
  {
    name: "queued for exactly the window: retryable. The boundary is inclusive",
    row: { status: "queued", created_at: iso(NOW - STALE_MS) },
    expect: { retry: true, why: "stale" },
  },
  {
    name: "queued for an hour: the send clearly never finished",
    row: { status: "queued", created_at: iso(NOW - 60 * MINUTE) },
    expect: { retry: true, why: "stale" },
  },
  {
    name: "queued with a created_at that cannot be read: NOT a retry, because how long is unknown",
    row: { status: "queued", created_at: "whenever" },
    expect: { retry: false, why: "sending" },
  },
  {
    name: "queued with no created_at at all: not a retry either",
    row: { status: "queued" },
    expect: { retry: false, why: "sending" },
  },
  {
    name: "queued with a created_at in the future, which a clock skew could do: not a retry",
    row: { status: "queued", created_at: iso(NOW + 60 * MINUTE) },
    expect: { retry: false, why: "sending" },
  },
  {
    name: "a status the check constraint does not allow: refused, as it was before any of this",
    row: { status: "posted", created_at: iso(NOW - 60 * MINUTE) },
    expect: { retry: false, why: "unknown" },
  },
  {
    name: "no status at all, which is what a mis-read row looks like: refused",
    row: { created_at: iso(NOW - 60 * MINUTE) },
    expect: { retry: false, why: "unknown" },
  },
  {
    name: "a status of the right word in the wrong case: refused, not guessed at",
    row: { status: "Failed", created_at: iso(NOW - MINUTE) },
    expect: { retry: false, why: "unknown" },
  },
];

for (const testCase of RETRY_CASES) {
  Deno.test(`retryVerdict: ${testCase.name}`, () => {
    const got = retryVerdict(testCase.row, NOW);
    if (got.retry !== testCase.expect.retry || got.why !== testCase.expect.why) {
      throw new Error(
        `retryVerdict answered ${JSON.stringify(got)}, expected ${JSON.stringify(testCase.expect)}` +
          ` -- for "${testCase.name}"`,
      );
    }
  });
}

// THE REFUSAL THAT MUST NOT HAVE CHANGED. Issue #166: "a waiting invitation whose
// status is sent still answers 409 with code 23505". The sentence below is the one
// this function sent before any of this existed, written out here character for
// character on purpose -- this is the test's own statement of the contract, and
// importing the string would make it agree with the function however the function
// changed.
const UNCHANGED_409 = "That person already has an invitation waiting for this team.";

Deno.test("alreadyWaitingAnswer: 409, the Postgres code, and the sentence it has always sent", async () => {
  const answer = alreadyWaitingAnswer("23505");
  const problems: string[] = [];

  if (answer.status !== 409) problems.push(`the status is ${answer.status}, expected 409`);

  const { text, body } = await readBody(answer);
  if (!body) {
    problems.push(`the body is not a JSON object: ${text}`);
  } else {
    if (body.error !== UNCHANGED_409) {
      problems.push(`error is ${JSON.stringify(body.error)}, expected ${JSON.stringify(UNCHANGED_409)}`);
    }
    if (body.code !== "23505") {
      problems.push(`code is ${JSON.stringify(body.code)}, expected "23505"`);
    }
    const extra = Object.keys(body).filter((key) => !["error", "code"].includes(key));
    if (extra.length > 0) problems.push(`it carries fields it should not: ${extra.join(", ")}`);
  }
  problems.push(...disclosureProblems(text));

  if (problems.length > 0) {
    throw new Error(`the unchanged 409 is wrong: ${problems.join("; ")}`);
  }
});

Deno.test("stillSendingAnswer: 409 with the code, its own sentence, and no raw code for a person to read", async () => {
  const answer = stillSendingAnswer("23505");
  const problems: string[] = [];

  if (answer.status !== 409) problems.push(`the status is ${answer.status}, expected 409`);

  const { text, body } = await readBody(answer);
  if (!body) {
    problems.push(`the body is not a JSON object: ${text}`);
  } else {
    if (body.code !== "23505") {
      problems.push(`code is ${JSON.stringify(body.code)}, expected "23505"`);
    }
    const message = body.error;
    if (typeof message !== "string" || message.trim() === "") {
      problems.push(`error is ${JSON.stringify(message)}, expected a sentence`);
    } else {
      // It must be ITS OWN sentence. The two 409s mean different things -- "wait"
      // and "they already have it" -- and a screen that showed the same words for
      // both would hide the difference the owner can act on.
      if (message === UNCHANGED_409) {
        problems.push("it sends the already-waiting sentence, so the two 409s cannot be told apart");
      }
      if (message.includes("23505")) {
        problems.push("the sentence contains the Postgres code, which is not for a person to read");
      }
    }
    const extra = Object.keys(body).filter((key) => !["error", "code"].includes(key));
    if (extra.length > 0) problems.push(`it carries fields it should not: ${extra.join(", ")}`);
  }
  problems.push(...disclosureProblems(text));

  if (problems.length > 0) {
    throw new Error(`the still-sending 409 is wrong: ${problems.join("; ")}`);
  }
});

// ---------------------------------------------------------------------------
// Can these tests fail?
// ---------------------------------------------------------------------------
//
// Every case below is a plausible way to write this feature wrong. Plausible is
// the requirement: `status: "sent"` written straight into the answer is what
// anybody would write first, and it passes every browser, every log and every
// staging run while being a lie in the one case nobody can see. If the checks
// above cannot catch these, they are not evidence of anything.
//
// Each case is checked by the SAME judgement the real builders are checked by,
// not by a second copy of it -- so a check weakened above stops catching the
// matching mistake here, and this section goes red.

// The judgement from section 1 and 2, lifted out so a broken builder can be put
// through it. Returns the problems; empty means it passed, which for a broken
// builder is the failure.
async function problemsWithAnswer(
  answer: Response,
  expected: { status: "queued" | "sent"; retried: boolean; redirected: boolean },
): Promise<string[]> {
  const problems: string[] = [];
  if (answer.status !== 201) problems.push("wrong HTTP status");
  const { text, body } = await readBody(answer);
  if (!body) return ["not a JSON object"];
  const invitation = body.invitation as Body | undefined;
  if (!invitation || typeof invitation !== "object") return ["no invitation object"];
  if (invitation.status !== expected.status) problems.push("the status does not match the row");
  if (body.retried !== expected.retried) problems.push("retried is wrong");
  if (body.redirected !== expected.redirected) problems.push("redirected is wrong");
  const allowed = ["invitation", "redirected", "retried"];
  if (Object.keys(body).some((key) => !allowed.includes(key))) problems.push("extra fields");
  problems.push(...disclosureProblems(text, [MADE_UP_ID, MADE_UP_EMAIL]));
  return problems;
}

Deno.test('the answer checks REFUSE a builder that always says "sent"', async () => {
  // The mistake: the status in the answer is written from what the code HOPED,
  // not from what the database confirmed. Anybody would write it this way first,
  // and it is right in four of this file's five answer cases -- which is what
  // makes it dangerous rather than obvious.
  const alwaysSent = () =>
    Response.json(
      {
        invitation: {
          id: MADE_UP_ID,
          email: MADE_UP_EMAIL,
          expires_at: MADE_UP_EXPIRY,
          status: "sent",
        },
        redirected: false,
        retried: false,
      },
      { status: 201 },
    );

  // Against a row that says 'queued', this must be caught.
  const caught = await problemsWithAnswer(alwaysSent(), {
    status: "queued",
    retried: false,
    redirected: false,
  });
  if (caught.length === 0) {
    throw new Error(
      'a builder that reports "sent" for a row that says "queued" passed the checks',
    );
  }

  // And the same body against a row that really does say 'sent' must pass, or the
  // check above is catching something other than the mistake.
  const shouldPass = await problemsWithAnswer(alwaysSent(), {
    status: "sent",
    retried: false,
    redirected: false,
  });
  if (shouldPass.length > 0) {
    throw new Error(
      `the checks reject a correct 'sent' answer too, so they are not catching the ` +
        `mistake they claim to: ${shouldPass.join("; ")}`,
    );
  }
});

Deno.test("the failure checks REFUSE every broken failure answer", async () => {
  const broken: Array<{ name: string; answer: Response; code: FailureCode; recorded: boolean }> = [
    {
      // The one docs/plan.md forbids in so many words: the email service's reply,
      // which quotes the address, the subject and the message.
      name: "a 502 that passes the email service's reply straight through",
      answer: Response.json(
        { error: `The invitation email could not be sent: ${SERVICE_REPLY}`, code: "refused" },
        { status: 502 },
      ),
      code: "refused",
      recorded: true,
    },
    {
      name: "a 502 that names the address it could not send to",
      answer: Response.json(
        {
          error: `The invitation email could not be sent. The email service would not accept the message. The invitation is saved and shows as "could not be sent", so you can ask again. Address: ${MADE_UP_EMAIL}`,
          code: "refused",
        },
        { status: 502 },
      ),
      code: "refused",
      recorded: true,
    },
    {
      name: "a 502 with no code, so the screen has nothing to key a sentence off",
      answer: Response.json(
        {
          error:
            'The invitation email could not be sent. The email service would not accept the message. The invitation is saved and shows as "could not be sent", so you can ask again.',
        },
        { status: 502 },
      ),
      code: "refused",
      recorded: true,
    },
    {
      name: "a 502 whose message belongs to another code",
      answer: Response.json(
        {
          error:
            'The invitation email could not be sent. The email service could not be reached. The invitation is saved and shows as "could not be sent", so you can ask again.',
          code: "refused",
        },
        { status: 502 },
      ),
      code: "refused",
      recorded: true,
    },
    {
      // The status write failed, so the row says 'queued' -- and this tells the
      // owner it is marked as failed. The same lie as the 'sent' one above, in the
      // other direction.
      name: "CLAIMING THE ROW IS MARKED FAILED WHEN THE STATUS WRITE FAILED",
      answer: Response.json(
        {
          error:
            'The invitation email could not be sent. The email service would not accept the message. The invitation is saved and shows as "could not be sent", so you can ask again.',
          code: "refused",
        },
        { status: 500 },
      ),
      code: "refused",
      recorded: false,
    },
    {
      name: "a 201 for a send that did not happen",
      answer: Response.json(
        { error: "The invitation email could not be sent. The email service would not accept the message.", code: "refused" },
        { status: 201 },
      ),
      code: "refused",
      recorded: true,
    },
  ];

  // Judged by the same rules the real builder is judged by, written once here
  // because Deno.test bodies cannot be shared any other way.
  async function problemsWithFailure(
    answer: Response,
    code: FailureCode,
    recorded: boolean,
  ): Promise<string[]> {
    const problems: string[] = [];
    if (answer.status !== (recorded ? 502 : 500)) problems.push("wrong HTTP status");
    const { text, body } = await readBody(answer);
    if (!body) return ["not a JSON object"];
    if (body.code !== code) problems.push("wrong or missing code");
    const message = typeof body.error === "string" ? body.error : "";
    if (!message.includes(FAILURE_SENTENCES[code])) problems.push("the message is not this code's");
    if (/shows as "could not be sent"/.test(message) !== recorded) {
      problems.push("what it claims about the row does not match the row");
    }
    if (Object.keys(body).some((key) => !["error", "code"].includes(key))) {
      problems.push("extra fields");
    }
    problems.push(...disclosureProblems(text));
    return problems;
  }

  const missed: string[] = [];
  for (const one of broken) {
    const problems = await problemsWithFailure(one.answer, one.code, one.recorded);
    if (problems.length === 0) missed.push(one.name);
  }

  // The count is asserted rather than described, so deleting a case shows up here
  // rather than quietly weakening the file -- the argument suspension_test.ts
  // makes about its own seven.
  if (broken.length !== 6) {
    throw new Error(`expected 6 broken failure answers, found ${broken.length} -- was one removed?`);
  }
  if (missed.length > 0) {
    throw new Error(`the failure checks passed ${missed.length} answer(s) that are wrong: ${missed.join("; ")}`);
  }
});

Deno.test("the retry cases REFUSE a verdict that sends a second email", async () => {
  // The mistake, and it is the expensive one: "there is a row, the owner pressed
  // the button, send it again". It gets the failed and stale cases right, which is
  // why a test that only tried those would pass it.
  function brokenVerdict(row: { status?: unknown; created_at?: unknown }) {
    if (row?.status === "failed") return { retry: true, why: "failed" };
    return { retry: true, why: "stale" };
  }

  // And the opposite mistake: never retry, so the button does nothing.
  function timidVerdict(_row: { status?: unknown; created_at?: unknown }) {
    return { retry: false, why: "sent" };
  }

  // Counted over the cases each mistake is meant to be caught by, not over all of
  // them: a mistake caught by some unrelated case is not evidence that the case
  // which matters would catch it.
  const refusing = RETRY_CASES.filter((c) => c.expect.retry === false);
  const retrying = RETRY_CASES.filter((c) => c.expect.retry === true);

  // The numbers are asserted rather than described, so deleting a case shows up
  // here rather than quietly weakening the file. Ten cases must refuse a retry --
  // two rows that say 'sent', two queued inside the window, three whose clock
  // cannot be read or points the wrong way, and three whose status is not one of
  // the three allowed words -- and four must offer one.
  if (refusing.length !== 10 || retrying.length !== 4) {
    throw new Error(
      `expected 10 refusing cases and 4 retrying ones, found ${refusing.length} and ` +
        `${retrying.length} -- was one removed?`,
    );
  }

  const eagerMissed = refusing.filter((c) => {
    const got = brokenVerdict(c.row);
    return got.retry === c.expect.retry && got.why === c.expect.why;
  });
  if (eagerMissed.length > 0) {
    throw new Error(
      `a verdict that retries everything was NOT caught by ${eagerMissed.length} of the ` +
        `${refusing.length} refusing cases: ${eagerMissed.map((c) => c.name).join("; ")}. That is ` +
        `the mistake that sends a second email to a real person`,
    );
  }

  const timidMissed = retrying.filter((c) => {
    const got = timidVerdict(c.row);
    return got.retry === c.expect.retry && got.why === c.expect.why;
  });
  if (timidMissed.length > 0) {
    throw new Error(
      `a verdict that never retries was NOT caught by ${timidMissed.length} of the ` +
        `${retrying.length} retrying cases: ${timidMissed.map((c) => c.name).join("; ")}. The Try ` +
        `again button could be dead and these tests would pass`,
    );
  }
});

// HOW TO RUN IT, from the repository root. Needs Deno.
//
//   deno test --no-lock --allow-env --allow-read=supabase/migrations --config supabase/functions/invite-member/deno.json supabase/functions/_tests/invitation_status_test.ts
//
// WHY --no-lock, and WHY --allow-env: both for the reasons spelled out at the
// bottom of suspension_test.ts beside this file. In short: without --no-lock Deno
// writes a deno.lock into the function folder named by --config, which is a change
// to what gets deployed arriving as a side effect of running a test; and
// --allow-env is needed because importing the function pulls in
// npm:@supabase/server, whose dependency probes environment variables at import
// time. Nothing here reads, sets, prints or needs a secret.
//
// WHY --allow-read, which suspension_test.ts does not need: one test reads
// supabase/migrations/20261006095847_invitation_status.sql, so that the fixed list
// of failure codes is compared with the check constraint that enforces it rather
// than with a second copy of itself. It is narrowed to that one directory, so the
// run cannot read a .env file, a key or anything else on the disk.
//
// WHY THAT --config: the three function folders' deno.json files are identical
// (suspension_test.ts records the matching hashes), and the repository root has
// none, so without --config the bare specifiers do not resolve. This file names
// invite-member's because invite-member is what it tests.
//
// `deno test` type-checks what it runs, so this command also type-checks
// invite-member. The output of the runs that accompanied this file -- including
// the run where it FAILED first, against a function that claimed 'sent' -- is in
// evidence/build-it-18-invitation-status-function.md.
//
// NOTHING RUNS THIS IN CI, and that is said here rather than left to be noticed.
// .github/workflows/ci.yml's `functions-test` job names one file --
// supabase/functions/_tests/suspension_test.ts -- so this file is not picked up,
// and issue #166 says not to change that workflow beyond test counts. It therefore
// runs only when somebody runs it. Filed as issue #167, which names the one-line
// change that would fix it.
