#!/usr/bin/env node
// build-it-26-legal-pages-checks.mjs -- the one thing only a DEPLOYED build can
// answer about the privacy page and the terms: can a SIGNED-OUT visitor reach
// them, and do they carry the sentences they are supposed to carry?
//
// Build it 26, PR 1. Run BEFORE and AFTER, against two different addresses.
//
// ---------------------------------------------------------------------------
// WHY THIS NEEDS A DEPLOYED BUILD AT ALL
// ---------------------------------------------------------------------------
//
// `scripts/screen-state-check.mjs` section 11 holds everything about the WORDS:
// that they all live in one file, that the five forbidden sentences are absent,
// that every figure is interpolated, and that both paths are in PUBLIC_PATHS.
// It runs in CI on every pull request and it is the stronger half.
//
// What it CANNOT answer is whether the Proxy actually lets a signed-out visitor
// through. `PUBLIC_PATHS` is a list in a module; the thing that reads it runs in
// the Edge runtime on a request, and the failure it would hide is silent and
// total -- a privacy page that redirects to /login is a privacy page only people
// with an account can read, which is the exact opposite of what issue #204 asks
// for. One `GET` settles it, and nothing short of a deployed build can make it.
//
// ---------------------------------------------------------------------------
// THE BEFORE AND THE AFTER, AND THEY ARE TWO ADDRESSES RATHER THAN TWO MOMENTS
// ---------------------------------------------------------------------------
//
// Every other before/after script in this folder is run twice against ONE
// project, either side of a change the owner makes in a dashboard. There is no
// dashboard here: the change is a deploy. So the pair is
//
//   BEFORE  the address serving the build WITHOUT this change -- the current
//           production site, or main's own deploy. Expect: both paths redirect
//           to /login, or 404. That is what makes the AFTER mean something.
//   AFTER   this branch's Vercel PREVIEW address. Expect: both answer 200,
//           signed out, carrying their headings and the sentences below.
//
// ---------------------------------------------------------------------------
// WHAT IT SENDS, CREATES AND SPENDS: NOTHING
// ---------------------------------------------------------------------------
//
// Two `GET` requests to two public pages, with NO cookie, NO session, NO key and
// NO account. It cannot sign anybody in, cannot write anything, and cannot spend
// a daily limit -- there is nothing on either page that costs anybody anything.
// It reads no secret and takes no setting from the environment.
//
// SO IT IS SAFE TO POINT AT PRODUCTION, and that is deliberate rather than
// careless: fetching a page this app serves to the public is not a production
// command and is not a dashboard. It is the same thing a visitor does. Nothing
// here is capable of changing production, and the script refuses any method but
// GET by never making one.
//
// WHAT IT NEVER PRINTS: the page's whole body. It prints a status, a length, and
// whether each expected phrase was found -- because a run log of this repository
// is public, and a document is long.
//
// ---------------------------------------------------------------------------
// HOW TO RUN IT
// ---------------------------------------------------------------------------
//
//   node scripts/staging/build-it-26-legal-pages-checks.mjs --selftest
//   node scripts/staging/build-it-26-legal-pages-checks.mjs <base address>
//
// For example, in Git Bash:
//
//   node scripts/staging/build-it-26-legal-pages-checks.mjs https://team-tasks-virid.vercel.app
//   node scripts/staging/build-it-26-legal-pages-checks.mjs https://team-tasks-git-feat-build-it-26-privacy-and-terms-info423.vercel.app
//
// NO SECRET IS EVER ON THE COMMAND LINE, because this script has no secret. The
// only argument is a public web address.

// ---------------------------------------------------------------------------
// What each page must carry
// ---------------------------------------------------------------------------
//
// A SHORT, DISTINCTIVE PHRASE RATHER THAN A WHOLE SENTENCE, so the owner can
// reword a paragraph without this script going red for the wrong reason. What it
// holds is that the SUBJECT reached the browser -- which is a different question
// from the wording, and the wording is section 11's job.
//
// Each phrase is one of the items issue #204 requires, or one the owner added
// afterwards. They are duplicated from nothing: section 11 checks the same
// subjects in the source, and this checks they survived the build and the
// request. A phrase that section 11 passes and this one fails means the page did
// not render what the module holds.
const PAGES = [
  {
    path: "/privacy",
    heading: "Privacy",
    phrases: [
      "dp@raj-dhonota.com",
      "can read the whole database",
      "title of that one task",
      "Nothing that says who asked",
      "West US (Oregon)",
      "about a fortnight",
      "asked to sign in again",
      "cf.turnstile.u",
      "no way to delete your account in this app",
    ],
  },
  {
    path: "/terms",
    heading: "Terms",
    phrases: [
      "England and Wales",
      "not for anybody under 16",
      "do not keep a record of which version",
      "dp@raj-dhonota.com",
    ],
  },
];

