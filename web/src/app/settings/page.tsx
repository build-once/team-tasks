import { redirect } from "next/navigation";

import { ActButton } from "@/app/components/ActButton";
import { Banner } from "@/app/components/Banner";
import { Header } from "@/app/components/Header";
import { BUTTON_IDS } from "@/lib/buttons";
import {
  CONSENT_HOW_LONG,
  CONSENT_OFF_MEANS,
  CONSENT_ON,
  CONSENT_ONLY_YOU,
  CONSENT_READ_FAILED,
  CONSENT_SETTING_NAME,
  CONSENT_STARTS_OFF,
  CONSENT_UNREADABLE,
  CONSENT_WHAT_IS_SENT,
  CONSENT_WHO_GETS_IT,
  consentState,
  settingsSentence,
  settingsWentWell,
} from "@/lib/consent";
import { rememberUserForErrorReports } from "@/lib/sentry-user";
import { createClient } from "@/lib/supabase/server";
import { DISPLAY_NAME_MAX } from "@/lib/teams";

import { saveAiSuggestions } from "./actions";

// Settings -- today it holds exactly one thing, and that one thing is the switch that
// decides whether anybody's task title leaves this project.
//
// Build it 21 part 2b, issue #211. docs/plan.md, "AI suggestions -- the consent
// setting", is the agreed description of everything this page says.
//
// WHY A PAGE OF ITS OWN, rather than a box on My teams beside the nickname. Because
// what it is for is to be FOUND. docs/plan.md's third precondition for installing the
// production key is a privacy page, and its reason applies to the switch as well: "A
// setting is not consent if the person switching it on cannot find out what it sends."
// A consent control at the bottom of a page about teams is a control nobody meets
// until they are looking for it.
//
// WHAT THIS PAGE IS NOT. It is not the thing that stops anything being sent.
// suggest-subtasks checks the setting for itself, with the key in its hand, and
// refuses a caller whose setting is off whatever any screen drew -- see
// web/src/lib/consent.ts's header, and docs/plan.md: "A screen that hid the button
// would not be this, and a screen is not where a rule lives."
//
// THERE IS NO PRIVACY PAGE YET, and this page is not one. It says what Suggest
// subtasks sends, because a person switching that on needs to know -- and it says
// nothing about the rest of what this app holds, which is what issue #204 is for and
// what docs/plan.md names as a release gate for the production key.

