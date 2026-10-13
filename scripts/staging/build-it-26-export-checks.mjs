#!/usr/bin/env node
// build-it-26-export-checks.mjs -- the export, against STAGING, and against a
// DEPLOYED build for the one thing only a request can answer.
//
// Build it 26, PR 3. STAGING ONLY for everything that signs in.
//
// ---------------------------------------------------------------------------
// THIS PULL REQUEST HAS NO MIGRATION, AND THAT CHANGES WHAT A BEFORE RUN IS FOR
// ---------------------------------------------------------------------------
//
// Its siblings -- build-it-23-attachment-checks, build-it-25-limits-checks --
// are run before and after `supabase db push`, and their BEFORE runs FAIL
// loudly, because the rules they ask about do not exist yet. The export adds NO
// rule, NO policy, NO privilege and NO table. It is a read, made with the
// caller's own session, of rows row-level security already lets them read.
//
// So the before and after are not symmetrical here, and both halves are worth
// having for different reasons:
//
//   SECTIONS 1-6 (staging)   MUST PASS BEFORE AND AFTER. They are the CONTROL
//                            for the claim this pull request rests on: that the
//                            export needed no new access. A difference between
//                            the two runs would mean the export changed
//                            somebody's visibility, which is the one thing it
//                            must not do.
//   SECTION 7 (--app)        ONE judgement is expected to FAIL before the merge
//                            and PASS after it: the privacy page carrying the
//                            sentence about the download. That is the only
//                            thing in this feature a script with no session can
//                            observe changing, and it is what makes the AFTER
//                            run mean something.
//
// ---------------------------------------------------------------------------
// WHAT IT CREATES, AND WHAT IT WILL NEVER TOUCH
// ---------------------------------------------------------------------------
//
// TWO TASKS, both titled from one fixed prefix -- see MARK below -- so a
// leftover is recognisable at a glance in the dashboard and can never be
// mistaken for somebody's real task. The cleanup matches on that prefix and on
// nothing else, so no row this script did not create can be removed by it.
//
//   Alice  one PERSONAL task. It is what her own export must contain.
//   Carol  one task IN ALICE'S TEAM. It is what Alice's export must NOT
//          contain, and it is the whole point: the SELECT policy on `tasks`
//          lets Alice READ it, so the thing keeping it out of her file is the
//          export's own filter.
//
// IT WRITES NOTHING ELSE. No team is made or changed, no invitation is sent, no
// file is uploaded, no setting is switched, and no account is created. The
// uploads are left out on purpose: issue #298 records that every CI run already
// spends one of Alice's thirty daily uploads on staging, and the storage rules
// are proved on every pull request by web/tests/access-rules.test.mjs.
//
// AND IT SPENDS NOTHING AT A VENDOR. The export is not counted against a daily
// limit -- the owner's decision 9 of 2026-10-12 -- and nothing this script does
// reaches Anthropic or the email service.
//
// WHAT IT NEVER PRINTS: a password, an access token, a user id, the publishable
// key, the project URL, or a task's real title. Statuses, error codes, counts
// and this script's own marked titles are printed, because those are what the
// judgements are about.
//
// ---------------------------------------------------------------------------
// HOW TO RUN IT
// ---------------------------------------------------------------------------
//
//   node scripts/staging/build-it-26-export-checks.mjs --selftest
//       The logic only. No setting is read, no request is made, no account is
//       used. CI runs this on every pull request IF the owner asks for the line
//       (AGENTS.md rule 5 reserves .github/workflows/ to the owner).
//
//   node scripts/staging/build-it-26-export-checks.mjs
//       Sections 1-6, against staging. Needs web/.env.local for the URL and the
//       publishable key, and ALICE_EMAIL / ALICE_PASSWORD / BOB_EMAIL /
//       BOB_PASSWORD / CAROL_EMAIL / CAROL_PASSWORD in the environment.
//
//   node scripts/staging/build-it-26-export-checks.mjs --app=https://<address>
//       The same, plus section 7 against a DEPLOYED build. Without the flag
//       section 7 reports UNVERIFIED and makes no request -- which is the shape
//       build-it-20-ai-checks uses for its --ai-limit section.
//
//   node scripts/staging/build-it-26-export-checks.mjs --cleanup
//       Removes every task whose title starts with this script's prefix and
//       reports the count. Makes no judgement and runs no check.
//
// THE --app ADDRESS IS PRODUCTION'S, NOT A PREVIEW'S, and that is not a
// preference: Vercel's Deployment Protection "requires authentication for all
// requests, including those to Routing Middleware"
// (https://vercel.com/docs/deployment-protection, read 2026-10-13), so a script
// gets Vercel's own sign-in page rather than this app. Vercel documents a bypass
// and it is a SECRET, which would mean a secret on a command line -- forbidden
// outright. scripts/staging/build-it-26-legal-pages-checks.mjs learned that the
// hard way on 13 October and this script borrows its host comparison.
//
// NO SECRET IS EVER ON THE COMMAND LINE. The only argument is a public web
// address; every password comes from the environment and none is printed.
//
// NO PACKAGES. Node built-ins and global fetch only (AGENTS.md rule 17).

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// The one place this repository spells Cloudflare's dummy token -- the owner's
// decision J of 11 October 2026. Staging has CAPTCHA switched on, so every
// sign-in in this repository has to carry it.
import { captchaBody } from "../lib/captcha.mjs";

const PASS = "PASS";
const FAIL = "FAIL";
const UNVERIFIED = "UNVERIFIED";

const STAGING_REF = "ghskxrhqlhvrhpnivqbd";
const STAGING_HOST = `${STAGING_REF}.supabase.co`;

const HERE = dirname(fileURLToPath(import.meta.url));
const ENV_FILE = resolve(HERE, "..", "..", "web", ".env.local");

// Everything this run makes is named from this.
const MARK = "bi26-export-check";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// PostgreSQL's insufficient_privilege, which PostgREST passes through in the
// body. It is what a table with no policy and no grant answers.
const RLS_VIOLATION = "42501";

// The sentence the privacy page must carry once the export exists. It is a
// SHORT, DISTINCTIVE PHRASE rather than the whole paragraph, so the owner can
// reword the sentence without this script going red for the wrong reason --
// what it holds is that the SUBJECT reached the browser.
const EXPORT_PHRASE = "download what this app holds about you";

// And where the download lives. A signed-out request for it must NOT come back
// with a file.
const EXPORT_PATH = "/settings/export";

