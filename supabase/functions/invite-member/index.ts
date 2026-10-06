// invite-member -- the only way an invitation gets created.
//
// docs/plan.md, feature 3: "Invite people to a team by email: an invitation
// expires after 7 days, and a team may have at most 20 pending."
//
// The invitations table has NO insert policy
// (supabase/migrations/20260930193813_create_invitations.sql), so the app's
// publishable key cannot write to it. This function holds the secret key and is
// the single place the ownership check and the 20-pending limit happen.
//
// WHERE THE KEYS COME FROM. Nowhere in this repository. SUPABASE_URL and
// SUPABASE_SECRET_KEYS are pre-populated in the function's own settings on
// Supabase and withSupabase reads them; EMAIL_API_KEY, EMAIL_FROM, APP_URL and
// the delivery settings are set by the owner in the same place, per project.
// No value is ever logged -- see the note at the end of this file.
//
// Written against the official guides:
//   https://supabase.com/docs/guides/functions/quickstart
//   https://supabase.com/docs/guides/functions/auth
//   https://supabase.com/docs/guides/ai-tools/ai-prompts/edge-functions
//   https://supabase.com/docs/reference/server/types-userclaims
// and Resend's current send-email reference:
//   https://resend.com/docs/api-reference/emails/send-email
//
// Both imports are pinned to exact versions in deno.json (rule 17, Lesson A4).
//
// DEPLOYED TO STAGING AND TO PRODUCTION. Staging first, by the owner from their
// own terminal; production on the merge of PR #44, by the `deploy-functions` job
// in .github/workflows/migrate-production.yml. Both are recorded in
// evidence/invitations.md -> "What is deployed where", written 2026-10-01, along
// with what was observed in each environment.
//
// This line used to say the file had never been pushed to any project, which was
// untrue from the moment PR #44 merged (issue #111). Read what follows as code
// that is running in production: it is.
//
// WITH ONE EXCEPTION, as of 5 October 2026: THE SUSPENDED-ACCOUNT CHECK BELOW IS
// ON STAGING AND NOT IN PRODUCTION. It arrived with issue #133, part B of Build
// it 16 step 5. The owner deployed this branch's three functions to staging and
// ran scripts/staging/build-it-16-suspend-checks.mjs --expect-suspended with the
// test account Bob's account_status row in place: 14 PASS, 1 FAIL, and the one
// failure was in accept-invite's refusal body, not in this function.
//
// So a suspended person can no longer invite people on STAGING. PRODUCTION is
// still running this file without the check, because code reaches production only
// through a pull request the owner merges (rule 19) -- and the assistant has
// deployed nothing anywhere. evidence/build-it-16-suspend-functions.md records
// what the staging run showed and what is still unproved.
//
// AND A SECOND EXCEPTION, as of 6 October 2026, WHICH IS NOT DEPLOYED ANYWHERE AT
// ALL. The status writing, the retry path and the failure codes below arrived with
// issue #166 (Build it 18 part 2b). They are in this repository and in NO Supabase
// project: not staging, not production. The owner deploys to staging; production
// follows a merge, through .github/workflows/migrate-production.yml.
//
// Until that staging deploy happens, what is running out there is the version
// that DELETES an invitation whose email failed. So: a row in staging or
// production at status 'queued' was put there by the migration's defaults and the
// old code, and no deployed function has ever written 'sent' or 'failed'. The
// two rows the coach read on 6 October say 'sent' because the migration's backfill
// said so, not because a function did.
//
// scripts/staging/build-it-18-invitation-status-checks.mjs is written to be run
// BEFORE and AFTER that deploy, and the before-run is expected to fail: that is
// how the pair of runs shows the deploy is what changed the behaviour.

// Setup type definitions for built-in Supabase Runtime APIs
import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";

const MAX_PENDING_PER_TEAM = 20;
const TOKEN_BYTES = 32; // 32 random bytes = 256 bits. See makeToken below.

// docs/plan.md, feature 3: "an invitation expires after 7 days".
//
// THE DATABASE IS WHAT NORMALLY DECIDES THIS, and that has not changed:
// invitations.expires_at defaults to `now() + interval '7 days'`, so an insert
// from here does not mention it. This number is used in exactly one place -- a
// retry, which replaces the link on a row that already exists, and so has to
// restate the window rather than inherit a default it is not triggering. See the
// retry block for why the window starts again.
const INVITATION_DAYS = 7;

// The shape Postgres accepts for a uuid column: 8-4-4-4-12 hex digits.
//
// Deliberately a shape check and nothing cleverer. It does not care which UUID
// version or variant the value claims to be -- gen_random_uuid() produces v4,
// but rejecting anything else here would be inventing a rule the database does
// not have. The only job is to stop a value that cannot be cast at all.
const UUID_PATTERN =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

function fail(message: string, status: number, code?: string) {
  // One shape for every failure, so the page can always read `error`.
  return Response.json({ error: message, code }, { status });
}

// ---------------------------------------------------------------------------
// An invitation's status, and the four reasons a send can fail (issue #166)
// ---------------------------------------------------------------------------
//
// docs/plan.md, "Invitation status": "queued when the row is created, then sent
// or failed. On a failure, a short reason code and nothing more -- never the
// email service's full reply, which can quote the address, the subject and the
// message."
//
// THE THREE WORDS AND THE FOUR CODES ARE THE MIGRATION'S, NOT THIS FILE'S.
// 20261006095847_invitation_status.sql has two check constraints,
// invitations_status_allowed and invitations_failure_code_allowed, and they are
// what decides: a value not on these lists is refused by the database with
// 23514, whatever this file believes. The copies here exist so this function can
// name a value rather than spell a string at four call sites, and they are
// written in the same order as the constraint so the two can be read side by
// side. Adding a code needs a new migration, which is the point of a fixed list.
export const INVITATION_STATUSES = ["queued", "sent", "failed"] as const;
export type InvitationStatus = (typeof INVITATION_STATUSES)[number];

export const FAILURE_CODES = [
  "not_configured",
  "unreachable",
  "refused",
  "unconfirmed",
] as const;
export type FailureCode = (typeof FAILURE_CODES)[number];

