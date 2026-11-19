# fb-ad-disable

[![CI](https://github.com/privaterra/fb-ad-disable/actions/workflows/ci.yml/badge.svg)](https://github.com/privaterra/fb-ad-disable/actions/workflows/ci.yml)
[Latest release](https://github.com/privaterra/fb-ad-disable/releases/latest) · [Changelog](CHANGELOG.md) · [Security](SECURITY.md)

A script for Google Chrome that works through Facebook's own settings pages for you, while you are logged in, to:

- stop advertisers and data brokers that uploaded a contact list containing your details from using it to target you,
- hide the advertisers Facebook lists for you,
- switch off the ad settings that let Meta use partner data, your profile categories and your activity off Meta,
- clear (and optionally disconnect) your off-Meta activity,
- switch off the AI features Facebook lets you switch off,
- tighten your audience and visibility settings to a level you choose: **Default**, **Moderate** or **Max**.

You pick what to run from a menu, press **Start**, and get a report at the end.

<img src="docs/menu.png" alt="The fb-ad-disable menu" width="372">

The script only clicks controls on facebook.com, the same ones you would click by hand. It has no server, collects nothing and sends nothing anywhere.

## Before you start

- **Read this first: Facebook changes its pages often.** The script finds controls by their visible English text. When it cannot complete a step it does not guess: the step is listed in the final report as "Needs manual check", with a link to the page and the value to set. Expect a few of those.
- **Set Facebook's language to English (US)** for the run (Settings → Language and region). Only the advertiser-list task also has Portuguese labels.
- **Do a dry run first.** Tick *Dry run* in the menu: the script visits every page and reports what it would change, without changing anything.
- Use a desktop Chrome window, leave the Facebook tab in the foreground while it works, and do not click in it.
- Two actions cannot be undone in one click: **Limit past posts** (part of Moderate and Max) and **Clear off-Meta activity history**. Facebook may also ask for your password before some changes; the script cannot enter it, so those steps end up in the manual list.

## How to use it

There are three ways to run the same file, `fb-ad-disable.js`. The extension is the most convenient because a full run moves between `www.facebook.com` and `accountscenter.facebook.com`, and only the extension and the userscript survive those page loads without your help.

### Option 1: Chrome extension (recommended)

1. From the [latest release](https://github.com/privaterra/fb-ad-disable/releases/latest), download `fb-ad-disable-<version>.zip` and unzip it. (Or clone this repository.)
2. In Chrome open `chrome://extensions`.
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and select the `fb-ad-disable` folder (the one containing `manifest.json`).
5. Pin the extension (puzzle-piece icon → pin) so its icon is visible.
6. Open [facebook.com](https://www.facebook.com) and make sure you are logged in.
7. Click the **FB Ad Disable** toolbar icon. The menu appears at the top right of the page.
8. Choose your tasks and privacy level (see below), tick **Dry run** the first time, and press **Start**.
9. Wait for the report. The tab moves between pages by itself; a full run takes a few minutes, longer if you have many advertisers.

The extension only runs on Facebook pages and does nothing until you click its icon. Remove it or switch it off in `chrome://extensions` when you are done.

### Option 2: Userscript (Tampermonkey or Violentmonkey)

1. Install [Tampermonkey](https://www.tampermonkey.net/) in Chrome.
2. Open [`fb-ad-disable.user.js` from the latest release](https://github.com/privaterra/fb-ad-disable/releases/latest/download/fb-ad-disable.user.js) and confirm when Tampermonkey offers to install it. (Or: Tampermonkey icon → **Create a new script**, delete the template, paste the whole content of `fb-ad-disable.js`, and save.) It does not update by itself: install the newer file from a later release when you want it.
3. Open [facebook.com](https://www.facebook.com), logged in.
4. Tampermonkey icon → **Open FB Ad Disable**.
5. Choose your options and press **Start**, as above.

### Option 3: Paste into the DevTools console (nothing to install)

1. Open [facebook.com](https://www.facebook.com), logged in.
2. Press `F12` (or `Ctrl+Shift+J`, on a Mac `Cmd+Option+J`) and select the **Console** tab.
3. Chrome blocks pasting into the console the first time: type `allow pasting` and press Enter. Facebook also prints a warning there about pasting code you do not understand. That warning is sound advice in general; read `fb-ad-disable.js` before you paste it.
4. Paste the whole content of `fb-ad-disable.js` and press Enter. The menu appears.
5. Choose your options and press **Start**.
6. **When the page reloads, the menu disappears**, because a pasted script cannot survive a page load. Press `↑` then Enter in the console (or paste again) and the run continues from where it stopped. When the run has just moved between Facebook's two sites, the menu asks first: click **Resume it**. Repeat until the report appears.

To avoid re-pasting, save the script once under **Sources → Snippets → New snippet** and run it with `Ctrl+Enter`.

Console mode is fine for a single task such as *Disable list-based advertisers*, which stays on one page. For a full run, use the extension.

### The menu

| Section | What to choose |
| --- | --- |
| **Advertisers and ad data** | Tick the tasks to run (table below). |
| **Privacy settings level** | Default, Moderate or Max (table below). |
| **Dry run** | Report what would change without changing anything. |
| **Remember processed advertisers and ad topics** (on) | Keep the database: every advertiser and ad topic handled, what Facebook says about it and what happened. |
| **Skip remembered advertisers and ad topics** (on) | Leave alone the advertisers and ad topics the database has as done, and only open new ones. The menu shows how many are remembered, with **Forget them** to clear the database. |
| **Save advertiser details** (off) | Keep everything Facebook shows about each advertiser and add CSV export to the report. The advertiser table itself is always shown. |
| **Keep the full log** (on) | Keep every log line of the run instead of the last 300. **Copy log** and **Save log** are always available, whatever this is set to. |
| **Speed** | Pause between clicks. Use *Slow* if steps fail on a slow connection. |
| **Saved data** | **Export to file** and **Import from file**: your settings, the advertiser database and the run history as one file. See below. |

### Last run and rate limiting

The top of the menu says when the script last ran in this browser. Under each section it says when that section last ran and how it went, for example "Last run Nov 16, 10:23 PM (2 h ago): Changed: 4 advertisers hidden, 1 already hidden".

Facebook limits how fast its pages can be opened. When it has had enough it answers with "Something went wrong. Please try again later." or "This page isn't available right now" instead of the page, sometimes for hours. The script cannot tell that apart from a fault on Facebook's side, so it reports it as a possibility:

- The three tasks that open one page per advertiser or topic (**Disable list-based advertisers**, **Hide advertisers you have seen**, **Ad topics**) say so in the menu, because they are the ones that can trigger it.
- A section that met one of those error pages on its last run shows a red warning in the menu with how long ago it was. Leave it a few hours before running that section again; the other sections are not affected.
- The log and the report say "This can be Facebook rate limiting…" on the step where it happened.

This history is kept in this browser only, next to the remembered advertisers.

### While it runs

<img src="docs/progress.png" alt="Progress bars and time left during a run" width="372">

- The **top bar** is overall progress: the step number, the percentage done and the estimated time left.
- A **second bar** appears while advertisers are being processed. The script first opens the whole advertiser list to count it, then fills the bar as it works through them. When the advertisers are done the bar disappears.
- The advertiser bar comes straight back after a page load in the middle of an advertiser step, with the count so far.
- The **Ad topics** step uses the same second bar, labelled "Topics", and the same live table.
- An **advertiser table** fills in under the bars, one row per advertiser as it is handled: its name, what Facebook says about it (category and followers, or how many list uses were still allowed), and the result: ✅ disabled or ads hidden, ☑️ no change needed or already hidden, ⏭ skipped because remembered, 👁 what a dry run would do, ⚠️ failed. "remembered" marks an advertiser that was added to the remembered list. Hover over a row for the rest of its details.
- The **log** gets one line per advertiser in the same order, for example `[12/215] Acme · Retail company · 1,234 followers · http://acme.example/ → ads hidden`.
- **Time left** is estimated from how fast the run is actually going: the average time per step so far, and the average time per advertiser. It is rough at the start and improves as the run proceeds. Until an advertiser list has been counted, the estimate says "plus advertisers not counted yet".
- **Stop** ends the run after the current click. If a run is interrupted, opening the menu again offers **Resume it**.

### The report

Each step ends in one of these states:

| | Meaning |
| --- | --- |
| ✅ Changed | The script clicked the control. Spot-check a few of these. |
| ☑️ Already set | The setting already had the wanted value. |
| 👁 Dry run | What would be changed. |
| ⚠️ Needs manual check | The script could not do it. Use the **Open page** link and set the value shown. |
| ℹ️ Nothing to do | The page has nothing for this step: no AI switches, or a setting Facebook no longer offers on your account. |

When a step fails, the report keeps **What the page showed**: the text and controls that were on screen at that moment, with email addresses and long numbers removed. That is what makes a wrong label fixable, so include it when you report a problem (**Copy report** contains it). It is your own settings page, so read it before sharing.

**Copy report** puts the report on the clipboard. If something fails on your account, the report plus the log are what is needed to fix the labels.

<img src="docs/report.png" alt="Report with the advertiser details table" width="372">

### The advertiser database

With **Remember processed advertisers and ad topics** on, every advertiser the script handles goes into a database kept in this browser: its name, what Facebook says about it (category, description, followers, website, list uses), what happened, and when.

An advertiser counts as **done** once the page itself confirms it: for a list-based advertiser, an "Allow" button is shown and no "Don't allow" button is left; for an advertiser you saw ads from, its ads are hidden. With **Skip remembered advertisers and ad topics** on, later runs use that:

- a list-based advertiser that is done is not opened again, which makes repeat runs much shorter;
- an advertiser whose ads are hidden is not opened again just to read its details: they come from the database.

Fewer pages opened also means less chance of running into Facebook's rate limit.

- An advertiser the script could not confirm (a failure, or no list-use buttons found) is in the database but not marked done, so it is checked again next time.
- A dry run does not add to the database.
- Untick **Skip remembered advertisers and ad topics** to re-check everyone, or use **Forget them** in the menu to clear the database.
- The database never leaves this browser unless you export it. In console mode it is kept in the site's local storage, separately for `www.facebook.com` and `accountscenter.facebook.com`.

### Saving your data to a file, and importing it

Everything the script keeps lives in the browser: in the extension's storage, the userscript manager's, or the site's. It is lost when that storage is: a new browser or profile, a reinstall, or loading the extension from a different folder (Chrome treats that as a new extension). A file gets around that.

- **When a run finishes**, the report asks: *Save your data to a file?* **Save to file** downloads `fb-ad-disable-backup-<date>.json`. It is not asked after a dry run, which changed nothing.
- **At the start**, when nothing is saved in this browser, the top of the menu says so and offers **Import from file**.
- **At any time**, the **Saved data** section of the menu has **Export to file** and **Import from file**.

The file holds three things: your settings (the menu's choices), the advertiser database, and the run history (when each section last ran and how it went). It is plain JSON that you can read. It holds no passwords and nothing about your Facebook account beyond the advertisers Facebook listed for you.

Importing **merges**: for an advertiser or a section that both the file and the browser have, the more recent entry stays, and importing the same file twice adds nothing. The settings in the file replace the menu's. The menu then says what was imported, for example "Imported my-backup.json: settings, 215 advertisers (198 new here), run history."

A file to import is treated as untrusted: only the fields the script knows are read, text is capped in length, and anything else is dropped.

### Ad topics

The **Ad topics: See less** task works through the topic list the way the advertiser tasks work through theirs:

- **Counted first.** The list is loaded to its end, then a second bar shows "Topics: 12 of 530".
- **One line and one row per topic.** The log says which topic was handled and what happened ("set to “See less”", "already “See less”", "failed" with the reason). The same rows fill the table during the run.
- **Remembered.** With **Remember processed advertisers and ad topics** on, a topic that is done goes into the database. With **Skip remembered advertisers and ad topics** on, later runs do not open it again; the log says how many were skipped.
- **In the report.** The report has an **Ad topics** table, with **Export topics CSV** and **Copy topics CSV**. The file is separate from the advertiser file and has these columns: `name`, `result`, `action`, `remembered`, `error`, `processed_at`, `dry_run`.
- **In the backup file.** Remembered topics are saved and imported with the advertisers.

A list of several hundred topics takes a while: each topic is a page to open, a choice and a way back. If Facebook stops showing the rest of the list the step says how many are left; the ones done are remembered, so the next run carries on from there.

### Advertiser details (CSV)

The report always shows the advertiser table. With **Save advertiser details** on, it also has **Export CSV** (saves a file) and **Copy CSV**, the full text of each advertiser's page is kept, and advertisers whose ads are already hidden are opened too so their details can be read. The file has one row per advertiser and these columns:

| Column | Content |
| --- | --- |
| `task` | `list-based` or `seen` |
| `name` | Advertiser name as shown in the list |
| `category`, `about` | What the advertiser's panel says it is, for example "Food & beverage company", and its description |
| `followers`, `website` | As shown in the advertiser's panel |
| `remembered` | `yes` when the advertiser is on the remembered list |
| `advertiser_id` | The id in the advertiser's link, when there is one |
| `result` | `disabled`, `no change needed`, `ads hidden`, `failed`, `skipped (remembered…)`, or what a dry run would do |
| `action` | What was clicked |
| `list_uses` | Each list use and its state before the change, e.g. `Showing ads to you using a list: allowed` |
| `link` | The advertiser's entry in ad preferences |
| `facebook_page` | A link found in the advertiser's panel, when there is one |
| `list_text` | Full text of the advertiser's row in the list |
| `detail_text` | Text of the advertiser's panel (why you are in their audience), up to 1,000 characters |
| `error` | Why it failed, if it did |
| `processed_at` | Time, ISO 8601 |
| `dry_run` | `yes` or `no` |

The details are whatever Facebook's page shows for that advertiser; the script cannot see more than you can.

### Saving the log

**Copy log** and **Save log** are always there, during the run and in the report. The saved text file contains the options used, the report and the log lines with their times. With **Keep the full log** on (the default) that is every line of the run; with it off, the last 300.

The log holds what your own Facebook pages showed: advertiser names, and, when a setting is changed or fails, the text of its pop-up. That text can include your name and the names of your accounts. Email addresses and long numbers are removed, names are not, so read a log before you post it anywhere public.

## What each task does

| Task | Where | What happens |
| --- | --- | --- |
| **Disable list-based advertisers** | Accounts Center → Ad preferences → Manage info → Audience-based advertising | For every advertiser: open it → *They uploaded or used a list to reach you* → **Don't allow**, for both showing you ads and excluding you from ads. This is the original script this project grew from. See the note below. If Facebook stops showing the rest of the list part-way, the step reports how many advertisers were not reached and asks for another run; the ones done are remembered. |
| **Hide advertisers you have seen** | Ad preferences → Advertisers you saw ads from | Opens each advertiser in the list and clicks **Hide ads**. Advertisers the list marks "You hid their ads" are counted as already hidden and left alone. The list loads as it is scrolled, so the script first scrolls it to the end to count it, and scrolls again whenever Facebook redraws it after a hide. Facebook draws an opened advertiser over the list, in the same pop-up, and its page has list-like lines of its own (**Facebook Page**, **Website**, the line with **Unhide**). The script only takes a row for an advertiser when it is among the list's rows that are actually in front, and on an advertiser's page it clicks **Hide ads** and nothing else. A hide counts once the page shows it. If entries are still out of reach at the end the report says how many. |
| **Restrict ad data settings** | Ad preferences → Manage info | *Activity from other businesses* (formerly "Activity information from ad partners") → not using this information · *Categories used to reach you* → employer, job title, education and relationship status set to not used, other categories removed · *Ads in other apps* (under "Ads shown outside of Meta") → not showing · *Ads about Meta* → not using your activity · *Social interactions* → Only me, for each Facebook account in its "Select an account" pop-up; accounts of other products listed there (Instagram) are read and reported, not changed. A row that already says so ("Not using this information") is left untouched. |
| **Clear off-Meta activity history** | Accounts Center → Your information and permissions → Your activity off Meta technologies | **Clear previous activity**. See the note below. |
| **Disconnect future off-Meta activity** (off by default; Max ticks it) | same page | *Manage future activity* → **Disconnect future activity**. Side effect: "Log in with Facebook" on other sites and apps stops working. See the note below. |
| **Ad topics: See less** (experimental, off by default) | Ad preferences → Customize ads → Ad topics → See all | Opens each topic and picks **See less**. Handled like the advertiser steps: the list is counted first and a second bar shows how far it is, each topic gets a line in the log and a row in the table, and topics that are done are remembered and skipped by later runs. The pop-up has a "See less" of its own in places (a tab, a filter): a topic only counts as opened once a "See less" turns up that was not there before the topic was clicked. See [Ad topics](#ad-topics). |
| **Turn off AI features** | Settings → Posts, Stories, Reels, Profile and tagging, Followers and public content | Turns off **Allow comment summaries on your posts** and any other switch on those pages whose label mentions AI. Lists the AI settings that have no switch on the web (see below). |

### How advertisers are opened

Facebook answers an advertiser with "This page isn't available right now" unless the page is reached the way it expects, and that has changed over time. The script therefore gets to the list by clicking through Ad preferences, as a person does, and opens advertisers in up to three ways. If the first advertisers all come up as the error page it moves to the next way by itself and says so in the log:

1. a plain click on the entry,
2. the full mouse sequence on the entry,
3. loading each advertiser's own address, one page load per advertiser. This is slower (allow several seconds per advertiser) and needs the extension or the userscript, because a pasted script does not survive page loads.

The result says which way was used and on how many advertisers the "They uploaded or used a list" panel opened, for example "0 disabled, 215 needed no change… Advertisers opened by a click; panel opened on 215". "Needed no change" means the panel showed "Allow" for both uses, which is what it shows once a use is disallowed. Check one advertiser by hand if the numbers surprise you.

If no way works, the step is reported for manual follow-up and the run carries on with the other tasks. In that case open one advertiser by hand: if Facebook shows you the error page too, the fault is on Facebook's side.

The list itself can fail the same way: Facebook sometimes shows "Something went wrong. Please try again later." where the list should be. The report then says so in those words. Nothing in the script can get past that; try the task again later.

### Off-Meta activity is being retired

Meta has been removing "Your activity off Meta technologies" for accounts in the US and other countries since mid-2026 and folding it into **Activity from other businesses**. On such an account the old page says "This content isn't available right now", and **Activity from other businesses** (Accounts Center → Your information and permissions) is a single choice with no history to clear. The two off-Meta tasks handle that: *Clear off-Meta activity history* reports that there is nothing to clear and what the choice is set to, and *Disconnect future off-Meta activity* selects "Don't allow us to use this activity to show you relevant content" and confirms, or reports it as already set. The setting that replaces them is covered by **Restrict ad data settings**. Where the old setting still exists, the tasks work as described.

### AI features: what can and cannot be switched off

Meta gives no single switch for AI, and Meta AI itself (in search and Messenger) cannot be removed. The task does what the web settings allow:

- **Switched off automatically:** *Allow comment summaries on your posts*, and every switch on the scanned settings pages whose label contains "AI", "Meta AI", "comment summaries" or "cloud processing". A switch whose label already describes a restriction (it starts with "Hide", "Block", "Limit" and similar) is left alone. The report names each switch that was turned off.
- **Listed in the report to do by hand**, because there is nothing to click on the web:
  - *Camera roll cloud processing*: Facebook phone app → Settings → **Camera roll sharing suggestions** → both options off.
  - *Use of your information to train Meta AI*: no switch exists. Where your region allows it, the Privacy Center page on generative AI links to the objection form.
  - *Meta AI chats and memory*: delete them in Meta AI's own settings; you can mute the Meta AI chat in Messenger.
- Instagram, WhatsApp and Messenger have their own settings and are outside this script, which only runs on facebook.com.
- If Facebook does not show the comment summaries setting for your account, the report says "Nothing to do".

## Privacy levels

**Default** changes none of these. Moderate and Max set:

| Setting | Moderate | Max |
| --- | --- | --- |
| Who can see your future posts | Friends | Only me |
| Limit who can see past posts | Limited to Friends | Limited to Friends |
| Who can send you friend requests | Friends of friends | Friends of friends |
| Who can see your friends list | Friends | Only me |
| Who can look you up by email address ("People with your email address") | Friends | No one |
| Who can look you up by phone number ("People with your phone number") | Friends | No one |
| Search engines outside Facebook link to your profile | Off | Off |
| Who can follow you | Friends | Friends |
| Who can see the people, Pages and lists you follow | Friends | Only me |
| Who can comment on your public posts | Friends | Friends |
| Who can like or comment on public profile info | Friends | Friends |
| Who can post on your profile | Friends | Only me |
| Who can see what others post on your profile | Friends | Only me |
| Who can see posts you are tagged in on your profile | Friends | Only me |
| Review posts you are tagged in before they appear | On | On |
| Review tags people add to your posts | On | On |
| Allow others to share your posts to their stories | unchanged | Off |

Where Facebook offers nothing stricter than Friends (followers, public comments), Max uses Friends.

A setting is never loosened. If a row already shows something stricter than the level asks for, for example "No one" where Moderate would set "Friends", it is left as it is and the report says so. When a row shows its current value and that is already the wanted one, the row is not opened at all.

## What this cannot do

- **It cannot delete what data brokers hold.** It stops brokers and advertisers from using their lists and your off-Meta activity to target you on Meta, which is the part Facebook lets you control. To have a broker delete your record you must ask the broker (or use an opt-out service or your regional privacy rights, for example GDPR or CCPA requests).
- It does not change the visibility of individual profile fields (birthday, phone, email, hometown, relationship). Review those under your profile → About.
- It does not touch Messenger active status, location settings in the mobile apps, or apps and websites connected to your account (Settings → Apps and websites). Do those by hand.
- New advertisers appear over time. Run the advertiser tasks again every few months.

## How well tested is it

- The engine (menu, page navigation and resume, text matching, dry run, progress bars, remembered advertisers, CSV and log export, reporting, the three run modes) is covered by automated tests that drive the real script in Chromium against mock Facebook pages: `npm test`.
- The advertiser-list flow keeps the click sequence of the original console script this project started from.
- The automated tests cannot log in to Facebook, so they prove nothing about live pages by themselves. The setting names come from Meta's help pages and from the reports of real runs.
- A live run of 1.4.0 on one account (US, English, November 2026) completed every section: 215 list-based advertisers checked, 354 advertisers in the "saw ads from" list handled, the ad data settings, the AI settings and all 17 audience and visibility settings. Not exercised on that account, because the settings were already off: switching off a category field that is in use, removing "other categories", and choosing an option behind the renamed ad rows. Those paths are covered by the mock tests only.
- A live run of 1.6.0 on the same account showed two faults that the mock pages had not caught, both fixed in 1.6.1: the list-based step ended at 159 of 226 advertisers without saying so, and in "Hide advertisers you have seen" lines of an advertiser's own page were clicked as advertisers. The count of 354 above was inflated by that second fault. The mock pop-up is now built the way the live one is, and the released 1.6.0 fails on it the same way.
- A live run of 1.6.1 on that account (November 2026) completed both advertiser steps: 240 of 240 list-based advertisers, of which 16 still allowed list use and were switched to "Don't allow" and shown as such by the page afterwards, and 200 advertisers in the "saw ads from" list, 29 of them hidden, each handled once. In that run Facebook did not cut the list short, so the handling of a list that stops showing its remaining advertisers is covered by the mock tests only. "Social interactions in ads" reported a change on every live run up to 1.6.3. The log of 1.6.3 showed why: the setting is kept per account, its pop-up lists the accounts with their current value, and the script took the value shown on the Facebook account for the option to click. The setting itself was already "Only me". Fixed in 1.6.4, which has not been run on a live account yet.
- A live run of 1.6.2 confirmed that remembered advertisers are skipped: all 240 list-based advertisers, and 197 of the 200 in the "saw ads from" list, in about a minute and a half.
- A live run of 1.6.4 confirmed the per-account handling of "Social interactions in ads" ("Already set", with what each account shows). In the same run the **Ad topics** step did badly: 8 topics in 45 minutes, 520 not reached. The log did not say why, because that step logged nothing per topic. 1.7.0 reworks it (see above) and logs each topic, each reload and what the pop-up showed when it gets stuck; it has only been run against the mock pages, whose topic pop-up is a guess at the real one.
- Facebook serves different layouts to different accounts and changes them often. Expect differences, and start with a dry run.

A safety rule that is tested: an option such as "Friends" or "Only me" is only ever clicked inside a dialog, menu or radio group, never elsewhere on the page.

## Troubleshooting

- **Reporting a problem.** Use **Copy report** and paste it; for more detail use **Save log** and attach the file. Both contain "what the page showed" for each failed step.
- **The page reloaded during a run.** In the extension and userscript the same tab carries on by itself from the step it was on (a step that reloads three times is skipped and reported). In console mode, run the script again.
- **"Had no list controls" or "failed" advertisers.** An advertiser page without "Don't allow" / "Allow" buttons, or one where Facebook shows "This page isn't available right now", is counted separately and never reported as done. The report keeps what the first such page showed.
- **A row has moved.** Facebook moves settings between pages. For rows known to move, the script tries the next settings page by itself (the log says "not on this page, trying the next one").
- **Many steps say "Needs manual check".** Check Facebook is in English (US), try *Slow* speed, and run again; finished steps are quick the second time because they report "Already set".
- **The panel vanished (console mode).** The page reloaded. Run the script again and it resumes.
- **A label changed.** Labels live in three tables at the top of `fb-ad-disable.js`: `L` (shared buttons), `AD_SETTINGS` and `PRIVACY`. Each `row` entry is a list of lower-case text fragments; add the new wording next to the old one.
- **Another language.** Add a key next to `en` in `L`, and add the translated row text to the `row` lists.
- **`web.facebook.com`.** Supported: start the script there.

## Security

[SECURITY.md](SECURITY.md) has the review of November 2026 and what was fixed. In short:

- **CSV export** cannot be used for formula injection: every cell is quoted, and a value that starts with `=`, `+`, `-` or `@` (after any spaces, and in full-width form too) gets an apostrophe in front so a spreadsheet shows it as text.
- **A saved run is checked before it is used**, and in console mode a run found in the tab is offered with **Resume it** instead of being started. Expect that button once each time a pasted run moves between `www.facebook.com` and `accountscenter.facebook.com`.
- **Dependencies** are locked, updated by Dependabot, and checked against published advisories by `npm audit` on every push and weekly. CodeQL scans the code.

## Releases

Each [release](https://github.com/privaterra/fb-ad-disable/releases) has three files:

| File | Use |
| --- | --- |
| `fb-ad-disable-<version>.zip` | The Chrome extension. Unzip, then **Load unpacked** (Option 1). |
| `fb-ad-disable.user.js` | The userscript (Option 2). The same file can be pasted into the console (Option 3). |
| `SHA256SUMS.txt` | Checksums of the two files above. |

To check a download, put it next to `SHA256SUMS.txt` and run:

```bash
sha256sum -c SHA256SUMS.txt
```

A release is built from a tagged commit by the Release workflow, after the tests and `npm audit` pass. Nothing is added to the files beyond what is in this repository.

### Branches

| Branch | Holds |
| --- | --- |
| `main` | The released code. What you get when you clone the repository, and the only branch releases are published from. |
| `dev` | The next version, while it is being put together. It can be ahead of the latest release and is not guaranteed to work. |

Changes go to `dev`, directly or through a pull request. CI, `npm audit` and CodeQL run on every push to either branch, and Dependabot proposes its updates against `dev`. To try the next version before it is released, clone `dev` and load it unpacked.

### Publishing a release

1. On `dev`, set the new version in `package.json`, `package-lock.json`, `manifest.json` and the two places in `fb-ad-disable.js`.
2. In `CHANGELOG.md`, turn the **Unreleased** section into the section for that version.
3. Open a pull request from `dev` into `main` and merge it once CI passes.
4. Run **Release** from the Actions tab, on `main`.

The workflow checks that the version matches everywhere, refuses a version that is already released, refuses to publish from any branch but `main`, and creates the tag and the release.

## Development

```bash
npm install
```

```bash
npm test
```

```bash
npm run build
```

`npm run build` writes the release files to `dist/`.

| File | Purpose |
| --- | --- |
| `fb-ad-disable.js` | The script: userscript header, settings tables, engine, panel. |
| `manifest.json`, `background.js` | Chrome extension wrapper (toolbar icon opens the menu). |
| `test/mock/` | Mock Facebook pages. |
| `LICENSE` | MIT licence. |
| `test/run.test.js` | End-to-end tests (Playwright). |
| `package-lock.json` | The exact library versions the tests run with. |
| `scripts/release.js` | Builds the release files and checks the version is the same everywhere. |
| `CHANGELOG.md` | What changed in each version; a release's notes are its section. |
| `.github/` | CI (tests, `npm audit`), CodeQL and Dependabot. |
| `SECURITY.md` | Security review and how the project is kept current. |

## Disclaimer

This is an unofficial tool, not affiliated with or endorsed by Meta. It automates your own account's settings pages; use it at your own discretion and check the result.

## License

[MIT](LICENSE) © 2026 Privaterra
