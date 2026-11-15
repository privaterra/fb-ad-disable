// End-to-end tests against mock Facebook pages (test/mock). They check the
// script's engine: menu, navigation and resume, text matching, safety scoping,
// dry run and reporting. They cannot prove the labels match live Facebook.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');
const { pages } = require('./mock/pages');

const ROOT = path.join(__dirname, '..');
const SCRIPT = fs.readFileSync(path.join(ROOT, 'fb-ad-disable.js'), 'utf8');
const LIB = fs.readFileSync(path.join(__dirname, 'mock', 'lib.js'), 'utf8');
const OFF_META = 'https://accountscenter.facebook.com/info_and_permissions/off_facebook_activity/';

// Serves the mock pages on the real Facebook hostnames. `inject` adds the script
// to every page, the way a userscript manager would.
async function mockFacebook(context, { inject = false } = {}) {
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
    // Facebook redirects this address to Accounts Center.
    const redirect = host === 'www' && p === '/off_facebook_activity';
    const page = redirect ? `() => location.replace(${JSON.stringify(OFF_META)})` : pages[`${host} ${p}`];
    return route.fulfill({
      contentType: 'text/html; charset=utf-8',
      body: `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>mock</title></head><body><div id="main"></div>
        <script src="/__mock.js"></script><script>(${page ? page.toString() : '() => {}'})()</script>
        ${inject && !redirect ? '<script src="/__fbad.js"></script>' : ''}</body></html>`,
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

async function configureAndStart(page, { level = 'default', tasks, dryRun = false } = {}) {
  const p = panel(page);
  await p.locator('button[name="start"]').waitFor();
  if (tasks) {
    for (const box of await p.locator('input[name="task"]').all()) {
      await box.setChecked(tasks.includes(await box.getAttribute('value')));
    }
  }
  await p.locator(`input[name="level"][value="${level}"]`).check();
  if (dryRun) await p.locator('input[name="dry"]').check();
  // Test-only speed: far faster than the options offered in the menu.
  await p.locator('select[name="speed"]').evaluate((sel) => { sel.add(new Option('Test', '20')); sel.value = '20'; });
  await p.locator('button[name="start"]').click();
}

async function report(page) {
  await panel(page).locator('#summary').waitFor({ timeout: 150000 });
  const rows = await panel(page).locator('li').evaluateAll((els) => els.map((e) => [e.dataset.id, e.dataset.status, e.textContent]));
  return Object.fromEntries(rows.map(([id, status, text]) => [id, { status, text }]));
}

const sets = (events) => Object.fromEntries(events.filter((e) => e.type === 'set').map((e) => [e.id, e.value]));

let browser;
before(async () => { browser = await chromium.launch(); });
after(async () => { await browser.close(); });

test('userscript mode, Max level: every task runs across both sites', async () => {
  const context = await browser.newContext();
  const events = await mockFacebook(context, { inject: true });
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
  assert.match(r.lists.text, /3 disabled, 2 needed no change, 0 failed \(of 5\)/);

  assert.deepEqual(events.filter((e) => e.type === 'hide').map((e) => e.name).sort(), ['Acme', 'Globex', 'Hooli', 'Initech', 'Umbrella']);

  assert.deepEqual(events.filter((e) => e.type === 'category').map((e) => `${e.name}:${e.value}`).sort(), ['Education:false', 'Employer:false']);
  assert.equal(events.filter((e) => e.type === 'offclear').length, 1);
  assert.equal(events.filter((e) => e.type === 'offfuture').length, 1);

  assert.deepEqual(sets(events), {
    ad_partners: 'No', ad_outside: false, ad_social: 'Only me',
    future_posts: 'Only me', past_posts: true, friend_requests: 'Friends of friends', friends_list: 'Only me',
    lookup_email: 'Only me', search_engines: false, follow: 'Friends', following: 'Only me',
    public_comments: 'Friends', public_profile_info: 'Friends', post_on_profile: 'Only me', others_posts: 'Only me',
    tagged_posts: 'Only me', review_tagged: true, review_tags: true,
  });
  assert.equal(events.filter((e) => e.type === 'set').length, 18, 'each setting is changed exactly once');
  assert.equal(events.filter((e) => e.type === 'decoy').length, 0, 'the "Friends" link outside the dialog is never clicked');

  assert.equal(r.lookup_phone.status, 'already');
  assert.equal(r.share_to_stories.status, 'manual', 'a setting that is missing from the page is reported, not skipped silently');
  assert.match(r.share_to_stories.text, /Open page/);
  const others = Object.entries(r).filter(([id, v]) => v.status !== 'changed' && !['lookup_phone', 'share_to_stories'].includes(id));
  assert.deepEqual(others, []);
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
  assert.match(r.lists.text, /3 of 5 advertisers would be disabled/);
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

test('Chrome extension: content script loads, toolbar flag opens the menu, a run completes', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fbad-profile-'));
  const context = await chromium.launchPersistentContext(dir, {
    channel: 'chromium',
    args: [`--disable-extensions-except=${ROOT}`, `--load-extension=${ROOT}`],
  });
  try {
    const events = await mockFacebook(context);
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
