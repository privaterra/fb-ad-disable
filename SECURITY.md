# Security

## What this project runs with

The script runs inside your logged-in Facebook tab, with everything your session can do. Read
`fb-ad-disable.js` before you run it, and only take it from this repository.

By design it:

- makes no network requests of its own and sends nothing anywhere;
- loads no remote code and uses no `eval`;
- builds its panel without `innerHTML`, so page text is only ever shown as text;
- only opens addresses on `facebook.com` (and one link to `meta.ai` in the report);
- as an extension, asks for `storage`, `activeTab` and `scripting`, and runs only on Facebook pages.

It has no runtime dependencies. The only library is Playwright, used by the tests.

## Review of November 2026 (version 1.5.0)

| Finding | Risk | Fix |
| --- | --- | --- |
| **CSV formula injection.** Advertiser names and page text go into the exported CSV. A cell starting with `=`, `+`, `-` or `@` was already neutralised, but not one with spaces in front, a full-width sign, or a `;` or tab that splits a value into a second cell where the list separator is not a comma. | A crafted advertiser name could run as a formula when the file is opened in a spreadsheet. | Every cell is quoted, control characters become spaces, and a cell that starts with a formula sign after any spaces gets an apostrophe in front. Covered by a test with hostile names. |
| **Saved run trusted as written.** A run in progress is saved so it can continue after a page load. Addresses in it were used as links and for navigation without a check. | A forged saved run could put a `javascript:` link in the report. | A saved run is validated before use: known tasks and levels only, addresses must be https on Facebook's sites, advertiser pages must be advertiser pages. Links that fail the check are dropped. |
| **Console mode resumed a run found in `window.name`.** That is how a pasted script carries a run from `www.facebook.com` to `accountscenter.facebook.com`, but any site the tab visited earlier can write `window.name`. | Another site could make the script start working through settings when you next paste it. It could only run this script's own tasks. | A run read from `window.name` is never started by itself. The menu shows it with **Resume it** for you to decide. The extension and the userscript do not use `window.name`. |
| **No lockfile, no advisory checks.** | A vulnerable or changed library version could be picked up unnoticed. | `package-lock.json`, Dependabot, `npm audit` in CI, and CodeQL (see below). |

Not found: HTML or script injection into the panel, remote code loading, selector or regular
expression injection, or use of page-controlled text as a property name.

## Keeping it current

- **Locked versions.** `package-lock.json` pins every library. CI installs exactly those with `npm ci`.
- **Updates.** Dependabot checks npm and the GitHub Actions used here every week and opens a pull request for each update. CI tests it.
- **Advisories.** `npm audit` runs on every push, every pull request, and weekly. It fails the build when a published advisory affects a library in use. The weekly run also tests against the newest release of every library, ahead of the lockfile.
- **Code scanning.** CodeQL analyses the JavaScript on every push and weekly.

Two switches in the repository's settings complete this and cannot be set from the code:
**Dependabot alerts** and **Dependabot security updates**, under Settings → Advanced Security.

To check by hand:

```bash
npm ci
```

```bash
npm audit
```

```bash
npm outdated
```

## Releases

A release is built by the Release workflow from the tagged commit, after `npm audit` and the tests
pass. The files are the repository's own, unmodified, and `SHA256SUMS.txt` lets you check a
download. The userscript does not update itself: a new version only runs when you install it.

## Reporting a problem

Open an issue, or for something that should not be public yet, use **Report a vulnerability**
under the repository's Security tab.
