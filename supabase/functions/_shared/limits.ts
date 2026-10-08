// limits.ts -- the two numbers, the one refusal, and the one way to count.
//
// Build it 22 part 2, issue #221. The database half is
// supabase/migrations/20261008115900_usage_counts.sql (issue #220, merged as
// PR #224), which built `public.usage_counts` and `public.count_daily_use()` and
// deliberately left them unused.
//
// WHY THIS FILE EXISTS AT ALL, in docs/plan.md's own words: "Both numbers live in
// one config file: supabase/functions/_shared/limits.ts, read by both
// suggest-subtasks and invite-member. Not spelled at a call site and not in two
// places. Changing a limit is then a one-line change in one file, which is also
// what makes it reviewable: a limit nobody can find is a limit nobody can check."
//
// So the rule this file is written to keep is a NEGATIVE: neither 20 appears
// anywhere in either function. Both import DAILY_LIMITS from here.
//
// ---------------------------------------------------------------------------
// THE ONE THING ABOUT THIS FILE THAT IS UNVERIFIED, AND IT IS ITS LOCATION
// ---------------------------------------------------------------------------
//
// NO FUNCTION IN THIS PROJECT HAS EVER BEEN DEPLOYED WITH AN IMPORT OF A FILE
// OUTSIDE ITS OWN FOLDER. That was written down the last time the question came
// up and the answer was to decline the shared module:
// evidence/build-it-16-suspend-functions.md, "Three copies, not a shared module"
// -- `checkSuspension` is copied into four files rather than imported from here,
// because "the first symptom of getting it wrong would be all three functions
// failing to boot".
//
// THIS TIME THE SHARED FILE IS WHAT WAS ASKED FOR, by name and by path, and it is
// not this file's decision to take: docs/plan.md's table of the owner's decisions
// of 8 October 2026 has a row reading "The config file | `supabase/functions/_shared/limits.ts`,
// as proposed", and issue #221's first condition is that this exact path exists and
// is read by both functions. A second copy of the numbers in each function folder
// would satisfy the bundler and break the thing the decision was about.
//
// IT IS SUPABASE'S OWN DOCUMENTED LAYOUT: "you can store any shared code in a
// folder prefixed with an underscore (_)"
// (https://supabase.com/docs/guides/functions/development-tips). And the repository
// already treats it as one -- scripts/drift-check.mjs asserts "a _shared folder is
// not treated as a function", and migrate-production.yml's smoke test skips it
// (evidence/production-smoke-test.md).
//
// AND IF THE BUNDLER REFUSES IT, THE DEPLOY FAILS AND NOTHING IS DEPLOYED, which is
// the safe direction for an unknown to fail in: staging keeps the function it has,
// which counts nothing, rather than getting one that counts wrongly. The staging
// script's before-and-after pair is what tells the two apart, because a function
// that is not there answers 404. The same unknown already hangs over
// suggest-subtasks' JSON import (issue #188), and the owner's staging deploy
// settles both at once.
//
// ---------------------------------------------------------------------------
// WHAT THIS FILE DOES NOT DO
// ---------------------------------------------------------------------------
//
// It does not read the database, the clock or the environment. `countOneUse` is
// handed the call to make, exactly as `checkSuspension` and `checkAiConsent` are
// handed their reads, for the two reasons those give: a test can hand it a call
// that FAILS and prove the fail-closed branch with no database, and the rpc stays
// written out at the call site where a reviewer can see which function is called
// with which arguments.
//
// NO IMPORTS, so the Deno tests beside the functions can load it under any of the
// function folders' deno.json, and so nothing here can drift with a dependency.

// ---------------------------------------------------------------------------
// The features, which are the database's words and not this file's
// ---------------------------------------------------------------------------
//
// usage_counts_feature_allowed in 20261008115900_usage_counts.sql is the fixed
// list: `check (feature in ('ai_suggestions', 'invitations'))`. These two
// constants exist so a call site names a value rather than spelling a string --
// and the database is what decides, whatever this file believes. The migration
// says why that way round: "a typo at a call site -- 'ai_suggestion', 'invite' --
// is refused by the database rather than quietly counted in a fourth bucket that
// no limit watches."
//
// A feature word is therefore not a thing to add here alone. Adding one needs a
// new migration, on purpose.
export const FEATURE_AI_SUGGESTIONS = "ai_suggestions";
export const FEATURE_INVITATIONS = "invitations";

