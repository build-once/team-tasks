// legal.ts -- every sentence the privacy page and the terms say, in ONE place.
//
// Build it 26, PR 1. docs/plan.md, "The documents, your own data, and deleting an
// account", parts 1, 2 and 3.
//
// ---------------------------------------------------------------------------
// THESE WORDS ARE A DRAFT, AND MERGING IS WHAT MAKES THEM THE OWNER'S
// ---------------------------------------------------------------------------
//
// docs/plan.md has said since 7 October that writing these words is the owner's,
// "not least because they carry legal weight", and issue #204 says the same:
// "Writing the page's actual words is a content decision with legal weight, and
// it is the owner's. This issue is the requirement and the gate, not a draft."
//
// So what is below is a draft assembled from docs/claims.md section 7 -- one
// sentence per row, and NOT ONE sentence the register does not already have a
// verdict for. The owner's answer 5 of 2026-10-13 is that the owner reads both
// documents himself before launch, and that this is NOT A LEGAL REVIEW. Merging
// the pull request that adds this file is what turns the draft into the owner's
// own words; nothing else does.
//
// ---------------------------------------------------------------------------
// THE FIVE SENTENCES THAT MAY NEVER APPEAR HERE
// ---------------------------------------------------------------------------
//
// docs/claims.md section 7 marks these MUST NOT SAY -- permanently, not "yet".
// scripts/screen-state-check.mjs section 11 refuses each of them by pattern, so
// a later edit cannot slip one in:
//
//   1. that Sentry does not STORE an IP address. We do not SEND one -- that is
//      our code, in web/src/sentry/options.ts. What Sentry records is a
//      dashboard setting nobody here has seen. Answer 16.
//   2. that anybody accepted a particular version of these terms. No such
//      record is kept, on purpose. Answer 4.
//   3. that anybody's age is verified. Nothing asks and nothing holds one.
//      Answer 3.
//   4. that either document was reviewed by a lawyer, prepared by anybody, or
//      checked against any law. Answer 5.
//   5. that this app uses no cookies at all. True of a signed-out visitor and
//      false the moment they sign in. Answer 15.
//
// ---------------------------------------------------------------------------
// WHY EVERY NUMBER IS A CONSTANT AND NOT A LITERAL
// ---------------------------------------------------------------------------
//
// A policy that says "5 MB" as a literal is a policy that goes stale against the
// bucket. Every figure below is interpolated from the constant the app itself
// uses, so a limit cannot change in one place and stay wrong here -- the same
// discipline web/src/lib/attachments.ts already applies to the file sentences,
// and that scripts/screen-state-check.mjs already compares against the
// migration's SQL.
//
// The three figures that have no constant in `web/` are declared here with the
// file that holds the authority, and section 11 of that script reads those files
// as text and refuses a mismatch.
//
// ---------------------------------------------------------------------------
// NO SENTENCE LIVES IN A PAGE
// ---------------------------------------------------------------------------
//
// web/src/app/privacy/page.tsx and web/src/app/terms/page.tsx map over the
// arrays at the bottom of this file and render nothing of their own. That is the
// shape web/src/lib/turnstile.ts's TURNSTILE_WORDS already has, for the reason
// Build it 25 gives: four sentences drawn by one component "so they cannot drift
// into saying three things". Two long documents have far more room to drift.

import {
  LINK_SECONDS,
  MAX_FILE_WORDS,
  MAX_FILES_PER_TASK,
  PER_PERSON_WORDS,
} from "@/lib/attachments";
import { TITLE_MAX } from "@/lib/tasks";
import { INVITATION_DAYS, NAME_MAX } from "@/lib/teams";

// ---------------------------------------------------------------------------
// Who, where, and under what law
// ---------------------------------------------------------------------------

/**
 * The organisation answerable for all of this. The owner's answer 1, 13 Oct 2026.
 */
export const CONTROLLER = "DHTA Ltd";