// One fixed sentence per code, and every one of them is OUR words.
//
// THIS IS THE RULE THE CODES EXIST FOR. Nothing the email service says reaches
// this map, a stored row, a response body or a log line -- not its message, not
// its field names, not the body it answered with. Its reply can quote the
// address, the subject and the text of the message, all three of which are
// personal data under docs/plan.md's appendix, and none of which has any
// business on a screen or in a log.
//
// Note what is also absent: the HTTP status the service answered with. It is not
// "its own words", so it would not break the rule above -- it is left out
// because it answers no question the owner can act on. Resend keeps its own
// sending log for 30 days (docs/plan.md's appendix), and that is the place to
// read what actually happened to one message.
export const FAILURE_SENTENCES: Record<FailureCode, string> = {
  not_configured: "This environment is not set up to send invitation email.",
  unreachable: "The email service could not be reached.",
  // "would not accept" rather than "refused", which is the word the code itself
  // uses. A sentence that repeats its own code reads as a machine value dressed
  // up as English, and supabase/functions/_tests/invitation_status_test.ts refuses
  // one -- it caught this sentence on its first run, when it said "The email
  // service refused the message."
  refused: "The email service would not accept the message.",
  unconfirmed:
    "The email service answered, but did not confirm that an email was created.",
};

// HOW LONG A ROW MAY SIT AT 'queued' BEFORE IT COUNTS AS NEVER SENT.
//
// Why this exists at all: a row is written as 'queued' and the status is written
// again after the email service answers, so a function that STOPS between those
// two writes -- a crash, a timeout, a shut-down isolate -- leaves a row at
// 'queued' that nothing will ever move. Nothing in the data distinguishes it
// from a send that is in flight this second, so the only thing that can tell
// them apart is the clock.
//
// WHY FIFTEEN MINUTES, and the number is chosen rather than read off a limits
// page:
//
//   * it is far longer than this function can possibly still be running. The
//     only thing it waits on between the two writes is one HTTP request to the
//     email service, and the platform ends an invocation long before fifteen
//     minutes. THE EXACT WALL-CLOCK LIMIT IS UNVERIFIED -- it was not read in
//     the session that wrote this line, so no number for it is written here.
//     https://supabase.com/docs/guides/functions/limits is the page to read, and
//     issue #168 holds the question;
//   * it is far shorter than the 7 days an invitation lives, so a stuck row
//     becomes retryable with almost all of its life left rather than at the end
//     of it;
//   * and it is long enough that an owner pressing the button twice, or opening
//     two tabs, cannot produce a retry while the first send is still happening.
//     That matters more than tightness in the other direction: a retry sends a
//     second email to a real person, and the cost of waiting fifteen minutes is
//     that the screen says "sending" for fifteen minutes.
//
// web/src/lib/teams.ts has the same number, so the Try again button appears at
// the same moment the function would honour it. This copy is the one that
// decides.
export const STALE_QUEUED_MINUTES = 15;

// May this invitation be sent again, given the row that is already there?
//
// Pure, and exported, so supabase/functions/_tests/invitation_status_test.ts
// runs THIS decision rather than a copy of it -- the same argument
// checkSuspension's export rests on.
//
// `nowMs` is passed in rather than read from the clock here, so a test can place
// a row either side of the window without waiting.
export type RetryVerdict =
  | { retry: true; why: "failed" | "stale" }
  | { retry: false; why: "sent" | "sending" | "unknown" };

export function retryVerdict(
  row: { status?: unknown; created_at?: unknown },
  nowMs: number,
): RetryVerdict {
  const status = row?.status;

  // The one the owner asks for most: the send is known to have failed, so the
  // old link was never delivered and nobody is waiting on it.
  if (status === "failed") return { retry: true, why: "failed" };

  // Known sent. Refused, and this is the refusal issue #166 requires to be
  // unchanged: a waiting invitation whose status is sent still answers 409 with
  // the Postgres code 23505.
  if (status === "sent") return { retry: false, why: "sent" };

  if (status === "queued") {
    const createdAt =
      typeof row.created_at === "string" ? Date.parse(row.created_at) : NaN;

    // AN UNREADABLE created_at DOES NOT BECOME A RETRY. If the clock cannot be
    // read, how long this row has been waiting is not known -- and an unknown is
    // not "long enough", for the same reason an unknown is not a zero everywhere
    // else in this file. Refusing sends no second email; guessing might.
    if (Number.isNaN(createdAt)) return { retry: false, why: "sending" };

    const stale = nowMs - createdAt >= STALE_QUEUED_MINUTES * 60_000;
    return stale ? { retry: true, why: "stale" } : { retry: false, why: "sending" };
  }

  // Not one of the three words. The check constraint makes this unreachable
  // through the database, so arriving here means the row was read wrongly rather
  // than written wrongly -- and the safe answer to "I do not recognise this" is
  // the refusal that was here before any of this existed.
  return { retry: false, why: "unknown" };
}

// THE 409 THAT MUST NOT CHANGE, exported so the test reads the body this
// function sends rather than a body it writes out for itself. Issue #166: "a
// waiting invitation whose status is sent still answers 409 with code 23505",
// and the sentence is the one this function has sent since it was written.
export function alreadyWaitingAnswer(code?: string): Response {
  return fail(
    "That person already has an invitation waiting for this team.",
    409,
    code,
  );
}

// The other two refusals a live row can produce, both 409 and both carrying the
// same Postgres code, because in both cases that code is the real one the
// database answered the insert with.
//
// They are separate sentences rather than the one above because they are
// separate facts, and the owner can act on the difference: "wait" is not "press
// the button". Neither existed as a distinguishable case before this change --
// every row in the table was either accepted, expired or sent -- so this adds
// wording where there was none rather than altering the refusal above.
export function stillSendingAnswer(code?: string): Response {
  return fail(
    `That invitation is being sent now. Give it a few minutes, and the team's ` +
      `page will say whether it went.`,
    409,
    code,
  );
}

// The answer for a send that did not happen, with the invitation left behind so
// the owner can see it and ask again.
//
// `recorded` is whether the row now says 'failed'. The distinction is the whole
// point of this builder: issue #166 says what the function answers must match
// what it stored, so when the status write itself failed this must NOT claim the
// invitation is marked as failed -- the owner will see it as still sending.
//
// 502 when the row was marked, 500 when it was not: the same pairing this
// function used before, where a clean upstream failure was 502 and one that left
// the database in a state nobody asked for was 500.
export function sendFailureAnswer(args: {
  code: FailureCode;
  recorded: boolean;
}): Response {
  const sentence = FAILURE_SENTENCES[args.code];
  if (args.recorded) {
    return fail(
      `The invitation email could not be sent. ${sentence} The invitation is ` +
        `saved and shows as "could not be sent", so you can ask again.`,
      502,
      args.code,
    );
  }
  return fail(
    `The invitation email could not be sent. ${sentence} We could not record ` +
      `that either, so the invitation may still show as "sending". Please check ` +
      `the team's invitations before asking again.`,
    500,
    args.code,
  );
}