export const FEATURES = [FEATURE_AI_SUGGESTIONS, FEATURE_INVITATIONS] as const;

export type Feature = (typeof FEATURES)[number];

// ---------------------------------------------------------------------------
// THE TWO NUMBERS
// ---------------------------------------------------------------------------
//
// "The limits: 20 AI suggestions and 20 invitations per person per day. Confirmed
// by the owner on 2026-10-08, after the arithmetic, and the arithmetic is kept as
// written." -- docs/plan.md.
//
// AND THE ARITHMETIC SAYS 20 IS NOT WHAT KEEPS EITHER SERVICE INSIDE ITS CEILING,
// which is the part a reader of this file is owed rather than left to discover.
// docs/costs.md works it out: at the plan's group size of about six, twenty AI
// asks each is above Anthropic's 5-dollar monthly spend limit, and twenty
// invitations each is above the email service's free 100-a-day. The owner kept both
// numbers KNOWING that, because the two controls do different jobs:
//
//   the vendor cap stops the BILL, by refusing requests;
//   this stops ONE PERSON, or one retry loop, using the whole month's allowance in
//   an afternoon and leaving the other five with a helper that has stopped working.
//
// So 20 is sized for a volunteer's day rather than for the multiplication, and the
// number to change if that stops being true is this one, here, once.
//
// PER PERSON, NOT PER TEAM. docs/plan.md: "one person who owns three teams has 20
// invitations a day in total, not 20 for each team." The existing limits are
// untouched and are different things -- at most 20 PENDING invitations per team, at
// most 3 teams per person, a 7-day expiry -- none of which caps how many a person
// may send in a day.
//
// A LIMIT OF 0 OR LESS REFUSES EVERYBODY, and that is the database's behaviour
// rather than a check here: count_daily_use's insert carries `where p_limit > 0`,
// so nothing is written and nothing comes back. The migration's comment says it is
// "what somebody switching a feature off in limits.ts would expect it to mean".
export const DAILY_LIMITS: Readonly<Record<Feature, number>> = {
  [FEATURE_AI_SUGGESTIONS]: 20,
  [FEATURE_INVITATIONS]: 20,
};

/**
 * The day's limit for one feature.
 *
 * Exported as a function rather than leaving each call site to index the map, so
 * that a call site reads `dailyLimit(FEATURE_INVITATIONS)` and cannot accidentally
 * become `DAILY_LIMITS[something] ?? 20` -- which would put a number back at a call
 * site, which is the one thing this file exists to prevent.
 */
export function dailyLimit(feature: Feature): number {
  return DAILY_LIMITS[feature];
}

// ---------------------------------------------------------------------------
// The refusal: one sentence, two codes, and why it is not an existing code
// ---------------------------------------------------------------------------
//
// THE SENTENCE IS docs/plan.md's, character for character: "When the limit is
// reached the person sees: 'You've reached today's limit. It resets tomorrow.'"
//
// "One sentence for both features, saying what happened and when it ends, and
// naming NO company, model, key, status or number."
//
// WHY IT IS NOT ONE OF suggest-subtasks' TWELVE FIXED CODES, which is the plan's
// own argument and was decided against issue #184's condition 3: "those twelve all
// mean 'something in this app's plumbing went wrong, press it again later', and
// this one is a fact about the person's own day that they can plan around. Like the
// consent refusal, it gets its own sentence and its own code." The owner decided on
// 2026-10-08 that #184 is the thing that changes, not the sentence, and a comment on
// that issue says so.
//
// AND IT NAMES NO NUMBER, deliberately, including the limit itself. "You have used
// 20 of 20" would be truer and would also be the one sentence in this app that
// could go stale against limits.ts -- and a person who has run out does not need
// the arithmetic, they need to know when it comes back.
//
// WHAT "TOMORROW" MEANS, AND THAT IT IS APPROXIMATE FOR MOST PEOPLE. The counter
// rolls over at 00:00 UTC, which is some fixed hour of somebody's own afternoon or
// evening rather than their midnight. docs/plan.md works it through -- "Somebody at
// UTC-5 who reaches the limit at 10:00 local gets their allowance back at 19:00 the
// same local day, and the app will have told them 'tomorrow'" -- and the owner kept
// the wording on 2026-10-08 with that inaccuracy in front of them, because "it
// resets at 00:00 UTC" is precise and means nothing to a volunteer. The inaccuracy
// is recorded rather than fixed, and the plan's paragraph is the one to come back to
// if this app ever has people spread across time zones.
export const DAILY_LIMIT_MESSAGE =
  "You've reached today's limit. It resets tomorrow.";