/**
 * The one address every right in this plan is exercised through.
 *
 * Answer 1, 13 Oct 2026. TWO THINGS TRAVEL WITH IT and both are in the pages:
 * it is a PUBLIC address on a PUBLIC page, so it will be scraped and will
 * receive rubbish -- and it is the ONLY route for somebody who cannot sign in,
 * because answer 14 left the app with no form on purpose. So it is the one
 * address in this project that must not go unread.
 */
export const CONTACT_ADDRESS = "dp@raj-dhonota.com";

/** Answer 2, 13 Oct 2026. Both the governing law and the venue. */
export const GOVERNING_LAW = "England and Wales";

/**
 * Answer 3, 13 Oct 2026: 16, STATED and NOT CHECKED.
 *
 * The distinction has to survive into the wording. The terms say the app is not
 * for anybody younger; they do NOT say anybody's age is verified, because
 * nothing asks for an age and nothing holds one.
 */
export const MINIMUM_AGE = 16;

/**
 * When these words last changed.
 *
 * NOT a review date, and it must never be drawn as one (answer 5). Update it in
 * the same change as any edit to the two arrays below.
 */
export const LAST_UPDATED = "13 October 2026";

// ---------------------------------------------------------------------------
// The three figures with no constant in web/
// ---------------------------------------------------------------------------

/**
 * How long a daily usage count is kept.
 *
 * The authority is supabase/migrations/20261008115900_usage_counts.sql, whose
 * `count_daily_use` deletes `day <= l_today - 7`. There is no TypeScript
 * constant for it, because nothing in `web/` reads that table -- nothing CAN:
 * no role holds any privilege on it.
 */
export const USAGE_COUNT_DAYS = 7;

/**
 * How long a nightly copy of production is kept, and the slack on it.
 *
 * The authority is an R2 object lifecycle rule in Cloudflare, which nothing in
 * this repository can read. docs/backups.md records the number and the slack:
 * Cloudflare allows up to a day for a removal, so the real window is "up to
 * about fifteen days". The pages say "about a fortnight" rather than a figure
 * dressed as a promise.
 */
export const BACKUP_DAYS = 14;

/**
 * How long the email service keeps its sending log, on the free plan.
 *
 * Resend's own figure, as recorded in docs/plan.md's appendix. The pages
 * ATTRIBUTE it rather than asserting it (answer 5's second consequence).
 */
export const EMAIL_LOG_DAYS = 30;

// ---------------------------------------------------------------------------
// The shape the pages render
// ---------------------------------------------------------------------------

/** One heading and its paragraphs. The pages draw nothing else. */
export type LegalSection = {
  readonly heading: string;
  readonly paragraphs: ReadonlyArray<string>;
};

export const PRIVACY_TITLE = "Privacy";
export const TERMS_TITLE = "Terms";

/**
 * The `<head>` for each page.
 *
 * HERE RATHER THAN IN THE PAGE, which looks like over-tidiness and is not: a
 * page's `description` is a sentence, it is shown to people in a search result
 * and in a link preview, and it is therefore a claim. Every other sentence in
 * these two documents lives in this file so that one reviewer can read the lot
 * in one place; leaving two in the page files would mean two sentences nobody
 * reviewing the wording would ever see. `scripts/screen-state-check.mjs`
 * section 11 refuses a sentence-shaped literal in either page, which is what
 * makes that true rather than intended.
 */
export const PRIVACY_META = {
  title: `${PRIVACY_TITLE} — Team Tasks`,
  description:
    "What Team Tasks holds about you, who else receives any of it, where it is held, how long it is kept, and what you can ask for.",
};

export const TERMS_META = {
  title: `${TERMS_TITLE} — Team Tasks`,
  description:
    "What Team Tasks is, who can use it, what you agree to, and what it does not promise.",
};

export const PRIVACY_INTRO =
  "This page says what Team Tasks holds about you, who else receives any of it, where it is held, how long it is kept, and what you can ask for. It is written to be read rather than to cover anybody, so where something is not known it says so.";