// The answer for an invitation whose email went.
//
// `status` is read back from the row rather than assumed, which is the other
// half of "what the function answers must match what it stored". When the status
// write failed it is still 'queued', and this says 'queued' -- the email went,
// and the row does not know it yet.
//
// 201 FOR A RETRY TOO, and that is a decision rather than an oversight. Nothing
// is created by a retry: the row was already there, and its token_hash and
// expires_at are replaced in place. 201 is still the honest answer to what the
// caller asked for -- there is now a pending invitation whose link has just been
// emailed -- and `retried` says which of the two happened, so no caller has to
// infer it from a status code. The alternative, 200, would also have broken
// web/tests/access-rules.test.mjs, which accepts 201 or 409 from this function
// and which rule 20 does not allow to be edited to suit a change here.
export function invitationAnswer(args: {
  id: string;
  email: string;
  expires_at: string;
  status: InvitationStatus;
  redirected: boolean;
  retried: boolean;
}): Response {
  return Response.json(
    {
      invitation: {
        id: args.id,
        email: args.email,
        expires_at: args.expires_at,
        // One of the three words, and never a failure code: this builder is only
        // ever reached when the email went.
        status: args.status,
      },
      // True when the email went to the test inbox instead of the invited
      // person, so a staging tester is not left wondering.
      redirected: args.redirected,
      // True when this replaced the link on an invitation that was already
      // there, rather than creating one.
      retried: args.retried,
    },
    { status: 201 },
  );
}

// ---------------------------------------------------------------------------
// The suspended-account check (issue #133)
// ---------------------------------------------------------------------------
//
// Identical to create-team's and accept-invite's, on purpose and for the same
// reason hashToken is identical to accept-invite's: one question, asked the same
// way in all three places, so that if one ever changes the others must change
// with it. supabase/functions/_tests/suspension_test.ts imports all three and asserts
// they agree, so a copy that drifts is a failing test rather than a hole.
//
// WHY THIS IS IN TYPESCRIPT AT ALL, when suspension is a database feature.
// 20261004114313_suspend_accounts.sql adds one restrictive policy per table, and
// those policies decide for the app's own users. They do NOT decide here: this
// function reads and writes with ctx.supabaseAdmin, which connects as
// `service_role`, and the Supabase roles page says of that role, "This role is
// used by the API (PostgREST) to bypass Row Level Security." So every rule in
// that migration is skipped on this path.
//
// WHAT WOULD HAPPEN WITHOUT IT, which is worse here than in create-team: a
// suspended owner's invitation would occupy one of the team's 20 pending slots
// and WOULD SEND MAIL to a real address. That is why the call below sits before
// decideDelivery and before every insert.
//
// AND IT MUST NOT CALL public.is_active(). That function answers about
// auth.uid(), and an admin connection has no signed-in user -- so auth.uid() is
// null and the answer is false for EVERY caller. It would not error; this
// function would simply refuse everybody, silently. Measured as `service_role`
// with no session: `is_active()` returns `f`
// (evidence/build-it-16-suspend-accounts.md section 5, step M7). So the table is
// read by user id instead, which is what the migration's `grant select on table
// public.account_status to service_role` is for, and which step M8 confirms
// works with no session.
//
// WHAT IS NEVER DONE HERE: no insert, update or delete on account_status -- the
// privilege is deliberately not granted, so an attempt would fail with 42501 --
// and the `reason` column is never selected, never returned and never logged.
// docs/plan.md marks it sensitive and says nobody reads it through the app.

// The one code every refusal uses, in all three functions. A caller learns a
// code and nothing else: no reason, no timestamp, no mention of a table.
const SUSPENDED_CODE = "account_suspended";

// Neutral, true, and blaming nothing else. docs/plan.md says this version does
// not decide what a suspended person is told, and issue #134 holds the fuller
// question -- so this says the least it can while still being honest, and it is
// deliberately NOT a message written for another cause.
const SUSPENDED_MESSAGE = "You can't do that at the moment.";

// THE REFUSAL ITSELF, exported so that supabase/functions/_tests/suspension_test.ts
// reads the body THIS function sends rather than a body the test writes out for
// itself. Same argument as the `checkSuspension` export below: a test that spells
// out `{ error, code }` by hand passes whatever the function actually does.
//
// That is not a hypothetical. On 5 October 2026 the owner ran
// scripts/staging/build-it-16-suspend-checks.mjs --expect-suspended against the
// deployed functions and got 14 PASS, 1 FAIL: accept-invite's copy of this call
// sent no `code` at all, because its `fail` takes the reason third and the code
// fourth and the call passed three arguments. Every test in this repository
// passed, because nothing here looked at a body. Now they do.
//
// `fail` here takes (message, status, code), so the body is `{ error, code }`
// with no `reason` field -- right for this function, because only accept-invite's
// caller, the /invite/[token] page, picks its wording from a reason.
export function suspendedRefusal(): Response {
  return fail(SUSPENDED_MESSAGE, 403, SUSPENDED_CODE);
}

// Three answers, not two. "I could not tell" is the one that matters: a read
// that failed does not mean "not suspended". This file already argues that shape
// twice, about its two counts -- "an unknown is not a zero".
export type SuspensionVerdict =
  | { allowed: true }
  | { allowed: false; why: "suspended" }
  | { allowed: false; why: "unknown"; code?: string };

