// words.ts -- every place an internal value becomes something a person reads.
//
// WHAT COUNTS AS AN INTERNAL VALUE. A value the database chose, or the code
// chose, for a machine: `owner`, `member`, `queued`, `failed`, `not_configured`.
// None of them is wrong English exactly, and that is what makes them easy to
// leave on a screen -- "owner" reads fine until you notice the screen is showing
// you a column.
//
// WHY THEY GET MAPPED RATHER THAN CAPITALISED. Two reasons, and the second is the
// one that matters. The first is that a word chosen for a person can be chosen for
// a person: "could not be sent" is a better thing to read than "failed". The
// second is that a mapping can be CHECKED AGAINST THE DATABASE. The roles and the
// statuses are both fixed lists written down in supabase/migrations, so
// scripts/friendly-words-check.mjs reads the migrations, pulls the lists out of
// them, and insists that every value the database allows has a word here. A
// migration adding a fourth status turns that check red, which is the only way a
// screen gets told about it -- an `if` chain would simply draw nothing, or draw
// the raw word.
//
// AND THE NULLS. The other half of this file is `plainText`, which is the answer
// to "no screen can show null or undefined". That is not a thing a careful author
// avoids one place at a time; it is a thing one function does, everywhere a value
// might be missing.
//
// NO IMPORTS, so scripts/friendly-words-check.mjs can load it with a plain `node`
// run. Nothing here talks to Supabase, reads the clock or renders anything.

// ---------------------------------------------------------------------------
// Nothing on a screen is ever "null"
// ---------------------------------------------------------------------------

// The four shapes a missing value arrives in, and only one of them is obvious.
//
// `null` and `undefined` are the two everybody thinks of, and React draws
// neither -- it renders nothing for both, which is why a missing name shows up
// as a gap rather than as the word. THE WORDS ARE THE DANGEROUS CASE: a value
// that has been through a URL, a JSON round trip or a `String(x)` arrives as the
// five characters "null" or the nine characters "undefined", and React draws
// those exactly as it would draw a name. So they are refused here by name.
//
// Case-insensitively, and after trimming, because " NULL " is the same accident.
const NOTHING_WORDS: ReadonlyArray<string> = ["null", "undefined", "nan"];

/**
 * A value that is safe to draw, or the fallback.
 *
 * Returns the trimmed value when there is one, and `fallback` when the value is
 * missing, blank, or one of the words a missing value turns into on its way
 * through a string. The fallback is written by whoever calls this, so it can say
 * the right thing for its own screen -- "Unnamed member" in a members list is
 * not the same sentence as "Signed in" in a header.
 *
 * It never returns null, undefined or an empty string. That is the whole
 * contract, and scripts/screen-state-check.mjs holds it to it over every shape
 * of input it could be handed, including a number, an array and an object.
 */
export function plainText(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;

  const text = value.trim();
  if (text === "") return fallback;
  if (NOTHING_WORDS.includes(text.toLowerCase())) return fallback;

  return text;
}

// ---------------------------------------------------------------------------
// A person with no nickname
// ---------------------------------------------------------------------------

// What a members list shows for somebody who has not set a nickname.
//
// team_roster left-joins profiles on purpose, so a person with no profile row
// still appears in their team's list with display_name null (the view's comment
// in 20261002122203_team_rules.sql says so). A missing name is a missing name,
// never a missing person -- and never an empty line, which is what React draws
// for a null and which reads as a bug.
//
// IT IS NOT THEIR EMAIL ADDRESS, and it must never become one: "never shown to
// team members" is a decision in docs/plan.md, and the app cannot read another
// person's address in any case -- addresses live in auth.users, which no policy
// in this database exposes.
export const NO_DISPLAY_NAME = "Unnamed member";

// What the account menu says when the verified token carries no email claim.
//
// `email` is optional on Supabase's own JwtPayload type
// (web/node_modules/@supabase/auth-js/dist/module/lib/types.d.ts, line 2028: it
// is `email?: string`), so this is a real case and not a defensive flourish. It
// says what is known -- somebody is signed in -- and does not invent a name for
// them.
export const NO_ACCOUNT_NAME = "Signed in";