export const TERMS_INTRO =
  "Team Tasks is a small shared to-do list for a volunteer group. These terms say what it is, what it is not, and what you agree to by using it.";

// ---------------------------------------------------------------------------
// The privacy page
// ---------------------------------------------------------------------------
//
// Every paragraph below has a row in docs/claims.md section 7, with the file and
// line that keeps it. The six items issue #204 requires are in sections 3, 4, 6
// and 7; the three the owner added on 10 and 11 October -- where data is held,
// that copies remain for about a fortnight, and that a recovery signs everybody
// out -- are in sections 3 and 7.

export const PRIVACY: ReadonlyArray<LegalSection> = [
  {
    heading: "Who holds this data, and how to reach us",
    paragraphs: [
      // FIX 4, the coach's review of PR #303: the first version said "DHTA Ltd
      // is answerable" and then "There is no larger organisation behind it",
      // which on a plain reading contradict each other. Both facts are true and
      // they are about different things -- WHO IS ANSWERABLE, which is the
      // company, and HOW BIG THE OPERATION IS, which is one person. Said
      // together in one paragraph they cannot be read as a contradiction.
      `${CONTROLLER} is the company answerable for the data this app holds, and one person runs the app day to day. That is the same person who can read the whole database, including everything listed below.`,
      `So there is no support team and nobody else to escalate to: ${CONTACT_ADDRESS} reaches that person, and it is the only way to reach anybody about this app.`,
      `If you cannot sign in — a forgotten password, a suspended account, or an invitation to an address that never became an account — it is also how you ask for your data to be deleted.`,
      // ACCEPTED BY THE OWNER, 2026-10-13 -- optional paragraph 1 of the four
      // the coach's review of PR #303 asked for, moved in from OPTIONAL_PRIVACY
      // and that array deleted with it.
      //
      // IT IS THE OWNER'S JUDGEMENT AND NOT A LEGAL REVIEW, which is answer 5
      // and is why this paragraph is plain English rather than a term of art:
      // nothing in this repository can check whether these are the right words
      // for it, and `docs/claims.md` section 7a says so in the row.
      `We hold what is listed here for two reasons and no others: because the app cannot do what you asked of it without them — a list needs its tasks, a team needs its members, signing in needs an address and a password — and because keeping it working and safe needs a few things nobody asked for, like knowing how often a feature was used.`,
    ],
  },
  {
    heading: "What the app holds about you",
    paragraphs: [
      // CHANGED on the re-read: the first version said "The hash cannot be
      // turned back into your password", which is a cryptographic claim about
      // somebody else's implementation that nothing in this repository
      // establishes -- no page read says which algorithm Supabase Auth uses.
      // What can be said is what is STORED, which is a fact about the shape of
      // the data rather than a promise about how hard it is to reverse.
      `Your email address, and your password stored as a one-way hash rather than as the password itself. Supabase Auth holds both.`,
      `A nickname, if you set one. We ask for a nickname rather than your name, and the app has no field for a real name, a phone number, an address or a date of birth.`,
      // CHANGED on the re-read: "the app does not read it" was meant as "nothing
      // inspects it" and reads as false -- the app draws it on a screen, and
      // Suggest subtasks sends a title to another company. What is true is that
      // NOTHING CHECKS WHAT IT SAYS.
      `Your tasks: what each one says, whether it is ticked, when it was made, and which of your teams it belongs to if any. Task text is free text of up to ${TITLE_MAX} characters and nothing checks what it says — so please do not put other people's personal details in it.`,
      `Your teams: their names, up to ${NAME_MAX} characters, and who belongs to which. A team name is visible to that team.`,
      `Invitations you send: the address you typed, when you sent it, whether the email went, and a short code if it did not. An invited address belongs to somebody who may have no account at all, which is why only the team's owner can see it and nobody else in the team can.`,
      `Files you attach to a task: up to ${MAX_FILES_PER_TASK} per task, ${MAX_FILE_WORDS} each, ${PER_PERSON_WORDS} in total per person. A photograph can carry the place and the moment it was taken, inside the file, and this app does not remove it — the upload box says so where you attach one.`,
      `Whether you have switched AI suggestions on, and when you last changed it.`,
      `A count of how many times you used each limited feature on each day. It is a number and a date: nothing about which task, which address or what time of day. Nobody can see it through the app, not even you.`,
      `If your account has been suspended, a row saying so, when, and optionally a short note from the owner about why. Nobody can see that through the app either.`,
      `Those last two are available by writing to ${CONTACT_ADDRESS}.`,
      // CHANGED on the re-read: "neither can be switched off" overclaims.
      // docs/plan.md's own wording is "you cannot turn MOST of them off", which
      // is a different sentence. What is certainly true is that nothing in this
      // app writes them and nothing in this app can remove a line.
      `Supabase, which runs the database and the sign-in, also keeps a sign-in log that includes the address your requests come from, and Vercel, which serves the pages, keeps its own access log. Neither is something this app asked for, and nothing in this app can remove a line from either. We add no logging of our own, and there is no analytics and no tracker anywhere in this app.`,
    ],
  },
  {
    heading: "Who else receives any of it, and where it is held",
    paragraphs: [
      `Supabase holds the database, the sign-in and the attached files. Production's database and files are in West US (Oregon).`,
      `Vercel serves the pages and sees each request, including the address it came from. Where Vercel holds that, we have not established, and we would rather say so than guess.`,
      // CHANGED on the re-read, twice. "on this site" would be false on a
      // preview deploy, where the two login emails are still Supabase's own
      // sending -- custom SMTP is configured on production only (decision M).
      // And the 30 days is Resend's figure, so it is attributed rather than
      // asserted, which is answer 5's second consequence.
      `Resend sends this app's email: invitations, and on the live site the sign-up confirmation and the password-reset email too. So Resend sees the recipient's address and keeps a record of which addresses were sent what — ${EMAIL_LOG_DAYS} days, on the free plan, by Resend's own account of it. Where it holds that, we have not established.`,
      // FIX 3, the coach's review of PR #303. The first version said Sentry
      // "never receives your email address, your task text, a team name, a file
      // name or any sign-in token", and that overclaims in a way this project
      // has already written down about itself. docs/plan.md:
      //
      //   "A pattern scrub cannot recognise free text that no known phrase
      //    introduces, so error messages written by this app must never include
      //    task text, names or addresses."
      //
      // So the limit is real and the plan records it. What this app can promise
      // is TWO THINGS IT DOES -- it does not attach any of them, and it removes
      // the ones it can recognise before anything is sent -- and the thing it
      // asks of itself, which is that its own error messages do not carry them.
      // "Never receives" is a promise about a scrub's completeness, and
      // `scripts/screen-state-check.mjs` section 11 now refuses the phrase.
      `Sentry receives a report when the app breaks: what went wrong, which page, which browser and operating system, and the identifier of whoever hit it. This app does not attach your email address, your task text, a team name, a file name or any sign-in token to a report, and it removes the ones it can recognise before a report is sent. That removal works by recognising patterns, so it cannot promise to catch text it has no way of recognising — which is why this app's own error messages are written not to carry any of it.`,
      `We do not send your IP address to Sentry. Sentry's organisation data region is the United States. How long Sentry keeps a report we have not established.`,
      `Anthropic receives one thing, and only if you ask for it: if Suggest subtasks is available to you and you have switched AI suggestions on, pressing it sends the title of that one task, with fixed instructions written by this app. Nothing that says who asked goes with it — no address, no nickname, no identifier, no team name, and no other task. Anthropic publishes that it deletes inputs and outputs within 30 days of receipt or generation, with stated exceptions, and keeps up to 2 years — classification scores up to 7 years — for anything flagged as a usage policy violation. Where it holds a request we have not established.`,
      `Cloudflare receives something about every visitor to the sign-in, sign-up and password-reset screens, because the anti-robot check on those three screens is Cloudflare's. Cloudflare states that it processes "client IP address, TLS Fingerprint, User-Agent Header and Sitekey and associated origin", that the purpose "is not to identify, profile or target any individuals but solely to detect and block bots", and that Turnstile "does not access, store, or transmit user communications, form entries, or other page inputs" — which we read as meaning the password typed into the box beside it is not part of this. How long Cloudflare keeps any of it, it does not publish, and we have not been able to find out.`,
      // CHANGED on the re-read: "a file it cannot open" is the conclusion;
      // "without a passphrase it does not have" is the reason, and saying the
      // reason is what lets somebody judge the claim instead of trusting it.
      `Cloudflare also holds a nightly copy of everything above, in Western Europe. It is encrypted before it leaves the machine that makes it, with a passphrase Cloudflare does not have, so what it holds is a file it cannot read.`,
      // CHANGED on the re-read: "no data sold or shared" could be read as
      // contradicting the six companies named directly above it. What is meant
      // is selling and advertising, so that is what it now says.
      `Nothing else receives any of it, none of it is sold, and none of it is used for advertising.`,
      // ACCEPTED BY THE OWNER, 2026-10-13 -- optional paragraph 3, and the only
      // one of the four that is not a judgement: everything above it names a
      // region code or a "data region", and neither of those says a country to
      // somebody who has not met one. It adds no new fact.
      `In plain words: the database, the files you attach and the error reports are all held in the United States. The nightly copy is held in Europe, and it is encrypted so that the company holding it cannot read it.`,
    ],
  },
  {
    heading: "How long each thing is kept",
    paragraphs: [
      `Your tasks, your teams, your nickname and your settings are kept until they or your account are deleted. Nothing is cleared out automatically.`,
      `An invitation's link stops working after ${INVITATION_DAYS} days. The row recording that you invited that address is not removed when the link expires — nothing in this app can delete an invitation today — so it is kept until the team or the account it belongs to goes.`,
      // FIX 2, the coach's review of PR #303. The first version said a count is
      // "kept for 7 days and then removed", and that is not true for somebody
      // who does not come back.
      //
      // WHY. The removal is inside `count_daily_use`, on the path that does the
      // counting -- which is the thing docs/plan.md chose on purpose, so that
      // retention "cannot drift, because it runs on every use". But the delete
      // is scoped to the caller: `where user_id = p_user_id`, which is not an
      // optimisation -- a statement that swept the whole table would make every
      // count a write against other people's rows. So the sweep only ever runs
      // for somebody who uses a limited feature again, and a person who stops
      // using the app keeps the rows they had.
      // [#223](https://github.com/build-once/team-tasks/issues/223) is that gap,
      // and the migration's own comment states it: "a person who stops using
      // the app keeps the rows they had until they come back, because nothing
      // else ever runs."
      //
      // THE OPTION NOT TAKEN HERE: fixing #223 so the sentence becomes true.
      // That is a migration -- the sweep would have to stop being scoped to the
      // caller, which is the thing the scoping exists to avoid, or move to
      // something that runs on a clock, which docs/plan.md declined when it
      // chose this shape. It belongs in its own pull request with its own
      // decision, not in a documents change, and the page is worded for what
      // the code does TODAY rather than for what a later change might do.
      `A daily usage count is removed ${USAGE_COUNT_DAYS} days later, by the same thing that writes one — so the counts go once you use that feature again. If you stop using the app, the last few counts stay until you come back or your account is deleted. There is nothing in them but a number, a feature and a date.`,
      `A file is kept until it or its task is deleted. Deleting a task deletes its files, and the database refuses to delete a task while any file is still on it, so a file never outlives the task it was attached to.`,
      `A link to open a file lasts ${LINK_SECONDS / 60} minutes. For those ${LINK_SECONDS / 60} minutes anybody holding that link can open that file, whether or not they are signed in, so please do not paste one into a chat.`,
      `The nightly copies are removed after about a fortnight. Section "Backups" below says what that means for something you have deleted.`,
      `Resend's sending log, Sentry's reports and whatever Anthropic holds run on those companies' own clocks, quoted above where they publish one.`,
    ],
  },
  {
    heading: "Cookies, and what is stored on your device",
    paragraphs: [
      `We do not use cookies for analytics, advertising or tracking, and this app contains no tracker.`,
      `Signed out, on the sign-in screen, this app stores nothing on your device at all — no cookie, and nothing in your browser's storage.`,
      `When you sign in, a cookie keeps you signed in. While a password-reset link is being used there is a second, short-lived cookie that tells the new-password screen a link was just accepted. Both are needed for those things to work, and neither is used for anything else.`,
      `The anti-robot check stores one item in your browser, under the key cf.turnstile.u. It belongs to Cloudflare rather than to us, it sits in Cloudflare's own part of the page where this app cannot read it, and Cloudflare does not document what it is or how long it stays. We would rather name it and say that than leave it out.`,
      // CHANGED on the re-read: "nothing here to consent to" is a conclusion
      // dressed as a fact, and the item above it is a third party's. The reason
      // is what the owner's decision of 13 Oct 2026 actually rests on, so the
      // reason is what the page gives.
      `There is no consent banner: nothing listed above is used for analytics, advertising or profiling, and the rest is what makes signing in work.`,
    ],
  },
  {
    heading: "What you can ask for",
    paragraphs: [
      // ADDED WITH THE EXPORT, Build it 26 PR 3, and not one word of it before
      // the feature existed: scripts/screen-state-check.mjs section 11i refused
      // any claim about a download until there was one, and docs/claims.md
      // section 7d's row for it said MUST NOT SAY YET.
      //
      // IT NAMES WHERE, because a right somebody cannot find is not a right
      // they have -- the same argument docs/plan.md makes for the consent
      // setting having a page of its own rather than a box on another screen.
      //
      // AND IT SAYS WHAT THE FILE DOES NOT HOLD rather than listing it here.
      // The list is in the file, which is where the person reading it is.
      `You can download what this app holds about you, as one file, from Settings. The file itself says what is deliberately not in it, and why.`,
      `You can change your tasks and your nickname yourself, and you can switch AI suggestions off at any time, which stops anything more being sent immediately.`,
      // CHANGED on the re-read: the first version said "we will delete it" with
      // nothing about how. It is done BY HAND, in a dashboard, and today the
      // database refuses to delete an account while any of that person's tasks
      // still has a file on it -- so the files have to be removed first. None of
      // that stops the deletion happening; it stops it being instant, and a
      // sentence that implied otherwise would be a promise about speed nobody
      // made.
      `There is no way to delete your account in this app yet. Write to ${CONTACT_ADDRESS} from the address on the account and we will delete it by hand. It is not instant, and it is one person doing it.`,
      `Asking from the address on the account is how we know it is you — without that, anybody who knew your address could have your account destroyed.`,
      `Changing the email address on an account is also done by hand. Write to the same place.`,
      `To ask what is held about you, or for the two things above that nobody can see through the app, write to ${CONTACT_ADDRESS}.`,
      // CHANGED on the re-read: an untried procedure described as though it were
      // routine. docs/claims.md's verdict for this row is "not verified, and not
      // yet tried", so the page says so.
      `Error reports about you can be deleted at Sentry on request, and the moment to ask is before the account goes — afterwards the identifier in them is the only thing left to search by, and nobody writes it down. So ask for both in the same message. Nobody has had to do this yet.`,
      // ACCEPTED BY THE OWNER, 2026-10-13 -- optional paragraph 2. It names the
      // regulator for England and Wales, which is where answer 2 puts these
      // terms. The order matters and is deliberate: write here first, and the
      // regulator if that does not settle it.
      `If you are not happy with how this is handled, write to ${CONTACT_ADDRESS} first — and if that does not settle it, you can complain to the Information Commissioner's Office, the UK's regulator for this, at ico.org.uk.`,
    ],
  },
  {
    heading: "What cannot be undone",
    paragraphs: [
      `Switching AI suggestions off stops anything more being sent. It does not recall what was already sent, and it cannot. What Anthropic holds runs on the clock quoted above.`,
      `What has already gone to Anthropic also cannot be found, let alone removed on request, because nothing identifying you was sent with it. That is the price of sending nothing about who asked, and it is the right way round.`,
      `Resend's record of which addresses were sent what is that company's, and goes on its own ${EMAIL_LOG_DAYS}-day clock.`,
      `The sign-in log and the hosting access log are written by Supabase and Vercel whether we want them or not, and nothing we do removes a line from either.`,
    ],
  },
  {
    heading: "Backups, and what “deleted” means",
    paragraphs: [
      // CHANGED on the re-read: "Every night" is what the schedule ASKS for, and
      // docs/backups.md measured the first scheduled run starting 5h 57m 24s
      // late, and quotes GitHub's own "some queued jobs may be dropped". So the
      // honest word is "most nights".
      `Most nights an encrypted copy of the whole database and every attached file is made and kept by Cloudflare for about a fortnight. It exists because the one thing in this app nobody can retype is a photograph of a job that has since been done.`,
      `So when something is deleted it is gone from the app at once, and gone from the copies when the last copy made before the deletion expires — up to about a fortnight later. A backup that honoured deletions would have honoured the wrong one too, which is the whole reason it exists.`,
      // FIX 1, the coach's review of PR #303. The first version said "nothing
      // anybody typed is lost", and that is false: a copy is a copy of a
      // MOMENT, so everything after the last one is gone.
      //
      // THE FIGURE IS THE ONE docs/backups.md SUPPORTS, which is not the
      // owner's target of "at most one day" -- that page says in as many words
      // that the target "is NOT what this design delivers", because a late copy
      // stretches the window and a dropped one doubles it. Its own replacement
      // sentence is the one quoted here: "we lose at most about a day and a
      // quarter on a normal night, and about two and a half days if GitHub
      // drops a run -- and we would not know which had happened." The first
      // figure is measured once; the second is GitHub's published behaviour and
      // has not been observed.
      `If this app ever has to be rebuilt from one of those copies, everything that changed after that copy was made is lost — on a normal night that is up to about a day and a quarter, and up to about two and a half days if a night's copy is missed. We would not be able to tell you which it had been. What survives, survives exactly as it was.`,
      `And everybody will be asked to sign in again: sign-ins are deliberately not restored.`,
    ],
  },
  {
    heading: "Changes to this page",
    paragraphs: [
      `These words last changed on ${LAST_UPDATED}. If what the app does changes, this page changes with it, and the date above changes too.`,
    ],
  },
];