// ITS OWN CODE. Not on suggest-subtasks' SUGGEST_CODES list and not on
// invite-member's FAILURE_CODES list -- the second of those is a check constraint in
// 20261006095847_invitation_status.sql and adding to it would need a migration,
// which this change does not have and does not need: nothing about a daily limit is
// an invitation's status.
export const DAILY_LIMIT_CODE = "daily_limit";

// AND A SECOND CODE, FOR THE COUNT THAT DID NOT ANSWER. Issue #221: "An error from
// count_daily_use is a refusal. A failed count is not permission to spend money --
// same shape as create-team's 'an unknown is not a zero'."
//
// IT IS A SEPARATE CODE FROM THE ONE ABOVE because it is separate news, and the
// difference is the whole of what the owner can act on: `daily_limit` means the app
// worked and this person has had their twenty, and `daily_limit_unknown` means the
// counting itself is broken and NOBODY is getting anything. One is a quiet day, the
// other is a page to open.
//
// The two functions give it DIFFERENT SENTENCES, which is right and is the same
// split the suspension check already has: suggest-subtasks says the one fixed
// sentence it says for every piece of plumbing that broke, and invite-member says
// "could not check, so nothing was sent" in the shape it uses for every other check
// that did not answer.
export const DAILY_LIMIT_UNKNOWN_CODE = "daily_limit_unknown";

// 429, which is the status for "you have made too many requests" and the only one
// in the range that means what this refusal means. Not 403, which the consent
// refusal uses and which says "a rule about who you are said no"; not 503, which
// says the service is unwell.
//
// NO SCREEN DECIDES ITS WORDING FROM THIS NUMBER, which is what makes it safe to
// pick on meaning rather than on what a screen's switch statement already handles:
// web/src/lib/teams.ts reads the CODE first, the way it already does for
// `account_suspended`, and web/src/lib/suggestions.ts reads the code too. A screen
// that fell through to its default for a 429 would say "that could not be sent,
// please try again", which is the wrong advice -- so both were changed in the same
// pull request as this file, and scripts/screen-state-check.mjs holds them to it.
export const DAILY_LIMIT_STATUS = 429;

/**
 * The refusal, built here so that both functions and every test read the body THIS
 * file sends rather than one they write out for themselves.
 *
 * The same argument invite-member's answer builders and suggest-subtasks'
 * `unavailableAnswer` rest on -- and the same argument that caught a missing `code`
 * on staging in October.
 *
 * `{ error, code }` and nothing else: no limit, no feature word, no count, no user
 * id, no date. A body that said which feature would be saying something the sentence
 * deliberately does not, and the person pressed a button so they know which one.
 */
export function dailyLimitRefusal(): Response {
  return Response.json(
    { error: DAILY_LIMIT_MESSAGE, code: DAILY_LIMIT_CODE },
    { status: DAILY_LIMIT_STATUS },
  );
}

// ---------------------------------------------------------------------------
// Counting one use, which is one call and one decision
// ---------------------------------------------------------------------------
//
// THE NAME OF THE DATABASE FUNCTION AND THE NAMES OF ITS ARGUMENTS, written out
// here once. 20261008115900_usage_counts.sql declares
// `public.count_daily_use(p_user_id uuid, p_feature text, p_limit integer)
// returns boolean`, and PostgREST matches rpc arguments BY NAME -- so a misspelled
// key is a 404 from the database rather than a default, which is a refusal, which
// is the right direction. They are constants so that the two call sites cannot
// disagree about them.
export const COUNT_RPC = "count_daily_use";