// The read itself is passed IN, as a function that performs it. Two reasons,
// and the second is the one that made this the shape rather than passing the
// client:
//
//   * supabase/functions/_tests/suspension_test.ts can hand this a read that FAILS, and
//     so prove the fail-closed branch below without a database, a key or a
//     network. It exercises this very function, not a copy of it;
//   * the query stays written out at the call site, in the handler, where a
//     reviewer can see which table and which column it reads. An earlier version
//     took the admin client as a narrowed structural type instead, and
//     `deno check` refused it: TS2589, "Type instantiation is excessively deep
//     and possibly infinite", because matching the generated client against a
//     hand-written shape instantiates its generics. A cast would have silenced
//     that by switching the check off, which is the opposite of the point.
//
// `data: unknown` because nothing here cares what the row contains. Only whether
// there is one. The `reason` column is never selected.
export type AccountStatusRead = () => PromiseLike<{
  data: unknown;
  error: { code?: string } | null;
}>;

// Is this person allowed to act? Exported so the test runs THIS function rather
// than a copy of it.
export async function checkSuspension(
  read: AccountStatusRead,
): Promise<SuspensionVerdict> {
  let answer: { data: unknown; error: { code?: string } | null };
  try {
    answer = await read();
  } catch {
    // A thrown error -- the network, the client itself -- is still an unknown.
    // Nothing about the cause is returned or logged.
    return { allowed: false, why: "unknown" };
  }

  // Lesson F14: the error AND what came back.
  if (answer?.error) {
    return { allowed: false, why: "unknown", code: answer.error.code };
  }
  if (!Array.isArray(answer?.data)) {
    // No error and no array either. Not an empty result -- an unanswered
    // question, which is refused rather than guessed at.
    return { allowed: false, why: "unknown" };
  }
  if (answer.data.length > 0) {
    return { allowed: false, why: "suspended" };
  }
  return { allowed: true };
}

// A URL-safe token from at least 32 random bytes of cryptographic randomness.
//
// crypto.getRandomValues is the Web Crypto API, available in the Edge runtime.
// Math.random() would be catastrophic here: the token is the only thing standing
// between a stranger and joining somebody's team, so it has to be unguessable,
// not merely unpredictable-looking.
function makeToken(): string {
  const bytes = new Uint8Array(TOKEN_BYTES);
  crypto.getRandomValues(bytes);
  // Base64url, so the token survives being pasted into a URL unescaped.
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// SHA-256 of the token, hex-encoded: 64 characters, matching the
// invitations_token_hash_shape constraint in the migration.
async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token),
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Work out where this email may be sent, BEFORE anything is written to the
// database. Returns either a refusal or a decided recipient and subject.
//
// The order is deliberate and is the whole point of doing this first: an
// invitation that exists but whose email was never sent is worse than no
// invitation, because it occupies one of the team's 20 pending slots and the
// person it names never heard about it.
//
// EMAIL_TEST_INBOX wins over EMAIL_DELIVERY on purpose. If a test inbox is set
// at all, that is somebody saying "do not send to real people from here", and
// that instruction should not be overridable by another setting sitting beside
// it. Staging sets the test inbox; production sets EMAIL_DELIVERY=live.
type Delivery =
  | { ok: true; to: string; subject: string; redirected: boolean }
  | { ok: false; message: string; missing: string[] };

function decideDelivery(invitedEmail: string, teamName: string): Delivery {
  const env = Deno.env;

  const apiKey = (env.get("EMAIL_API_KEY") ?? "").trim();
  const from = (env.get("EMAIL_FROM") ?? "").trim();
  const appUrl = (env.get("APP_URL") ?? "").trim();
  const testInbox = (env.get("EMAIL_TEST_INBOX") ?? "").trim();
  const delivery = env.get("EMAIL_DELIVERY") ?? "";

  // The three settings that are required whatever the delivery mode.
  const missing: string[] = [];
  if (apiKey === "") missing.push("EMAIL_API_KEY");
  if (from === "") missing.push("EMAIL_FROM");
  if (appUrl === "") missing.push("APP_URL");
  if (missing.length > 0) {
    return {
      ok: false,
      message:
        `Invitations are not configured on this environment, so no invitation was created. ` +
        `Missing: ${missing.join(", ")}.`,
      missing,
    };
  }

  if (testInbox !== "") {
    // Redirected. The real address goes in the subject so a tester can tell the
    // messages apart -- it is not a leak: the test inbox belongs to whoever set
    // this up, and they already have the invitation list.
    return {
      ok: true,
      to: testInbox,
      subject: `[staging] invitation for ${invitedEmail}`,
      redirected: true,
    };
  }

  // Exactly "live". Not "true", not "Live", not "1". A delivery switch that
  // accepts near-misses is a switch that turns itself on by accident.
  if (delivery === "live") {
    return {
      ok: true,
      to: invitedEmail,
      subject: `You have been invited to ${teamName}`,
      redirected: false,
    };
  }

  return {
    ok: false,
    message:
      `This environment is not allowed to send invitation emails, so no invitation was created. ` +
      `Set EMAIL_TEST_INBOX to redirect mail, or EMAIL_DELIVERY to "live" to send to real people.`,
    missing: ["EMAIL_TEST_INBOX", "EMAIL_DELIVERY"],
  };
}

// POST to Resend. Built from Resend's current reference:
// https://resend.com/docs/api-reference/emails/send-email
//
//   POST https://api.resend.com/emails
//   Authorization: Bearer re_xxxxxxxxx
//   Content-Type: application/json
//   body: { from, to, subject, text }   -- from/to/subject required
//   success body: { "id": "49a3999c-0ce1-4ea6-ab68-afcd6dc2e794" }
//
// Plain fetch, no package (rule 17).
//
// TEXT ONLY, never html. The team name is free text somebody typed, and a team
// called `<img onerror=...>` in an HTML email is a scripting hole in whatever
// mail client opens it. Plain text cannot be interpreted that way, and this app
// has no need for a styled email.
//
// WHAT CAME BACK IS JUDGED SOMEWHERE ELSE. The reading of the answer lives in
// `codeFromSendResponse` below, which takes a Response and nothing else, so the
// test can hand it every shape the service can produce without a network, a key
// or an account. This function is the part that cannot be tested that way: the
// fetch, and the one failure only a fetch can have.
async function sendEmail(args: {
  apiKey: string;
  from: string;
  to: string;
  subject: string;
  text: string;
}): Promise<{ ok: true; id: string } | { ok: false; code: FailureCode }> {
  let response: Response;
  try {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${args.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: args.from,
        to: args.to,
        subject: args.subject,
        text: args.text,
      }),
    });
  } catch {
    // Network-level failure: nothing was sent, and no status to read. Nothing
    // about the cause is kept -- not the thrown message, which can name a host.
    return { ok: false, code: "unreachable" };
  }

  return await codeFromSendResponse(response);
}