// ---------------------------------------------------------------------------
// THE FOUR OPTIONAL PARAGRAPHS ARE GONE FROM THIS FILE, AND HERE IS WHERE THEY WENT
// ---------------------------------------------------------------------------
//
// An `OPTIONAL_PRIVACY` array stood here, holding four paragraphs for the owner
// to accept or strike (the coach's review of PR #303). The owner answered all
// four on 2026-10-13, so the array is deleted rather than left empty: a holding
// place with nothing in it is a thing somebody has to work out the status of.
//
//   1. why the data is held            ACCEPTED -> "Who holds this data"
//   2. the Information Commissioner's
//      Office                          ACCEPTED -> "What you can ask for"
//   3. "in plain words ... the United
//      States"                         ACCEPTED -> "Who else receives any of it"
//   4. the company's registered number
//      and office                      NOT NOW -- and DELETED rather than left
//                                      as a placeholder, at the owner's
//                                      instruction. A blank in square brackets
//                                      left in a file is a thing that
//                                      eventually reaches a page.
//
// AND THIS COMMENT DELIBERATELY DOES NOT SPELL THAT BLANK. Section 11 refuses
// the placeholder ANYWHERE in this file, and the first version of this note went
// red by naming the string it was explaining the deletion of -- the third time
// in this change that a comment tripped a check it was describing.
//
// WHERE ITEM 4 LIVES NOW: docs/plan.md's Build it 26 section, as an open item
// for the owner. It is a FACT ONLY THE OWNER HAS rather than a decision, so it
// could not be drafted and should not be guessed.
//
// The three that were accepted are marked where they sit, and each has a row in
// docs/claims.md section 7 saying it is the OWNER'S JUDGEMENT and not a legal
// review -- which is answer 5, and is the reason none of them is written as a
// term of art.
//
// scripts/screen-state-check.mjs section 11 holds all of that: the three
// paragraphs must be present, `OPTIONAL_PRIVACY` must not exist, and neither
// placeholder may appear anywhere in this file or either page.