// ---------------------------------------------------------------------------
// WHAT THE DATABASE FUNCTION PROMISES, so that reading this file is enough
// ---------------------------------------------------------------------------
//
// Three facts about it, all of them from the migration and all three load-bearing
// here:
//
//   * THE CHECK AND THE INCREMENT ARE ONE STATEMENT, so two simultaneous calls
//     cannot both pass a limit with room for one. That is why this file does not
//     read a count and compare it: there is nothing to read, and the comparison
//     happens inside the statement that does the increment, where Postgres holds
//     the row. evidence/build-it-22-usage-counts.md section 5 fires 20 at once at a
//     limit of 2 and 2 are allowed, every round -- and shows the read-then-write
//     version letting all 20 through.
//   * IT RETURNS true OR false AND NEVER NULL. `coalesce(l_allowed, false)` is the
//     last line of it. So the `unknown` branch below is not expected to happen; it
//     is there because an unexpected answer must not be read as a yes.
//   * IT RAISES rather than answering, in two cases: an unknown feature (the check
//     constraint) and a user id with no account (the foreign key). The coach's
//     review of PR #224 measured both and said what this file has to do about them:
//     "The calling functions must treat any error from this call as 'not allowed'".
//     That is the `unknown` branch, and it is why there is no try/catch anywhere
//     above a call site that could swallow one.

/**
 * The call that counts, passed in as a function that performs it.
 *
 * Shaped exactly like `AccountStatusRead`, `AiConsentRead` and `TaskTitleRead` in
 * the functions, and passed in for the same two reasons: a test can hand this a
 * call that fails, and the rpc stays written out at the call site.
 *
 * `data` is `unknown` on purpose. A scalar-returning rpc gives back a boolean
 * through PostgREST, and this code is written to be handed anything at all --
 * because a deployed database older or newer than this file is one of the things it
 * can be handed.
 */
export type UsageCountCall = () => PromiseLike<{
  data: unknown;
  error: { code?: string } | null;
}>;

/**
 * Three answers, not two, and the third is the one that matters.
 *
 * `at_limit`  the count had already reached the day's limit. Nothing was written,
 *             and this person has had their twenty.
 * `unknown`   the call errored, threw, or answered something that is not a boolean.
 *             Whether this person may spend money is NOT KNOWN, and an unknown is
 *             not a yes.
 */
export type UsageVerdict =
  | { allowed: true }
  | { allowed: false; why: "at_limit" }
  | { allowed: false; why: "unknown"; code?: string };

/**
 * Count one use, and say whether it may go ahead.
 *
 * CALLED IMMEDIATELY BEFORE THE PAID CALL AND NEVER GIVEN BACK, which is the
 * owner's decision of 2026-10-08 and the whole of the protection. docs/plan.md:
 * "The count is written immediately before the paid call is made, and no answer --
 * success, refusal, timeout or silence -- changes it afterwards."
 *
 * WHICH MEANS THIS FUNCTION HAS NO COMPANION. There is no `giveBack`, no
 * `uncount`, no refund path, and that absence is deliberate rather than
 * unfinished: "a count written only on success makes a loop of failures free, and
 * a failing service is exactly when something retries. Over-counting by one when
 * the network is down costs a person one press; under-counting when the service is
 * broken costs the owner the thing this limit exists for." So the count may be
 * HIGHER than the number of requests that reached anybody, and never lower, which
 * is the direction an unknown should fail in.
 *
 * Exported so the tests run THIS decision rather than a copy of it.
 */
