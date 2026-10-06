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
//   resetForRetry         takes the write as a FUNCTION that performs it, the same
//                         shape checkSuspension uses, so a test can hand it a write
//                         that touches no row -- and can read the filter it was
//                         given rather than reading `.eq()` calls by eye
//   resetFailureAnswer    takes a verdict and returns the Response built from it
//
// So there is no network, no Supabase project, no account and no email service
// involved, and nothing here proves anything about what the DEPLOYED function
// does. That is what scripts/staging/build-it-18-invitation-status-checks.mjs is
// for, run by the owner once the function is deployed to staging.
//
// THE SEVEN THINGS IT ASKS:
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
//   7. TWO RETRIES AT ONCE DO NOT BOTH SEND. The write that hands an invitation a
//      new link is pinned to the state the decision was made on -- the row's own
//      status AND its expiry, which is replaced on every retry and so works as a
//      version even when the status does not change. The loser's write touches no
//      row, and is answered "that invitation is being sent now" rather than with a
//      second email and a first link that is dead on arrival.
//
// AND IT CHECKS THAT IT CAN FAIL. The last section writes out the mistakes this
// file exists to catch -- an answer that reports 'sent' from a row that says
// 'queued', a 502 that quotes the email service, a verdict that sends a second
// email to somebody who already has the first, a retry write pinned to the row's
// id alone -- and requires the checks above to refuse every one of them. A check
// that cannot fail reports a pass and means nothing.
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
  resetFailureAnswer,
  resetForRetry,
  type ResetVerdict,
  type RetryApply,
  type RetryFilter,
  type RetryPatch,
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
// 7. A retry takes over the row, or loses the race -- never both
// ---------------------------------------------------------------------------
//
// THE RACE, written out, because it is the reason this section exists. Two Try
// again presses at the same moment -- a double click, two tabs, a phone and a
// laptop -- both read the same row, both get `retry: true` out of `retryVerdict`
// above, and both reach the write that hands the invitation a new link. If that
// write is filtered on the row's id alone, BOTH SUCCEED: each rotates the token,
// each sends an email, and the first email's link is dead on arrival, because the
// second write replaced the hash it pointed at. The person gets two messages and
// the older one -- the one at the top of a threaded inbox, the one they are most
// likely to open -- does nothing at all.
//
// So the write is a compare-and-set: the row's own `status` and `expires_at` go
// into the filter beside its id, and the loser's write matches no row. `expires_at`
// is what makes it work when the status does not change, which is the case nobody
// thinks of -- a stale 'queued' row retried is 'queued' again, so a filter on
// status alone would let the second request straight through.
//
// These tests hand `resetForRetry` an `apply` that RECORDS what it was asked to
// write and to what, so what is asserted below is the filter the database is
// actually given -- not a list of `.eq()` calls read by eye.

const RETRY_ROW = {
  id: MADE_UP_ID,
  status: "failed",
  expires_at: "2026-10-09T09:00:00.000Z",
};
const FRESH_EXPIRY = "2026-10-13T09:00:00.000Z";
const NEW_TOKEN_HASH = "1".repeat(64);

// An `apply` that answers however the case wants, and keeps what it was handed.
function recordingApply(answer: { data: unknown; error: { code?: string } | null }) {
  const seen: Array<{ patch: RetryPatch; filter: RetryFilter }> = [];
  return {
    seen,
    apply: (patch: RetryPatch, filter: RetryFilter) => {
      seen.push({ patch, filter });
      return Promise.resolve(answer);
    },
  };
}

// One row back, shaped the way the update's `.select()` asks for it.
const oneRowBack = {
  data: [{ id: MADE_UP_ID, email: MADE_UP_EMAIL, expires_at: FRESH_EXPIRY, status: "queued" }],
  error: null,
};