// ---------------------------------------------------------------------------
// The terms
// ---------------------------------------------------------------------------

export const TERMS: ReadonlyArray<LegalSection> = [
  {
    heading: "What Team Tasks is",
    paragraphs: [
      `A small shared to-do list, run by ${CONTROLLER} for a volunteer group. You can make tasks, tick them off, make teams of up to a few people, and invite others by email.`,
      `It is free, and there is nothing to pay for.`,
    ],
  },
  {
    heading: "Who can use it",
    paragraphs: [
      `This app is not for anybody under ${MINIMUM_AGE}. Nothing here asks your age, so by using it you are confirming that.`,
      `You need an email address you can receive mail at, because signing up and resetting a password both send you a link.`,
    ],
  },
  {
    heading: "What you agree to",
    paragraphs: [
      // CHANGED on the re-read, the same wording as the privacy page's: nothing
      // CHECKS what you type, which is the true and useful thing. "The app does
      // not read what you type" is false of an app that draws it on a screen.
      `What you type is yours and you are responsible for it. Please do not put other people's personal details into a task, a team name or a nickname — nothing checks what you type, so nothing stops you, and the people in your team can see it.`,
      `A file you attach can be opened by everybody who can see the task it is on. Please do not attach anything you would not show them.`,
      `Do not use this app to send bulk email, to upload anything you do not have the right to, or to try to reach other people's data.`,
    ],
  },
  {
    heading: "What we do not promise",
    paragraphs: [
      `We do not promise that the app will be available, that it will keep working, or that anybody will answer a message quickly. One person runs it.`,
      `We do not promise to keep your data for any length of time, and you should not use this app as the only place something important is written down.`,
      `We do not keep a record of which version of these terms you agreed to, or when. If this page changes, there is nothing in the app that would say which version you saw.`,
    ],
  },
  {
    heading: "Suspending an account",
    paragraphs: [
      `The owner can stop an account from reading or changing anything, without deleting it or its work. It is there for two cases: somebody putting other people's personal details into task text, and an account that has been taken over.`,
      `Nobody is emailed when this happens, and a suspended account sees an app with nothing in it. If that happens to you, write to ${CONTACT_ADDRESS}.`,
      `A suspended account cannot delete itself, which is why that address is the route.`,
    ],
  },
  {
    heading: "Your data",
    paragraphs: [
      `The Privacy page says what is held, who else receives it, where it is held and for how long. It is part of these terms.`,
    ],
  },
  {
    heading: "The law these terms are read under",
    paragraphs: [
      `${GOVERNING_LAW}, and any dispute is heard there.`,
    ],
  },
  {
    heading: "Changes to these terms",
    paragraphs: [
      `These words last changed on ${LAST_UPDATED}. If they change, this page changes and the date above changes with it. There is no notification.`,
    ],
  },
];