export async function countOneUse(call: UsageCountCall): Promise<UsageVerdict> {
  let answer: { data: unknown; error: { code?: string } | null };
  try {
    answer = await call();
  } catch {
    // A thrown error -- the network, the client itself, a raise that the client
    // turns into an exception. Nothing about the cause is returned or logged.
    return { allowed: false, why: "unknown" };
  }

  // Lesson F14: the error AND what came back. An error here is the unknown-feature
  // raise, the foreign-key raise, a lost connection, or a 42501 if the execute
  // grant ever went missing -- and every one of them means the same thing to this
  // function, which is that nothing may be spent.
  if (answer?.error) {
    return { allowed: false, why: "unknown", code: answer.error.code };
  }

  // `=== true` AND `=== false`, with everything else falling through to unknown.
  // Nothing truthy, nothing falsy. The function returns `boolean` and never null,
  // so a value that is neither of those two did not come out of it -- and the
  // string "false" is truthy in JavaScript, which is the mistake this line is
  // written to make impossible. The same two lines, for the same reason, as
  // checkAiConsent's reading of the consent column.
  if (answer?.data === true) return { allowed: true };
  if (answer?.data === false) return { allowed: false, why: "at_limit" };

  // No error, and an answer that is not a boolean. Not a refusal the database made
  // -- an unanswered question, which is refused rather than guessed at.
  return { allowed: false, why: "unknown" };
}

// ---------------------------------------------------------------------------
// THE GATE, which is what makes "nothing was sent" a provable fact
// ---------------------------------------------------------------------------
//
// WHY THIS IS A WRAPPER RATHER THAN A CHECK FOLLOWED BY AN `if`. The argument is
// `withConsent`'s in suggest-subtasks, word for word, because the thing being
// proved is the same shape of thing:
//
//   "Because the thing that has to be proved is a NEGATIVE -- that with the setting
//    off, no task is read and nothing reaches the AI service -- and a negative about
//    an order cannot be proved by testing the pieces one at a time. A test can ask an
//    `if` what it decides; it cannot ask it what did not run after it."
//
// Here the negative is issue #221's fourth condition: "the paid call NEVER MADE when
// the count refuses, with a stubbed service receiving nothing". With this shape a
// test can establish it about THIS code rather than about a copy of its order written
// out in a test file: `proceed` IS the rest of the handler, so the test hands in a
// `proceed` that would call a stubbed AI service or a stubbed email sender, and then
// asserts the stub was never called.
//
// AND THE OVER-CORRECTION IS GUARDED FROM THE OTHER SIDE, as withConsent's is: a
// gate that refused everybody would pass that test too, so the tests also assert that
// a count which says yes calls `proceed` exactly once and returns its answer
// untouched.
//
// WHAT IT DELIBERATELY DOES NOT DO IS LOG. `unknownAnswer` is a callback, so each
// function logs its own line beside building its own sentence -- which differ, and
// have to: suggest-subtasks says the one fixed sentence it says for every piece of
// broken plumbing, and invite-member says "could not check, so nothing was sent" in
// the shape it uses for every other check that did not answer. A log line written here
// could not know which function it was in.

/**
 * Count one use, and either refuse or run the rest of the handler.
 *
 * `count`          the rpc call, written out at the call site.
 * `unknownAnswer`  what to answer when the count did not answer at all. Called only
 *                  in that case, so it is also where the function logs.
 * `proceed`        the rest of the handler -- everything that spends money.
 *
 * THE AT-LIMIT ANSWER IS NOT A PARAMETER, on purpose. docs/plan.md: "One sentence for
 * both features", so there is nothing for a call site to choose and no way for the two
 * functions to drift into saying two different things about the same fact.
 */
export async function withDailyLimit(
  options: { count: UsageCountCall; unknownAnswer: () => Response },
  proceed: () => Promise<Response>,
): Promise<Response> {
  const use = await countOneUse(options.count);

  if (use.allowed) return await proceed();

  if (use.why === "at_limit") {
    // Not logged, and that is the same decision as the consent refusal's and
    // `busy`'s: a person having used their twenty is not news, and a log line every
    // time somebody reaches a limit is a log line that makes the real ones harder to
    // find.
    return dailyLimitRefusal();
  }

  // The count did not answer, so whether this person may spend money is NOT KNOWN --
  // and an unknown is not a yes. The function's own answer, and its own log line.
  return options.unknownAnswer();
}