// Say what is wrong with a retry's filter, rather than only that something is.
//
// Lifted out of the test below so the "can these tests fail?" section can put a
// broken `resetForRetry` through the SAME judgement, rather than a second copy of
// it that could drift and stop catching anything.
function retryFilterProblems(filter: RetryFilter): string[] {
  const problems: string[] = [];
  const keys = Object.keys(filter).sort();

  // THE ASSERTION THE WHOLE SECTION IS FOR. Three keys, not one.
  if (keys.join(",") !== "expires_at,id,status") {
    problems.push(
      `the filter pins ${keys.join(", ") || "nothing"} -- expected id, status and expires_at.` +
        ` Pinned on the id alone, two Try again presses both succeed and the first email's link` +
        ` is dead on arrival`,
    );
  }
  if (filter.id !== RETRY_ROW.id) {
    problems.push(`filter.id is ${JSON.stringify(filter.id)}`);
  }
  // Read off the ROW, not off the patch: pinning to the value being written would
  // match nothing, and pinning to anything else is not a compare-and-set.
  if (filter.status !== RETRY_ROW.status) {
    problems.push(
      `filter.status is ${JSON.stringify(filter.status)}, expected the row's own` +
        ` ${JSON.stringify(RETRY_ROW.status)}`,
    );
  }
  if (filter.expires_at !== RETRY_ROW.expires_at) {
    problems.push(
      `filter.expires_at is ${JSON.stringify(filter.expires_at)}, expected the row's own` +
        ` ${JSON.stringify(RETRY_ROW.expires_at)} -- which is the version, because it is replaced` +
        ` on every retry even when the status is not`,
    );
  }
  return problems;
}

Deno.test("resetForRetry: the write is pinned to the row's state, not to its id alone", async () => {
  const recorder = recordingApply(oneRowBack);
  await resetForRetry({
    row: RETRY_ROW,
    tokenHash: NEW_TOKEN_HASH,
    freshExpiry: FRESH_EXPIRY,
    apply: recorder.apply,
  });

  if (recorder.seen.length !== 1) {
    throw new Error(`the write was attempted ${recorder.seen.length} times, expected once`);
  }

  const problems = retryFilterProblems(recorder.seen[0].filter);
  if (problems.length > 0) {
    throw new Error(`the retry's filter is wrong: ${problems.join("; ")}`);
  }
});

Deno.test("resetForRetry: what it writes is a new token, queued, no code and a fresh expiry", async () => {
  const recorder = recordingApply(oneRowBack);
  await resetForRetry({
    row: RETRY_ROW,
    tokenHash: NEW_TOKEN_HASH,
    freshExpiry: FRESH_EXPIRY,
    apply: recorder.apply,
  });

  const patch = recorder.seen[0].patch as Record<string, unknown>;
  const problems: string[] = [];

  if (patch.token_hash !== NEW_TOKEN_HASH) {
    problems.push("it does not rotate the token hash, so the old link would still work");
  }
  if (patch.status !== "queued") {
    problems.push(`status is ${JSON.stringify(patch.status)}, expected "queued"`);
  }
  // The check constraint refuses a failure code on a row that is not 'failed', so
  // this is not cosmetic: leaving the old code would make the write fail with 23514.
  if (patch.failure_code !== "") {
    problems.push(`failure_code is ${JSON.stringify(patch.failure_code)}, expected ""`);
  }
  if (patch.expires_at !== FRESH_EXPIRY) {
    problems.push(
      "it does not move the expiry, so the email's promise of 7 days would be false on an old row",
    );
  }
  // created_at must NOT be written: "when was this person first invited" is a fact
  // a retry does not change.
  const allowed = ["token_hash", "status", "failure_code", "expires_at"];
  const extra = Object.keys(patch).filter((key) => !allowed.includes(key));
  if (extra.length > 0) {
    problems.push(`it writes fields it should not: ${extra.join(", ")}`);
  }

  if (problems.length > 0) {
    throw new Error(`the retry's patch is wrong: ${problems.join("; ")}`);
  }
});

