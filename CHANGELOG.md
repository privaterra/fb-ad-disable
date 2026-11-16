# Changelog

Notable changes to this project. Versions follow [semantic versioning](https://semver.org/).
Each release on GitHub carries the section for its version.

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

[1.5.0]: https://github.com/privaterra/fb-ad-disable/releases/tag/v1.5.0
