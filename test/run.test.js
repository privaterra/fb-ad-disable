// End-to-end tests against mock Facebook pages (test/mock). They check the
// script's engine: menu, navigation and resume, text matching, safety scoping,
// dry run and reporting. They cannot prove the labels match live Facebook.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');
const { pages, redirects } = require('./mock/pages');

const ROOT = path.join(__dirname, '..');
const SCRIPT = fs.readFileSync(path.join(ROOT, 'fb-ad-disable.js'), 'utf8');
const LIB = fs.readFileSync(path.join(__dirname, 'mock', 'lib.js'), 'utf8');

// Serves the mock pages on the real Facebook hostnames. `inject` adds the script
// to every page, the way a userscript manager would.
async function mockFacebook(context, { inject = false, offMeta = false, listMode = 'ui' } = {}) {
  const events = [];
  await context.exposeFunction('__record', (json) => { events.push(JSON.parse(json)); });
  await context.route('**/*', (route) => route.abort()); // never touch the real internet
  await context.route(/^https:\/\/(www|accountscenter)\.facebook\.com\//, (route) => {
    const url = new URL(route.request().url());
    const host = url.hostname.startsWith('accountscenter') ? 'ac' : 'www';
    const p = url.pathname.replace(/\/+$/, '') || '/';
    const js = (body) => route.fulfill({ contentType: 'text/javascript; charset=utf-8', body });
    if (p === '/__mock.js') return js(LIB);
    if (p === '/__fbad.js') return js(SCRIPT);
    const to = redirects[`${host} ${p}`];
    if (to) { // Facebook redirects on the server, so no script ever runs on this address
      return route.fulfill({ contentType: 'text/html; charset=utf-8', body: `<script>location.replace(${JSON.stringify(to)})</script>` });
    }
    const page = pages[`${host} ${p.replace(/^(\/ads\/audience_based_advertising)\/\d+$/, '$1/:id')}`];
    return route.fulfill({
      contentType: 'text/html; charset=utf-8',
      body: `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>mock</title></head><body><div id="main"></div>
        <script>window.__flags = ${JSON.stringify({ offMeta, listMode })}</script>
        <script src="/__mock.js"></script><script>(${page ? page.toString() : '() => {}'})()</script>
        ${inject ? '<script src="/__fbad.js"></script>' : ''}</body></html>`,
    });
  });
  return events;
}

// Userscript-manager API backed by one store shared across origins and page loads.
async function fakeUserscriptApi(context) {
  const values = new Map();
  await context.exposeFunction('GM_getValue', (k, d) => (values.has(k) ? values.get(k) : d));
  await context.exposeFunction('GM_setValue', (k, v) => { values.set(k, v); });
  await context.exposeFunction('GM_deleteValue', (k) => { values.delete(k); });
  await context.addInitScript(() => { window.GM_registerMenuCommand = (name, fn) => { window.__openMenu = fn; }; });
  return values;
}

const panel = (page) => page.locator('#fb-ad-disable-panel');

async function configureAndStart(page, { level = 'default', tasks, dryRun = false, options = {} } = {}) {
  const p = panel(page);
  await p.locator('button[name="start"]').waitFor();
  if (tasks) {
    for (const box of await p.locator('input[name="task"]').all()) {
      await box.setChecked(tasks.includes(await box.getAttribute('value')));
    }
  }
  await p.locator(`input[name="level"][value="${level}"]`).check();
  if (dryRun) await p.locator('input[name="dry"]').check();
  for (const [name, on] of Object.entries(options)) await p.locator(`input[name="${name}"]`).setChecked(on);
  // Test-only speed: far faster than the options offered in the menu.
  await p.locator('select[name="speed"]').evaluate((sel) => { sel.add(new Option('Test', '20')); sel.value = '20'; });
  await p.locator('button[name="start"]').click();
}

async function report(page) {
  await panel(page).locator('#summary').waitFor({ timeout: 150000 });
  const rows = await panel(page).locator('li').evaluateAll((els) => els.map((e) => [e.dataset.id, e.dataset.status, e.textContent]));
  return Object.fromEntries(rows.map(([id, status, text]) => [id, { status, text }]));
}

// Clicks a button in the panel and returns the text of the file it saves.
async function saved(page, name) {
  const [download] = await Promise.all([page.waitForEvent('download'), panel(page).locator(`button[name="${name}"]`).click()]);
  return { file: download.suggestedFilename(), text: fs.readFileSync(await download.path(), 'utf8') };
}