/**
 * Who the account menu says is signed in.
 *
 * The address from the VERIFIED token, which is this person's own and nobody
 * else's. docs/plan.md's "never shown to team members" is about other people's
 * addresses; this is the one screen where an address is the honest answer to
 * "which account am I in?", and the only person who ever sees it is its owner.
 *
 * Nothing about this is a claim that an account exists: it is drawn only on a
 * page that has already verified a session.
 */
export function accountLabel(email: unknown): string {
  return plainText(email, NO_ACCOUNT_NAME);
}

// ---------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------
//
// THE LIST IS THE VIEW'S. public.team_roster derives its role column -- there is
// no roles table and nothing stored -- as the two literals in
// 20261002122203_team_rules.sql:
//
//     'owner'::text  as role     (the branch over public.teams)
//     'member'::text as role     (the branch over public.team_members)
//
// scripts/friendly-words-check.mjs reads those two literals out of that file and
// requires a word here for each. A third branch added to the view turns it red.
export const ROLE_WORDS: Readonly<Record<string, string>> = {
  owner: "Owner",
  member: "Member",
};

// For a role this app has never heard of, which takes a migration adding a third
// branch to the view without this list being updated.
//
// It does NOT print the value, and it does not guess "Member" either. Guessing
// the lower of two permissions would be a quiet lie about what somebody can do;
// saying the role is not known is true, and a member list that says it is a list
// somebody will report.
export const UNKNOWN_ROLE_WORD = "Role not known";

/** The word a members list shows for one person's role. Never the raw value. */
export function roleWord(role: unknown): string {
  if (typeof role !== "string") return UNKNOWN_ROLE_WORD;

  const name = role.trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(ROLE_WORDS, name)
    ? ROLE_WORDS[name]
    : UNKNOWN_ROLE_WORD;
}

// ---------------------------------------------------------------------------
// Invitation status
// ---------------------------------------------------------------------------
//
// THE LIST IS THE MIGRATION'S. 20261006095847_invitation_status.sql:
//
//     add constraint invitations_status_allowed
//     check (status in ('queued', 'sent', 'failed'));
//
// scripts/friendly-words-check.mjs reads the three values out of that constraint
// and requires a word here for each.
//
// WHY "sending" AND NOT "queued". The owner pressed a button a second ago; what
// they want to know is where their invitation is, not which value a column holds.
// And "queued" is the value a row keeps when the function stopped half way --
// which is why web/src/lib/teams.ts has a staleness rule and a Try again button
// for exactly that row. Both of those are easier to explain next to the word
// "sending" than next to the word "queued".
//
// WHY "could not be sent" AND NOT "failed". "Failed" sounds like a fault of the
// person who typed the address. The send is what did not work, and the sentence
// beside it says what is known about why -- from a fixed code, never from
// anything the email service said (docs/plan.md, "Invitation status").
export type InvitationStatusWord = "sending" | "sent" | "could not be sent";

export const INVITATION_STATUS_WORDS: Readonly<
  Record<string, InvitationStatusWord>
> = {
  queued: "sending",
  sent: "sent",
  failed: "could not be sent",
};

// For a status this app has never heard of: a migration allowed a fourth word
// and this list was not updated.
//
// "sending" is the honest reading of a row nobody has confirmed, and it is what
// the old code already fell back to. It never shows the raw value. Note what
// does NOT follow from it: web/src/lib/teams.ts gives an unrecognised status no
// Try again button, because invite-member refuses a status it does not recognise
// -- so a button there would offer something that would then be refused.
export const UNKNOWN_INVITATION_STATUS_WORD: InvitationStatusWord = "sending";

/** The word My teams shows beside one waiting invitation. Never the raw value. */
export function invitationStatusWord(status: unknown): InvitationStatusWord {
  if (typeof status !== "string") return UNKNOWN_INVITATION_STATUS_WORD;

  const name = status.trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(INVITATION_STATUS_WORDS, name)
    ? INVITATION_STATUS_WORDS[name]
    : UNKNOWN_INVITATION_STATUS_WORD;
}