export default async function SettingsPage({
  searchParams,
}: PageProps<"/settings">) {
  const { saved, problem } = await searchParams;
  const supabase = await createClient();

  // src/proxy.ts already turns signed-out visitors away, but a page that shows a
  // person's own setting checks for itself too. getClaims() verifies the token's
  // signature every time; getSession() would trust a cookie anyone can forge.
  const { data: claimsData } = await supabase.auth.getClaims();
  if (!claimsData?.claims) redirect("/login");

  const userId = claimsData.claims.sub;
  rememberUserForErrorReports(userId);

  // ---- The setting, through the function and never through a select ------
  //
  // `public.my_ai_suggestions()`. No client role holds SELECT on
  // `profiles.ai_suggestions_enabled` -- that is how
  // 20261007204900_ai_suggestions_consent.sql stops a team mate reading it through the
  // existing "your team mates' profiles" policy -- so an ordinary select is refused
  // with 42501, for this person's own row, every time. Issue #207 found that before
  // this page existed.
  //
  // IT TAKES NO ARGUMENTS, which is the property worth noticing: who is asking comes
  // from `auth.uid()` inside the function's own body, so there is no parameter here
  // that could be pointed at somebody else's setting.
  const { data: consentData, error: consentError } = await supabase.rpc(
    "my_ai_suggestions",
  );

  // Three states, and the third is never drawn as either of the other two: a read that
  // failed is not "off". See consentState.
  const state = consentState({
    failed: Boolean(consentError),
    data: consentData,
  });

  // ---- Is there a profile row at all? -----------------------------------
  //
  // NAMED COLUMNS, NEVER A STAR. After the consent migration a `select *` on this
  // table by a signed-in caller fails outright, because the table-level SELECT was
  // revoked and given back column by column. The coach's review of PR #210 put it in
  // those words, and this is the first new read written since.
  //
  // WHY THIS PAGE NEEDS TO KNOW. A person with no profile row has nothing to write the
  // setting on: `UPDATE 0`, silently, and `display_name` is `not null` with no default
  // so a row cannot be created without a nickname. Issue #211 asks that such a person
  // can still switch the setting on, so the form below carries a nickname box for
  // them, and settings/actions.ts creates the row and then writes the setting.
  //
  // maybeSingle() because there is at most one row -- user_id is the primary key -- and
  // because "no row yet" is an ordinary answer rather than an error.
  const { data: profileData, error: profileError } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("user_id", userId)
    .maybeSingle();

  const profile = (profileData ?? null) as { display_name: string } | null;

  // A FAILED PROFILE READ IS NOT "NO PROFILE ROW", and this is the same trap as
  // `data ?? []` one page over: both arrive here as a null. So the nickname box is
  // drawn when the read SUCCEEDED and found nothing -- not when it failed, where the
  // page says it could not tell instead.
  const profileUnknown = Boolean(profileError);
  const needsNickname = !profileUnknown && profile === null;

  const outcome = settingsSentence(saved ?? problem);
  const outcomeIsGood = settingsWentWell(saved);

  return (
    <>
      <Header signedIn current="settings" account={claimsData.claims.email} />

      <main className="page stack">
        <h1>Settings</h1>

        {outcome === null ? null : (
          <Banner
            tone={outcomeIsGood ? "ok" : "bad"}
            icon={outcomeIsGood ? "check" : "alert"}
          >
            {outcome}
          </Banner>
        )}

        <form className="card" action={saveAiSuggestions}>
          <h2>{CONSENT_SETTING_NAME}</h2>

          {/* WHAT IT SENDS, TO WHOM, AND WHAT OFF DOES -- beside the switch rather
              than behind a link, because this is the only moment anybody is deciding.
              Every sentence is docs/plan.md's, narrowed; each one is a row in
              docs/claims.md. They are drawn in the order somebody asks the questions:
              what goes, who gets it, how long they keep it, what off does, where it
              starts, and who else can touch it. */}
          <p className="hint">{CONSENT_WHAT_IS_SENT}</p>
          <p className="hint">{CONSENT_WHO_GETS_IT}</p>
          <p className="hint">{CONSENT_HOW_LONG}</p>
          <p className="hint">{CONSENT_OFF_MEANS}</p>
          <p className="hint">{CONSENT_STARTS_OFF}</p>
          <p className="hint">{CONSENT_ONLY_YOU}</p>

          {/* THE SWITCH. A checkbox, which needs no JavaScript: this page is rendered
              on the server and the form posts. An unchecked box submits no field at
              all, so "off" arrives as an absence, which is the one shape nothing can
              forge into a yes.

              defaultChecked IS NOT DRAWN WHEN THE SETTING COULD NOT BE READ, and that
              is the whole of the unreadable state on this page: an unchecked box on a
              failed read would say "you have not switched this on", which is a claim
              this page cannot make. So the box is left unchecked AND the sentence
              below says the setting could not be read, so the box is not an answer. */}
          <div>
            <label className="label" htmlFor="ai_suggestions">
              <input
                id="ai_suggestions"
                name="ai_suggestions"
                type="checkbox"
                value="on"
                defaultChecked={state === CONSENT_ON}
                aria-describedby="ai_suggestions-hint"
              />{" "}
              Let me ask for AI suggestions on my tasks
            </label>

            <p className="hint" id="ai_suggestions-hint">
              {state === CONSENT_UNREADABLE
                ? CONSENT_READ_FAILED
                : state === CONSENT_ON
                  ? "This is on. Suggest subtasks will send a task's title when you press it."
                  : "This is off. Nothing of yours is being sent."}
            </p>
          </div>

          {/* THE NICKNAME, only for somebody who has no profile row (issue #207).
              Said rather than left to look like a fault: without a row there is
              nothing for the setting to be stored on, and that is not an artefact of
              this feature -- a profile row has always needed a nickname. */}
          {needsNickname ? (
            <div>
              <label className="label" htmlFor="display_name">
                Your nickname
              </label>
              <input
                className="input"
                id="display_name"
                name="display_name"
                type="text"
                maxLength={DISPLAY_NAME_MAX}
                placeholder="Carol"
                aria-describedby="display_name-hint"
              />
              <p className="hint" id="display_name-hint">
                You have not set a nickname yet, and this setting is stored on your
                profile — so switching it on needs one. A nickname of up to{" "}
                {DISPLAY_NAME_MAX} characters, shown to your team mates. Please not
                your full name.
              </p>
            </div>
          ) : null}

          {profileUnknown ? (
            <Banner tone="bad" icon="alert">
              Your profile could not be read, so this page cannot tell whether you have
              set a nickname. Saving will still work if you have one.
            </Banner>
          ) : null}

          <ActButton
            className="btn btn--primary"
            act={BUTTON_IDS.aiSuggestionsSave}
          >
            Save
          </ActButton>
        </form>

        {/* No Try again button here, and that is deliberate rather than an omission.
            LoadFailed posts a fixed identifier to a redirect table (RETRY_TARGETS in
            web/src/lib/screen-state.ts) and this page is not in it; adding it would be
            a change to the one table that stops a Try again being redirected anywhere
            a request asked for. A plain link with a literal address does the same job
            and needs no table.

            IT IS ALSO AN INCONSISTENCY, and issue #212 holds it along with the other
            two things about this page that only a browser can settle: every other
            failed read in this app draws a button, and whether a link here reads as a
            mistake is not a question any check in this repository can answer. */}
        {state === CONSENT_UNREADABLE ? (
          <p className="hint">
            <a href="/settings">Open this page again</a> to try reading the setting
            once more.
          </p>
        ) : null}
      </main>
    </>
  );
}