function parseCsv(text) {
  const rows = [[]];
  let cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') quoted = false; else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { rows[rows.length - 1].push(cell); cell = ''; } else if (c === '\n') { rows[rows.length - 1].push(cell); cell = ''; rows.push([]); } else if (c !== '\r') cell += c;
  }
  rows.pop(); // the file ends with a line break
  const [head, ...body] = rows;
  return body.map((r) => Object.fromEntries(head.map((k, i) => [k, r[i]])));
}

const sets = (events) => Object.fromEntries(events.filter((e) => e.type === 'set').map((e) => [e.id, e.value]));

let browser;
before(async () => { browser = await chromium.launch(); });
after(async () => { await browser.close(); });

test('userscript mode, Max level: every task runs across both sites', async () => {
  const context = await browser.newContext();
  const events = await mockFacebook(context, { inject: true, offMeta: true });
  await fakeUserscriptApi(context);
  const page = await context.newPage();
  await page.goto('https://www.facebook.com/settings/');
  assert.equal(await panel(page).count(), 0, 'the panel stays closed until asked for');
  await page.evaluate(() => window.__openMenu());

  await panel(page).locator('input[name="level"][value="max"]').check();
  assert.ok(await panel(page).locator('input[value="offfuture"]').isChecked(), 'Max ticks "disconnect future activity"');
  await configureAndStart(page, { level: 'max' });
  const r = await report(page);

  // Advertiser lists: both uses disallowed where they were still allowed, nothing else touched.
  const listuse = events.filter((e) => e.type === 'listuse').map((e) => `${e.id}:${e.use}:${e.allow}`).sort();
  assert.deepEqual(listuse, ['1:0:false', '1:1:false', '3:0:false', '3:1:false', '4:1:false']);
  assert.equal(events.filter((e) => e.type === 'navigated').length, 0, 'advertiser links must not navigate');
  assert.equal(r.lists.status, 'changed');
  // One advertiser page has no list controls and one is Facebook's error page: both are said, neither stops the run.
  assert.match(r.lists.text, /3 disabled, 1 needed no change, 1 had no list controls, 1 failed \(of 6\)/);
  assert.match(r.lists.text, /What the page showed/);

  assert.deepEqual(events.filter((e) => e.type === 'hide').map((e) => e.name).sort(), ['Acme', 'Globex', 'Hooli', 'Initech', 'Umbrella']);

  assert.deepEqual(events.filter((e) => e.type === 'category').map((e) => `${e.name}:${e.value}`).sort(), ['Education:false', 'Employer:false']);
  assert.equal(events.filter((e) => e.type === 'offclear').length, 1);
  assert.equal(events.filter((e) => e.type === 'offfuture').length, 1);

  assert.deepEqual(sets(events), {
    ad_partners: 'off', ad_outside: 'off', ad_about_meta: false, ad_social: 'Only me',
    future_posts: 'Only me', past_posts: true, friend_requests: 'Friends of friends', friends_list: 'Only me',
    lookup_email: 'No one', search_engines: false, follow: 'Friends', following: 'Only me',
    public_comments: 'Friends', post_on_profile: 'Only me', others_posts: 'Only me',
    tagged_posts: 'Only me', review_tagged: true, review_tags: true, share_to_stories: false,
    ai_summaries: false, reel_ai: false,
  });
  assert.equal(events.filter((e) => e.type === 'set').length, 21, 'each setting is changed exactly once');
  assert.deepEqual(events.filter((e) => e.type === 'decoy'), [],
    'nothing outside the open pop-up is clicked: not the "Friends" link, the off-screen dialog or another row\'s button');

  // A row Facebook moved to another settings page is found there.
  assert.equal(r.share_to_stories.status, 'changed');
  // AI: the scan turns off the AI switch only, and what has no switch is listed to do by hand.
  assert.match(r.ai_scan_reels.text, /turned off: Allow Meta AI to suggest remixes of your reels$/);
  assert.equal(r.ai_scan_posts.status, 'already');
  for (const id of ['ai_camera_roll', 'ai_training', 'ai_chats']) assert.equal(r[id].status, 'manual');
  assert.match(r.ai_training.text, /Open page/);

  assert.equal(r.lookup_phone.status, 'already');
  assert.equal(r.public_profile_info.status, 'manual', 'a setting that is missing from the page is reported, not skipped silently');
  assert.match(r.public_profile_info.text, /Open page/);
  assert.match(r.public_profile_info.text, /What the page showed.*Who Can Follow Me/, 'the report says what was on the page instead');
  const status = (id) => r[id].status;
  assert.deepEqual(Object.keys(r).filter((id) => status(id) === 'info').sort(), ['ai_scan_followers', 'ai_scan_stories', 'ai_scan_tagging']);
  assert.deepEqual(Object.keys(r).filter((id) => !['changed', 'info'].includes(status(id))).sort(),
    ['ai_camera_roll', 'ai_chats', 'ai_scan_posts', 'ai_training', 'lookup_phone', 'public_profile_info']);
  await context.close();
});