// The five sentences docs/claims.md section 7 marks MUST NOT SAY. Checked on the
// rendered page as well as in the source, because the point of this pair is that
// a thing can be right in a module and wrong on a screen.
const FORBIDDEN = [
  /does not store (your )?ip/i,
  /accepted version|you accepted (these )?terms on/i,
  /verif(y|ies|ied|ying) (your |their )?age/i,
  /reviewed by|prepared by|legal (advice|review)/i,
  /no cookies at all|we (use|set) no cookies/i,
];

// ---------------------------------------------------------------------------
// The judgements -- pure functions, which is what --selftest exercises
// ---------------------------------------------------------------------------
//
// IT IS A SEPARATE PURE FUNCTION SO THE SELFTEST CAN DRIVE THE REAL READING,
// which is the lesson evidence/build-it-16-suspend-functions.md records: a
// selftest that hands every judgement a hand-made object proves the judgement
// and not the reading. This one is handed a `{ status, body, redirected }` of
// exactly the shape the fetch below produces.

/**
 * What one page's answer means.
 *
 * @param page one entry of PAGES
 * @param answer { status, body, finalPath } -- finalPath is where the request
 *   ended up, which is how a redirect to /login is told from a 200
 */
export function judge(page, answer) {
  const notes = [];

  if (answer === null) {
    return {
      verdict: "FAIL",
      reachable: false,
      notes: ["the request did not arrive at all"],
    };
  }

  // A REDIRECT TO /login IS THE FAILURE THIS SCRIPT EXISTS FOR, and it is told
  // apart from every other failure because it has its own cause and its own
  // one-line fix: the path is missing from PUBLIC_PATHS.
  if (answer.finalPath !== page.path) {
    return {
      verdict: "FAIL",
      reachable: false,
      notes: [
        `redirected to ${answer.finalPath} -- a signed-out visitor cannot read it.` +
          ` If that is /login, the path is missing from PUBLIC_PATHS in web/src/lib/supabase/proxy.ts`,
      ],
    };
  }

  if (answer.status !== 200) {
    return {
      verdict: "FAIL",
      reachable: false,
      notes: [`answered ${answer.status}, not 200`],
    };
  }

  const body = typeof answer.body === "string" ? answer.body : "";

  // The heading, which is what says the right page rendered rather than some
  // other 200.
  const hasHeading = body.includes(`<h1>${page.heading}</h1>`);
  if (!hasHeading) notes.push(`no <h1>${page.heading}</h1> in the page`);

  const missing = page.phrases.filter((phrase) => !body.includes(phrase));
  for (const phrase of missing) notes.push(`MISSING: ${phrase}`);

  // AND THE FIVE REFUSALS, on the rendered page.
  const said = FORBIDDEN.filter((pattern) => pattern.test(body)).map(
    (pattern) => String(pattern),
  );
  for (const pattern of said) notes.push(`FORBIDDEN SENTENCE MATCHED: ${pattern}`);

  return {
    verdict: hasHeading && missing.length === 0 && said.length === 0 ? "PASS" : "FAIL",
    reachable: true,
    notes,
  };
}

/**
 * Whether a base address is one this script will fetch.
 *
 * It accepts any https address and refuses anything else, including http: a
 * document served over http is a document somebody on the network can rewrite,
 * and there is no case in which this script should be reading one.
 */
export function usableBase(raw) {
  if (typeof raw !== "string" || raw.trim() === "") return false;

  let url;
  try {
    url = new URL(raw.trim());
  } catch {
    return false;
  }

  return url.protocol === "https:";
}

// ---------------------------------------------------------------------------
// --selftest -- the judgements above, fed answers from a world where each thing
// has gone wrong, requiring each one to come out FAIL
// ---------------------------------------------------------------------------