function die(message) {
  console.error(`\nREFUSING TO RUN: ${message}\n`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Reading an answer -- the ONE place a body becomes something a judgement can
// look at
// ---------------------------------------------------------------------------
//
// IT IS A SEPARATE PURE FUNCTION SO THE SELFTEST CAN DRIVE THE REAL READING
// PATH, which is the lesson scripts/staging/build-it-23-attachment-checks.mjs
// records the hard way: its first selftest handed every judgement an object it
// had built itself, so an order-of-operations bug in the reading step was
// invisible to every case. A fixture that skips the parser is a fixture that
// agrees with its author.
export function readRestAnswer({ status, raw, error }) {
  if (error) return { error };

  let json = null;
  try {
    json = JSON.parse(raw);
  } catch {
    json = null;
  }

  return { status, json };
}

/** The PostgreSQL error code off a PostgREST refusal, or null. */
export function codeOf(answer) {
  const bag = answer.json;
  if (bag === null || typeof bag !== "object" || Array.isArray(bag)) return null;
  return typeof bag.code === "string" ? bag.code : null;
}

/** The rows of a successful answer, or an empty list. */
export function rowsOf(answer) {
  return Array.isArray(answer.json) ? answer.json : [];
}

/** Do the rows carry a title starting with this script's prefix? */
export function holdsMarked(answer, suffix) {
  return rowsOf(answer).some(
    (row) =>
      row !== null &&
      typeof row === "object" &&
      typeof row.title === "string" &&
      row.title.startsWith(`${MARK} ${suffix}`),
  );
}

// ---------------------------------------------------------------------------
// The judgements -- pure functions, which is what --selftest exercises
// ---------------------------------------------------------------------------

/** Is this URL the staging project, and nothing else? */
export function judgeStagingUrl(url) {
  const what = `the Supabase URL is the staging project, exactly ${STAGING_HOST}`;
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return [{ what, verdict: FAIL, detail: "that value does not parse as a URL at all" }];
  }
  if (parsed.protocol !== "https:") {
    return [{ what, verdict: FAIL, detail: `its scheme is "${parsed.protocol}", not "https:"` }];
  }
  if (parsed.username !== "" || parsed.password !== "") {
    return [{ what, verdict: FAIL, detail: "it carries credentials in the URL" }];
  }
  if (parsed.host !== STAGING_HOST) {
    return [{ what, verdict: FAIL, detail: "its host is not the staging project's" }];
  }
  return [{ what, verdict: PASS, detail: "the host matches, over https, with no credentials in it" }];
}

/**
 * THE HEADLINE JUDGEMENT. Alice's export reads her own rows and not her team
 * mate's, and the thing that keeps the second out is the export's own filter.
 *
 * `filtered` is the answer to the query the route actually makes --
 * `tasks?owner_id=eq.<her>`. `unfiltered` is the same read with the filter
 * taken off, which is what a later tidy-up would leave behind.
 *
 * BOTH HALVES ARE REQUIRED, and that is the whole design of this check:
 *
 *   the filtered answer HAS her task and NOT Carol's   -> the export is hers
 *   the unfiltered answer HAS Carol's                  -> the policy is WIDER,
 *                                                         so the filter is what
 *                                                         is doing the work
 *
 * Without the second half this would pass just as happily on a project where
 * the policy itself happened to hide Carol's task -- and then nothing would
 * notice the day the filter was removed.
 */
export function judgeOwnTasksOnly(filtered, unfiltered) {
  const results = [];

  if (filtered.error || unfiltered.error) {
    return [
      {
        what: "Alice's export reads her own tasks and not her team mate's",
        verdict: FAIL,
        detail: "one of the two reads did not arrive at all",
      },
    ];
  }

  const hasMine = holdsMarked(filtered, "alice");
  const hasTheirs = holdsMarked(filtered, "carol");

  results.push({
    what: "the export's own read holds Alice's marked task",
    verdict: hasMine ? PASS : FAIL,
    detail: hasMine
      ? `found it among ${rowsOf(filtered).length} row(s)`
      : `it is NOT there, among ${rowsOf(filtered).length} row(s) (status ${filtered.status})`,
  });

  results.push({
    what: "AND IT DOES NOT HOLD CAROL'S, which is the one row this file must never carry",
    verdict: hasTheirs ? FAIL : PASS,
    detail: hasTheirs
      ? "Carol's marked task is in the answer the export builds its file from"
      : "it is not there",
  });

  const policyShowsTheirs = holdsMarked(unfiltered, "carol");

  results.push({
    what: "and the POLICY would have shown it, so the filter is what keeps it out",
    verdict: policyShowsTheirs ? PASS : FAIL,
    detail: policyShowsTheirs
      ? "the same read without the owner filter does return Carol's task"
      : "the unfiltered read did NOT return it either, so this check proved nothing about the filter -- " +
        "Carol may not be in a team with Alice, or her task was not created",
  });

  return results;
}

/**
 * An outsider's version of each of the export's six reads returns none of
 * Alice's marked rows.
 *
 * `answers` is `{ label, answer }` per read. A refusal and an empty answer are
 * BOTH acceptable here and are reported differently, because the two are what
 * row-level security does in two different situations: a table with no matching
 * policy answers 42501, and a policy that matches no row answers an empty list.
 */
export function judgeOutsiderSeesNothing(answers) {
  return answers.map(({ label, answer }) => {
    const what = `Bob's own read of ${label} carries nothing of Alice's`;

    if (answer.error) {
      return { what, verdict: FAIL, detail: "the request did not arrive at all" };
    }

    const code = codeOf(answer);
    if (code !== null) {
      return {
        what,
        verdict: PASS,
        detail: `refused with ${code} (status ${answer.status})`,
      };
    }

    const marked = holdsMarked(answer, "alice") || holdsMarked(answer, "carol");
    return {
      what,
      verdict: marked ? FAIL : PASS,
      detail: marked
        ? "A MARKED ROW OF ALICE'S IS IN BOB'S ANSWER"
        : `${rowsOf(answer).length} row(s), none of them marked`,
    };
  });
}

/**
 * A signed-out caller, with the publishable key and no session, gets nothing
 * from any of the export's reads.
 *
 * The key is designed to ship in a browser, so this is not a check that it is
 * secret -- it is a check that it is worth nothing on its own, which is what
 * every policy in this project being `to authenticated` means.
 */
export function judgeSignedOutSeesNothing(answers) {
  return answers.map(({ label, answer }) => {
    const what = `a signed-out caller reads nothing from ${label}`;

    if (answer.error) {
      return { what, verdict: FAIL, detail: "the request did not arrive at all" };
    }

    const code = codeOf(answer);
    if (code !== null) {
      return { what, verdict: PASS, detail: `refused with ${code} (status ${answer.status})` };
    }

    const rows = rowsOf(answer);
    return {
      what,
      verdict: rows.length === 0 ? PASS : FAIL,
      detail:
        rows.length === 0
          ? `answered an empty list (status ${answer.status})`
          : `IT ANSWERED ${rows.length} ROW(S) to a caller with no session`,
    };
  });
}

/**
 * The two tables the export deliberately leaves out are closed to everybody,
 * which is WHY it leaves them out.
 *
 * The owner's decisions 8c and 8d of 2026-10-12: `usage_counts` and
 * `account_status` are not in the file, because `docs/plan.md` says nobody may
 * read either through the app -- not even the person they are about. If either
 * ever answered rows, the reason for leaving it out would have gone, and the
 * privacy page's promise to say they exist and how to ask would be the wrong
 * shape.
 */
export function judgeClosedTablesRefuse(answers) {
  return answers.map(({ label, answer }) => {
    const what = `${label} is closed even to the person it is about, which is why the export omits it`;

    if (answer.error) {
      return { what, verdict: FAIL, detail: "the request did not arrive at all" };
    }

    const code = codeOf(answer);
    if (code === RLS_VIOLATION) {
      return { what, verdict: PASS, detail: `refused with ${code} (status ${answer.status})` };
    }
    if (code !== null) {
      return {
        what,
        verdict: PASS,
        detail: `refused with ${code} (status ${answer.status}) -- not ${RLS_VIOLATION}, but a refusal`,
      };
    }

    const rows = rowsOf(answer);
    return {
      what,
      verdict: FAIL,
      detail: `IT ANSWERED ${rows.length} ROW(S) (status ${answer.status}); the export's reason for leaving it out no longer holds`,
    };
  });
}

/**
 * The consent setting is readable only through the function, and the function
 * cannot be asked about anybody else.
 *
 * `direct` is `profiles?select=ai_suggestions_enabled`, which must be refused:
 * no client role holds SELECT on that column, which is how a team mate is kept
 * from reading it through the existing team-mate policy -- and it closes the
 * person's own ordinary read with it (issue #207).
 *
 * `rpc` is `my_ai_suggestions()`, which must answer exactly one row.
 *
 * `rpcWithArgument` is the same call with a `user_id` in the body. The function
 * takes NO arguments -- who is asking comes from `auth.uid()` in its own body --
 * so this must either be refused or answer the caller's own row. What it must
 * never do is answer about the id that was sent.
 */
export function judgeConsentReadable(direct, rpc, rpcWithArgument) {
  const results = [];

  const directCode = direct.error ? null : codeOf(direct);
  results.push({
    what: "a direct select of the consent column is refused, for the person's own row",
    verdict: directCode === RLS_VIOLATION ? PASS : FAIL,
    detail: direct.error
      ? "the request did not arrive at all"
      : directCode === null
        ? `IT ANSWERED ${rowsOf(direct).length} ROW(S) (status ${direct.status}) -- the column is readable`
        : `refused with ${directCode} (status ${direct.status})`,
  });

  const rpcRows = rpc.error ? [] : rowsOf(rpc);
  results.push({
    what: "my_ai_suggestions() answers exactly one row for the caller",
    verdict: !rpc.error && rpcRows.length === 1 ? PASS : FAIL,
    detail: rpc.error
      ? "the request did not arrive at all"
      : `${rpcRows.length} row(s), status ${rpc.status}`,
  });

  const withCode = rpcWithArgument.error ? null : codeOf(rpcWithArgument);
  const withRows = rpcWithArgument.error ? [] : rowsOf(rpcWithArgument);
  const sameAnswer =
    withCode !== null ||
    (withRows.length === 1 &&
      rpcRows.length === 1 &&
      JSON.stringify(withRows[0]) === JSON.stringify(rpcRows[0]));

  results.push({
    what: "and it cannot be asked about somebody else: a user_id in the body changes nothing",
    verdict: sameAnswer ? PASS : FAIL,
    detail: rpcWithArgument.error
      ? "the request did not arrive at all"
      : withCode !== null
        ? `refused with ${withCode} (status ${rpcWithArgument.status})`
        : "the answer differs from the one with no argument",
  });

  return results;
}

// ---------------------------------------------------------------------------
// Section 7's judgements -- the DEPLOYED build, with no session at all
// ---------------------------------------------------------------------------

/**
 * Is this host one of Vercel's own, rather than the address we asked for?
 *
 * Borrowed, with its reason, from
 * scripts/staging/build-it-26-legal-pages-checks.mjs: Vercel's Deployment
 * Protection redirects to a path literally called `/login`, on `vercel.com`,
 * and this app's Proxy redirects to `/login` on this app's own host -- so the
 * one string the two cases have in common is the only one a path comparison
 * would see. An exact match or a dot-suffix, never `includes`.
 */
export function isVercelHost(host) {
  if (typeof host !== "string") return false;
  const h = host.trim().toLowerCase();
  return h === "vercel.com" || h.endsWith(".vercel.com");
}

/**
 * THE ONE JUDGEMENT EXPECTED TO FAIL BEFORE THE MERGE. The privacy page carries
 * the sentence about the download.
 *
 * It is the only part of this feature a script with no session can watch
 * change: the route needs a session, and `/settings` is behind the proxy's
 * sign-in check, so there is nothing else on a deployed build for a cookieless
 * request to compare.
 */
export function judgeExportSentenceOnPage(answer, expectedHost) {
  const what = "the privacy page carries the sentence about downloading your data";

  if (answer === null) {
    return [{ what, verdict: FAIL, detail: "the request did not arrive at all" }];
  }
  if (answer.finalHost !== expectedHost) {
    return [
      {
        what,
        verdict: FAIL,
        detail: isVercelHost(answer.finalHost)
          ? "Vercel's protection: this address cannot be checked from a script. Use production after the merge, " +
            "or open it in a browser signed in to Vercel. This app's own code did not run, so nothing here is its fault"
          : `redirected off this address, to ${answer.finalHost}${answer.finalPath}`,
      },
    ];
  }
  if (answer.status !== 200) {
    return [{ what, verdict: FAIL, detail: `answered ${answer.status}, not 200` }];
  }

  const body = typeof answer.body === "string" ? answer.body : "";
  const found = body.includes(EXPORT_PHRASE);

  return [
    {
      what,
      verdict: found ? PASS : FAIL,
      detail: found
        ? `found, in ${body.length} bytes`
        : `NOT THERE, in ${body.length} bytes. Before the merge that is the expected BEFORE; after it, the page did not render what the module holds`,
    },
  ];
}

/**
 * And the download is not reachable without a session.
 *
 * `/settings` is absent from `PUBLIC_PATHS`, so the proxy redirects a
 * cookieless request to `/login` before the route is reached at all. A 200 with
 * a JSON body here would be the worst failure this feature could have: one
 * person's whole export handed to anybody who knew the address.
 *
 * IT PASSES BEFORE AND AFTER THE MERGE, which is said rather than left to be
 * noticed: before it, the route does not exist; after it, the proxy turns the
 * request away. Both are the right answer, and the check is here for the day
 * somebody adds "/settings" to that list.
 */
export function judgeExportPathNotPublic(answer, expectedHost) {
  const what = `${EXPORT_PATH} hands nothing to a caller with no session`;

  if (answer === null) {
    return [{ what, verdict: FAIL, detail: "the request did not arrive at all" }];
  }

  const body = typeof answer.body === "string" ? answer.body : "";
  const looksLikeTheFile =
    body.includes("what_is_not_in_this_file") || body.includes("format_version");

  if (looksLikeTheFile) {
    return [
      {
        what,
        verdict: FAIL,
        detail:
          "IT ANSWERED SOMETHING SHAPED LIKE THE EXPORT FILE to a request with no cookie. " +
          `Check whether "/settings" has been added to PUBLIC_PATHS in web/src/lib/supabase/proxy.ts`,
      },
    ];
  }

  if (answer.finalHost !== expectedHost) {
    return [
      {
        what,
        verdict: isVercelHost(answer.finalHost) ? UNVERIFIED : FAIL,
        detail: isVercelHost(answer.finalHost)
          ? "Vercel's protection answered instead of this app, so this proves nothing either way"
          : `redirected off this address, to ${answer.finalHost}${answer.finalPath}`,
      },
    ];
  }

  return [
    {
      what,
      verdict: PASS,
      detail: `ended at ${answer.finalPath} (status ${answer.status}), and the body is not the export file`,
    },
  ];
}

// ---------------------------------------------------------------------------
// --selftest
// ---------------------------------------------------------------------------

function runSelftest() {
  console.log("\nbuild-it-26-export-checks --selftest: can these checks fail?\n");

  const ok = (status, rows) => readRestAnswer({ status, raw: JSON.stringify(rows) });
  const refused = (status, code) =>
    readRestAnswer({ status, raw: JSON.stringify({ code, message: "no" }) });
  const dead = () => readRestAnswer({ error: new Error("network") });

  const aliceRow = { id: "x", title: `${MARK} alice personal`, owner_id: "a" };
  const carolRow = { id: "y", title: `${MARK} carol in alices team`, owner_id: "c" };

  const HOST = "team-tasks-example.invalid";
  const page = (extra) => ({
    status: 200,
    body: `<p>You can ${EXPORT_PHRASE}, as one file, from Settings.</p>`,
    finalPath: "/privacy",
    finalHost: HOST,
    ...extra,
  });

  const verdicts = (results) => results.map((r) => r.verdict);

  const cases = [
    // ---------------------------------------------------- the staging URL guard
    {
      name: "the staging URL passes",
      got: verdicts(judgeStagingUrl(`https://${STAGING_HOST}`)),
      want: [PASS],
    },
    { name: "http is refused", got: verdicts(judgeStagingUrl(`http://${STAGING_HOST}`)), want: [FAIL] },
    { name: "another project is refused", got: verdicts(judgeStagingUrl("https://other.supabase.co")), want: [FAIL] },
    { name: "a URL carrying credentials is refused", got: verdicts(judgeStagingUrl(`https://u:p@${STAGING_HOST}`)), want: [FAIL] },
    { name: "a word that is not a URL is refused", got: verdicts(judgeStagingUrl("staging")), want: [FAIL] },
    {
      name: "A HOST THAT MERELY ENDS WITH THE STAGING ONE IS REFUSED",
      got: verdicts(judgeStagingUrl(`https://not-${STAGING_HOST}`)),
      want: [FAIL],
    },

    // -------------------------------------------- the headline, and its control
    {
      name: "the happy world PASSES all three parts, so the rest mean something",
      got: verdicts(judgeOwnTasksOnly(ok(200, [aliceRow]), ok(200, [aliceRow, carolRow]))),
      want: [PASS, PASS, PASS],
    },
    {
      name: "THE WORLD WHERE THE FILTER IS GONE: Carol's task in Alice's own read FAILS the second part",
      got: verdicts(judgeOwnTasksOnly(ok(200, [aliceRow, carolRow]), ok(200, [aliceRow, carolRow]))),
      want: [PASS, FAIL, PASS],
    },
    {
      name: "AND THE WORLD WHERE THE CHECK PROVED NOTHING: the policy did not show Carol's either, so part three FAILS",
      got: verdicts(judgeOwnTasksOnly(ok(200, [aliceRow]), ok(200, [aliceRow]))),
      want: [PASS, PASS, FAIL],
    },
    {
      name: "Alice's own task missing from her own export FAILS the first part",
      got: verdicts(judgeOwnTasksOnly(ok(200, []), ok(200, [aliceRow, carolRow]))),
      want: [FAIL, PASS, PASS],
    },
    {
      name: "a read that did not arrive FAILS rather than passing on an empty list",
      got: verdicts(judgeOwnTasksOnly(dead(), ok(200, [aliceRow, carolRow]))),
      want: [FAIL],
    },
    {
      name: "a refusal is not an empty answer: a 42501 on Alice's own read FAILS the first part",
      got: verdicts(judgeOwnTasksOnly(refused(401, RLS_VIOLATION), ok(200, [aliceRow, carolRow]))),
      want: [FAIL, PASS, PASS],
    },

    // ------------------------------------------------------------ the outsider
    {
      name: "Bob refused, and Bob answering an empty list, both PASS",
      got: verdicts(
        judgeOutsiderSeesNothing([
          { label: "tasks", answer: refused(401, RLS_VIOLATION) },
          { label: "teams", answer: ok(200, []) },
        ]),
      ),
      want: [PASS, PASS],
    },
    {
      name: "BOB HOLDING A MARKED ROW OF ALICE'S FAILS -- the world where the policy is open",
      got: verdicts(judgeOutsiderSeesNothing([{ label: "tasks", answer: ok(200, [aliceRow]) }])),
      want: [FAIL],
    },
    {
      name: "and Carol's marked row in Bob's answer FAILS too",
      got: verdicts(judgeOutsiderSeesNothing([{ label: "tasks", answer: ok(200, [carolRow]) }])),
      want: [FAIL],
    },
    {
      name: "a request that never arrived is NOT read as 'he saw nothing'",
      got: verdicts(judgeOutsiderSeesNothing([{ label: "tasks", answer: dead() }])),
      want: [FAIL],
    },

    // ----------------------------------------------------------- signed out
    {
      name: "a signed-out caller refused, or answering nothing, PASSES",
      got: verdicts(
        judgeSignedOutSeesNothing([
          { label: "tasks", answer: refused(401, RLS_VIOLATION) },
          { label: "teams", answer: ok(200, []) },
        ]),
      ),
      want: [PASS, PASS],
    },
    {
      name: "A SIGNED-OUT CALLER GETTING ANY ROW AT ALL FAILS, marked or not",
      got: verdicts(
        judgeSignedOutSeesNothing([{ label: "teams", answer: ok(200, [{ id: "z", name: "someone's team" }]) }]),
      ),
      want: [FAIL],
    },
    {
      name: "and a dead request is not a pass here either",
      got: verdicts(judgeSignedOutSeesNothing([{ label: "teams", answer: dead() }])),
      want: [FAIL],
    },

    // ------------------------------------------------------ the closed tables
    {
      name: "usage_counts refusing with 42501 PASSES",
      got: verdicts(judgeClosedTablesRefuse([{ label: "usage_counts", answer: refused(401, RLS_VIOLATION) }])),
      want: [PASS],
    },
    {
      name: "another refusal code still PASSES, because a refusal is a refusal",
      got: verdicts(judgeClosedTablesRefuse([{ label: "account_status", answer: refused(404, "42P01") }])),
      want: [PASS],
    },
    {
      name: "AN EMPTY LIST FAILS, which is the trap: a table with no rows LOOKS like a closed one",
      got: verdicts(judgeClosedTablesRefuse([{ label: "usage_counts", answer: ok(200, []) }])),
      want: [FAIL],
    },
    {
      name: "and rows coming back FAILS: the reason for leaving it out would have gone",
      got: verdicts(judgeClosedTablesRefuse([{ label: "usage_counts", answer: ok(200, [{ used: 4 }]) }])),
      want: [FAIL],
    },

    // ----------------------------------------------------------- the setting
    {
      name: "the consent column refused, one row from the function, the same with an argument: all PASS",
      got: verdicts(
        judgeConsentReadable(
          refused(401, RLS_VIOLATION),
          ok(200, [{ enabled: false, changed_at: null }]),
          ok(200, [{ enabled: false, changed_at: null }]),
        ),
      ),
      want: [PASS, PASS, PASS],
    },
    {
      name: "THE COLUMN BEING READABLE FAILS -- the world issue #207 is about, the other way up",
      got: verdicts(
        judgeConsentReadable(
          ok(200, [{ ai_suggestions_enabled: true }]),
          ok(200, [{ enabled: true, changed_at: null }]),
          ok(200, [{ enabled: true, changed_at: null }]),
        ),
      ),
      want: [FAIL, PASS, PASS],
    },
    {
      name: "AND AN ARGUMENT CHANGING THE ANSWER FAILS -- the function being askable about somebody else",
      got: verdicts(
        judgeConsentReadable(
          refused(401, RLS_VIOLATION),
          ok(200, [{ enabled: false, changed_at: null }]),
          ok(200, [{ enabled: true, changed_at: "2026-10-08T00:00:00Z" }]),
        ),
      ),
      want: [PASS, PASS, FAIL],
    },
    {
      name: "a refusal of the argument form PASSES: refusing is a fine answer to a question it does not take",
      got: verdicts(
        judgeConsentReadable(
          refused(401, RLS_VIOLATION),
          ok(200, [{ enabled: false, changed_at: null }]),
          refused(404, "PGRST202"),
        ),
      ),
      want: [PASS, PASS, PASS],
    },
    {
      name: "the function answering nothing at all FAILS",
      got: verdicts(
        judgeConsentReadable(refused(401, RLS_VIOLATION), ok(200, []), ok(200, [])),
      ),
      want: [PASS, FAIL, FAIL],
    },

    // ----------------------------------------------- the deployed build
    {
      name: "the privacy page carrying the sentence PASSES -- the expected AFTER",
      got: verdicts(judgeExportSentenceOnPage(page(), HOST)),
      want: [PASS],
    },
    {
      name: "THE EXPECTED BEFORE: the page without the sentence FAILS",
      got: verdicts(judgeExportSentenceOnPage(page({ body: "<p>nothing about a download</p>" }), HOST)),
      want: [FAIL],
    },
    {
      name: "a 404 FAILS",
      got: verdicts(judgeExportSentenceOnPage(page({ status: 404, body: "" }), HOST)),
      want: [FAIL],
    },
    {
      name: "VERCEL'S GATE FAILS and says so, rather than blaming this app",
      got: (() => {
        const r = judgeExportSentenceOnPage(
          page({ body: "x".repeat(334009), finalPath: "/login", finalHost: "vercel.com" }),
          HOST,
        );
        return [
          r[0].verdict,
          r[0].detail.includes("cannot be checked from a script"),
          r[0].detail.includes("PUBLIC_PATHS"),
        ];
      })(),
      want: [FAIL, true, false],
    },
    { name: "vercel.com is Vercel's", got: isVercelHost("vercel.com"), want: true },
    { name: "a subdomain of it is", got: isVercelHost("my-team.vercel.com"), want: true },
    { name: "a host merely ENDING with it is not", got: isVercelHost("notvercel.com"), want: false },
    { name: "and vercel.APP is where this app lives, not Vercel's gate", got: isVercelHost("team-tasks-virid.vercel.app"), want: false },

    {
      name: "the export path redirecting a cookieless request PASSES",
      got: verdicts(
        judgeExportPathNotPublic(
          { status: 200, body: "<h1>Sign in</h1>", finalPath: "/login", finalHost: HOST },
          HOST,
        ),
      ),
      want: [PASS],
    },
    {
      name: "THE WORST FAILURE THIS FEATURE COULD HAVE: the export file handed to a caller with no cookie",
      got: (() => {
        const r = judgeExportPathNotPublic(
          {
            status: 200,
            body: '{"format_version":1,"what_is_not_in_this_file":["..."],"account":{"email":"a@b.invalid"}}',
            finalPath: EXPORT_PATH,
            finalHost: HOST,
          },
          HOST,
        );
        return [r[0].verdict, r[0].detail.includes("PUBLIC_PATHS")];
      })(),
      want: [FAIL, true],
    },
    {
      name: "and it is caught even when the redirect looks right, because the BODY is what decides",
      got: verdicts(
        judgeExportPathNotPublic(
          { status: 200, body: '{"format_version":1}', finalPath: "/login", finalHost: HOST },
          HOST,
        ),
      ),
      want: [FAIL],
    },
    {
      name: "Vercel's gate on that path is UNVERIFIED rather than a pass or a failure",
      got: verdicts(
        judgeExportPathNotPublic(
          { status: 200, body: "x".repeat(334009), finalPath: "/login", finalHost: "vercel.com" },
          HOST,
        ),
      ),
      want: [UNVERIFIED],
    },
    {
      name: "a request that never arrived FAILS",
      got: verdicts(judgeExportPathNotPublic(null, HOST)),
      want: [FAIL],
    },

    // --------------------------------------------------- the reading path itself
    {
      name: "a body that is not JSON is read as no rows and no code, not as a crash",
      got: [rowsOf(readRestAnswer({ status: 500, raw: "<html>oops</html>" })).length, codeOf(readRestAnswer({ status: 500, raw: "<html>" }))],
      want: [0, null],
    },
    {
      name: "a code is never read off a successful array answer",
      got: codeOf(readRestAnswer({ status: 200, raw: "[]" })),
      want: null,
    },
    {
      name: "a marked title is matched by its PREFIX, so a real task cannot be mistaken for one",
      got: [
        holdsMarked(readRestAnswer({ status: 200, raw: JSON.stringify([aliceRow]) }), "alice"),
        holdsMarked(readRestAnswer({ status: 200, raw: JSON.stringify([{ title: "Collect the keys" }]) }), "alice"),
      ],
      want: [true, false],
    },
  ];

  let wrong = 0;
  for (const c of cases) {
    const same = JSON.stringify(c.got) === JSON.stringify(c.want);
    if (!same) wrong += 1;
    console.log(`  ${same ? "ok  " : "WRONG"}  ${c.name}`);
    if (!same) {
      console.log(`          wanted ${JSON.stringify(c.want)}, got ${JSON.stringify(c.got)}`);
    }
  }

  console.log(`\n${cases.length} logic cases, ${wrong} wrong.`);

  if (wrong > 0) {
    console.log("\nFAIL the judgements do not behave as described, so a real run would mean nothing.\n");
    return 1;
  }

  console.log(
    `PASS every judgement can fail: ${cases.length} cases, including the world where the export's own ` +
      `owner filter is gone, the world where the check would have proved nothing because the policy hid ` +
      `the row anyway, a closed table answering an empty list rather than a refusal, the consent ` +
      `function askable about somebody else, and the export file itself handed to a caller with no cookie.\n`,
  );
  console.log("This is the LOGIC only. Nothing was sent anywhere by this run.");
  return 0;
}

// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
if (args.includes("--selftest")) {
  process.exit(runSelftest());
}
const cleanupOnly = args.includes("--cleanup");
const appArg = args.find((a) => a.startsWith("--app="));
const appBase = appArg ? appArg.slice("--app=".length).trim() : null;

if (appBase !== null) {
  let parsed = null;
  try {
    parsed = new URL(appBase);
  } catch {
    parsed = null;
  }
  if (parsed === null || parsed.protocol !== "https:") {
    die(
      `--app needs an https address, and got something else.\n` +
        `It is PRODUCTION'S address, not a preview's: Vercel's Deployment Protection stops a\n` +
        `script reading a preview at all.`,
    );
  }
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------
//
// The same small .env reader the scripts beside this use, and for the same
// reason: no dotenv package exists here and adding one for a staging script
// would need a rule 17 conversation for no benefit.

function readEnvFile(path) {
  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch (cause) {
    die(
      `could not read ${path} (${cause.code ?? "unknown error"}).\n` +
        `That file holds the staging URL and publishable key. It is git-ignored, so it\n` +
        `exists only on your own machine.\n` +
        `\n` +
        `If you only wanted to check this script's own logic, that needs none of it:\n` +
        `  node scripts/staging/build-it-26-export-checks.mjs --selftest`,
    );
  }

  const values = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;
    const withoutExport = trimmed.replace(/^export\s+/, "");
    const eq = withoutExport.indexOf("=");
    if (eq === -1) continue;
    const key = withoutExport.slice(0, eq).trim();
    let value = withoutExport.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

const fileEnv = readEnvFile(ENV_FILE);
const supabaseUrl = (fileEnv.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
const publishableKey = (fileEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "").trim();

const missingFromFile = [];
if (supabaseUrl === "") missingFromFile.push("NEXT_PUBLIC_SUPABASE_URL");
if (publishableKey === "") missingFromFile.push("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
if (missingFromFile.length > 0) {
  die(`${ENV_FILE} is missing: ${missingFromFile.join(", ")}.\nNo value is printed by this script.`);
}

// THE STAGING GUARD, first, before a password is read out of the environment and
// long before a request is made.
const urlVerdict = judgeStagingUrl(supabaseUrl)[0];
if (urlVerdict.verdict !== PASS) {
  die(
    `the Supabase URL in web/.env.local is not the staging project: ${urlVerdict.detail}.\n` +
      `This script creates and deletes rows. It runs against staging and nothing else.`,
  );
}

// THREE PEOPLE, AND ALL THREE ARE NEEDED. Alice owns the team and the export;
// Carol is the team mate whose task must not reach Alice's file; Bob is the
// outsider who must see none of it.
const PEOPLE = [
  { key: "alice", label: "Alice", emailVar: "ALICE_EMAIL", passwordVar: "ALICE_PASSWORD" },
  { key: "bob", label: "Bob", emailVar: "BOB_EMAIL", passwordVar: "BOB_PASSWORD" },
  { key: "carol", label: "Carol", emailVar: "CAROL_EMAIL", passwordVar: "CAROL_PASSWORD" },
];

const missingFromEnv = [];
for (const person of PEOPLE) {
  if ((process.env[person.emailVar] ?? "").trim() === "") missingFromEnv.push(person.emailVar);
  if ((process.env[person.passwordVar] ?? "") === "") missingFromEnv.push(person.passwordVar);
}
if (missingFromEnv.length > 0) {
  die(
    `these are not set in the environment: ${missingFromEnv.join(", ")}.\n` +
      `See docs/environments.md -> "Where the test accounts live". No value is printed.\n` +
      `\n` +
      `The logic check needs none of them:\n` +
      `  node scripts/staging/build-it-26-export-checks.mjs --selftest`,
  );
}

const base = supabaseUrl.replace(/\/+$/, "");
const authUrl = `${base}/auth/v1`;
const restUrl = `${base}/rest/v1`;

let passes = 0;
let failures = 0;
let unverified = 0;

function record(results) {
  for (const result of results) {
    if (result.verdict === PASS) passes += 1;
    else if (result.verdict === FAIL) failures += 1;
    else unverified += 1;
    console.log(`  ${result.verdict}  ${result.what} -- ${result.detail}`);
  }
}

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

async function signIn(person) {
  const email = (process.env[person.emailVar] ?? "").trim();
  const password = process.env[person.passwordVar] ?? "";

  let response;
  try {
    response = await fetch(`${authUrl}/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: publishableKey, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, ...captchaBody() }),
    });
  } catch (cause) {
    die(`${person.label} could not reach the auth endpoint (${cause.message})`);
  }
  if (!response.ok) {
    die(
      `${person.label} (${person.passwordVar}, value not printed) could not sign in: ` +
        `HTTP ${response.status}. If this is a CAPTCHA refusal, staging's secret key must be one of ` +
        `Cloudflare's DUMMY ones -- docs/rate-limits.md section 3 row 6.`,
    );
  }
  const session = await response.json();
  const accessToken = session?.access_token ?? "";
  const userId = session?.user?.id ?? "";
  if (accessToken === "" || userId === "") die(`${person.label}: HTTP 2xx but no session came back`);
  if (!UUID_PATTERN.test(userId)) die(`${person.label}: the user id is not a uuid`);
  // Neither is ever printed.
  return { label: person.label, accessToken, userId };
}

// scope=local, NOT global: issue #150 records five scripts ending the owner's
// own browser sessions with a global sign-out.
async function signOut(session) {
  if (!session?.accessToken) return;
  try {
    const response = await fetch(`${authUrl}/logout?scope=local`, {
      method: "POST",
      headers: { apikey: publishableKey, Authorization: `Bearer ${session.accessToken}` },
    });
    console.log(`  (${session.label} signed out: HTTP ${response.status})`);
  } catch (cause) {
    console.log(`  (${session.label} sign out failed: ${cause.message}; the session expires on its own)`);
  }
}

async function rest(method, path, { accessToken, body, prefer } = {}) {
  const headers = { apikey: publishableKey };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (prefer) headers.Prefer = prefer;

  try {
    const response = await fetch(`${restUrl}/${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return readRestAnswer({ status: response.status, raw: await response.text() });
  } catch (cause) {
    return readRestAnswer({ error: cause });
  }
}

async function fetchPage(appAddress, path) {
  const url = new URL(path, appAddress).toString();
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: { accept: "text/html" },
    });
    const ended = new URL(response.url);
    return {
      status: response.status,
      body: await response.text(),
      finalPath: ended.pathname,
      finalHost: ended.host,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// The six reads the export makes, as paths
// ---------------------------------------------------------------------------
//
// WRITTEN OUT HERE SO THEY CAN BE COMPARED WITH THE ROUTE, which is the thing
// this script is about: web/src/app/settings/export/route.ts makes exactly these
// six, and this is the only place anybody could notice them drifting apart.
const EXPORT_READS = (userId) => [
  {
    label: "tasks",
    path: `tasks?select=id,title,done,created_at,team_id,owner_id&owner_id=eq.${userId}&order=created_at.desc`,
  },
  { label: "teams", path: "teams?select=id,name,created_at,owner_id" },
  { label: "team_members", path: `team_members?select=team_id,joined_at&user_id=eq.${userId}` },
  {
    label: "invitations",
    path: `invitations?select=team_id,email,status,failure_code,created_at,expires_at&invited_by=eq.${userId}`,
  },
  { label: "profiles", path: `profiles?select=display_name,created_at&user_id=eq.${userId}` },
];

// ---------------------------------------------------------------------------
// Cleanup -- every task whose title starts with this script's prefix
// ---------------------------------------------------------------------------

async function cleanUp(sessions) {
  let removed = 0;

  for (const session of sessions) {
    if (!session) continue;
    const answer = await rest(
      "DELETE",
      `tasks?title=like.${encodeURIComponent(`${MARK}%`)}`,
      { accessToken: session.accessToken, prefer: "return=representation" },
    );
    const gone = rowsOf(answer).length;
    removed += gone;
    console.log(`  ${session.label} removed ${gone} marked task(s) (status ${answer.status ?? "none"})`);
  }

  return removed;
}

// ---------------------------------------------------------------------------
// A real run
// ---------------------------------------------------------------------------

const sessions = {};

try {
  for (const person of PEOPLE) {
    sessions[person.key] = await signIn(person);
  }

  if (cleanupOnly) {
    console.log("\nbuild-it-26-export-checks --cleanup\n");
    const removed = await cleanUp(Object.values(sessions));
    console.log(`\n${removed} marked task(s) removed. No check was run.\n`);
  } else {
    console.log("\nbuild-it-26-export-checks\n");
    console.log("  Three accounts on STAGING. It creates two marked tasks and removes them.");
    console.log("  Nothing is uploaded, sent or spent, and no real title is printed.\n");

    // --- 1. the staging guard, already decided above, reported here ---------
    console.log("1. the project this is pointed at");
    record([urlVerdict]);

    // --- 2. a team Alice owns and Carol belongs to --------------------------
    console.log("\n2. the fixture: a team Alice owns that Carol is in");

    const owned = await rest("GET", `teams?select=id&owner_id=eq.${sessions.alice.userId}`, {
      accessToken: sessions.alice.accessToken,
    });
    const carolIn = await rest(
      "GET",
      `team_members?select=team_id&user_id=eq.${sessions.carol.userId}`,
      { accessToken: sessions.carol.accessToken },
    );

    const ownedIds = rowsOf(owned).map((row) => row.id);
    const carolIds = new Set(rowsOf(carolIn).map((row) => row.team_id));
    // Sorted, so a project with more than one shared team picks the same team
    // on every run.
    const shared = ownedIds.filter((id) => carolIds.has(id)).sort();
    const teamId = shared[0] ?? null;

    record([
      {
        what: "a team Alice owns and Carol belongs to was found",
        verdict: teamId === null ? UNVERIFIED : PASS,
        detail:
          teamId === null
            ? "none found, so section 3's headline judgement cannot ask its question. " +
              "Carol must accept an invitation to one of Alice's teams first"
            : `found one, among ${ownedIds.length} team(s) Alice owns`,
      },
    ]);

    // --- 3. the headline: her own rows, and not her team mate's -------------
    console.log("\n3. the export's own reads: Alice's rows, and NOT Carol's");

    const aliceTask = await rest(
      "POST",
      "tasks?select=id,title",
      {
        accessToken: sessions.alice.accessToken,
        body: { title: `${MARK} alice personal` },
        prefer: "return=representation",
      },
    );
    record([
      {
        what: "Alice's own marked task was created",
        verdict: rowsOf(aliceTask).length === 1 ? PASS : FAIL,
        detail: `status ${aliceTask.status ?? "none"}, ${rowsOf(aliceTask).length} row(s)`,
      },
    ]);

    if (teamId !== null) {
      const carolTask = await rest("POST", "tasks?select=id,title", {
        accessToken: sessions.carol.accessToken,
        body: { title: `${MARK} carol in alices team`, team_id: teamId },
        prefer: "return=representation",
      });
      record([
        {
          what: "Carol's marked task in Alice's team was created",
          verdict: rowsOf(carolTask).length === 1 ? PASS : FAIL,
          detail: `status ${carolTask.status ?? "none"}, ${rowsOf(carolTask).length} row(s)`,
        },
      ]);
    }

    const reads = EXPORT_READS(sessions.alice.userId);
    const filtered = await rest("GET", reads[0].path, {
      accessToken: sessions.alice.accessToken,
    });
    // THE SAME READ WITH THE OWNER FILTER TAKEN OFF, which is what a later
    // tidy-up would leave behind -- and what proves the policy is wider.
    const unfiltered = await rest(
      "GET",
      "tasks?select=id,title,done,created_at,team_id,owner_id",
      { accessToken: sessions.alice.accessToken },
    );

    record(judgeOwnTasksOnly(filtered, unfiltered));

    // --- 4. the outsider, and a caller with no session ---------------------
    console.log("\n4. the same six reads, as Bob and as nobody");

    const bobReads = EXPORT_READS(sessions.bob.userId);
    record(
      judgeOutsiderSeesNothing(
        await Promise.all(
          bobReads.map(async ({ label, path }) => ({
            label,
            answer: await rest("GET", path, { accessToken: sessions.bob.accessToken }),
          })),
        ),
      ),
    );

    record(
      judgeSignedOutSeesNothing(
        await Promise.all(
          reads.map(async ({ label, path }) => ({
            label,
            answer: await rest("GET", path),
          })),
        ),
      ),
    );

    // --- 5. the two tables the export deliberately leaves out -------------
    console.log("\n5. the two tables decisions 8c and 8d leave out, and why");

    record(
      judgeClosedTablesRefuse([
        {
          label: "usage_counts",
          answer: await rest("GET", `usage_counts?select=feature,day,used&user_id=eq.${sessions.alice.userId}`, {
            accessToken: sessions.alice.accessToken,
          }),
        },
        {
          label: "account_status",
          answer: await rest("GET", `account_status?select=user_id&user_id=eq.${sessions.alice.userId}`, {
            accessToken: sessions.alice.accessToken,
          }),
        },
      ]),
    );

    // --- 6. the setting, through the function and only for the caller -----
    console.log("\n6. the AI suggestions setting: the function, and never a select");

    record(
      judgeConsentReadable(
        await rest(
          "GET",
          `profiles?select=ai_suggestions_enabled&user_id=eq.${sessions.alice.userId}`,
          { accessToken: sessions.alice.accessToken },
        ),
        await rest("POST", "rpc/my_ai_suggestions", {
          accessToken: sessions.alice.accessToken,
          body: {},
        }),
        await rest("POST", "rpc/my_ai_suggestions", {
          accessToken: sessions.alice.accessToken,
          body: { user_id: sessions.bob.userId },
        }),
      ),
    );

    // --- 7. the deployed build, with no session at all ---------------------
    console.log("\n7. a DEPLOYED build, with no cookie, no session and no key");

    if (appBase === null) {
      record([
        {
          what: "the privacy page carries the sentence about downloading your data",
          verdict: UNVERIFIED,
          detail: "no --app=<https address> was given, so no request was made",
        },
        {
          what: `${EXPORT_PATH} hands nothing to a caller with no session`,
          verdict: UNVERIFIED,
          detail: "no --app=<https address> was given, so no request was made",
        },
      ]);
    } else {
      const expectedHost = new URL(appBase).host;
      record(judgeExportSentenceOnPage(await fetchPage(appBase, "/privacy"), expectedHost));
      record(judgeExportPathNotPublic(await fetchPage(appBase, EXPORT_PATH), expectedHost));
    }
  }
} finally {
  // IT TIDIES UP EVEN WHEN A CHECK FAILS. Ctrl-C does not run a finally, which
  // is what --cleanup is for -- and issue #213 records that exact gap in an
  // older script rather than this one having discovered it.
  if (!cleanupOnly) {
    console.log("\ncleaning up");
    const removed = await cleanUp(Object.values(sessions));
    console.log(`  ${removed} marked task(s) removed in total`);
  }

  for (const session of Object.values(sessions)) await signOut(session);
}

if (!cleanupOnly) {
  console.log(`\n${passes} PASS / ${failures} FAIL / ${unverified} UNVERIFIED\n`);

  if (failures > 0) {
    console.log(
      "WHICH FAIL IS THIS? There are two shapes and they mean opposite things:\n\n" +
        "  * ONE failure, and it is the privacy page's sentence -- that is the EXPECTED\n" +
        "    BEFORE. This pull request has no migration, so nothing about anybody's\n" +
        "    access changes; the page is the only thing a cookieless request can watch\n" +
        "    change, and it changes when the pull request is merged and deployed.\n\n" +
        "  * ANYTHING IN SECTIONS 1 TO 6 -- a real problem, in both runs. Those are the\n" +
        "    CONTROL for the claim this change rests on: that the export needed no new\n" +
        "    access to anything. A failure there is somebody's visibility having moved.\n",
    );
    process.exit(1);
  }
}