test('dry run changes nothing and reports what it would do', async () => {
  const context = await browser.newContext();
  const events = await mockFacebook(context, { inject: true });
  await fakeUserscriptApi(context);
  const page = await context.newPage();
  await page.goto('https://www.facebook.com/');
  await page.evaluate(() => window.__openMenu());
  await configureAndStart(page, { level: 'moderate', dryRun: true, tasks: ['lists', 'seen', 'adsettings', 'offclear', 'offfuture'] });
  const r = await report(page);

  assert.deepEqual(events, [], 'no setting is touched');
  assert.equal(r.lists.status, 'dry');
  assert.match(r.lists.text, /3 of 6 advertisers would be disabled, 1 had no list controls, 1 failed/);
  // This account no longer has the off-Meta setting: said plainly, not reported as a failure.
  for (const id of ['offclear', 'offfuture']) {
    assert.equal(r[id].status, 'info');
    assert.match(r[id].text, /Facebook does not offer this on your account/);
  }
  assert.equal(r.ad_partners.status, 'dry');
  assert.match(r.seen.text, /5 advertisers would be hidden/);
  assert.equal(r.future_posts.status, 'dry');
  assert.match(r.future_posts.text, /would select “Friends”/);
  assert.equal(r.post_on_profile.status, 'already', 'Moderate keeps a value that is already Friends');
  assert.equal(r.share_to_stories, undefined, 'Moderate does not include the Max-only setting');
  await context.close();
});

test('console mode: re-running the script after each page load resumes the run', async () => {
  const context = await browser.newContext();
  const events = await mockFacebook(context);
  const page = await context.newPage();
  await page.goto('https://www.facebook.com/settings/?tab=posts');
  let loads = 0;
  page.on('load', () => { loads++; page.evaluate(SCRIPT).catch(() => {}); }); // the user pastes the script again
  await page.evaluate(SCRIPT);
  await configureAndStart(page, { level: 'moderate', tasks: ['lists', 'adsettings'] });
  const r = await report(page);

  assert.ok(loads >= 3, 'the run crossed www -> accountscenter -> www');
  assert.equal(r.lists.status, 'changed');
  assert.equal(r.ad_social.status, 'changed');
  assert.equal(sets(events).future_posts, 'Friends');
  assert.equal(sets(events).friends_list, 'Friends');
  assert.equal(sets(events).lookup_phone, 'Friends');
  assert.equal(events.filter((e) => e.type === 'listuse').length, 5);
  assert.equal(events.filter((e) => e.type === 'decoy').length, 0);
  await context.close();
});

test('Stop ends the run and an old unfinished run is offered, not resumed by itself', async () => {
  const context = await browser.newContext();
  const events = await mockFacebook(context, { inject: true });
  const values = await fakeUserscriptApi(context);
  const page = await context.newPage();
  await page.goto('https://accountscenter.facebook.com/ads/audience_based_advertising/');
  await page.evaluate(() => window.__openMenu());
  await configureAndStart(page, { tasks: ['lists', 'seen'] });
  await panel(page).locator('button[name="stop"]').click();
  await panel(page).locator('#summary').waitFor();
  assert.match(await panel(page).locator('li[data-id="lists"]').textContent(), /stopped before this step finished/);
  const count = events.length;
  await page.waitForTimeout(1500);
  assert.equal(events.length, count, 'nothing happens after Stop');
  assert.equal(events.filter((e) => e.type === 'hide').length, 0);

  // Pretend the tab was closed mid-run long ago.
  const state = JSON.parse(values.get('fbAdDisableState'));
  values.set('fbAdDisableState', JSON.stringify({ ...state, running: true, navAt: Date.now() - 3600e3 }));
  await page.goto('https://www.facebook.com/');
  await page.waitForTimeout(500);
  assert.equal(await panel(page).count(), 0);
  await page.evaluate(() => window.__openMenu());
  await panel(page).locator('button[name="resume"]').waitFor();
  await context.close();
});

