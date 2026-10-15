// switches.ts -- the four kill switches, the four sentences, and the one way to
// read one.
//
// Build it 29, Lesson J24. The database half is
// supabase/migrations/20261015120000_feature_switches.sql, which builds
// `public.feature_switches` and `public.feature_on()`; docs/incident-plan.md is the
// page that says how to use them on a bad day.
//
// WHAT A KILL SWITCH IS FOR, because it is the reason every choice below goes the
// way it does: the owner must be able to stop one risky feature WITHOUT A DEPLOY.
// One value in the Supabase Table Editor, and the next request is refused -- no
// branch, no pull request, no build.
//
// It lives beside limits.ts and is shaped like it on purpose: the features are the
// database's words rather than this file's, the read is handed IN as a function so
// a test can hand in one that fails, and the gate is a WRAPPER so that "nothing was
// sent" is a provable fact about an order rather than an argument about an `if`.
//
// NO IMPORTS, so the Deno tests beside the functions can load it under any of the
// function folders' deno.json, and so nothing here can drift with a dependency.

// ---------------------------------------------------------------------------
// The four features, which are the database's words and not this file's
// ---------------------------------------------------------------------------
//
// feature_switches_feature_allowed in 20261015120000_feature_switches.sql is the
// fixed list: `check (feature in ('ai_suggestions', 'invitations', 'attachments',
// 'payments'))`. These constants exist so a call site names a value rather than
// spelling a string.
//
// AND A MISSPELLING HERE SWITCHES THE FEATURE OFF rather than leaving it on, which
// is the one thing to know about this list. public.feature_on() answers false for
// any word it has no row for, so `'ai_suggestion'` would refuse every ask with the
// switched-off sentence. That is the safe direction -- a kill switch whose typo
// fails open is a kill switch that does nothing on the day it is flipped -- and it
// is loud enough to find in a minute.
//
// A feature word is not a thing to add here alone. Adding one needs a new
// migration, on purpose.
export const SWITCH_AI_SUGGESTIONS = "ai_suggestions";
export const SWITCH_INVITATIONS = "invitations";
export const SWITCH_ATTACHMENTS = "attachments";
export const SWITCH_PAYMENTS = "payments";

export const SWITCHES = [
  SWITCH_AI_SUGGESTIONS,
  SWITCH_INVITATIONS,
  SWITCH_ATTACHMENTS,
  SWITCH_PAYMENTS,
] as const;

export type Switch = (typeof SWITCHES)[number];

// The database function, and the name of its one argument. PostgREST matches rpc
// arguments BY NAME, so a misspelled key is a 404 from the database rather than a
// default -- which is a refusal, which is the right direction. Constants so the
// five call sites cannot disagree about them.
export const SWITCH_RPC = "feature_on";
export const SWITCH_ARGUMENT = "p_feature";

// ---------------------------------------------------------------------------
// THE FOUR SENTENCES
// ---------------------------------------------------------------------------
//
// "Switched off → a friendly message ('Suggestions are switched off for now.' and
// equivalents), never a crash" -- the owner's instruction for Build it 29, and the
// first of these is their wording character for character. The other three are the
// same sentence about the other three features.
//
// WHAT THEY SAY, AND IT IS THE WHOLE RULE THEY ARE WRITTEN TO: this app turned the
// feature off on purpose, and nothing is wrong with the person or with their
// request. No company, no table, no status, no code, no promise about when it comes
// back -- because nobody knows when, and a sentence that guessed would be the kind
// of reassurance this app does not do.
//
// WHY "for now" IS IN ALL FOUR. It is the difference between this and the twelve
// fixed failure codes suggest-subtasks already has: those mean "something in this
// app's plumbing went wrong, press it again later", and this means "somebody
// decided". "for now" is the shortest honest way to say the second without
// promising a time.
//
// AND THEY ARE COPIED IN web/src/lib/switches.ts, deliberately, for the reason
// web/src/lib/suggestions.ts gives about the daily limit's sentence: the deployed
// function is a different program from the one in this branch until somebody
// deploys, so the screen holds its own copy. scripts/screen-state-check.mjs
// compares the two sets character for character, so a change to one is a red check
// rather than two screens saying different things.
export const SWITCHED_OFF_MESSAGES: Readonly<Record<Switch, string>> = {
  [SWITCH_AI_SUGGESTIONS]: "Suggestions are switched off for now.",
  [SWITCH_INVITATIONS]: "Invitations are switched off for now.",
  [SWITCH_ATTACHMENTS]: "Attachments are switched off for now.",
  [SWITCH_PAYMENTS]: "Payments are switched off for now.",
};

