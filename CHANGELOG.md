# Changelog

Notable changes to this project. Versions follow [semantic versioning](https://semver.org/).
Each release on GitHub carries the section for its version.

## [1.6.1]

On the `dev` branch, not released yet. Fixes for what a live run of 1.6.0 showed.

### Fixed

- **Hide advertisers you have seen: lines of an advertiser's own page were clicked as if they were advertisers.** Facebook draws an opened advertiser over the list inside the same pop-up and keeps the covered list in the page. The script could then open one advertiser on top of another, file an advertiser under the name of the list ("Advertisers you saw ads from") or of another advertiser, and click the buttons on an advertiser's page: **Facebook Page**, **Website** and **Unhide** (it hid the advertiser again afterwards). A row now only counts as an advertiser when it is among the list's rows that are actually in front, an advertiser only counts as opened once its own **Hide ads** or **Unhide** is in front, and nothing else in the pop-up is clicked. The page reloads this caused between advertisers are gone too.
- **Disable list-based advertisers ended early without saying so.** When Facebook stopped showing the rest of the list part-way (159 of 226 in the live run), the step reported "of 159" as if that were all. It now opens the list further, reloads it up to twice, and otherwise reports how many advertisers were not reached, as a step that needs another run.
- **Wrong entries in the advertiser database are removed.** Entries of "Hide advertisers you have seen" that an earlier version filed under the wrong name are dropped when the database is read, with a line in the log, so those advertisers are read again.
- A hide only counts when the advertiser's page shows it as hidden afterwards; otherwise the report says it was clicked but not confirmed.
- An advertiser's name is no longer repeated as its category ("TryLumic · TryLumic"), and a list-based advertiser's name and handle are no longer run together ("Hyatt@hyatt" is now "Hyatt @hyatt").

## [1.6.0] - 2026-11-18

### Added

- **Export and import of your data** ([#9](https://github.com/privaterra/fb-ad-disable/issues/9)). One file holds your settings, the advertiser database and the run history. The report asks at the end of a run whether to save it; the menu offers to import one when nothing is saved in the browser, and has **Export to file** and **Import from file** at any time. Importing merges, and a file to import is treated as untrusted.
- **An advertiser database.** The remembered list now holds every advertiser handled, in both advertiser tasks, with what Facebook says about it. An advertiser whose ads are already hidden is no longer opened again just to read its details, which means fewer pages opened per run.
- The menu's settings are kept on their own, so they survive when a run in progress is discarded.

### Fixed

- **Advertisers were handled twice** ([#8](https://github.com/privaterra/fb-ad-disable/issues/8)). In "Hide advertisers you have seen", the lines of an advertiser's own panel (its category, its description) could be taken for further entries of the list when the panel was still on screen. Each such line was booked as another advertiser, which also inflated the "already hidden" and "no longer shown" counts. An entry is now only picked while the list itself is on screen, and the panel is closed with its own Back button, one press at a time.
- **The advertiser progress bar disappeared** after a page load in the middle of an advertiser step and only came back when the next advertiser was done. It now comes straight back with the count so far.
- **Copy log and Save log are always there**, during the run and in the report. They used to depend on the "Save logs" option, so they vanished whenever the saved options were lost, for example after installing the extension from a new folder. The option is now "Keep the full log" and is on by default.
- **A row that already shows the wanted value is not opened.** "People with your email address · No one" failed with "could not find option" when its dialog did not open.
- Links to files of this repository in release notes are written as full addresses, so they work on the release page.

### Changed

- **A setting is never loosened.** A row that shows something stricter than the level asks for ("No one" where Moderate would set "Friends") is left as it is.
- The project now has two branches: `main` holds the released code, `dev` the next version. Releases are published from `main` only.
- **Security:** the advertiser database is held in a `Map` while the script runs, and a cleaned backup file is built entry by entry, so an advertiser key that comes from the page, a saved run or an imported file can never be taken for a built-in property (two CodeQL "remote property injection" findings on the new import code).

## [1.5.0] - 2026-11-16

First public release.

### What it does

One script for Google Chrome, run as an extension, a userscript, or pasted into the DevTools console while logged in to Facebook. From one menu it:

- stops advertisers and data brokers that uploaded a contact list with your details from using it (**Disable list-based advertisers**);
- hides the advertisers Facebook lists for you (**Hide advertisers you have seen**);
- switches off the ad settings that use partner data, your profile categories and your activity elsewhere (**Restrict ad data settings**);
- handles what replaced off-Meta activity (**Clear** and **Disconnect off-Meta activity**);
- switches off the AI features Facebook lets you switch off, and lists the ones it does not (**Turn off AI features**);
- sets 17 audience and visibility settings to a level you choose: **Default**, **Moderate** or **Max**.

It has a dry run, progress bars with time left, a table and log line per advertiser, a remembered list so later runs only handle new advertisers, CSV and log export, and a report that says what was changed, what was already set, and what needs doing by hand.

### Security

- CSV export cannot be used for formula injection: every cell is quoted, and a value starting with `=`, `+`, `-` or `@` is shown as text.
- A saved run is validated before use, and a run found in `window.name` (console mode) is offered, never started.
- Locked dependencies, Dependabot, `npm audit` in CI and CodeQL. See [SECURITY.md](SECURITY.md).

### Known limits

- Facebook changes its pages often and serves different layouts to different accounts. Start with a dry run.
- Facebook limits how fast its pages can be opened. A task that meets "Something went wrong" is reported as possible rate limiting; wait a few hours before running it again.
- Tested live on one account (US, English). Switching off a category field that is in use, removing "other categories", and choosing an option behind the renamed ad rows are covered by the mock tests only.
- English (US) only, apart from Portuguese labels in the list-based advertiser task.

## Before the first release

Development versions, not published.

- **1.4.1** - Reach every entry of a list that loads as it scrolls. The list-based result says how advertisers were opened.
- **1.4.0** - The menu shows when each section last ran and flags possible rate limiting. Handles a list Facebook redraws after a hide, and "Activity from other businesses".
- **1.3.0** - A table row and a log line per advertiser, with category, followers and website. Reads "already hidden" and the profile-field layout of "Categories used to reach you".
- **1.2.2** - Reaches the advertiser list through Ad preferences, and opens advertisers in up to three ways.
- **1.2.1** - Renamed ad rows, advertiser pages with their own address, off-Meta activity retired, and a run that survives a page reload.
- **1.2.0** - **Turn off AI features**. Reworked the settings a first live run could not change. Failed steps record what the page showed.
- **1.1.0** - Remembered advertisers, log saving, progress bars with time left, advertiser details as CSV.
- **1.0.0** - First version: the menu, the advertiser and ad-data tasks, the three privacy levels, dry run and the report.

[1.6.1]: https://github.com/privaterra/fb-ad-disable/compare/v1.6.0...dev
[1.6.0]: https://github.com/privaterra/fb-ad-disable/releases/tag/v1.6.0
[1.5.0]: https://github.com/privaterra/fb-ad-disable/releases/tag/v1.5.0