test('progress bars, advertiser details CSV, saved log and remembered advertisers', async () => {
  const context = await browser.newContext();
  const events = await mockFacebook(context, { inject: true });
  await fakeUserscriptApi(context);
  const page = await context.newPage();
  const p = panel(page);
  const listuse = () => events.filter((e) => e.type === 'listuse').length;
  await page.goto('https://accountscenter.facebook.com/ads/audience_based_advertising/');
  await page.evaluate(() => window.__openMenu());

  // The new options and their defaults.
  await p.locator('button[name="start"]').waitFor();
  for (const [name, on] of [['remember', true], ['skipKnown', true], ['saveInfo', false], ['saveLog', false]]) {
    assert.equal(await p.locator(`input[name="${name}"]`).isChecked(), on, `${name} default`);
  }
  assert.match(await p.locator('#known').textContent(), /0 remembered/);

  // Run 1: two bars and a time estimate while advertisers are processed.
  await configureAndStart(page, { tasks: ['lists', 'seen'], options: { saveInfo: true, saveLog: true } });
  await p.locator('#advlabel', { hasText: /^Advertisers: \d of 6$/ }).waitFor();
  assert.equal(await p.locator('[role="progressbar"]').count(), 2);
  assert.match(await p.locator('#eta').textContent(), /^Time left: (under a minute|about \d+ min)/);
  assert.match(await p.locator('#step').textContent(), /^Step 1 of 2: /);
  await p.locator('button[name="savelog"]').waitFor(); // available during the run too
  let r = await report(page);
  assert.match(r.lists.text, /3 disabled, 1 needed no change, 1 had no list controls, 1 failed \(of 6\)/);
  assert.equal(listuse(), 5);

  // Issue 4: the details table and its CSV.
  assert.equal(await p.locator('#advertisers tbody tr').count(), 11);
  const csv = await saved(page, 'csv');
  assert.match(csv.file, /^fb-ad-disable-advertisers-[\d-]+\.csv$/);
  const rows = parseCsv(csv.text.replace(/^\uFEFF/, ''));
  assert.equal(rows.length, 11);
  const broker = rows.find((x) => x.name === 'Data Broker One');
  assert.equal(broker.task, 'list-based');
  assert.equal(broker.advertiser_id, '1000001');
  assert.equal(broker.result, 'disabled');
  assert.equal(broker.action, 'clicked “Don’t allow” 2×');
  assert.equal(broker.list_uses, 'Showing ads to you using a list: allowed | Excluding you from ads using a list: allowed');
  assert.match(broker.link, /\/ads\/audience_based_advertising\/1000001\//);
  assert.match(broker.detail_text, /You may have interacted with their website/);
  assert.match(broker.processed_at, /^\d{4}-\d\d-\d\dT/);
  assert.equal(broker.dry_run, 'no');
  assert.equal(rows.find((x) => x.name === 'Half Done LLC').list_uses,
    'Showing ads to you using a list: not allowed | Excluding you from ads using a list: allowed');
  assert.equal(rows.find((x) => x.name === 'No List Corp').result, 'no list controls found');
  const brokenRow = rows.find((x) => x.name === 'Broken Page Ltd');
  assert.equal(brokenRow.result, 'failed');
  assert.match(brokenRow.error, /This page isn’t available right now/);
  assert.deepEqual(rows.filter((x) => x.task === 'seen').map((x) => `${x.name}:${x.result}`).sort(),
    ['Acme:ads hidden', 'Globex:ads hidden', 'Hooli:ads hidden', 'Initech:ads hidden', 'Umbrella:ads hidden']);

  // Issue 2: the log as a file.
  const logFile = await saved(page, 'savelog');
  assert.match(logFile.file, /^fb-ad-disable-log-[\d-]+\.txt$/);
  assert.match(logFile.text, /^fb-ad-disable 1\.2\.2 log\n/);
  assert.match(logFile.text, /Options: \{.*"saveLog":true/);
  assert.match(logFile.text, /\d\d:\d\d:\d\d   6 advertisers found, 6 to process/);
  assert.match(logFile.text, /\d\d:\d\d:\d\d Finished\.\n$/);

  // Issue 1: advertisers the page confirmed as disabled are remembered and skipped next time.
  await p.locator('button[name="menu"]').click();
  await p.locator('#known', { hasText: '4 remembered' }).waitFor();
  await configureAndStart(page, { tasks: ['lists'], options: { saveInfo: true, saveLog: false } });
  r = await report(page);
  assert.match(r.lists.text, /0 disabled, 0 needed no change, 1 had no list controls, 1 failed \(of 6\), 4 skipped as remembered/);
  assert.equal(listuse(), 5, 'remembered advertisers are not opened again');
  assert.equal(await p.locator('#advertisers tbody tr', { hasText: 'skipped (remembered' }).count(), 4);
  assert.equal(await p.locator('button[name="savelog"]').count(), 0, 'no log buttons unless the option is on');

  // With "skip" off, every advertiser is processed again.
  await p.locator('button[name="menu"]').click();
  await configureAndStart(page, { tasks: ['lists'], options: { skipKnown: false, saveInfo: false } });
  r = await report(page);
  assert.match(r.lists.text, /3 disabled, 1 needed no change, 1 had no list controls, 1 failed \(of 6\)/);
  assert.equal(listuse(), 10);
  assert.equal(await p.locator('#advertisers').count(), 0, 'no table unless the option is on');

  // The list can be forgotten.
  await p.locator('button[name="menu"]').click();
  await p.locator('button[name="forget"]').click();
  await p.locator('#known', { hasText: '0 remembered' }).waitFor();
  await context.close();
});

test('ad topics: "See all" next to the heading, then "See less" for each topic', async () => {
  const context = await browser.newContext();
  const events = await mockFacebook(context, { inject: true });
  await fakeUserscriptApi(context);
  const page = await context.newPage();
  await page.goto('https://accountscenter.facebook.com/ads/');
  await page.evaluate(() => window.__openMenu());
  await configureAndStart(page, { tasks: ['adsettings', 'topics'] }); // ad settings first, so the other tab is showing
  let r = await report(page);
  assert.equal(r.topics.status, 'changed');
  assert.deepEqual(events.filter((e) => e.type === 'topic').map((e) => `${e.name}:${e.value}`).sort(),
    ['Alcohol:See less', 'Parenting:See less', 'Pets:See less']);
  // The ad rows under their current names; the "Ads shown outside of Meta" heading is not mistaken for a row.
  assert.deepEqual(sets(events), { ad_partners: 'off', ad_outside: 'off', ad_about_meta: false, ad_social: 'Only me' });
  assert.deepEqual(events.filter((e) => e.type === 'decoy'), []);

  // Second run: the rows now say so themselves, and nothing is opened or clicked for them.
  const before = events.length;
  await panel(page).locator('button[name="menu"]').click();
  await configureAndStart(page, { tasks: ['adsettings'] });
  r = await report(page);
  assert.equal(r.ad_partners.status, 'already');
  assert.match(r.ad_partners.text, /not using this information/);
  assert.equal(r.ad_outside.status, 'already');
  assert.equal(r.ad_about_meta.status, 'already');
  assert.deepEqual(events.slice(before).filter((e) => ['ad_partners', 'ad_outside', 'ad_about_meta'].includes(e.id)), []);
  await context.close();
});

test('a page reload in the middle of a run is picked up by the same tab only', async () => {
  const context = await browser.newContext();
  const events = await mockFacebook(context, { inject: true });
  await fakeUserscriptApi(context);
  const page = await context.newPage();
  await page.goto('https://accountscenter.facebook.com/ads/audience_based_advertising/');
  await page.evaluate(() => window.__openMenu());
  await configureAndStart(page, { tasks: ['lists'] });
  await panel(page).locator('#advlabel', { hasText: /^Advertisers: [12] of 6$/ }).waitFor();

  // Another Facebook tab opened meanwhile must not join in.
  const other = await context.newPage();
  await other.goto('https://www.facebook.com/settings/');
  await other.waitForTimeout(400);
  assert.equal(await panel(other).count(), 0);
  await other.close();

  await page.reload(); // Facebook reloads the page under the script
  const r = await report(page);
  assert.equal(r.lists.status, 'changed');
  assert.match(r.lists.text, /1 failed \(of 6\)/);
  assert.match(await panel(page).locator('button[name="menu"]').textContent(), /menu/);
  // Every advertiser was handled. (The one in progress at the reload is done again: the mock forgets its state on reload.)
  assert.deepEqual([...new Set(events.filter((e) => e.type === 'listuse').map((e) => `${e.id}:${e.use}`))].sort(), ['1:0', '1:1', '3:0', '3:1', '4:1']);
  assert.equal(events.filter((e) => e.type === 'decoy').length, 0);
  await context.close();
});

// Facebook answers an advertiser with its error page unless it is reached the way it expects.
// Which way that is cannot be known from here, so each one is tested.
for (const [listMode, said] of [['press', /another way \(press\)/], ['direct', /another way \(direct\)/]]) {
  test(`advertisers that only open by "${listMode}" are still processed`, async () => {
    const context = await browser.newContext();
    const events = await mockFacebook(context, { inject: true, listMode });
    await fakeUserscriptApi(context);
    const page = await context.newPage();
    const logged = [];
    page.on('console', (m) => logged.push(m.text()));
    await page.goto('https://www.facebook.com/settings/');
    await page.evaluate(() => window.__openMenu());
    await configureAndStart(page, { tasks: ['lists'], options: { saveInfo: true } });
    const r = await report(page);
    assert.equal(r.lists.status, 'changed');
    assert.match(r.lists.text, /3 disabled, 1 needed no change, 1 had no list controls, 1 failed \(of 6\)/);
    assert.deepEqual(events.filter((e) => e.type === 'listuse').map((e) => `${e.id}:${e.use}:${e.allow}`).sort(),
      ['1:0:false', '1:1:false', '3:0:false', '3:1:false', '4:1:false']);
    assert.ok(logged.some((line) => said.test(line)), 'the log says it changed the way of opening');
    assert.equal(await panel(page).locator('#advertisers tbody tr').count(), 6, 'each advertiser is booked once');
    assert.deepEqual(events.filter((e) => e.type === 'decoy' || e.type === 'navigated'), []);
    await context.close();
  });
}

test('when Facebook opens no advertiser at all, the run says so and moves on', async () => {
  const context = await browser.newContext();
  const events = await mockFacebook(context, { inject: true, listMode: 'never' });
  await fakeUserscriptApi(context);
  const page = await context.newPage();
  await page.goto('https://www.facebook.com/settings/');
  await page.evaluate(() => window.__openMenu());
  await configureAndStart(page, { tasks: ['lists', 'ai'] });
  const r = await report(page);
  assert.equal(r.lists.status, 'manual');
  assert.match(r.lists.text, /for every advertiser, however it is opened/);
  assert.equal(r.ai_summaries.status, 'changed', 'the next task still runs');
  assert.deepEqual(events.filter((e) => e.type === 'listuse' || e.type === 'decoy'), []);
  await context.close();
});

test('a dry run does not add advertisers to the remembered list', async () => {
  const context = await browser.newContext();
  const events = await mockFacebook(context, { inject: true });
  await fakeUserscriptApi(context);
  const page = await context.newPage();
  await page.goto('https://accountscenter.facebook.com/ads/audience_based_advertising/');
  await page.evaluate(() => window.__openMenu());
  await configureAndStart(page, { tasks: ['lists'], dryRun: true });
  await report(page);
  assert.deepEqual(events, []);
  await panel(page).locator('button[name="menu"]').click();
  await panel(page).locator('#known', { hasText: '0 remembered' }).waitFor();
  await context.close();
});

test('Chrome extension: content script loads, toolbar flag opens the menu, a run completes', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fbad-profile-'));
  const context = await chromium.launchPersistentContext(dir, {
    channel: 'chromium',
    args: [`--disable-extensions-except=${ROOT}`, `--load-extension=${ROOT}`],
  });
  try {
    const events = await mockFacebook(context, { offMeta: true });
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    await worker.evaluate(() => chrome.storage.local.set({ fbAdDisableOpen: Date.now() })); // what the toolbar click does
    const page = await context.newPage();
    await page.goto('https://www.facebook.com/settings/');
    await configureAndStart(page, { tasks: ['adsettings', 'offclear'] });
    const r = await report(page);
    assert.equal(r.ad_partners.status, 'changed');
    assert.equal(r.offclear.status, 'changed');
    assert.equal(sets(events).ad_social, 'Only me');
    assert.equal(events.filter((e) => e.type === 'offclear').length, 1);
  } finally {
    await context.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