const RESET_CASES: Array<{
  name: string;
  answer: () => { data: unknown; error: { code?: string } | null };
  throws?: boolean;
  rejects?: boolean;
  expect: ResetVerdict;
}> = [
  {
    name: "one row came back: the retry has the row, and the answer is built from it",
    answer: () => oneRowBack,
    expect: {
      ok: true,
      row: { id: MADE_UP_ID, email: MADE_UP_EMAIL, expires_at: FRESH_EXPIRY },
    },
  },
  {
    name:
      "NO ROW CAME BACK: another request got there first, which is a lost race and NOT an error",
    answer: () => ({ data: [], error: null }),
    expect: { ok: false, why: "lost" },
  },
  {
    name: "the write failed with a Postgres code",
    // 23514 is check_violation, which is what writing a failure code onto a row
    // that is not 'failed' would produce.
    answer: () => ({ data: null, error: { code: "23514" } }),
    expect: { ok: false, why: "error", code: "23514" },
  },
  {
    name: "the write failed with no code at all",
    answer: () => ({ data: null, error: {} }),
    expect: { ok: false, why: "error" },
  },
  {
    name: "the write threw",
    answer: () => ({ data: null, error: null }),
    throws: true,
    expect: { ok: false, why: "error" },
  },
  {
    name: "the write's promise rejected",
    answer: () => ({ data: null, error: null }),
    rejects: true,
    expect: { ok: false, why: "error" },
  },
  {
    name: "no error, but no list of rows either -- an unknown, not a lost race",
    answer: () => ({ data: null, error: null }),
    expect: { ok: false, why: "unexpected", rows: -1 },
  },
  {
    name: "two rows, which the primary key makes impossible",
    answer: () => ({
      data: [
        { id: MADE_UP_ID, email: MADE_UP_EMAIL, expires_at: FRESH_EXPIRY },
        { id: MADE_UP_ID, email: MADE_UP_EMAIL, expires_at: FRESH_EXPIRY },
      ],
      error: null,
    }),
    expect: { ok: false, why: "unexpected", rows: 2 },
  },
  {
    name: "one row, but it came back without the address the answer needs",
    answer: () => ({ data: [{ id: MADE_UP_ID, expires_at: FRESH_EXPIRY }], error: null }),
    expect: { ok: false, why: "unexpected", rows: 1 },
  },
];

for (const testCase of RESET_CASES) {
  Deno.test(`resetForRetry: ${testCase.name}`, async () => {
    const apply = () => {
      if (testCase.throws) throw new Error("the client itself fell over");
      if (testCase.rejects) return Promise.reject(new Error("the network went away"));
      return Promise.resolve(testCase.answer());
    };

    const got = await resetForRetry({
      row: RETRY_ROW,
      tokenHash: NEW_TOKEN_HASH,
      freshExpiry: FRESH_EXPIRY,
      apply,
    });

    if (JSON.stringify(got) !== JSON.stringify(testCase.expect)) {
      throw new Error(
        `resetForRetry answered ${JSON.stringify(got)}, expected ` +
          `${JSON.stringify(testCase.expect)} -- for "${testCase.name}"`,
      );
    }
  });
}

// And what the loser is actually told. The verdict is a decision; this is the
// response built from it, and the two are not the same thing -- the gap between
// them is where suspension_test.ts's one staging failure lived.