// ---------------------------------------------------------------------------
// The codes: one per feature for OFF, and ONE for "the switch did not answer"
// ---------------------------------------------------------------------------
//
// FOUR OFF CODES RATHER THAN ONE, because the four are different news in a log
// line: which feature somebody has switched off is the whole of what the owner
// wants to see there, and a single `switched_off` would make four incidents look
// alike. The person at the screen sees no difference -- they get the sentence for
// the button they pressed.
//
// NONE OF THEM IS ONE OF suggest-subtasks' TWELVE FIXED CODES, and that is the same
// decision the consent refusal and the daily limit both took: "those twelve all
// mean 'something in this app's plumbing went wrong, press it again later', and
// this one is a fact [...] they can plan around". A refusal a person can understand
// earns its own words and its own code.
export const SWITCHED_OFF_CODES: Readonly<Record<Switch, string>> = {
  [SWITCH_AI_SUGGESTIONS]: "ai_suggestions_switched_off",
  [SWITCH_INVITATIONS]: "invitations_switched_off",
  [SWITCH_ATTACHMENTS]: "attachments_switched_off",
  [SWITCH_PAYMENTS]: "payments_switched_off",
};

// AND ONE CODE FOR THE READ THAT DID NOT ANSWER, which is a different fact and has
// to be. The same split `ai_suggestions_unknown` and `daily_limit_unknown` already
// have, and for the reason docs/plan.md gives about the first of those: a failed
// read is not a yes -- AND IT IS ALSO NOT A "SOMEBODY SWITCHED THIS OFF". Answering
// the switched-off sentence here would be this app claiming a decision nobody made,
// which is the one thing the sentence must never do.
//
// So the function says the fixed thing it says for every piece of broken plumbing,
// in its own words, and this code goes in the log line beside it.
export const SWITCH_UNKNOWN_CODE = "switch_unknown";

// AND ONE MORE WORD, WHICH IS NOT A CODE AND NOT A SENTENCE: the `reason`
// accept-invite sends so that the /invite/<token> page knows which of its own
// sentences to draw. It is in INVITE_REASONS in web/src/lib/teams.ts, which is the
// fixed list that page will accept, and scripts/screen-state-check.mjs compares the
// two spellings. See switchedOffRefusal for why a reason exists at all.
export const SWITCH_OFF_REASON = "switched_off";

// 503, because a feature somebody switched off is a service that is deliberately
// not available -- not 403, which says a rule about who you are refused you, and
// not 429, which the daily limit uses because it means "too many requests".
//
// NO SCREEN DECIDES ITS WORDING FROM THIS NUMBER. Each screen reads the CODE, the
// way web/src/lib/teams.ts already does for `account_suspended` and `daily_limit`.
export const SWITCHED_OFF_STATUS = 503;

/**
 * The refusal, built here so that all five functions and every test read the body
 * THIS file sends rather than one they write out for themselves.
 *
 * The same argument limits.ts's `dailyLimitRefusal` and invite-member's answer
 * builders rest on -- and the same argument that caught a missing `code` on staging
 * in October 2026.
 *
 * `{ error, code }` and nothing else. No feature word in the body beyond what the
 * code says, no user id, no timestamp, and nothing about who switched it off.
 */
export function switchedOffRefusal(feature: Switch, reason?: string): Response {
  return Response.json(
    {
      error: SWITCHED_OFF_MESSAGES[feature],
      code: SWITCHED_OFF_CODES[feature],
      // `reason` ONLY WHEN A CALLER ASKS FOR ONE, and it is not a wording choice.
      // accept-invite's caller -- the /invite/<token> page -- picks its own
      // sentence from a short `reason` out of a fixed list, the way that page
      // picks every other sentence it draws (web/src/lib/teams.ts, INVITE_REASONS).
      // So this field is how that page is told WHICH of its own sentences to use;
      // the sentence and the code above are still fixed here, and no call site can
      // choose them.
      ...(reason === undefined ? {} : { reason }),
    },
    { status: SWITCHED_OFF_STATUS },
  );
}

// ---------------------------------------------------------------------------
// Reading one switch, which is one call and one decision
// ---------------------------------------------------------------------------

/**
 * The call that reads a switch, passed in as a function that performs it.
 *
 * Shaped exactly like `AccountStatusRead`, `AiConsentRead` and `UsageCountCall`,
 * and passed in for the two reasons those give: a test can hand this a call that
 * FAILS and prove the fail-closed branch with no database, a key or a network, and
 * the rpc stays written out at the call site where a reviewer can see which
 * function is called with which argument.
 *
 * `data: unknown` on purpose. This code is written to be handed anything at all,
 * because a deployed database older or newer than this file is one of the things it
 * can be handed.
 */
export type SwitchRead = () => PromiseLike<{
  data: unknown;
  error: { code?: string } | null;
}>;

/**
 * Three answers, not two, and the third is the one that matters.
 *
 * `off`      the switch says this feature is off. Somebody decided that, and the
 *            person gets the sentence for it.
 * `unknown`  the read errored, threw, or answered something that is not a boolean.
 *            Whether this feature may run is NOT KNOWN -- and an unknown is not a
 *            yes, nor is it a decision anybody made.
 */
