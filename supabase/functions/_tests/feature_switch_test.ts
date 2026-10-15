// feature_switch_test.ts -- the kill switches, over the bodies the functions
// actually build.
//
// Build it 29, Lesson J24. What it is about:
//
//   supabase/functions/_shared/switches.ts     the four words, the four
//                                              sentences, the codes, and the gate
//   supabase/migrations/20261015120000_...sql  the table, and the fixed list the
//                                              four words are compared with
//   suggest-subtasks, invite-member,           the five doors the switches are
//   accept-invite, stripe-checkout,            read at
//   stripe-webhook
//
// WHAT MAKES THIS FILE WORTH ANYTHING, and it is daily_limit_test.ts's argument
// beside it: every function it calls is IMPORTED FROM THE CODE UNDER TEST. The gate
// is the real `withSwitch` the handlers call, the refusal is the real
// `switchedOffRefusal` they send, the words are the real constants they read, and
// `proceed` is built out of the real pieces of each handler. Nothing here writes out
// a copy of a sentence, a status or an order and then checks its own copy.
//
// THE FIVE THINGS BUILD IT 29 ASKS FOR, and where each one is:
//
//   a switch read at each door       section 6, and section 7 for the webhook,
//                                    whose order is read off its own source
//   switched off -> a friendly       sections 3 and 5
//   message, never a crash
//   an unreadable switch is not      sections 2 and 5: its own code, and the
//   a switched-off switch            function's own sentence
//   the paid service gets NOTHING    section 6: the spies' log must be EMPTY and
//   when a switch is off             `proceed` must not have run at all
//   and a can-this-fail guard        section 8, which feeds the same assertions
//                                    three gates from worlds where the switch is
//                                    read wrongly -- and requires them to go RED
//
// IT REACHES NO DATABASE AND NO NETWORK. Every switch read is a function returning
// a value this file wrote, and both paid services are stubs that record what they
// were given. The two things it reads off the disk are the migration, so the four
// feature words are compared with the check constraint that enforces them rather
// than with a second copy of themselves, and two handlers' own source, because an
// ORDER is an absence and there is no value to pass in that would reveal one.
//
// AND IT PROVES NOTHING ABOUT A DEPLOYED FUNCTION, which is rule 8's half of this.
// Nothing in this repository is deployed by this change, and the migration is
// applied nowhere: a run here says the bodies are right. The bottom of this file
// has the command.

import { assert, assertEquals } from "jsr:@std/assert@1.0.8";

import {
  readSwitch,
  SWITCH_AI_SUGGESTIONS,
  SWITCH_ARGUMENT,
  SWITCH_ATTACHMENTS,
  SWITCH_INVITATIONS,
  SWITCH_OFF_REASON,
  SWITCH_PAYMENTS,
  SWITCH_RPC,
  SWITCH_UNKNOWN_CODE,
  SWITCHED_OFF_CODES,
  SWITCHED_OFF_MESSAGES,
  SWITCHED_OFF_STATUS,
  SWITCHES,
  switchedOffRefusal,
  type Switch,
  type SwitchRead,
  withSwitch,
} from "../_shared/switches.ts";

// The real pieces of the AI ask, in the order the handler runs them.
import {
  buildAnthropicRequest,
  callAnthropic,
  readSuggestions,
  SUGGEST_CODES,
  suggestionsAnswer,
  UNAVAILABLE_MESSAGE,
  unavailableAnswer,
} from "../suggest-subtasks/index.ts";

// And the real pieces of the invitation send.
import {
  codeFromSendResponse,
  invitationAnswer,
} from "../invite-member/index.ts";

// ---------------------------------------------------------------------------
// Made-up values. Every one of them belongs to nobody.
// ---------------------------------------------------------------------------

const MADE_UP_USER_ID = "a1b2c3d4-0029-4e5f-8a9b-0c1d2e3f4a5b";
const MADE_UP_TITLE = "Clear the gutters before winter";
const MADE_UP_EMAIL = "nobody-at-all@example.com";
const MADE_UP_TEAM_NAME = "Tuesday crew";
const MADE_UP_INVITATION_ID = "a1b2c3d4-0030-4e5f-8a9b-0c1d2e3f4a5b";