Deno.test("resetFailureAnswer: a lost race is the 409 'being sent now', not a failure", async () => {
  const answer = resetFailureAnswer({ ok: false, why: "lost" }, "23505");
  const problems: string[] = [];

  if (answer.status !== 409) {
    problems.push(
      `the status is ${answer.status}, expected 409. A 500 here would tell the owner something` +
        ` broke, when in fact their first press is sending the email right now`,
    );
  }

  const { text, body } = await readBody(answer);
  if (!body) {
    problems.push(`the body is not a JSON object: ${text}`);
  } else {
    if (body.code !== "23505") {
      problems.push(`code is ${JSON.stringify(body.code)}, expected the insert's "23505"`);
    }
    const message = typeof body.error === "string" ? body.error : "";
    // It must be the SAME sentence a recently-queued invitation gets, because it is
    // the same fact: something is being sent for this address right now.
    const expected = await stillSendingAnswer("23505").json();
    if (message !== expected.error) {
      problems.push(
        `the message is ${JSON.stringify(message)}, and a recently-queued invitation gets` +
          ` ${JSON.stringify(expected.error)} -- one fact should not have two wordings`,
      );
    }
    if (message === UNCHANGED_409) {
      problems.push("it sends the already-waiting sentence, which is a different fact");
    }
  }
  problems.push(...disclosureProblems(text));

  if (problems.length > 0) {
    throw new Error(`the lost-race answer is wrong: ${problems.join("; ")}`);
  }
});

const RESET_FAILURE_ANSWERS: Array<{
  name: string;
  verdict: Extract<ResetVerdict, { ok: false }>;
  status: number;
  mustSay?: string;
}> = [
  {
    name: "a failed write is a 500 carrying its Postgres code",
    verdict: { ok: false, why: "error", code: "23514" },
    status: 500,
  },
  {
    name: "a failed write with no code is still a 500",
    verdict: { ok: false, why: "error" },
    status: 500,
  },
  {
    name: "two rows back is a 500 that names the count",
    verdict: { ok: false, why: "unexpected", rows: 2 },
    status: 500,
    mustSay: "2 rows",
  },
  {
    name: "no list of rows at all is a 500 that says so rather than printing a negative number",
    verdict: { ok: false, why: "unexpected", rows: -1 },
    status: 500,
    mustSay: "no list of rows",
  },
];

for (const testCase of RESET_FAILURE_ANSWERS) {
  Deno.test(`resetFailureAnswer: ${testCase.name}`, async () => {
    const answer = resetFailureAnswer(testCase.verdict, "23505");
    const problems: string[] = [];

    if (answer.status !== testCase.status) {
      problems.push(`the status is ${answer.status}, expected ${testCase.status}`);
    }

    const { text, body } = await readBody(answer);
    if (!body) {
      problems.push(`the body is not a JSON object: ${text}`);
    } else {
      const message = typeof body.error === "string" ? body.error : "";
      if (message.trim() === "") problems.push("there is no message");
      if (testCase.mustSay && !message.includes(testCase.mustSay)) {
        problems.push(
          `the message does not contain ${JSON.stringify(testCase.mustSay)}: ${JSON.stringify(message)}`,
        );
      }
      // Nothing was sent on any of these paths, and the message must say so -- the
      // owner's next move depends on it.
      if (!message.includes("Nothing was sent") && !message.includes("nothing was sent")) {
        problems.push("the message does not say that nothing was sent");
      }
      const expectedCode =
        testCase.verdict.why === "error" ? testCase.verdict.code : undefined;
      if (body.code !== expectedCode) {
        problems.push(
          `code is ${JSON.stringify(body.code)}, expected ${JSON.stringify(expectedCode)}`,
        );
      }
      const extra = Object.keys(body).filter((key) => !["error", "code"].includes(key));
      if (extra.length > 0) problems.push(`it carries fields it should not: ${extra.join(", ")}`);
    }
    problems.push(...disclosureProblems(text));

    if (problems.length > 0) {
      throw new Error(`resetFailureAnswer is wrong for "${testCase.name}": ${problems.join("; ")}`);
    }
  });
}

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