// What the email service's answer means, as one of the three codes an answer can
// produce. Exported and pure, so the test runs this and not a copy.
//
// A 2xx STATUS ALONE IS NOT SUCCESS, which is the whole reason this is three
// branches and not one. The service can answer 200 with a body that is not JSON,
// or with JSON that carries no id, and in both cases no email can be said to
// exist -- so both are `unconfirmed`, which is deliberately ONE code for two
// branches: they are one fact to somebody reading a screen, "it answered, and we
// still cannot say it went". The migration's comment says the same.
//
// Reporting success here would be the worst outcome available: an invitation
// marked sent that nobody ever received, which the owner has no reason to look
// at again.
export async function codeFromSendResponse(
  response: Response,
): Promise<{ ok: true; id: string } | { ok: false; code: FailureCode }> {
  if (!response.ok) {
    return { ok: false, code: "refused" };
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { ok: false, code: "unconfirmed" };
  }

  const id = (body as { id?: unknown } | null)?.id;
  if (typeof id !== "string" || id === "") {
    return { ok: false, code: "unconfirmed" };
  }

  return { ok: true, id };
}

export default {
  // auth: "user" plus verify_jwt = true in supabase/config.toml: the platform
  // verifies the caller's token before this code runs.
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    // The caller's id comes from the VERIFIED token and nowhere else.
    // UserClaims.id is documented as "User's unique ID (same as JWTClaims.sub)".
    const callerId = ctx.userClaims?.id;
    if (!callerId) {
      return fail("You must be signed in to invite somebody.", 401);
    }

    // ---- Is this account suspended? --------------------------------------
    //
    // FIRST, before `await req.json()` and so before every check below it. The
    // position is the point rather than tidiness: a suspended caller never
    // reaches decideDelivery, never reaches the pending count, and never reaches
    // an insert -- so no mail is sent, and none of the team's 20 pending slots
    // is spent on an invitation its owner was not allowed to make.
    const suspension = await checkSuspension(() =>
      ctx.supabaseAdmin
        .from("account_status")
        .select("user_id")
        .eq("user_id", callerId)
        .limit(1)
    );
    if (!suspension.allowed) {
      if (suspension.why === "suspended") {
        return suspendedRefusal();
      }
      // Fail closed. The read did not answer, so whether this person may act is
      // not known -- and an unknown is not a "no row". A different refusal from
      // the one above, with a different status and message, because its cause is
      // a failed check rather than a suspension.
      return fail(
        "Could not check your account, so no invitation was created. Please try again.",
        500,
        suspension.code,
      );
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return fail("Expected a JSON body with a team id and an email.", 400);
    }

    const rawTeamId = (body as { team_id?: unknown } | null)?.team_id;
    const rawEmail = (body as { email?: unknown } | null)?.email;

    if (typeof rawTeamId !== "string" || rawTeamId.trim() === "") {
      return fail("Which team is this invitation for?", 400);
    }
    if (typeof rawEmail !== "string") {
      return fail("Please give an email address to invite.", 400);
    }

    const teamId = rawTeamId.trim();

    // A valid UUID, checked BEFORE any database call.
    //
    // teams.id is a uuid column. Sending anything else -- the owner did it on
    // staging by typing an email address into the team id prompt -- made
    // Postgres refuse to cast it, error 22P02 (invalid_text_representation),
    // which arrived here as a query error and came back as
    // 500 "Could not check the team, so no invitation was created."
    //
    // That is wrong twice over: 500 says the server broke when the caller sent
    // something malformed, and the message sends somebody looking at the team
    // rather than at what they typed. A shape this easy to check should never
    // reach the database to be rejected.
    if (!UUID_PATTERN.test(teamId)) {
      return fail("That is not a valid team id.", 400);
    }

    // Lowercased here, so it matches the invitations_email_lowercase constraint
    // and so accept-invite's comparison is case-insensitive by construction.
    const email = rawEmail.trim().toLowerCase();

    if (email === "") {
      return fail("Please give an email address to invite.", 400);
    }
    // Deliberately loose. Address validity is settled by whether the mail
    // arrives, not by a regular expression; this only catches obvious typos.
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return fail("That does not look like an email address.", 400);
    }
    if (email.length > 320) {
      return fail("That email address is too long.", 400);
    }

    // ---- Only the team's owner may invite ---------------------------------
    //
    // Read with supabaseAdmin and check owner_id here, rather than relying on
    // the caller's own client returning nothing for somebody else's team. Both
    // would work today; this one keeps working if the select policy changes,
    // and it lets "not your team" be told apart from "no such team".
    const { data: team, error: teamError } = await ctx.supabaseAdmin
      .from("teams")
      .select("id, name, owner_id")
      .eq("id", teamId)
      .limit(1);

    // Lesson F14: check the error AND what came back.
    if (teamError) {
      return fail(
        "Could not check the team, so no invitation was created. Please try again.",
        500,
        teamError.code,
      );
    }
    if (!Array.isArray(team) || team.length !== 1) {
      // Zero rows: no such team. 404, and a DIFFERENT answer from "not yours",
      // which is the 403 just below this block -- the two outcomes are
      // deliberately told apart, for the reason given at the top of this block:
      // reading the team with supabaseAdmin "lets 'not your team' be told apart
      // from 'no such team'".
      //
      // This comment used to claim the two answers were identical, so that team
      // ids could not be discovered. They are not identical, and the claim was
      // worse than wrong: it invited somebody to "restore" that behaviour by
      // collapsing the 403 into this 404, losing a distinction the file argues
      // for on purpose (issue #111). What a caller can learn from the pair is
      // that a team id exists -- not who is in it, not its name, and not
      // anything about its invitations.
      return fail("That team was not found.", 404);
    }
    if (team[0].owner_id !== callerId) {
      return fail("Only the team's owner can invite people.", 403);
    }
    const teamName = String(team[0].name ?? "");

    // ---- Refuse inviting yourself -----------------------------------------
    //
    // Cheap and first: the caller's own address is on the verified token, so
    // this costs no query. An owner inviting themselves would send a link they
    // can never use -- accept-invite would match the address, add them to
    // team_members, and leave them a "member" of a team they already own, which
    // means nothing and confuses the pending list.
    const callerEmail = ctx.userClaims?.email;
    if (
      typeof callerEmail === "string" &&
      callerEmail.trim().toLowerCase() === email
    ) {
      return fail(
        "That is your own email address. You already own this team, so there is nothing to accept.",
        409,
      );
    }

    // ---- Refuse inviting somebody already in the team ---------------------
    //
    // Checked by looking up THE TEAM'S members and comparing their addresses,
    // rather than looking up the invited address and asking which teams it is
    // in. The reason is the shape of the data available: team_members holds
    // user ids, invitations hold email addresses, and the installed client has
    // no "find the user with this email" call -- `listUsers` is paginated over
    // every user in the project and `getUserById` needs an id you do not have.
    //
    // So the loop is bounded by the size of THIS TEAM (a handful of people),
    // not by the number of accounts in the project. If teams ever grow large
    // this wants replacing with a lookup, but it is correct either way: it
    // never pages, so it cannot silently miss somebody on page two.
    const { data: members, error: membersError } = await ctx.supabaseAdmin
      .from("team_members")
      .select("user_id")
      .eq("team_id", teamId);

    // Lesson F14: the error AND what came back. A failed read here must NOT be
    // treated as "nobody is in the team" -- that would let the check pass by
    // accident, which is the failing-open pattern this project keeps refusing.
    if (membersError) {
      return fail(
        "Could not check who is already in this team, so no invitation was created. Please try again.",
        500,
        membersError.code,
      );
    }
    if (!Array.isArray(members)) {
      return fail(
        "Could not check who is already in this team, so no invitation was created. Please try again.",
        500,
      );
    }

    for (const member of members) {
      const memberId = (member as { user_id?: unknown }).user_id;
      if (typeof memberId !== "string") continue;

      const { data: memberUser, error: memberUserError } =
        await ctx.supabaseAdmin.auth.admin.getUserById(memberId);

      // Again, not treated as "not them". If a member's account cannot be read
      // we do not know whether this address is already in the team, and an
      // unknown is not a no.
      if (memberUserError) {
        return fail(
          "Could not check who is already in this team, so no invitation was created. Please try again.",
          500,
        );
      }

      const memberEmail = memberUser?.user?.email;
      if (
        typeof memberEmail === "string" &&
        memberEmail.trim().toLowerCase() === email
      ) {
        return fail(
          "That person is already in this team, so there is nothing to invite them to.",
          409,
        );
      }
    }

    // ---- Limit: fewer than 20 PENDING invitations -------------------------
    //
    // Pending means not accepted and not expired. An expired or accepted
    // invitation does not occupy a slot, which is what stops a team being
    // permanently full because of invitations that went nowhere.
    const nowIso = new Date().toISOString();
    const { count: pendingCount, error: countError } = await ctx.supabaseAdmin
      .from("invitations")
      .select("id", { count: "exact", head: true })
      .eq("team_id", teamId)
      .is("accepted_at", null)
      .gt("expires_at", nowIso);

    if (countError) {
      return fail(
        "Could not check how many invitations this team already has, so none was created. Please try again.",
        500,
        countError.code,
      );
    }
    if (typeof pendingCount !== "number") {
      // No error but no number is an unknown, not a zero. Treating it as zero
      // is how a limit gets bypassed.
      return fail(
        "Could not check how many invitations this team already has, so none was created. Please try again.",
        500,
      );
    }
    if (pendingCount >= MAX_PENDING_PER_TEAM) {
      return fail(
        `This team has ${pendingCount} invitations waiting, the most allowed. Wait for some to be accepted or to expire.`,
        409,
      );
    }

    // AND A RETRY IS COUNTED HERE TOO, WHICH IS WRONG AND IS NOT FIXED HERE. A
    // failed invitation is still pending by this count -- not accepted, not expired
    // -- so a team sitting at 20 cannot send one of them again, even though a retry
    // creates no row and occupies no new slot. The owner presses Try again and is
    // told the team is full.
    //
    // The fix is to read the existing row before counting, and that moves a refusal
    // ahead of another one, which issue #166 does not allow in this change. Issue
    // #170 holds it, with what a fix must and must not change.

    // ---- Decide delivery BEFORE writing anything --------------------------
    //
    // Required by the delivery rules, and worth restating: if this environment
    // may not send, nothing is created at all. No invitation, no wasted slot.
    //
    // AND THIS IS WHY NOTHING IS EVER STORED AS `not_configured`, which is a
    // thing to say out loud rather than leave somebody to discover. The fixed
    // list in 20261006095847_invitation_status.sql has four codes, and names this
    // branch as the source of that one -- but this branch runs BEFORE any row
    // exists, by the deliberate ordering above, so there is nothing to write a
    // status on. The caller gets 503 and the table is untouched.
    //
    // The code is still in the list, the screen still has a sentence for it, and
    // both are right: the column can hold it, the check constraint allows it, and
    // a later change that writes a row before deciding delivery would produce it.
    // What would be wrong is a screen that met the value and showed nothing.
    // Issue #169 holds the question of whether the ordering should change so that
    // a retry in an unconfigured environment records this instead of leaving the
    // row as it was; it is not changed here because issue #166 requires every
    // existing refusal to keep its order.
    const decision = decideDelivery(email, teamName);
    if (!decision.ok) {
      // Names the settings. Never their values -- see the note at the end.
      console.error(
        `invite-member refused: email delivery not configured. Settings involved: ${decision.missing.join(", ")}. No value is logged.`,
      );
      return fail(decision.message, 503);
    }

    // ---- Clear this address's DEAD invitations to this team ---------------
    //
    // Without this, an address could be invited to a team exactly once, ever.
    //
    // The unique index invitations_one_pending_per_email covers
    // (team_id, email) WHERE accepted_at IS NULL. "Not accepted" includes
    // "not accepted and long expired", so an invitation that lapsed after 7
    // days still occupies that slot -- and a fresh invite to the same person
    // hits 23505 and reports "already has an invitation waiting", which is
    // simply untrue. Nothing expires the row, so the block is permanent.
    //
    // WHY THE INDEX IS NOT CHANGED INSTEAD. The obvious fix -- adding
    // `and expires_at > now()` to the index predicate -- is not allowed by
    // Postgres. From the CREATE INDEX documentation: "All functions and
    // operators used in an index definition must be immutable, that is, their
    // results must depend only on their arguments and never on any outside
    // influence (such as the contents of another table or the current time)."
    // now() depends on the current time, so a time-aware partial index cannot
    // exist. The index is kept exactly as it is, and the dead rows are removed
    // here instead, which is the only place that can know the clock.
    //
    // Deleted rather than kept for the record: an expired invitation that was
    // never accepted is not history worth holding, and docs/plan.md's whole
    // reason for the 7-day expiry is that an address belonging to somebody who
    // never joined should not sit in the database.
    //
    // Placed after the delivery decision on purpose, so an environment that may
    // not send still changes nothing at all.
    const { error: clearError, count: clearedCount } = await ctx.supabaseAdmin
      .from("invitations")
      .delete({ count: "exact" })
      .eq("team_id", teamId)
      .eq("email", email)
      .is("accepted_at", null)
      .lte("expires_at", nowIso);

    // F14 on the delete. If it failed, stop: carrying on would hit the unique
    // index and report "already has an invitation waiting", which is the wrong
    // message and the bug this code exists to remove.
    if (clearError) {
      return fail(
        "Could not clear an earlier expired invitation for that address, so no new invitation was created. Please try again.",
        500,
        clearError.code,
      );
    }

    // A COUNT only, never the address. There is normally nothing to clear, so
    // the zero case is not worth a line.
    if ((clearedCount ?? 0) > 0) {
      console.log(
        `invite-member: cleared ${clearedCount} expired unaccepted invitation(s) for this team and address before re-inviting. No address is logged.`,
      );
    }

    // ---- Create the invitation, or take over the one already there ---------
    //
    // The row is created as 'queued'. Nothing names that column in the insert:
    // 20261006095847_invitation_status.sql gives status the default 'queued' and
    // failure_code the default '', and letting the defaults do it means there is
    // one place the starting state is written down rather than two.
    const token = makeToken();
    const tokenHash = await hashToken(token);

    const { data: inserted, error: insertError } = await ctx.supabaseAdmin
      .from("invitations")
      .insert({
        team_id: teamId,
        email,
        token_hash: tokenHash,
        invited_by: callerId,
      })
      .select("id, email, expires_at, status");

    // The row this request is going to send for, once it is known: either the one
    // just inserted or the one that was already there and may be sent again.
    let invitationId: string;
    let invitationEmail: string;
    let invitationExpiry: string;
    let retried: boolean;

    if (insertError) {
      // 23505 is unique_violation: the partial unique index means this address
      // already has a live invitation to this team.
      //
      // BEFORE THIS CHANGE THAT WAS THE END OF IT -- one sentence, 409, and
      // nothing to do about it. It is now the start of the retry path, because
      // the table can say what happened to that invitation's email, and "it was
      // never delivered" and "it is in their inbox" deserve different answers.
      if (insertError.code === "23505") {
        const { data: existing, error: existingError } = await ctx.supabaseAdmin
          .from("invitations")
          .select("id, email, status, created_at, expires_at")
          .eq("team_id", teamId)
          .eq("email", email)
          .is("accepted_at", null)
          .limit(1);

        // Lesson F14: the error AND what came back. A read that failed does not
        // mean "no row", and it certainly does not mean "retry" -- a retry sends
        // mail, so an unknown here must refuse.
        if (existingError) {
          return fail(
            "That address already has an invitation to this team, and it could not be read, so nothing was sent. Please try again.",
            500,
            existingError.code,
          );
        }
        if (!Array.isArray(existing) || existing.length !== 1) {
          // Zero rows: the row that blocked the insert is no longer pending --
          // accepted or deleted in the moment between the two statements. The
          // unchanged refusal is the right answer rather than a guess: it sends
          // no mail, and asking again a second later inserts cleanly.
          return alreadyWaitingAnswer(insertError.code);
        }

        const row = existing[0];
        const verdict = retryVerdict(row, Date.now());

        if (!verdict.retry) {
          if (verdict.why === "sending") return stillSendingAnswer(insertError.code);
          // 'sent' and 'unknown' both get the refusal this function has always
          // sent, which is what issue #166 requires of the first and what the
          // comment in retryVerdict argues for the second.
          return alreadyWaitingAnswer(insertError.code);
        }

        // ---- A RETRY. The link is replaced before anything is sent. ---------
        //
        // A NEW TOKEN, because the old one cannot be reused: the token itself is
        // never stored (only its SHA-256 hash), so there is nothing to put in a
        // second email even if the first one had been delivered -- and it was
        // not, which is the whole reason this branch exists. The new hash
        // replaces the old one, so the previous link, wherever it got to, now
        // opens nothing.
        //
        // THE 7 DAYS START AGAIN, and that is deliberate. The email about to go
        // out says "The link works for 7 days", and on a row created six days ago
        // that sentence would be false -- the link would die tomorrow. A retry is
        // a new invitation in every respect except which row it lives in, so it
        // gets a new window and the email tells the truth. The cost is named
        // plainly: an address belonging to somebody who never joined can sit here
        // for 7 days from the LAST attempt rather than the first.
        //
        // created_at is left alone, so "when was this person first invited" is
        // still answerable, and 20260930193813_create_invitations.sql's
        // invitations_expires_after_created constraint still holds.
        //
        // status goes back to 'queued' and failure_code back to '', which the
        // check constraint requires of any row that is not 'failed'. Both are
        // named here, not left to a default: a default only applies to an insert.
        const freshExpiry = new Date(
          Date.now() + INVITATION_DAYS * 24 * 60 * 60 * 1000,
        ).toISOString();

        const { data: reset, error: resetError } = await ctx.supabaseAdmin
          .from("invitations")
          .update({
            token_hash: tokenHash,
            status: "queued",
            failure_code: "",
            expires_at: freshExpiry,
          })
          .eq("id", row.id)
          .select("id, email, expires_at, status");

        if (resetError) {
          return fail(
            "Could not prepare that invitation to be sent again, so nothing was sent. Please try again.",
            500,
            resetError.code,
          );
        }
        if (!Array.isArray(reset) || reset.length !== 1) {
          const wrote = Array.isArray(reset) ? reset.length : 0;
          return fail(
            `That invitation may not have been prepared to send again: the database reported no error but returned ${wrote} rows instead of 1. Nothing was sent. Please check the team's invitations before trying again.`,
            500,
          );
        }

        // A COUNT AND A REASON, never the address and never the token. The reason
        // is one of two fixed words from retryVerdict, so this line cannot grow a
        // value somebody typed.
        console.log(
          `invite-member: sending an existing invitation again (${verdict.why}). A new link replaces the old one. No address, token or hash is logged.`,
        );

        invitationId = reset[0].id;
        invitationEmail = reset[0].email;
        invitationExpiry = reset[0].expires_at;
        retried = true;
      } else {
        return fail(
          "Could not create the invitation. Please try again.",
          500,
          insertError.code,
        );
      }
    } else {
      if (!Array.isArray(inserted) || inserted.length !== 1) {
        const wrote = Array.isArray(inserted) ? inserted.length : 0;
        return fail(
          `The invitation may not have been created: the database reported no error but returned ${wrote} rows instead of 1. Please check the team's invitations before trying again.`,
          500,
        );
      }
      invitationId = inserted[0].id;
      invitationEmail = inserted[0].email;
      invitationExpiry = inserted[0].expires_at;
      retried = false;
    }

    // ---- Send the email ---------------------------------------------------
    //
    // The link's host comes ONLY from APP_URL. Never from a request header:
    // Host, X-Forwarded-Host and Origin are all attacker-controlled, and a link
    // built from one would let somebody send a real invitation pointing at a
    // site they own, harvesting the token when it is opened.
    const appUrl = (Deno.env.get("APP_URL") ?? "").trim().replace(/\/+$/, "");
    const link = `${appUrl}/invite/${token}`;

    const text = [
      `You have been invited to join the team "${teamName}" on Team Tasks.`,
      ``,
      `Open this link to accept:`,
      link,
      ``,
      `The link works for 7 days, and only for ${email}.`,
      `Sign in or sign up with that address first, then open the link again.`,
      ``,
      `If you were not expecting this, you can ignore this email.`,
    ].join("\n");

    const sent = await sendEmail({
      apiKey: (Deno.env.get("EMAIL_API_KEY") ?? "").trim(),
      from: (Deno.env.get("EMAIL_FROM") ?? "").trim(),
      to: decision.to,
      subject: decision.subject,
      text,
    });

    // ---- Write down what happened to the email ----------------------------
    //
    // THE ROW NO LONGER DISAPPEARS WHEN A SEND FAILS, and that is the change
    // issue #166 asks for. What the old code did instead -- delete the
    // invitation -- threw away the only record that anybody had tried, so the
    // owner saw an empty list and had no way to tell "nobody invited them" from
    // "the email bounced off the service twice this morning". A failed row stays,
    // says so, and offers to go again.
    //
    // The status write is the LAST thing, after the send, because until the
    // service has answered there is nothing true to write. What that leaves
    // behind if this function stops between the insert and this line is a row at
    // 'queued' and no second write -- see STALE_QUEUED_MINUTES, which is how such
    // a row becomes retryable rather than sitting there for seven days.
    const outcome = sent.ok
      ? { status: "sent" as const, failure_code: "" }
      : { status: "failed" as const, failure_code: sent.code };

    const { data: recorded, error: recordError } = await ctx.supabaseAdmin
      .from("invitations")
      .update(outcome)
      .eq("id", invitationId)
      .select("id, email, expires_at, status");

    // F14 on the status write. One row back, with no error, is the only thing
    // that means the row says what this function is about to claim it says.
    const wroteOneRow =
      !recordError && Array.isArray(recorded) && recorded.length === 1;

    if (!wroteOneRow) {
      // The row still says 'queued', whatever happened to the email. Said in a
      // log line because nothing else will notice: the owner's screen will show
      // "sending" and, after STALE_QUEUED_MINUTES, a Try again button -- which is
      // the right offer, but somebody looking into why wants to find this.
      //
      // The invitation id is named, as the old orphan line named it. No address,
      // no token, no hash, and nothing the email service said.
      console.error(
        `invite-member: the email ${sent.ok ? "WENT" : "did not go"} and the status could not be written. Invitation id ${invitationId} still says "queued". Error code: ${recordError?.code ?? "none"}; rows updated: ${Array.isArray(recorded) ? recorded.length : "unknown"}.`,
      );
    }

    if (!sent.ok) {
      // Named, not described, and never the service's own reply. `recorded` is
      // what makes the answer match the row: a 502 says the invitation is marked
      // as failed, and this function only says that when it is.
      console.error(
        `invite-member: the invitation email did not go. Code: ${sent.code}. Recorded on the row: ${wroteOneRow ? "yes" : "NO"}. No address, token or email-service reply is logged.`,
      );
      return sendFailureAnswer({ code: sent.code, recorded: wroteOneRow });
    }

    // The email went. The status is the one the database confirmed, so a failed
    // status write answers 'queued' rather than claiming 'sent'.
    return invitationAnswer({
      id: invitationId,
      email: wroteOneRow ? recorded[0].email : invitationEmail,
      expires_at: wroteOneRow ? recorded[0].expires_at : invitationExpiry,
      status: wroteOneRow ? "sent" : "queued",
      redirected: decision.redirected,
      retried,
    });
  }),
};

// ABOUT LOGGING, because this function handles more sensitive material than any
// other in the project.
//
// The console calls above name SETTINGS, an invitation id, a failure code and a
// retry reason -- and the last two are the ones added by issue #166, so they are
// named here as well as at their call sites. A failure code is one of four fixed
// words from a list in a migration; a retry reason is one of two fixed words from
// `retryVerdict`. Neither can carry a value somebody typed, and NOTHING THE EMAIL
// SERVICE SAID IS LOGGED AT ALL: not its message, not its body, not the status it
// answered with. docs/plan.md's reason is that its reply "can quote the address,
// the subject and the message".
//
// They never print:
//   * any setting's value -- not EMAIL_API_KEY, not EMAIL_FROM, not APP_URL,
//     not EMAIL_TEST_INBOX, not EMAIL_DELIVERY;
//   * the token, or its hash;
//   * the invited email address, or the team name, both of which are personal
//     data under docs/plan.md's appendix.
//
// docs/plan.md decided "Logs: we add none of our own ... task text and email
// addresses never go into a log line from server code". The two lines here are
// the narrow exception that decision allows for: a misconfiguration and a failed
// cleanup both need to be discoverable, and neither message contains anything
// personal or secret.
