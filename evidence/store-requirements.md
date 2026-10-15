# Evidence: store-requirements

Result: N/A - web only
Date: 2026-10-15
How checked: (1) Read this row's `how_to_prove` in `checklist/launch.json`, which says to write "Result: N/A - web only" if no mobile app is shipped. (2) Confirmed there is no mobile app to ship: `git ls-files` filtered for Android, iOS, Xcode and app-manifest names returns nothing. (3) The decision is written down in [docs/decisions/mobile.md](../docs/decisions/mobile.md) — Team Tasks is a web app opened in a phone's browser, with no app-store release — so there are no store requirements to meet.
Checked by: Raj Dhonota (owner)

## Output (secrets removed)

```
$ git ls-files | grep -iE "manifest|android|ios/|\.plist|apk|xcode"
(no output -- no mobile app project in this repository)
```

## What would change this

Shipping an app through a store. `docs/decisions/mobile.md` lists the three things that
would make us look again: phone notifications, working with no signal, or somebody using
the app asking for an installable one. If any of them happens, this row stops being N/A
and the store checklist has to be done for real.