function selftest() {
  console.log(
    "build-it-26-legal-pages-checks --selftest: can these checks fail?\n",
  );

  const privacy = PAGES[0];

  // A body that passes everything, built from the page's own expectations so
  // this case cannot drift from them.
  const good =
    `<h1>${privacy.heading}</h1>` + privacy.phrases.map((p) => `<p>${p}</p>`).join("");

  const cases = [
    {
      name: "the happy answer PASSES, so the other cases mean something",
      got: judge(privacy, { status: 200, body: good, finalPath: "/privacy" }),
      want: "PASS",
    },
    {
      name: "A REDIRECT TO /login FAILS -- the failure this script exists for",
      got: judge(privacy, { status: 200, body: good, finalPath: "/login" }),
      want: "FAIL",
    },
    {
      name: "a 404 FAILS",
      got: judge(privacy, { status: 404, body: "", finalPath: "/privacy" }),
      want: "FAIL",
    },
    {
      name: "a 200 with no heading FAILS -- some other page answered",
      got: judge(privacy, { status: 200, body: "<h1>Sign in</h1>", finalPath: "/privacy" }),
      want: "FAIL",
    },
    {
      name: "a 200 missing ONE required phrase FAILS",
      got: judge(privacy, {
        status: 200,
        body: good.replace("cf.turnstile.u", "something else"),
        finalPath: "/privacy",
      }),
      want: "FAIL",
    },
    {
      name: "a page that says Sentry does not store an IP address FAILS",
      got: judge(privacy, {
        status: 200,
        body: `${good}<p>Sentry does not store your IP address.</p>`,
        finalPath: "/privacy",
      }),
      want: "FAIL",
    },
    {
      name: "a page that claims a legal review FAILS",
      got: judge(privacy, {
        status: 200,
        body: `${good}<p>This page was reviewed by a lawyer.</p>`,
        finalPath: "/privacy",
      }),
      want: "FAIL",
    },
    {
      name: "a page that claims an age check FAILS",
      got: judge(privacy, {
        status: 200,
        body: `${good}<p>We verify your age.</p>`,
        finalPath: "/privacy",
      }),
      want: "FAIL",
    },
    {
      name: "a page that claims a version record FAILS",
      got: judge(privacy, {
        status: 200,
        body: `${good}<p>Your accepted version is stored.</p>`,
        finalPath: "/privacy",
      }),
      want: "FAIL",
    },
    {
      name: "a page that says no cookies at all FAILS",
      got: judge(privacy, {
        status: 200,
        body: `${good}<p>We use no cookies at all.</p>`,
        finalPath: "/privacy",
      }),
      want: "FAIL",
    },
    {
      name: "a request that never arrived FAILS",
      got: judge(privacy, null),
      want: "FAIL",
    },
    { name: "http is refused", got: { verdict: usableBase("http://example.invalid") ? "PASS" : "FAIL" }, want: "FAIL" },
    { name: "a word that is not an address is refused", got: { verdict: usableBase("preview") ? "PASS" : "FAIL" }, want: "FAIL" },
    { name: "an empty argument is refused", got: { verdict: usableBase("") ? "PASS" : "FAIL" }, want: "FAIL" },
    { name: "an https address is accepted", got: { verdict: usableBase("https://example.invalid") ? "PASS" : "FAIL" }, want: "PASS" },
  ];

  let wrong = 0;
  for (const c of cases) {
    const ok = c.got.verdict === c.want;
    if (!ok) wrong += 1;
    console.log(`  ${ok ? "ok  " : "WRONG"}  ${c.name}`);
  }

  console.log(`\n${cases.length} logic cases, ${wrong} wrong.`);

  if (wrong > 0) {
    console.log(
      "\nFAIL the judgements do not behave as described, so a real run would mean nothing.\n",
    );
    process.exit(1);
  }

  console.log(
    `PASS every judgement can fail: ${cases.length} cases, including each of the five sentences docs/claims.md marks MUST NOT SAY, and the redirect to /login this script exists to catch\n`,
  );
}

// ---------------------------------------------------------------------------
// A real run
// ---------------------------------------------------------------------------

async function fetchPage(base, path) {
  const url = new URL(path, base).toString();

  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: { accept: "text/html" },
    });

    return {
      status: response.status,
      body: await response.text(),
      finalPath: new URL(response.url).pathname,
    };
  } catch {
    return null;
  }
}

async function run(base) {
  console.log(`\nbuild-it-26-legal-pages-checks\n  address: ${base}\n`);
  console.log(
    "  Two GET requests, no cookie, no session, no key, no account.\n" +
      "  Nothing is created, sent or spent, and no page body is printed.\n",
  );

  let failures = 0;

  for (const page of PAGES) {
    const answer = await fetchPage(base, page.path);
    const result = judge(page, answer);

    const size = answer && typeof answer.body === "string" ? answer.body.length : 0;
    console.log(
      `${result.verdict}  ${page.path} -- status ${answer ? answer.status : "none"},` +
        ` ${size} bytes, ${page.phrases.length} phrase(s) expected`,
    );
    for (const note of result.notes) console.log(`        ${note}`);

    if (result.verdict !== "PASS") failures += 1;
  }

  console.log(
    `\n${PAGES.length - failures} of ${PAGES.length} page(s) passed.\n`,
  );

  if (failures > 0) {
    console.log(
      "A FAIL here against a PREVIEW of this branch is a real problem.\n" +
        "A FAIL against the address serving the OLD build is the expected BEFORE.\n",
    );
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------

const args = process.argv.slice(2);

if (args.includes("--selftest")) {
  selftest();
} else {
  const base = args[0];

  if (!usableBase(base)) {
    console.log(
      "\nbuild-it-26-legal-pages-checks needs one argument: the https address to read.\n\n" +
        "  node scripts/staging/build-it-26-legal-pages-checks.mjs --selftest\n" +
        "  node scripts/staging/build-it-26-legal-pages-checks.mjs https://<address>\n\n" +
        "Run it twice: once against the address serving the build WITHOUT this\n" +
        "change (expect both paths to redirect or 404 -- that is the BEFORE), and\n" +
        "once against this branch's Vercel Preview (expect both to answer 200).\n\n" +
        "It sends two GET requests and nothing else. There is no secret to pass.\n",
    );
    process.exit(1);
  }

  await run(base.trim());
}