Deno.test("the retry-reset checks REFUSE a write that is not a compare-and-set", async () => {
  // THE MISTAKE, AND IT IS THE ONE THIS PULL REQUEST WAS REVIEWED FOR. It is what
  // anybody would write: find the row by its id and update it. Every ordinary case
  // passes -- one row back, an error, a thrown client -- and it is wrong only when
  // two requests arrive at once, which is exactly when nobody is testing.
  async function brokenResetForRetry(args: {
    row: { id: string; status: string; expires_at: string };
    tokenHash: string;
    freshExpiry: string;
    apply: RetryApply;
  }): Promise<ResetVerdict> {
    const patch: RetryPatch = {
      token_hash: args.tokenHash,
      status: "queued",
      failure_code: "",
      expires_at: args.freshExpiry,
    };
    // The id alone. No compare, so no set to lose.
    const answer = await args.apply(patch, { id: args.row.id });
    if (answer?.error) return { ok: false, why: "error", code: answer.error.code };
    if (!Array.isArray(answer?.data)) return { ok: false, why: "unexpected", rows: -1 };
    if (answer.data.length !== 1) {
      // And the second half of the mistake: a write that touched nothing reads as
      // something broken, so the loser of a race is told to try again -- which is
      // the one thing it must not be told.
      return { ok: false, why: "unexpected", rows: answer.data.length };
    }
    const only = answer.data[0] as { id: string; email: string; expires_at: string };
    return { ok: true, row: { id: only.id, email: only.email, expires_at: only.expires_at } };
  }

  const missed: string[] = [];

  // 1. The filter check, run through the SAME judgement the real one uses.
  const recorder = recordingApply(oneRowBack);
  await brokenResetForRetry({
    row: RETRY_ROW,
    tokenHash: NEW_TOKEN_HASH,
    freshExpiry: FRESH_EXPIRY,
    apply: recorder.apply,
  });
  if (retryFilterProblems(recorder.seen[0].filter).length === 0) {
    missed.push("the filter check passed a write pinned to the id alone");
  }

  // 2. The lost-race case.
  const lost = await brokenResetForRetry({
    row: RETRY_ROW,
    tokenHash: NEW_TOKEN_HASH,
    freshExpiry: FRESH_EXPIRY,
    apply: () => Promise.resolve({ data: [], error: null }),
  });
  if (lost.ok !== false || lost.why !== "unexpected") {
    throw new Error(
      `the broken copy is not broken in the way this test describes: it answered ${JSON.stringify(lost)}`,
    );
  }
  const lostCase = RESET_CASES.find((c) => c.expect.ok === false && c.expect.why === "lost");
  if (!lostCase) {
    throw new Error("there is no lost-race case left in RESET_CASES -- was it removed?");
  }
  if (JSON.stringify(lost) === JSON.stringify(lostCase.expect)) {
    missed.push("the lost-race case passed a copy that reports a lost race as something broken");
  }

  // 3. And the ordinary cases must still pass it, or these two checks are catching
  //    something other than the mistake they name.
  const ordinary = await brokenResetForRetry({
    row: RETRY_ROW,
    tokenHash: NEW_TOKEN_HASH,
    freshExpiry: FRESH_EXPIRY,
    apply: () => Promise.resolve(oneRowBack),
  });
  if (!ordinary.ok) {
    throw new Error(
      "the broken copy fails even the ordinary one-row case, so it is not the plausible mistake" +
        " this test is about",
    );
  }

  if (missed.length > 0) {
    throw new Error(
      `${missed.length} check(s) passed a write that is not a compare-and-set: ${missed.join("; ")}`,
    );
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
// CI runs the whole folder in one go instead, which also type-checks and runs
// suspension_test.ts beside this file:
//
//   deno test --no-lock --allow-env --allow-read=supabase/migrations --config supabase/functions/create-team/deno.json supabase/functions/_tests
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
// CI RUNS THIS, as of the coach's review of PR #172 (issue #167). The
// `functions-test` job in .github/workflows/ci.yml used to name
// supabase/functions/_tests/suspension_test.ts by path, so this file was picked up
// by nothing and could not fail a pull request. It now names the FOLDER, with
// --allow-read=supabase/migrations added for the test above that reads the
// migration, and its EXPECTED_FUNCTION_TESTS floor counts both files.
//
// What that means for anybody adding a test here: nothing. A new case raises the
// count, and the floor is a floor. But a test DELETED from this file lowers the
// count below the floor and turns that job red, which is the point of it.