export type SwitchVerdict =
  | { on: true }
  | { on: false; why: "off" }
  | { on: false; why: "unknown"; code?: string };

/**
 * Read one switch, and say whether the feature may run.
 *
 * FAIL CLOSED, which is the whole of the design and is argued in the migration's
 * header: a kill switch has exactly one failure that matters, and it is the owner
 * flipping it off while the feature carries on.
 *
 * Exported so the tests run THIS decision rather than a copy of it.
 */
export async function readSwitch(read: SwitchRead): Promise<SwitchVerdict> {
  let answer: { data: unknown; error: { code?: string } | null };
  try {
    answer = await read();
  } catch {
    // A thrown error -- the network, the client itself, a database with no such
    // function yet. Nothing about the cause is returned or logged here.
    return { on: false, why: "unknown" };
  }

  // Lesson F14: the error AND what came back. An error here is a missing function
  // (a project the migration has not reached), a 42501 if the execute grant ever
  // went missing, or a lost connection -- and all of them mean the same thing to
  // this function.
  if (answer?.error) {
    return { on: false, why: "unknown", code: answer.error.code };
  }

  // `=== true` AND `=== false`, with everything else falling through to unknown.
  // Nothing truthy, nothing falsy: public.feature_on() returns boolean and never
  // null, so a value that is neither of those two did not come out of it -- and the
  // string "false" is truthy in JavaScript, which is the mistake these two lines
  // are written to make impossible. The same two lines, for the same reason, as
  // checkAiConsent's reading of the consent column and countOneUse's reading of the
  // counter.
  if (answer?.data === true) return { on: true };
  if (answer?.data === false) return { on: false, why: "off" };

  return { on: false, why: "unknown" };
}

// ---------------------------------------------------------------------------
// THE GATE, which is what makes "nothing happened" a provable fact
// ---------------------------------------------------------------------------
//
// A WRAPPER RATHER THAN A CHECK FOLLOWED BY AN `if`, and the argument is
// `withConsent`'s and `withDailyLimit`'s, word for word, because the thing being
// proved is the same shape of thing:
//
//   "Because the thing that has to be proved is a NEGATIVE -- that with the setting
//    off, no task is read and nothing reaches the AI service -- and a negative about
//    an order cannot be proved by testing the pieces one at a time. A test can ask an
//    `if` what it decides; it cannot ask it what did not run after it."
//
// Here the negative is the point of the whole feature: with the switch off, NOTHING
// the switch guards happens. `proceed` IS the rest of the handler, so a test hands
// in a `proceed` that would call a stubbed AI service, a stubbed email sender or a
// stubbed Stripe, and then asserts the stub was never called.
//
// AND THE OVER-CORRECTION IS GUARDED FROM THE OTHER SIDE, as both of those are: a
// gate that refused everybody would pass that test too, so the tests also assert
// that a switch which says on calls `proceed` exactly once and returns its answer
// untouched.
//
// WHAT IT DELIBERATELY DOES NOT DO IS LOG THE OFF CASE. A feature the owner
// switched off, being refused, is not news -- it is the switch working, and a log
// line per press would bury the real lines on the one day somebody is reading them.
// The same decision `withConsent` and the daily limit both took. `unknownAnswer` IS
// a callback, so each function logs its own line for the case that is news.

/**
 * Read the switch, and either refuse or run the rest of the handler.
 *
 * `feature`        which switch, from the four constants above.
 * `read`           the rpc call, written out at the call site.
 * `unknownAnswer`  what to answer when the switch did not answer at all. Called
 *                  only in that case, so it is also where the function logs.
 * `proceed`        the rest of the handler -- everything the switch guards.
 *
 * THE OFF ANSWER IS NOT A PARAMETER, on purpose: there is one sentence per feature
 * and no way for two call sites to drift into saying different things about the same
 * fact. invite-member and accept-invite therefore say the SAME sentence about the
 * invitations switch, which is right -- it is one switch.
 */
export async function withSwitch(
  options: {
    feature: Switch;
    read: SwitchRead;
    unknownAnswer: () => Response;
    // The `reason` field for a caller that picks its own wording from one -- only
    // accept-invite, whose page does. NOT a way to change the sentence: see
    // switchedOffRefusal.
    offReason?: string;
  },
  proceed: () => Promise<Response>,
): Promise<Response> {
  const verdict = await readSwitch(options.read);

  if (verdict.on) return await proceed();

  if (verdict.why === "off") {
    return switchedOffRefusal(options.feature, options.offReason);
  }

  // The switch did not answer, so whether this feature may run is NOT KNOWN -- and
  // an unknown is neither a yes nor a decision somebody made. The function's own
  // answer, and its own log line.
  return options.unknownAnswer();
}
