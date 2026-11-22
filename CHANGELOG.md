# Changelog

Notable changes to this project. Versions follow [semantic versioning](https://semver.org/).
Each release on GitHub carries the section for its version.

## [1.7.2]

From a live run of 1.7.1. The advertiser steps and the settings went through as before (3 of 229 list-based advertisers were new and were switched off, 5 of 200 advertisers seen were new and were hidden, the rest skipped as remembered). The Ad topics step did nothing, and its log showed the pop-up as it is.

### Fixed

- **Ad topics: the step lost its list and did nothing.** 1.7.1 knew the list by the heading above it. Counting the list scrolls to its last row, the heading went out of view, and the list was taken for another page: three page loads, no topic opened. Now a heading that was scrolled out of view with its list still counts; only a heading that is covered by another page does not. The same goes for the rows: a list that was scrolled to a part without rows is scrolled back before it is given up.
- **Ad topics: the topics are behind "View and manage topics".** The pop-up opens on a summary: three topics, "Special topics", and the topics already chosen. The step worked on those few rows. It now opens "View and manage topics" and works through the list there, and opens it again if "Back" went past it. Where the pop-up has no such button, the rows of the summary are used as before.
- **"See less · … and others" on the summary is not a topic.** 1.7.1 left that row out only where entries are plain buttons; on the summary they are list items.
- **A list down to its last row is still the list.** Two known rows had to be in view; a list that loses the entries that are done ends with one. One row is enough when it is still to do.
- **A step that could not reach its list is not reported as "Already set".** With nothing changed and the list not worked through, the report now says "Needs manual check".

### Changed

- **"Special topics" is looked at, not changed.** At the end of the step its page is opened, what it shows is written to the log (the controls and their state), and it is closed again. Nothing in it is clicked: what a click does there is not known yet. The report says it was left as it is.
- **What the page showed, in the log, is the page in front.** A pop-up keeps its covered pages in the document; with a long list under an opened entry, the note showed the list and not the entry.

## [1.7.1] - 2026-11-22

From a live run of 1.7.0, whose per-topic log lines showed what the Ad topics pop-up really holds.

### Fixed

- **Ad topics: the step walked into the list of topics that are done already.** The pop-up's list has a row called "See less" that is not a topic: it opens the topics already set to "See less" (919 on the account of the live run). The step took the row for a topic, landed in that list, took it for the list it was working on because it showed some of the same names, and opened 384 topics one by one to find each "already “See less”", in 45 minutes. Now:
  - a row is left out by its name, not only when its whole text matches, so "See less · 919 topics" is not an entry;
  - the list a step works on is known by the heading above it as well: another page's list is another list, whatever names it shows.
- **A row that opens a group of topics is not clicked through.** "Special topics" opens a page of several topics, each with a "See less" of its own. 1.7.0 clicked the first one and reported a failure. What a click does there is not known yet, so nothing in it is clicked; the row is reported as not handled.
- **What the page showed is in the log for each kind of failure**, once, with the name of the entry. The 1.7.0 log named the failures but not what was on screen.
- **Work done before a failed page load is reported.** When Facebook answered with a blank page after the step reloaded, the report only said that the "Ad topics" section was not found. It now says what was done up to then, that the rest was not reached, and that a blank page can be rate limiting.

## [1.7.0] - 2026-11-19

### Added

- **Ad topics are handled like advertisers.** The "Ad topics: See less" task now has:
  - a count of the list and a second progress bar ("Topics: 12 of 530"), with the time left;
  - a row per topic in the live table, and a line per topic in the log with its result;
  - memory: a topic that is done is remembered, and with "Skip remembered advertisers and ad topics" on it is not opened again;
  - an **Ad topics** table in the report, with **Export topics CSV** and **Copy topics CSV** (a file of its own);
  - a place in the backup file, next to the advertisers.

### Fixed

- **Ad topics: 8 topics in 45 minutes, 520 never reached** (a live run of 1.6.4). The step logged nothing per topic, so the log did not show why. What changed:
  - A topic only counts as opened once a "See less" turns up that was not on screen before the topic was clicked and is not inside a topic's row. The pop-up can have a "See less" of its own (a tab, a filter); clicking that changes no topic and swaps the list.
  - In a long list only the container that holds most of the listed rows is the list. Tabs, filters and other buttons of the pop-up are not taken for entries.
  - A row is picked from the whole list, not only from the part that is on screen.
  - Looking at a long list is much cheaper: what was found is kept for a moment instead of being worked out again several times per step.
  - Loading more of a list is limited to four minutes at a time, and the log says when the page is loaded again and what the pop-up showed when the list gets stuck.
- What the page showed at the first failure of a list step is kept across page loads, so it reaches the report.
- A list step stops after eight entries in a row could not be handled (three when nothing has worked yet), and says so.

### Changed

- The options are now "Remember processed advertisers and ad topics" and "Skip remembered advertisers and ad topics".

## [1.6.4] - 2026-11-19

From a live run of 1.6.3, whose log showed why one setting was reported as changed on every run.

### Fixed

- **"Social interactions in ads" was never really changed: the script clicked the value shown on an account.** The setting is kept per account. Its pop-up, "Select an account", lists each account with its product and current value, and the "Only me" there is what the Facebook account is already set to, not an option. The script took it for the option, clicked it (which only opens the account) and reported a change. It now reads the list: a Facebook account that already shows the wanted value is left alone, one that does not is opened and set, and the report says what each account shows.
- **Accounts of other products in that list (Instagram) are read and reported, not changed.** This script is about Facebook.
- Several categories on one line ("Brand · Science, Technology & Engineering · Information Technology Company") are a category again. 1.6.3 took a long one for a description and dropped it from the log line.

### Changed

- The README says that a saved log can contain your name and the names of your accounts, when the text of a pop-up is kept in it.

## [1.6.3] - 2026-11-19

From a live run of 1.6.2, which skipped all 240 remembered list-based advertisers and handled the 200 advertisers of "Hide advertisers you have seen" in just over a minute.

### Fixed

- **A setting reported as "Changed" on every run.** "Social interactions in ads" was changed to "Only me" by every run, 1.6.2 included. Three things now work on it:
  - A pop-up that opens with no option selected yet gets a moment to show its current choice before anything is clicked.
  - A step that the last run changed to the very same value says so in the report and asks for a check by hand: the choice may not be staying, or the page does not show it.
  - When a choice is changed, the log keeps what the pop-up showed before the click, with each option named and its state.
- **The line that names a step was missing from the log** for every step that starts with a page load ("1/26 Disable list-based advertisers", "10/26 Who can see your future posts"…). It is now written once per step, before the page loads.
- "Limit who can see past posts" says that it is applied on every run: Facebook offers the button whether or not past posts were limited before.
- A description stored as a follower count or as a category by earlier versions is moved to the description when the database is read.

## [1.6.2] - 2026-11-19

Small corrections from a live run of 1.6.1, which completed every step: 240 of 240 list-based advertisers (16 switched to "Don't allow") and 200 advertisers in "Hide advertisers you have seen" (29 hidden), each handled once.

### Fixed

- **A choice that the page gives no state for is reported as such.** "Social interactions in ads" said "Changed (Only me)" on every run. The script now reads back what the pop-up shows after selecting an option. When the pop-up shows no state at all it says so in the report, and the log keeps what the pop-up looked like. When the option still shows as not selected after the click, the step is reported for a check by hand instead of as done.
- The state of an option is also read from a control that sits next to its text, not only around it.
- **A description is no longer taken for a follower count or a category.** A line such as "…with 7 million+ members…" or "…helping folks like you since 2005" was printed as the follower count; a long description was printed as the category.

### Changed

- **A list-based advertiser is remembered by the address of its page without the query string.** The number in the address is the advertiser; the rest only says how the page is shown. Entries remembered by earlier versions are converted when the database is read.

## [1.6.1] - 2026-11-18

Fixes for what a live run of 1.6.0 showed.

### Fixed

- **Hide advertisers you have seen: lines of an advertiser's own page were clicked as if they were advertisers.** Facebook draws an opened advertiser over the list inside the same pop-up and keeps the covered list in the page. The script could then open one advertiser on top of another, file an advertiser under the name of the list ("Advertisers you saw ads from") or of another advertiser, and click the buttons on an advertiser's page: **Facebook Page**, **Website** and **Unhide** (it hid the advertiser again afterwards). A row now only counts as an advertiser when it is among the list's rows that are actually in front, an advertiser only counts as opened once its own **Hide ads** or **Unhide** is in front, and nothing else in the pop-up is clicked. The page reloads this caused between advertisers are gone too.
- **Disable list-based advertisers ended early without saying so.** When Facebook stopped showing the rest of the list part-way (159 of 226 in the live run), the step reported "of 159" as if that were all. It now opens the list further, reloads it up to twice, and otherwise reports how many advertisers were not reached, as a step that needs another run.
- **Wrong entries in the advertiser database are removed.** Entries of "Hide advertisers you have seen" that an earlier version filed under the wrong name are dropped when the database is read, with a line in the log, so those advertisers are read again.
- A hide only counts when the advertiser's page shows it as hidden afterwards; otherwise the report says it was clicked but not confirmed.
- An advertiser's name is no longer repeated as its category ("TryLumic · TryLumic"), and a list-based advertiser's name and handle are no longer run together (`Hyatt@hyatt` is now `Hyatt @hyatt`).

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

[1.7.2]: https://github.com/privaterra/fb-ad-disable/compare/v1.7.1...dev
[1.7.1]: https://github.com/privaterra/fb-ad-disable/releases/tag/v1.7.1
[1.7.0]: https://github.com/privaterra/fb-ad-disable/releases/tag/v1.7.0
[1.6.4]: https://github.com/privaterra/fb-ad-disable/releases/tag/v1.6.4
[1.6.3]: https://github.com/privaterra/fb-ad-disable/releases/tag/v1.6.3
[1.6.2]: https://github.com/privaterra/fb-ad-disable/releases/tag/v1.6.2
[1.6.1]: https://github.com/privaterra/fb-ad-disable/releases/tag/v1.6.1
[1.6.0]: https://github.com/privaterra/fb-ad-disable/releases/tag/v1.6.0
[1.5.0]: https://github.com/privaterra/fb-ad-disable/releases/tag/v1.5.0