// A key-shaped string, deliberately dull: `.githooks/pre-commit` runs gitleaks,
// which cannot tell a fixture from the real thing, and a repeated character has
// almost no entropy. The two test files beside this one say the same.
const KEY_SHAPED = `not-a-real-api-key-${"z".repeat(24)}`;

// A model name is NOT written out here: approved-models.json is the only file
// allowed to name one, and scripts/approved-model-check.mjs enforces that from the
// other end.
const NOT_A_MODEL = "a-model-name-this-app-never-sends";

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

// The switch reads this file hands in. Each one is a whole shape of answer rather
// than a tweak of another, so a verdict table reads as a list of worlds.
const SWITCH_ON: SwitchRead = () => Promise.resolve({ data: true, error: null });
const SWITCH_OFF: SwitchRead = () => Promise.resolve({ data: false, error: null });
const SWITCH_ERRORED: SwitchRead = () =>
  Promise.resolve({ data: null, error: { code: "42883" } });
const SWITCH_THREW: SwitchRead = () => {
  throw new Error("the connection went away");
};

// =========================================================================
// 1. The four words, and they are the database's rather than this file's
// =========================================================================

Deno.test("the four feature words are exactly the ones the migration allows", async () => {
  const sql = await Deno.readTextFile(
    "supabase/migrations/20261015120000_feature_switches.sql",
  );

  // The check constraint, read out of the migration rather than copied: the
  // database is what decides, whatever TypeScript believes.
  const constraint = sql.match(
    /add constraint feature_switches_feature_allowed\s*\n?\s*check \(feature in \(([^)]*)\)\)/,
  );
  assert(constraint, "feature_switches_feature_allowed is not in the migration");

  const allowed = [...constraint[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
  assertEquals(allowed, [...SWITCHES].sort());
});

Deno.test("the rpc and its one argument are the ones the migration declares", async () => {
  const sql = await Deno.readTextFile(
    "supabase/migrations/20261015120000_feature_switches.sql",
  );
  assert(
    sql.includes(`create function public.${SWITCH_RPC}(${SWITCH_ARGUMENT} text)`),
    `the migration does not declare public.${SWITCH_RPC}(${SWITCH_ARGUMENT} text)`,
  );
  // PostgREST matches rpc arguments by name, so a misspelling here is a 404 from
  // the database -- a refusal, which is the right direction, and this test is what
  // stops it happening quietly.
  assertEquals(SWITCH_RPC, "feature_on");
  assertEquals(SWITCH_ARGUMENT, "p_feature");
});

Deno.test("the migration reads a missing row as OFF, which is what the gate relies on", async () => {
  const sql = await Deno.readTextFile(
    "supabase/migrations/20261015120000_feature_switches.sql",
  );
  // The coalesce is the whole fail-closed design. A `true` there would make a
  // deleted row mean "on", which is the one direction a kill switch must not fail
  // in -- and nothing in TypeScript could tell.
  assert(
    /coalesce\(\s*\(\s*select fs\.enabled[\s\S]*?\),\s*false\s*\)/.test(sql),
    "feature_on() does not coalesce a missing row to false",
  );
  // And the four rows are seeded in the same file, so no database has the table
  // without them.
  for (const feature of SWITCHES) {
    assert(
      sql.includes(`('${feature}', true)`),
      `${feature} is not seeded by the migration`,
    );
  }
});

// =========================================================================
// 2. readSwitch -- three answers, and everything odd is the third
// =========================================================================

for (
  const shape of [
    { name: "true", read: SWITCH_ON, on: true, why: undefined },
    { name: "false", read: SWITCH_OFF, on: false, why: "off" },
    { name: "an error", read: SWITCH_ERRORED, on: false, why: "unknown" },
    { name: "a thrown error", read: SWITCH_THREW, on: false, why: "unknown" },
    // The truthy shapes a boolean read back as text arrives in. "false" is TRUTHY
    // in JavaScript, which is the mistake the two `===` lines exist to prevent --
    // and reading it as "on" would be a switch that cannot be switched off.
    {
      name: 'the string "false"',
      read: (() => Promise.resolve({ data: "false", error: null })) as SwitchRead,
      on: false,
      why: "unknown",
    },
    {
      name: 'the string "true"',
      read: (() => Promise.resolve({ data: "true", error: null })) as SwitchRead,
      on: false,
      why: "unknown",
    },
    {
      name: "null",
      read: (() => Promise.resolve({ data: null, error: null })) as SwitchRead,
      on: false,
      why: "unknown",
    },
    {
      name: "undefined",
      read: (() => Promise.resolve({ data: undefined, error: null })) as SwitchRead,
      on: false,
      why: "unknown",
    },
    {
      name: "the number 1",
      read: (() => Promise.resolve({ data: 1, error: null })) as SwitchRead,
      on: false,
      why: "unknown",
    },
    {
      name: "the number 0",
      read: (() => Promise.resolve({ data: 0, error: null })) as SwitchRead,
      on: false,
      why: "unknown",
    },
    {
      name: "an empty object",
      read: (() => Promise.resolve({ data: {}, error: null })) as SwitchRead,
      on: false,
      why: "unknown",
    },
    {
      name: "an array holding true",
      read: (() => Promise.resolve({ data: [true], error: null })) as SwitchRead,
      on: false,
      why: "unknown",
    },
  ]
) {
  Deno.test(`readSwitch: ${shape.name} -> ${shape.on ? "on" : shape.why}`, async () => {
    const verdict = await readSwitch(shape.read);
    assertEquals(verdict.on, shape.on);
    if (!verdict.on) assertEquals(verdict.why, shape.why);
  });
}

Deno.test("readSwitch carries the database's code through on an error, and nothing else", async () => {
  const verdict = await readSwitch(SWITCH_ERRORED);
  assert(!verdict.on);
  assert(verdict.why === "unknown");
  assertEquals(verdict.code, "42883");
});

// =========================================================================
// 3. The refusal: four sentences, four codes, one status
// =========================================================================

Deno.test("every switched-off refusal is the owner's sentence, with its own code and 503", async () => {
  const problems: string[] = [];

  for (const feature of SWITCHES) {
    const { body } = await readBody(switchedOffRefusal(feature));
    const answer = switchedOffRefusal(feature);

    if (answer.status !== SWITCHED_OFF_STATUS) {
      problems.push(`${feature} answered ${answer.status}, expected ${SWITCHED_OFF_STATUS}`);
    }
    if (body?.error !== SWITCHED_OFF_MESSAGES[feature]) {
      problems.push(`${feature} did not send its own sentence`);
    }
    if (body?.code !== SWITCHED_OFF_CODES[feature]) {
      problems.push(`${feature} did not send its own code`);
    }
    // No reason unless one is asked for: only accept-invite's page wants one.
    if ("reason" in (body ?? {})) {
      problems.push(`${feature} sent a reason nobody asked for`);
    }
  }

  assertEquals(SWITCHED_OFF_STATUS, 503);
  if (problems.length > 0) throw new Error(problems.join("; "));
});

Deno.test("the four sentences are the owner's words, and say nothing about plumbing", () => {
  const problems: string[] = [];

  // The owner's wording for Build it 29, character for character. The other three
  // are the same sentence about the other three features.
  assertEquals(
    SWITCHED_OFF_MESSAGES[SWITCH_AI_SUGGESTIONS],
    "Suggestions are switched off for now.",
  );
  assertEquals(
    SWITCHED_OFF_MESSAGES[SWITCH_INVITATIONS],
    "Invitations are switched off for now.",
  );
  assertEquals(
    SWITCHED_OFF_MESSAGES[SWITCH_ATTACHMENTS],
    "Attachments are switched off for now.",
  );
  assertEquals(
    SWITCHED_OFF_MESSAGES[SWITCH_PAYMENTS],
    "Payments are switched off for now.",
  );

  // What none of them may say. A sentence that named the table would be telling a
  // volunteer about our database; one that named a company would be blaming
  // somebody else for a decision we made.
  const forbidden = [
    "anthropic",
    "claude",
    "resend",
    "stripe",
    "cloudflare",
    "supabase",
    "feature_switches",
    "feature_on",
    "503",
    "error",
    "sorry",
  ];
  for (const feature of SWITCHES) {
    const lower = SWITCHED_OFF_MESSAGES[feature].toLowerCase();
    for (const word of forbidden) {
      if (lower.includes(word)) problems.push(`${feature}'s sentence contains "${word}"`);
    }
    if (!lower.endsWith("switched off for now.")) {
      problems.push(`${feature}'s sentence does not end "switched off for now."`);
    }
  }

  if (problems.length > 0) throw new Error(problems.join("; "));
});

Deno.test("the codes: one per feature, one for a read that failed, all distinct identifiers", () => {
  const problems: string[] = [];
  const codes = [...SWITCHES.map((f) => SWITCHED_OFF_CODES[f]), SWITCH_UNKNOWN_CODE];

  if (new Set(codes).size !== codes.length) problems.push("two codes are the same word");
  for (const code of codes) {
    if (!/^[a-z][a-z_]*[a-z]$/.test(code)) {
      problems.push(`"${code}" is not a short lower-case identifier`);
    }
  }

  // THE SPLIT THAT MATTERS, and it is the same one the consent refusal and the
  // daily limit both make: a decision somebody took is NOT one of
  // suggest-subtasks' fixed failure codes, and a read that broke IS.
  for (const feature of SWITCHES) {
    if ((SUGGEST_CODES as readonly string[]).includes(SWITCHED_OFF_CODES[feature])) {
      problems.push(`${feature}'s off code is in SUGGEST_CODES, which would give it the plumbing sentence`);
    }
  }
  if (!(SUGGEST_CODES as readonly string[]).includes(SWITCH_UNKNOWN_CODE)) {
    problems.push("switch_unknown is not in SUGGEST_CODES, so it would not get the fixed sentence");
  }

  if (problems.length > 0) throw new Error(problems.join("; "));
});

Deno.test("a reason is sent only when a caller asks for one, and it is the page's word", async () => {
  const { body } = await readBody(
    switchedOffRefusal(SWITCH_INVITATIONS, SWITCH_OFF_REASON),
  );
  assertEquals(body?.reason, SWITCH_OFF_REASON);
  // The sentence and the code are unchanged by it: a reason routes a page to one of
  // its own sentences, it does not choose this one.
  assertEquals(body?.error, SWITCHED_OFF_MESSAGES[SWITCH_INVITATIONS]);
  assertEquals(body?.code, SWITCHED_OFF_CODES[SWITCH_INVITATIONS]);
  assertEquals(SWITCH_OFF_REASON, "switched_off");
});

// =========================================================================
// 4. Nothing in a refusal says anything about anybody
// =========================================================================

Deno.test("no refusal carries a person, a key, a company or a table name", async () => {
  const problems: string[] = [];
  const mustNotAppear = [
    MADE_UP_USER_ID,
    MADE_UP_EMAIL,
    MADE_UP_TITLE,
    MADE_UP_TEAM_NAME,
    KEY_SHAPED,
    "anthropic",
    "resend",
    "stripe",
    "feature_switches",
    "feature_on",
  ];

  for (const feature of SWITCHES) {
    const { text } = await readBody(switchedOffRefusal(feature, SWITCH_OFF_REASON));
    const lower = text.toLowerCase();
    for (const value of mustNotAppear) {
      if (lower.includes(value.toLowerCase())) {
        problems.push(`${feature}'s refusal contains "${value}"`);
      }
    }
  }

  if (problems.length > 0) throw new Error(problems.join("; "));
});

// =========================================================================
// 5. The gate, in the abstract: what runs and what does not
// =========================================================================

Deno.test("with the switch ON, proceed runs exactly once and its answer comes back untouched", async () => {
  let calls = 0;
  const theAnswer = Response.json({ ok: true }, { status: 201 });

  const answer = await withSwitch(
    {
      feature: SWITCH_AI_SUGGESTIONS,
      read: SWITCH_ON,
      unknownAnswer: () => {
        throw new Error("unknownAnswer must not be called when the switch is on");
      },
    },
    () => {
      calls += 1;
      return Promise.resolve(theAnswer);
    },
  );

  assertEquals(calls, 1);
  assertEquals(answer, theAnswer);
  assertEquals(answer.status, 201);
});

Deno.test("with the switch OFF, proceed never runs and the answer is the feature's own", async () => {
  let calls = 0;
  const answer = await withSwitch(
    {
      feature: SWITCH_PAYMENTS,
      read: SWITCH_OFF,
      unknownAnswer: () => {
        throw new Error("unknownAnswer must not be called when the switch says off");
      },
    },
    () => {
      calls += 1;
      return Promise.resolve(Response.json({ ok: true }));
    },
  );

  assertEquals(calls, 0);
  assertEquals(answer.status, SWITCHED_OFF_STATUS);
  const { body } = await readBody(answer);
  assertEquals(body?.error, SWITCHED_OFF_MESSAGES[SWITCH_PAYMENTS]);
  assertEquals(body?.code, SWITCHED_OFF_CODES[SWITCH_PAYMENTS]);
});

for (const broken of [
  { name: "errored", read: SWITCH_ERRORED },
  { name: "threw", read: SWITCH_THREW },
]) {
  Deno.test(
    `with a switch that ${broken.name}, proceed never runs and the function's own unknown answer is used once`,
    async () => {
      let calls = 0;
      let unknowns = 0;

      const answer = await withSwitch(
        {
          feature: SWITCH_INVITATIONS,
          read: broken.read,
          unknownAnswer: () => {
            unknowns += 1;
            return Response.json({ error: "no", code: SWITCH_UNKNOWN_CODE }, { status: 500 });
          },
        },
        () => {
          calls += 1;
          return Promise.resolve(Response.json({ ok: true }));
        },
      );

      assertEquals(calls, 0);
      assertEquals(unknowns, 1);
      assertEquals(answer.status, 500);

      // AND IT IS NOT THE SWITCHED-OFF SENTENCE, which is the whole point of the
      // third verdict: claiming somebody switched this off when nobody did would be
      // the one thing that sentence must never do.
      const { body } = await readBody(answer);
      assertEquals(body?.code, SWITCH_UNKNOWN_CODE);
      assert(
        body?.error !== SWITCHED_OFF_MESSAGES[SWITCH_INVITATIONS],
        "an unreadable switch answered as though somebody had switched it off",
      );
    },
  );
}

// =========================================================================
// 6. The gate at two real doors, with the paid service as a spy
// =========================================================================
//
// The spies stand in for the one thing in each handler that costs money, and
// nothing else. `proceed` IS the rest of the handler: for the AI ask it builds the
// request with the real `buildAnthropicRequest`, sends it through the real
// `callAnthropic`, reads the reply with the real `readSuggestions` and answers with
// the real `suggestionsAnswer`; for the invitation it reads a stubbed service's
// answer with the real `codeFromSendResponse` and answers with the real
// `invitationAnswer`.
//
// So a gate that read the switch and carried on regardless would fail these, and so
// would one that sent first and read the switch afterwards.

function aiSpies() {
  const log: string[] = [];

  const stubbedService = (
    _url: string,
    init: { method: string; headers: Record<string, string>; body: string; signal: AbortSignal },
  ) => {
    log.push(`the AI service received a request of ${init.body.length} bytes`);
    return Promise.resolve(
      Response.json({ content: [{ type: "text", text: "Book the hall" }] }, { status: 200 }),
    );
  };

  let calls = 0;
  const proceed = async (): Promise<Response> => {
    calls += 1;
    const result = await callAnthropic(
      buildAnthropicRequest({ model: NOT_A_MODEL, title: MADE_UP_TITLE, apiKey: KEY_SHAPED }),
      { fetchImpl: stubbedService },
    );
    if (!result.ok) return unavailableAnswer(result.code);
    const verdict = readSuggestions(result.body);
    if (!verdict.ok) return unavailableAnswer(verdict.code);
    return suggestionsAnswer(verdict.suggestions);
  };

  return { log, proceed, calls: () => calls };
}

function emailSpies() {
  const log: string[] = [];

  let calls = 0;
  const proceed = async (): Promise<Response> => {
    calls += 1;
    // The stubbed email service, answered with the real reader.
    log.push(`the email service received a message for ${MADE_UP_EMAIL}`);
    const sent = await codeFromSendResponse(
      Response.json({ id: "made-up-id" }, { status: 200 }),
    );
    if (!sent.ok) throw new Error("the stub should have answered 200");
    return invitationAnswer({
      id: MADE_UP_INVITATION_ID,
      email: MADE_UP_EMAIL,
      expires_at: "2026-10-22T00:00:00.000Z",
      status: "sent",
      redirected: false,
      retried: false,
    });
  };

  return { log, proceed, calls: () => calls };
}

type Door = {
  name: string;
  feature: Switch;
  spies: () => { log: string[]; proceed: () => Promise<Response>; calls: () => number };
  unknownAnswer: () => Response;
  unknownSentence: string;
  unknownStatus: number;
  // What the HANDLER answers when it is allowed to run, which is not the same
  // number for both: `suggestionsAnswer` is a 200 and `invitationAnswer` is a 201,
  // because one reads and the other creates. Written out per door rather than
  // loosened to "any 2xx", so the gate is held to passing the handler's own answer
  // back untouched.
  okStatus: number;
};

for (
  const door of [
    {
      name: "suggest-subtasks",
      feature: SWITCH_AI_SUGGESTIONS,
      spies: aiSpies,
      // The unknown answer that function passes in, built out of ITS real builder.
      unknownAnswer: () => unavailableAnswer(SWITCH_UNKNOWN_CODE),
      unknownSentence: UNAVAILABLE_MESSAGE,
      unknownStatus: 503,
      okStatus: 200,
    },
    {
      name: "invite-member",
      feature: SWITCH_INVITATIONS,
      spies: emailSpies,
      unknownAnswer: () =>
        Response.json(
          {
            error:
              "Could not check whether invitations are switched on, so nothing was sent. Please try again.",
            code: SWITCH_UNKNOWN_CODE,
          },
          { status: 500 },
        ),
      unknownSentence:
        "Could not check whether invitations are switched on, so nothing was sent. Please try again.",
      unknownStatus: 500,
      okStatus: 201,
    },
  ] as Door[]
) {
  Deno.test(`${door.name}: with the switch OFF the service receives NOTHING`, async () => {
    const spies = door.spies();

    const answer = await withSwitch(
      { feature: door.feature, read: SWITCH_OFF, unknownAnswer: door.unknownAnswer },
      spies.proceed,
    );

    assertEquals(spies.log, []);
    assertEquals(spies.calls(), 0);
    assertEquals(answer.status, SWITCHED_OFF_STATUS);
    const { body } = await readBody(answer);
    assertEquals(body?.error, SWITCHED_OFF_MESSAGES[door.feature]);
  });

  Deno.test(`${door.name}: with a switch that did not answer, the service receives NOTHING`, async () => {
    const spies = door.spies();

    const answer = await withSwitch(
      { feature: door.feature, read: SWITCH_ERRORED, unknownAnswer: door.unknownAnswer },
      spies.proceed,
    );

    assertEquals(spies.log, []);
    assertEquals(spies.calls(), 0);
    assertEquals(answer.status, door.unknownStatus);
    const { body } = await readBody(answer);
    assertEquals(body?.error, door.unknownSentence);
    assertEquals(body?.code, SWITCH_UNKNOWN_CODE);
  });

  // THE OVER-CORRECTION GUARD. A gate that refused everybody would pass both tests
  // above, so this is the other half: with the switch on, the handler runs and its
  // answer is the handler's.
  Deno.test(`${door.name}: with the switch ON the handler runs exactly once`, async () => {
    const spies = door.spies();

    const answer = await withSwitch(
      {
        feature: door.feature,
        read: SWITCH_ON,
        unknownAnswer: () => {
          throw new Error("unknownAnswer must not be called when the switch is on");
        },
      },
      spies.proceed,
    );

    assertEquals(spies.calls(), 1);
    assertEquals(spies.log.length, 1);
    assertEquals(answer.status, door.okStatus);
  });
}

// =========================================================================
// 7. The five doors, read off the handlers' own source
// =========================================================================
//
// AN ORDER IS AN ABSENCE, and there is no value to pass in that would reveal one.
// daily_limit_test.ts reads two handlers' source for the same reason -- "neither
// function spells a limit at a call site" -- and this does it for three facts that
// matter more than any sentence in this file.

const DOORS = [
  { file: "supabase/functions/suggest-subtasks/index.ts", word: SWITCH_AI_SUGGESTIONS },
  { file: "supabase/functions/invite-member/index.ts", word: SWITCH_INVITATIONS },
  { file: "supabase/functions/accept-invite/index.ts", word: SWITCH_INVITATIONS },
  { file: "supabase/functions/stripe-checkout/index.ts", word: SWITCH_PAYMENTS },
];

Deno.test("all four signed-in doors read a switch, and none of them spells a sentence", async () => {
  const problems: string[] = [];

  for (const door of DOORS) {
    const source = await Deno.readTextFile(door.file);

    if (!source.includes("withSwitch(")) {
      problems.push(`${door.file} does not call withSwitch`);
    }
    if (!source.includes("../_shared/switches.ts")) {
      problems.push(`${door.file} does not import the shared switches`);
    }
    // The sentence lives in one place. A copy at a call site is how two screens
    // start saying different things about the same fact.
    for (const feature of SWITCHES) {
      if (source.includes(SWITCHED_OFF_MESSAGES[feature])) {
        problems.push(`${door.file} spells out ${feature}'s sentence`);
      }
    }
  }

  if (problems.length > 0) throw new Error(problems.join("; "));
});

Deno.test("the webhook reads the switch AFTER the signature and BEFORE it writes anything", async () => {
  const source = await Deno.readTextFile("supabase/functions/stripe-webhook/index.ts");

  const verifies = source.indexOf("constructEventAsync(");
  const readsSwitch = source.indexOf("readSwitch(");
  const claims = source.indexOf('.from("stripe_events")');

  assert(verifies > 0, "the webhook does not verify a signature");
  assert(readsSwitch > 0, "the webhook does not read the switch");
  assert(claims > 0, "the webhook does not record the event");

  // AFTER THE SIGNATURE, so a switch can never change what an unverifiable body is
  // told. The production smoke test in .github/workflows/migrate-production.yml
  // depends on that answer, and a kill switch is not allowed to move a security
  // boundary.
  assert(
    verifies < readsSwitch,
    "the webhook reads the switch before it checks the signature, which would change what an unsigned body is told",
  );
  // AND BEFORE THE FIRST WRITE, so a switched-off window records nothing.
  assert(
    readsSwitch < claims,
    "the webhook records the event before reading the switch",
  );
});

Deno.test("the webhook asks Stripe to retry rather than swallowing an event", async () => {
  const source = await Deno.readTextFile("supabase/functions/stripe-webhook/index.ts");

  // The switch block must answer RETRY() and not OK(). A 200 would tell Stripe the
  // event was handled, and it would never come back -- so somebody who paid during
  // the switched-off window would silently never get what they paid for.
  const block = source.slice(
    source.indexOf("readSwitch("),
    source.indexOf('.from("stripe_events")'),
  );
  assert(block.includes("return RETRY();"), "the switched-off webhook does not ask for a retry");
  assert(!block.includes("return OK();"), "the switched-off webhook answers OK, so the event is lost");
});

// =========================================================================
// 8. CAN THESE TESTS FAIL? Three gates from worlds where the switch is read
//    wrongly, fed the same assertions, required to come out RED.
// =========================================================================

// A gate that reads the switch with a truthy test. The string "false" -- which is
// what a boolean column read back as text looks like -- is truthy, so this one
// carries on while the owner believes the feature is off.
async function truthyGate(
  options: { read: SwitchRead; unknownAnswer: () => Response },
  proceed: () => Promise<Response>,
): Promise<Response> {
  const answer = await options.read();
  if (answer.data) return await proceed();
  return options.unknownAnswer();
}

// A gate that treats a failed read as permission -- the "an unknown is a yes"
// mistake every other gate in this folder is written against.
async function errorIsPermissionGate(
  options: { read: SwitchRead; unknownAnswer: () => Response },
  proceed: () => Promise<Response>,
): Promise<Response> {
  try {
    const answer = await options.read();
    if (answer.error) return await proceed();
    if (answer.data === false) return options.unknownAnswer();
    return await proceed();
  } catch {
    return await proceed();
  }
}

// A gate that reads the switch AFTER doing the work -- the shape that looks right
// in a diff and protects nothing.
async function afterTheFactGate(
  options: { read: SwitchRead; unknownAnswer: () => Response },
  proceed: () => Promise<Response>,
): Promise<Response> {
  const answer = await proceed();
  const verdict = await readSwitch(options.read);
  return verdict.on ? answer : options.unknownAnswer();
}

Deno.test("CAN IT FAIL? a truthy gate lets the string \"false\" through, and the spy sees it", async () => {
  const spies = aiSpies();
  await truthyGate(
    {
      read: () => Promise.resolve({ data: "false", error: null }),
      unknownAnswer: () => unavailableAnswer(SWITCH_UNKNOWN_CODE),
    },
    spies.proceed,
  );
  // The assertion the real gate passes is `log` being EMPTY. Here it is not, which
  // is what makes section 6 worth running.
  assertEquals(spies.log.length, 1);
  assertEquals(spies.calls(), 1);
});

Deno.test("CAN IT FAIL? a gate that reads an error as permission spends money on a broken read", async () => {
  const spies = emailSpies();
  await errorIsPermissionGate(
    {
      read: SWITCH_ERRORED,
      unknownAnswer: () => Response.json({ error: "no" }, { status: 500 }),
    },
    spies.proceed,
  );
  assertEquals(spies.calls(), 1);
  assertEquals(spies.log.length, 1);
});

Deno.test("CAN IT FAIL? a gate that reads the switch afterwards has already sent the thing", async () => {
  const spies = emailSpies();
  const answer = await afterTheFactGate(
    {
      read: SWITCH_OFF,
      unknownAnswer: () => Response.json({ error: "no" }, { status: 500 }),
    },
    spies.proceed,
  );
  // It even answers with a refusal, which is what makes this the dangerous one: the
  // caller is told no AND the email went.
  assertEquals(answer.status, 500);
  assertEquals(spies.calls(), 1);
  assertEquals(spies.log.length, 1);
});

// ---------------------------------------------------------------------------
// How to run this file
// ---------------------------------------------------------------------------
//
//   deno test --no-lock --allow-env \
//     --allow-read=supabase/migrations,supabase/functions \
//     --config supabase/functions/create-team/deno.json \
//     supabase/functions/_tests
//
// --allow-read is two named directories and nothing else, both holding only code
// committed to this repository: this file reads the migration and two handlers'
// source. It cannot read a key, a .env file or anything else on the disk.
