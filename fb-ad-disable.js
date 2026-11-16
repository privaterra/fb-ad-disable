// ==UserScript==
// @name         FB Ad Disable & Privacy Hardener
// @namespace    https://github.com/privaterra/fb-ad-disable
// @version      1.1.0
// @description  Opt out of advertiser lists, restrict ad data use and tighten Facebook privacy settings from one menu.
// @license      MIT
// @match        https://www.facebook.com/*
// @match        https://web.facebook.com/*
// @match        https://accountscenter.facebook.com/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_registerMenuCommand
// @noframes
// @run-at       document-idle
// ==/UserScript==

/*
 * fb-ad-disable
 *
 * One file, three ways to run it (see README.md):
 *   - Chrome extension  : load this folder unpacked; click the toolbar icon on Facebook.
 *   - Userscript        : install in Tampermonkey / Violentmonkey; use its menu command.
 *   - DevTools console  : paste into the Console (or a Snippet) on facebook.com.
 *
 * The script only clicks controls in Facebook's own settings pages, as you would by hand.
 * It sends nothing anywhere. Facebook changes its pages often: every step that cannot be
 * completed is listed in the final report with a link and the value to set manually.
 */
(function () {
  'use strict';

  const VERSION = '1.1.0';
  const TAG = '[fb-ad-disable]';
  const KEY = 'fbAdDisableState';
  const MEMORY_KEY = 'fbAdDisableAdvertisers';

  if (window.top !== window) return;
  if (window.__fbAdDisable) { window.__fbAdDisable.open(); return; }
  if (!/(^|\.)facebook\.com$/.test(location.hostname)) {
    alert('fb-ad-disable: open https://www.facebook.com (logged in) and run this script there.');
    return;
  }

  const IS_EXT = typeof chrome !== 'undefined' && !!(chrome.runtime && chrome.runtime.id && chrome.storage);
  const IS_GM = !IS_EXT && typeof GM_getValue === 'function';
  const MODE = IS_EXT ? 'extension' : IS_GM ? 'userscript' : 'console';

  const AC = 'https://accountscenter.facebook.com';
  const WWW = location.hostname === 'web.facebook.com' ? 'https://web.facebook.com' : 'https://www.facebook.com';

  // ---------------------------------------------------------------------------
  // Labels. Matching is case-insensitive on visible text. English is always
  // tried; entries for the page language (document.documentElement.lang) are
  // added to it. Add a language by adding a key next to `en`.
  // ---------------------------------------------------------------------------
  const L = {
    seeMore: { en: ['see more'], pt: ['ver mais'] },
    seeAll: { en: ['see all', 'view all', 'show more'], pt: ['ver tudo'] },
    theyUploaded: { en: ['they uploaded or used a list to reach you'], pt: ['o anunciante carregou'] },
    dontAllow: { en: ["don't allow"], pt: ['não permitir'] },
    allow: { en: ['allow'], pt: ['permitir'] },
    back: { en: ['back'], pt: ['voltar'] },
    close: { en: ['close'], pt: ['fechar'] },
    hideAds: { en: ['hide ads', 'hide ads from this advertiser', 'hide all ads from this advertiser'], pt: ['ocultar anúncios'] },
    confirm: { en: ['save', 'done', 'confirm', 'save changes'], pt: ['salvar', 'concluir', 'confirmar'] },
    on: { en: ['on', 'yes', 'enabled'] },
    off: { en: ['off', 'no', 'disabled'] },
  };
  const LANG = (document.documentElement.lang || 'en').slice(0, 2).toLowerCase();
  const t = (key) => [...L[key].en, ...((LANG !== 'en' && L[key][LANG]) || [])];

  // ---------------------------------------------------------------------------
  // What the script can do
  // ---------------------------------------------------------------------------
  const TASKS = [
    { id: 'lists', on: true, label: 'Disable list-based advertisers',
      hint: 'Advertisers and data brokers that uploaded a contact list containing your details: stop them using it to show you ads or exclude you.' },
    { id: 'seen', on: true, label: 'Hide advertisers you have seen',
      hint: 'Clicks “Hide ads” for every advertiser Facebook lists for you.' },
    { id: 'adsettings', on: true, label: 'Restrict ad data settings',
      hint: 'Activity from ad partners: not used · profile categories: off · ads outside Meta: off · social interactions: Only me.' },
    { id: 'offclear', on: true, label: 'Clear off-Meta activity history',
      hint: 'Disconnects the activity other companies and websites have already sent to Meta about you.' },
    { id: 'offfuture', on: false, label: 'Disconnect future off-Meta activity',
      hint: 'Stops new off-Meta activity being linked to your account. Side effect: “Log in with Facebook” on other sites stops working.' },
    { id: 'topics', on: false, label: 'Ad topics: “See less” (experimental)',
      hint: 'Walks the ad topics list and picks “See less” for each one.' },
  ];

  const LEVELS = [
    { id: 'default', label: 'Default',
      hint: 'Leave audience and visibility settings exactly as they are.' },
    { id: 'moderate', label: 'Moderate',
      hint: 'Friends only: future and past posts, friends list, email/phone lookup, tagging. No search-engine link. Tag review on. Past posts cannot be bulk-undone.' },
    { id: 'max', label: 'Max',
      hint: 'Most restrictive: everything in Moderate, with “Only me” wherever Facebook offers it and sharing of your posts to other people’s stories off.' },
  ];

  const SETTINGS = WWW + '/settings/?tab=';
  const ADS = AC + '/ads/';

  // value: string[] = option to select, boolean = switch position, 'alloff' = turn every switch off.
  const AD_SETTINGS = [
    { id: 'ad_partners', title: 'Activity information from ad partners', url: ADS, tab: ['manage info'],
      row: ['activity information from ad partners'], steps: [['review setting', 'review settings']],
      all: ["no, don't make my ads more relevant"], mode: 'starts', confirm: ['confirm', 'save', 'done'],
      say: '“No, don’t make my ads more relevant by using this information”' },
    { id: 'ad_categories', title: 'Categories used to reach you', url: ADS, tab: ['manage info'],
      row: ['categories used to reach you'], all: 'alloff' },
    { id: 'ad_outside', title: 'Ads shown outside of Meta', url: ADS, tab: ['manage info'],
      row: ['ads shown outside of meta', 'ads shown off of meta', 'ads shown off meta'],
      all: ['not allowed', "don't allow", 'no'], elseToggle: false, say: '“Not allowed”' },
    { id: 'ad_social', title: 'Social interactions in ads', url: ADS, tab: ['manage info'],
      row: ['social interactions'], all: ['only me'] },
  ];

  const FRIENDS = ['friends'], ONLY_ME = ['only me'], FOF = ['friends of friends'];
  const PRIVACY = [
    { id: 'future_posts', title: 'Who can see your future posts', url: SETTINGS + 'posts',
      row: ['who can see your future posts'], moderate: FRIENDS, max: ONLY_ME },
    { id: 'past_posts', title: 'Limit who can see past posts', url: SETTINGS + 'posts',
      custom: 'pastPosts', moderate: true, max: true, say: '“Limit past posts”' },
    { id: 'friend_requests', title: 'Who can send you friend requests', url: SETTINGS + 'how_people_find_and_contact_you',
      row: ['who can send you friend requests'], moderate: FOF, max: FOF },
    { id: 'friends_list', title: 'Who can see your friends list', url: SETTINGS + 'how_people_find_and_contact_you',
      row: ['who can see your friends list'], moderate: FRIENDS, max: ONLY_ME },
    { id: 'lookup_email', title: 'Who can look you up by email address', url: SETTINGS + 'how_people_find_and_contact_you',
      row: ['look you up using the email address'], moderate: FRIENDS, max: ONLY_ME },
    { id: 'lookup_phone', title: 'Who can look you up by phone number', url: SETTINGS + 'how_people_find_and_contact_you',
      row: ['look you up using the phone number'], moderate: FRIENDS, max: ONLY_ME },
    { id: 'search_engines', title: 'Search engines outside Facebook link to your profile', url: SETTINGS + 'how_people_find_and_contact_you',
      row: ['search engines outside of facebook'], moderate: false, max: false },
    { id: 'follow', title: 'Who can follow you', url: SETTINGS + 'followers_and_public_content',
      row: ['who can follow me'], moderate: FRIENDS, max: FRIENDS },
    { id: 'following', title: 'Who can see the people, Pages and lists you follow', url: SETTINGS + 'followers_and_public_content',
      row: ['people, pages and lists you follow'], moderate: FRIENDS, max: ONLY_ME },
    { id: 'public_comments', title: 'Who can comment on your public posts', url: SETTINGS + 'followers_and_public_content',
      row: ['who can comment on your public posts', 'public post comments'], moderate: FRIENDS, max: FRIENDS },
    { id: 'public_profile_info', title: 'Who can like or comment on public profile info', url: SETTINGS + 'followers_and_public_content',
      row: ['public profile info'], moderate: FRIENDS, max: FRIENDS },
    { id: 'post_on_profile', title: 'Who can post on your profile', url: SETTINGS + 'profile_and_tagging',
      row: ['who can post on your profile'], moderate: FRIENDS, max: ONLY_ME },
    { id: 'others_posts', title: 'Who can see what others post on your profile', url: SETTINGS + 'profile_and_tagging',
      row: ['who can see what others post on your profile'], moderate: FRIENDS, max: ONLY_ME },
    { id: 'tagged_posts', title: 'Who can see posts you are tagged in on your profile', url: SETTINGS + 'profile_and_tagging',
      row: ["who can see posts you're tagged in on your profile"], moderate: FRIENDS, max: ONLY_ME },
    { id: 'review_tagged', title: 'Review posts you are tagged in before they appear on your profile', url: SETTINGS + 'profile_and_tagging',
      row: ["review posts you're tagged in before"], moderate: true, max: true },
    { id: 'review_tags', title: 'Review tags people add to your posts', url: SETTINGS + 'profile_and_tagging',
      row: ['review tags people add to your posts'], moderate: true, max: true },
    { id: 'share_to_stories', title: 'Allow others to share your posts to their stories', url: SETTINGS + 'profile_and_tagging',
      row: ['allow others to share your posts to their stor', 'allow others to share your public stor'], max: false },
  ];

  // ---------------------------------------------------------------------------
  // State (survives page loads) and storage
  // ---------------------------------------------------------------------------
  const parse = (s) => { try { return JSON.parse(s); } catch (e) { return null; } };

  // Storage that outlives a run and a browser restart.
  const durable = IS_EXT ? {
    get: async (k) => (await chrome.storage.local.get(k))[k] || null,
    set: (k, v) => chrome.storage.local.set({ [k]: v }),
  } : IS_GM ? {
    get: async (k) => { const s = await GM_getValue(k, ''); return s ? parse(s) : null; },
    set: async (k, v) => { await GM_setValue(k, JSON.stringify(v)); },
  } : { // console: localStorage, which is separate for www and accountscenter
    get: async (k) => { try { return parse(localStorage.getItem(k)); } catch (e) { return null; } },
    set: async (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage blocked */ } },
  };

  // The run in progress.
  const store = IS_EXT || IS_GM ? { get: () => durable.get(KEY), set: (v) => durable.set(KEY, v) } : {
    // Console: sessionStorage is per origin, window.name carries the state across
    // the www <-> accountscenter hop. The most recently written copy wins.
    get: async () => {
      let a = null, b = null;
      try { a = parse(sessionStorage.getItem(KEY)); } catch (e) { /* storage blocked */ }
      if ((window.name || '').startsWith(KEY + ':')) b = parse(window.name.slice(KEY.length + 1));
      if (a && b) return (a.savedAt || 0) >= (b.savedAt || 0) ? a : b;
      return a || b;
    },
    set: async (v) => {
      const s = JSON.stringify(v);
      try { sessionStorage.setItem(KEY, s); } catch (e) { /* storage blocked */ }
      try { window.name = KEY + ':' + s; } catch (e) { /* ignore */ }
    },
  };

  // List-based advertisers confirmed disabled in earlier runs: { key: { name, result, at } }.
  const memory = {
    load: async () => (await durable.get(MEMORY_KEY)) || {},
    save: (m) => durable.set(MEMORY_KEY, m),
  };

  let state = null;
  let units = [];
  let stopRequested = false;
  let busy = false;

  const save = async () => { state.savedAt = Date.now(); await store.set(state); };

  class Abort extends Error {}
  class DryRun extends Error {}
  class Renav extends Error {}

  // ---------------------------------------------------------------------------
  // DOM helpers
  // ---------------------------------------------------------------------------
  const norm = (s) => (s || '').replace(/[‘’ʼ]/g, "'").replace(/\s+/g, ' ').trim().toLowerCase();
  const visible = (el) => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
  const ownText = (el) => {
    let s = '';
    for (const n of el.childNodes) if (n.nodeType === 3) s += n.nodeValue;
    return norm(s);
  };
  const hit = (text, needles, mode) => !!text && needles.some((n) =>
    mode === 'exact' ? text === n : mode === 'starts' ? text.startsWith(n) : text.includes(n));

  const dialogs = () => [...document.querySelectorAll('[role="dialog"]')].filter(visible);
  const topLayer = () => { const d = dialogs(); return d[d.length - 1] || null; };

  function searchText(root, needles, mode) {
    const out = [];
    const seen = new Set();
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const el = n.parentElement;
      if (!el || seen.has(el) || /^(SCRIPT|STYLE|NOSCRIPT)$/.test(el.tagName)) continue;
      seen.add(el);
      if (hit(ownText(el), needles, mode) && visible(el)) out.push(el);
    }
    if (!out.length) {
      for (const el of root.querySelectorAll('[aria-label]')) {
        if (hit(norm(el.getAttribute('aria-label')), needles, mode) && visible(el)) out.push(el);
      }
    }
    return out;
  }

  // Elements whose own visible text (or aria-label) matches. The topmost dialog is
  // searched first; the rest of the page only if the dialog has no match.
  function findText(needles, { root, mode = 'exact' } = {}) {
    if (root) return searchText(root, needles, mode);
    const layer = topLayer();
    const found = layer ? searchText(layer, needles, mode) : [];
    return found.length ? found : searchText(document.body, needles, mode);
  }

  const findLabel = (needles, root = document) =>
    [...root.querySelectorAll('[aria-label]')].filter((el) => needles.includes(norm(el.getAttribute('aria-label'))) && visible(el));

  const check = () => { if (stopRequested) throw new Abort('Stopped'); };
  const sleep = async (ms) => { check(); await new Promise((r) => setTimeout(r, ms)); check(); };

  function domQuiet(idle = 400, max = 4000) {
    return new Promise((resolve) => {
      let timer = setTimeout(done, idle);
      const cap = setTimeout(done, max);
      const mo = new MutationObserver(() => { clearTimeout(timer); timer = setTimeout(done, idle); });
      mo.observe(document.documentElement, { childList: true, subtree: true });
      function done() { mo.disconnect(); clearTimeout(timer); clearTimeout(cap); resolve(); }
    });
  }

  // Pause after an action: a fixed delay (the "speed" option), then until the page stops changing.
  const settle = async () => { await sleep(state.opts.delay); await domQuiet(Math.min(400, Math.max(50, state.opts.delay))); check(); };

  async function waitFor(fn, timeout = 10000, what = 'element') {
    const end = Date.now() + timeout;
    for (;;) {
      const v = fn();
      if (v) return v;
      if (Date.now() > end) throw new Error(`could not find ${what}`);
      await sleep(150);
    }
  }

  function click(el) {
    try { el.scrollIntoView({ block: 'center' }); } catch (e) { /* ignore */ }
    el.click();
  }

  // A click that changes a setting. In dry-run mode nothing is clicked.
  function act(el, what) {
    if (state.opts.dryRun) throw new DryRun(what);
    log('  → ' + what);
    click(el);
  }

  const say = (el) => (el.getAttribute('aria-label') || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 70);

  // Clicks a row and reports whether a new dialog or page opened.
  async function openRow(el) {
    const before = dialogs().length + '|' + location.href;
    click(el);
    await settle();
    return before !== dialogs().length + '|' + location.href;
  }

  const OPTION_SEL = '[role="radio"],[role="menuitemradio"],[role="option"],[role="menuitem"],[role="checkbox"],label';
  const GROUP_SEL = '[role="dialog"],[role="menu"],[role="listbox"],[role="radiogroup"]';
  const SWITCH_SEL = '[role="switch"],[role="checkbox"],input[type="checkbox"]';

  // Options are only ever picked inside a dialog, menu or radio group, so a
  // same-named link elsewhere on the page ("Friends") can never be clicked.
  const findOption = (needles, mode) =>
    findText(needles, { mode }).filter((el) => el.closest(OPTION_SEL) || el.closest(GROUP_SEL));

  function checkedState(el) {
    const holder = el.closest('[role="radio"],[role="menuitemradio"],[role="option"],[role="checkbox"],[role="switch"]');
    if (holder) {
      const v = holder.getAttribute('aria-checked') ?? holder.getAttribute('aria-selected');
      if (v != null) return v === 'true';
    }
    const label = el.closest('label');
    const input = label && label.querySelector('input');
    return input ? input.checked : null;
  }

  async function choose(needles, mode = 'exact', timeout = 8000) {
    const el = await waitFor(() => findOption(needles, mode)[0], timeout, `option “${needles[0]}”`);
    const name = say(el);
    if (checkedState(el) === true) return { status: 'already', detail: name };
    act(el, `select “${name}”`);
    await settle();
    return { status: 'changed', detail: name };
  }

  async function confirmIf(needles = t('confirm')) {
    const layer = topLayer();
    if (!layer) return false;
    const btn = findText(needles, { root: layer }).filter((el) => !el.closest('[aria-disabled="true"],[disabled]')).pop();
    if (!btn) return false;
    act(btn, `confirm with “${say(btn)}”`);
    await settle();
    return true;
  }

  const switchOn = (sw) => (sw.matches('input') ? sw.checked : sw.getAttribute('aria-checked') === 'true');
  const switchesIn = (root) => [...root.querySelectorAll(SWITCH_SEL)].filter(visible);

  // The single switch that belongs to the row containing `el`, if there is one.
  function switchNear(el) {
    for (let p = el, i = 0; p && p !== document.body && i < 5; p = p.parentElement, i++) {
      const found = switchesIn(p);
      if (found.length > 1 || p.textContent.length > 600) return null;
      if (found.length === 1) return found[0];
    }
    return null;
  }

  async function setSwitch(sw, on) {
    const detail = on ? 'On' : 'Off';
    if (switchOn(sw) === on) return { status: 'already', detail };
    act(sw, `turn ${detail.toLowerCase()} “${say(sw) || 'switch'}”`);
    await settle();
    return { status: 'changed', detail };
  }

  async function allSwitchesOff() {
    const root = topLayer() || document.body;
    let n = 0;
    for (let i = 0; i < 40; i++) {
      const sw = switchesIn(root).find(switchOn);
      if (!sw) break;
      act(sw, `turn off “${say(sw) || 'switch'}”`);
      n++;
      await settle();
    }
    return n ? { status: 'changed', detail: `${n} switched off` } : { status: 'already', detail: 'all off' };
  }

  async function goBack(times) {
    for (let i = 0; i < times; i++) {
      const backs = findLabel(t('back'));
      if (!backs.length) break;
      click(backs[backs.length - 1]);
      await settle();
    }
  }

  async function closeLayers() {
    for (let i = 0; i < 3; i++) {
      const layer = topLayer();
      if (!layer) return;
      const btn = findLabel(t('close'), layer).pop() || findLabel(t('back'), layer).pop();
      if (btn) click(btn);
      else layer.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true }));
      await settle();
      if (topLayer() === layer) return;
    }
  }

  // ---------------------------------------------------------------------------
  // Navigation
  // ---------------------------------------------------------------------------
  const sameUrl = (a, b) => a.origin === b.origin &&
    a.pathname.replace(/\/+$/, '') === b.pathname.replace(/\/+$/, '') &&
    [...b.searchParams].every(([k, v]) => a.searchParams.get(k) === v);

  function at(url) {
    const here = new URL(location.href);
    if (sameUrl(here, new URL(url))) return true;
    const alias = state.alias[url]; // where Facebook redirected this URL to last time
    return !!alias && sameUrl(here, new URL(alias));
  }

  async function hardNav(unit) {
    state.navFor = unit.id;
    state.navAt = Date.now();
    await save();
    log(`Opening ${unit.url}`);
    if (MODE === 'console') log('If this panel disappears, run the script again: it continues from here.');
    location.assign(unit.url);
    await new Promise(() => {}); // the page unloads
  }

  async function goto(unit) {
    if (!unit.url) return;
    if (state.navFor === unit.id) { // just arrived for this unit; accept wherever Facebook sent us
      state.navFor = null;
      if (!at(unit.url)) state.alias[unit.url] = location.origin + location.pathname + location.search;
      await settle();
      return;
    }
    if (at(unit.url)) return;
    const want = new URL(unit.url);
    const link = [...document.querySelectorAll('a[href]')].find((a) => {
      try { return sameUrl(new URL(a.href), want) && visible(a); } catch (e) { return false; }
    });
    if (link) { // in-page navigation keeps the script alive
      state.navFor = unit.id;
      state.navAt = Date.now();
      await save();
      click(link);
      await waitFor(() => at(unit.url), 8000).catch(() => null);
      if (at(unit.url)) { state.navFor = null; await settle(); return; }
    }
    await hardNav(unit);
  }

  // ---------------------------------------------------------------------------
  // Advertiser details, CSV, time estimate
  // ---------------------------------------------------------------------------
  const CSV_COLUMNS = ['task', 'name', 'advertiser_id', 'result', 'action', 'list_uses', 'link', 'facebook_page',
    'list_text', 'detail_text', 'error', 'processed_at', 'dry_run'];

  const clip = (s, n) => (s || '').replace(/\s+/g, ' ').trim().slice(0, n);

  // One row of the advertiser details table (only kept when the option is on).
  function record(rec) {
    if (!state.opts.saveInfo) return;
    state.records.push({ ...rec, processed_at: new Date().toISOString(), dry_run: state.opts.dryRun ? 'yes' : 'no' });
  }

  function toCsv(rows) {
    const cell = (v) => {
      let s = v == null ? '' : String(v);
      if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // advertiser text must never run as a spreadsheet formula
      return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    return '\uFEFF' + [CSV_COLUMNS, ...rows.map((r) => CSV_COLUMNS.map((c) => r[c]))]
      .map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
  }

  function advertiserId(href) {
    try {
      const u = new URL(href, location.origin);
      for (const [k, v] of u.searchParams) if (/id/i.test(k) && /^\d+$/.test(v)) return v;
      const m = u.pathname.match(/\d{5,}/);
      return m ? m[0] : '';
    } catch (e) { return ''; }
  }

  // What the open panel says about list use, e.g. "Showing ads to you using a list: allowed | ...".
  function listUses() {
    const allowed = t('dontAllow');
    return findText([...allowed, ...t('allow')]).map((btn) => {
      const label = ownText(btn);
      let p = btn.parentElement;
      for (let i = 0; p && i < 5 && norm(p.textContent) === label; i++) p = p.parentElement;
      const what = p ? clip(p.textContent.replace(btn.textContent, ''), 160) : '';
      return `${what || 'list use'}: ${allowed.includes(label) ? 'allowed' : 'not allowed'}`;
    }).join(' | ');
  }

  // Time per advertiser, per task, measured as the run goes.
  function tick(id, startedAt) {
    const a = state.timing.adv[id] || (state.timing.adv[id] = { ms: 0, n: 0 });
    a.ms += Date.now() - startedAt;
    a.n++;
  }

  // Remaining time from the pace so far: other steps at their average, advertisers at theirs.
  function eta() {
    const tm = state.timing;
    const guess = state.opts.delay * 4 + 2500;
    const perUnit = tm.units ? tm.unitMs / tm.units : guess;
    let ms = 0, unknown = false;
    for (let i = state.idx; i < units.length; i++) {
      const u = units[i];
      if (!u.advertisers) { ms += perUnit; continue; }
      const p = state.adv[u.id], a = tm.adv[u.id];
      if (!p) { unknown = true; continue; } // not counted yet
      ms += Math.max(0, p.total - p.done) * (a && a.n ? a.ms / a.n : guess);
    }
    ui.eta(ms, unknown);
  }

  // ---------------------------------------------------------------------------
  // Tasks
  // ---------------------------------------------------------------------------
  const describe = (v) => (v === 'alloff' ? 'every switch off' : typeof v === 'boolean' ? (v ? 'On' : 'Off')
    : '“' + v[0].charAt(0).toUpperCase() + v[0].slice(1) + '”');

  async function applySetting(s, value) {
    if (s.tab) {
      const tab = findText(s.tab)[0];
      if (tab) { click(tab); await settle(); }
    }
    const row = await waitFor(() => findText(s.row, { mode: 'includes' })[0], 10000, `the “${s.title}” row`);

    if (typeof value === 'boolean') {
      let sw = switchNear(row);
      if (!sw) {
        await openRow(row);
        const layer = topLayer();
        const inLayer = layer ? switchesIn(layer) : [];
        sw = inLayer.length === 1 ? inLayer[0] : switchNear(row);
      }
      if (sw) return setSwitch(sw, value);
      const r = await choose(value ? t('on') : t('off'));
      if (r.status === 'changed') await confirmIf(s.confirm);
      return r;
    }

    const opened = await openRow(row);
    for (const step of s.steps || []) {
      const el = findText(step)[0];
      if (el) { click(el); await settle(); }
    }
    if (value === 'alloff') {
      if (!opened) throw new Error('the setting did not open');
      return allSwitchesOff();
    }
    let r;
    try {
      r = await choose(value, s.mode);
    } catch (e) {
      const layer = topLayer();
      const only = layer ? switchesIn(layer) : [];
      if (e instanceof DryRun || e instanceof Abort || s.elseToggle === undefined || only.length !== 1) throw e;
      r = await setSwitch(only[0], s.elseToggle);
    }
    if (r.status === 'changed') await confirmIf(s.confirm);
    return r;
  }

  // "Limit past posts": a button, then a confirmation with the same label.
  async function pastPosts() {
    const row = await waitFor(() => findText(['limit who can see past posts', "limit the audience for posts you've shared"],
      { mode: 'includes' })[0], 10000, 'the “Limit who can see past posts” row');
    await openRow(row);
    let n = 0;
    for (let pass = 0; pass < 2; pass++) {
      const btn = findText(['limit past posts']).filter((el) => el !== row).pop();
      if (!btn) break;
      act(btn, 'click “Limit past posts”');
      n++;
      await settle();
    }
    if (!n) throw new Error('the “Limit past posts” button was not found');
    return { status: 'changed', detail: 'past posts limited to Friends' };
  }

  // Advertisers that uploaded a list with your details. For each one: open it, open
  // "They uploaded or used a list to reach you", click "Don't allow" for both uses
  // (showing ads and excluding you), go back to the list.
  async function runLists() {
    const base = '/ads/audience_based_advertising';
    const keyOf = (a) => { const u = new URL(a.href, location.origin); return u.pathname + u.search; };
    const anchors = () => [...document.querySelectorAll('a[href*="/ads/audience_based_advertising/"]')]
      .filter((a) => keyOf(a).replace(/\/+$/, '') !== base);
    const o = state.opts;
    const done = new Set(state.listsDone || []);
    const tally = state.listsTally || (state.listsTally = { changed: 0, none: 0, failed: 0, dry: 0, skipped: 0 });
    const prog = state.adv.lists || (state.adv.lists = { done: 0, total: 0, skipped: 0 });
    const known = o.remember || o.skipKnown ? await memory.load() : {};
    const expand = async () => {
      const more = findText(t('seeMore'));
      if (!more.length) return false;
      more.forEach(click);
      await settle();
      return true;
    };
    const sync = () => {
      const keys = new Set([...done, ...anchors().map(keyOf)]);
      prog.total = Math.max(prog.total, keys.size);
      prog.done = done.size;
      prog.skipped = tally.skipped;
      ui.advertisers(prog);
      eta();
    };

    await waitFor(() => anchors().length, 10000).catch(() => null);
    // Count first: open the whole list so the advertiser bar knows its total.
    ui.progress('Counting advertisers…');
    for (let i = 0, stale = 0, n = anchors().length; i < 80 && stale < 2; i++) {
      if (!(await expand())) break;
      const now = anchors().length;
      stale = now > n ? 0 : stale + 1;
      n = now;
    }
    if (o.skipKnown) {
      let skipped = 0;
      for (const a of anchors()) {
        const key = keyOf(a);
        if (done.has(key) || !known[key]) continue;
        done.add(key);
        skipped++;
        record({ task: 'list-based', name: known[key].name || say(a), advertiser_id: advertiserId(a.href), link: a.href,
          result: 'skipped (remembered from an earlier run)', action: 'none' });
      }
      tally.skipped += skipped;
      state.listsDone = [...done];
      if (skipped) log(`  ${skipped} advertisers skipped: remembered from earlier runs`);
    }
    sync();
    log(`  ${prog.total} advertisers found, ${prog.total - prog.done} to process`);
    ui.progress('');

    for (;;) {
      check();
      await expand(); // the list can collapse again after coming back

      const next = anchors().find((a) => !done.has(keyOf(a)));
      if (!next) {
        if (done.size && !anchors().length && !at(this.url)) throw new Renav('the advertiser list is no longer open');
        break;
      }
      const started = Date.now();
      const key = keyOf(next);
      const item = next.closest('[role="listitem"]');
      const name = say(item || next) || key;
      const rec = { task: 'list-based', name, advertiser_id: advertiserId(next.href), link: next.href,
        list_text: clip((item || next).textContent, 300) };
      let depth = 0, confirmed = false;
      try {
        const opener = (item && item.querySelector('a[role="link"]')) || next;
        opener.addEventListener('click', (e) => e.preventDefault(), { once: true }); // open the side panel, not a new page
        click(opener);
        depth++;
        await settle();
        const uploaded = await waitFor(() => findText(t('theyUploaded'), { mode: 'includes' })[0], 8000).catch(() => null);
        if (o.saveInfo) {
          const layer = topLayer();
          rec.detail_text = layer ? clip(layer.innerText, 1000) : '';
          rec.facebook_page = (layer ? [...layer.querySelectorAll('a[href]')].map((a) => a.href) : []).find((x) => !x.includes(base)) || '';
        }
        if (uploaded) { click(uploaded); depth++; await settle(); }
        if (o.saveInfo) rec.list_uses = listUses();

        let clicks = 0, prev = -1;
        for (let pass = 0; pass < 2; pass++) {
          const btns = findText(t('dontAllow'));
          if (!btns.length) break;
          // Normally a clicked button turns into "Allow". If the label stays, take the other one.
          const target = btns.length === prev && btns.length > 1 ? btns[btns.length - 2] : btns[btns.length - 1];
          prev = btns.length;
          act(target, `Don’t allow: ${name}`);
          clicks++;
          await settle();
        }
        // Only what the page itself confirms is remembered: an "Allow" button and no "Don't allow" left.
        confirmed = !findText(t('dontAllow')).length && findText(t('allow')).length > 0;
        if (clicks) {
          tally.changed++;
          rec.result = 'disabled';
          rec.action = `clicked “Don’t allow” ${clicks}×`;
        } else {
          tally.none++;
          rec.result = 'no change needed';
          rec.action = 'none';
          log(`  ${name}: nothing to change`);
        }
      } catch (e) {
        if (e instanceof Abort) throw e;
        rec.action = 'none';
        if (e instanceof DryRun) {
          tally.dry++;
          rec.result = 'would be disabled (dry run)';
          log(`  would disable: ${name}`);
        } else {
          tally.failed++;
          rec.result = 'failed';
          rec.error = e.message;
          log(`  ${name}: ${e.message}`);
        }
      }
      await goBack(depth);
      done.add(key);
      state.listsDone = [...done];
      record(rec);
      if (o.remember && confirmed && !o.dryRun) { // a dry run leaves no trace
        known[key] = { name, result: rec.result, at: Date.now() };
        await memory.save(known);
      }
      tick('lists', started);
      await save();
      sync();
      if (done.size >= 1000) break;
    }

    if (!done.size) throw new Error('no list-based advertisers were found on this page');
    const skipped = tally.skipped ? `, ${tally.skipped} skipped as remembered` : '';
    const detail = o.dryRun
      ? `${tally.dry} of ${done.size} advertisers would be disabled${skipped}`
      : `${tally.changed} disabled, ${tally.none} needed no change, ${tally.failed} failed (of ${done.size})${skipped}`;
    return { status: o.dryRun ? 'dry' : tally.failed && !tally.changed ? 'manual' : tally.changed ? 'changed' : 'already', detail };
  }

  // Walks a list one entry at a time: open it, run `action`, come back.
  async function drillList(doneKey, action) {
    const scope = () => topLayer() || document.body;
    const items = () => [...scope().querySelectorAll('[role="listitem"]')].filter((el) => visible(el) && norm(el.textContent));
    const keyOf = (el) => norm(el.textContent).slice(0, 80);
    const done = new Set(state[doneKey] || []);
    let changed = 0, dry = 0, fails = 0;

    await waitFor(() => items().length, 8000, 'a list on this page');
    while (fails < 3 && done.size < 300) {
      check();
      const el = items().find((x) => !done.has(keyOf(x)));
      if (!el) break;
      const key = keyOf(el);
      try {
        click(el.querySelector('a,[role="button"],[role="link"]') || el);
        await settle();
        const r = await action();
        if (r.status === 'changed') { changed++; await confirmIf(); }
        fails = 0;
      } catch (e) {
        if (e instanceof Abort) throw e;
        if (e instanceof DryRun) { dry++; fails = 0; } else { fails++; log(`  ${key}: ${e.message}`); }
      }
      if (!items().some((x) => keyOf(x) === key)) await goBack(1);
      done.add(key);
      state[doneKey] = [...done];
      await save();
    }
    if (fails >= 3) throw new Error(`stopped after repeated failures (${changed} changed)`);
    if (state.opts.dryRun) return { status: 'dry', detail: `${dry} would be changed` };
    return { status: changed ? 'changed' : 'already', detail: `${changed} changed of ${done.size}` };
  }

  // "Hide ads" for every advertiser Facebook lists.
  async function runSeen() {
    const expand = findText([...t('seeMore'), ...t('seeAll')]);
    if (expand.length) { expand.forEach(click); await settle(); }
    await waitFor(() => findText(t('hideAds')).length, 8000).catch(() => null);

    const prog = state.adv.seen || (state.adv.seen = { done: 0, total: 0, skipped: 0 });
    prog.total = Math.max(prog.total, prog.done + findText(t('hideAds')).length);
    ui.advertisers(prog);
    eta();

    const clicked = new WeakSet();
    let n = 0, dry = 0;
    while (n + dry < 1000) {
      check();
      const btn = findText(t('hideAds')).find((b) => !clicked.has(b));
      if (!btn) break;
      clicked.add(btn);
      const started = Date.now();
      const item = btn.closest('[role="listitem"]');
      const link = item && item.querySelector('a[href]');
      const name = clip(item ? item.textContent.replace(btn.textContent, '') : '', 70) || 'advertiser';
      const rec = { task: 'seen', name, link: link ? link.href : '', advertiser_id: link ? advertiserId(link.href) : '',
        list_text: clip(item ? item.textContent : '', 300), action: 'none' };
      try {
        act(btn, `hide ads from ${name}`);
        n++;
        rec.result = 'ads hidden';
        rec.action = 'clicked “Hide ads”';
        await settle();
      } catch (e) {
        if (!(e instanceof DryRun)) throw e;
        dry++;
        rec.result = 'would be hidden (dry run)';
      }
      record(rec);
      tick('seen', started);
      prog.done++;
      prog.total = Math.max(prog.total, prog.done);
      ui.advertisers(prog);
      eta();
    }
    if (n + dry) return state.opts.dryRun ? { status: 'dry', detail: `${dry} advertisers would be hidden` } : { status: 'changed', detail: `${n} advertisers hidden` };

    // No "Hide ads" buttons in the list itself: open each advertiser and look inside.
    if (!/advertis/i.test(location.pathname)) throw new Error('the advertisers list was not found');
    return drillList('seenDone', async () => {
      const btn = await waitFor(() => findText(t('hideAds'))[0], 4000, '“Hide ads”');
      act(btn, 'hide ads');
      await settle();
      return { status: 'changed' };
    });
  }

  async function runTopics() {
    const row = await waitFor(() => findText(['ad topics'], { mode: 'includes' })[0], 10000, 'the “Ad topics” section');
    await openRow(row);
    const all = findText([...t('seeAll'), 'view and manage topics'])[0];
    if (all) { click(all); await settle(); }
    return drillList('topicsDone', () => choose(['see less'], 'exact', 4000));
  }

  async function runOffClear() {
    const row = await waitFor(() => findText(['clear previous activity', 'clear history'], { mode: 'includes' })[0],
      10000, '“Clear previous activity”');
    if (!(await openRow(row))) throw new Error('the confirmation did not open');
    const btn = findText(['clear previous activity', 'clear history', 'clear']).filter((el) => el !== row).pop();
    if (!btn) throw new Error('the “Clear” button was not found');
    act(btn, 'clear previous off-Meta activity');
    await settle();
    return { status: 'changed', detail: 'previous activity cleared' };
  }

  async function runOffFuture() {
    const row = await waitFor(() => findText(['manage future activity'], { mode: 'includes' })[0], 10000, '“Manage future activity”');
    await openRow(row);
    const again = findText(['manage future activity']).filter((el) => el !== row).pop(); // explainer screen
    if (again) { click(again); await settle(); }
    let r;
    try {
      r = await choose(['disconnect future activity'], 'exact', 6000);
    } catch (e) { // older layout: one switch plus a "Turn off" confirmation
      const layer = topLayer();
      const only = layer ? switchesIn(layer) : [];
      if (e instanceof DryRun || e instanceof Abort || only.length !== 1) throw e;
      r = await setSwitch(only[0], false);
    }
    if (r.status !== 'changed') return r;
    await confirmIf(['continue', 'next']);
    await confirmIf(['disconnect future activity', 'disconnect', 'turn off', 'confirm']);
    return { status: 'changed', detail: 'future activity disconnected' };
  }

  const CUSTOM = { pastPosts };

  function buildUnits(o) {
    const units = [];
    const on = (id) => o.tasks.includes(id);
    const setting = (s, value) => ({
      id: s.id, title: s.title, url: s.url,
      manual: `Set to ${s.say || describe(value)}.`,
      run: () => (s.custom ? CUSTOM[s.custom]() : applySetting(s, value)),
    });
    if (on('lists')) units.push({ id: 'lists', advertisers: true, title: 'Disable list-based advertisers', url: ADS + 'audience_based_advertising/',
      manual: 'Open each advertiser → “They uploaded or used a list to reach you” → choose “Don’t allow” for both options.', run: runLists });
    if (on('seen')) units.push({ id: 'seen', advertisers: true, title: 'Hide advertisers you have seen', url: WWW + '/adpreferences/advertisers',
      manual: 'Click “Hide ads” next to each advertiser.', run: runSeen });
    if (on('adsettings')) for (const s of AD_SETTINGS) units.push(setting(s, s.all));
    if (on('topics')) units.push({ id: 'topics', title: 'Ad topics: See less', url: ADS,
      manual: 'Open “Ad topics”, then choose “See less” for each topic.', run: runTopics });
    if (on('offclear')) units.push({ id: 'offclear', title: 'Clear off-Meta activity history', url: WWW + '/off_facebook_activity/',
      manual: 'Choose “Clear previous activity” and confirm.', run: runOffClear });
    if (on('offfuture')) units.push({ id: 'offfuture', title: 'Disconnect future off-Meta activity', url: WWW + '/off_facebook_activity/',
      manual: 'Choose “Manage future activity” → “Disconnect future activity” and confirm.', run: runOffFuture });
    if (o.level !== 'default') for (const s of PRIVACY) if (s[o.level] !== undefined) units.push(setting(s, s[o.level]));
    return units;
  }

  // ---------------------------------------------------------------------------
  // Runner
  // ---------------------------------------------------------------------------
  function log(msg) {
    console.log(TAG, msg);
    if (!state) return;
    const line = `${new Date().toTimeString().slice(0, 8)} ${msg}`;
    const cap = state.opts.saveLog ? 20000 : 300;
    state.log.push(line);
    if (state.log.length > cap) state.log.splice(0, state.log.length - cap);
    ui.log(line);
  }

  async function runQueue() {
    if (busy) return;
    busy = true;
    stopRequested = false;
    units = buildUnits(state.opts);
    ui.showRun();
    try {
      while (state.idx < units.length) {
        const unit = units[state.idx];
        const arriving = state.navFor === unit.id;
        if (!arriving) state.unitStart = Date.now();
        ui.step(state.idx, units.length, unit.title);
        eta();
        let res;
        try {
          await goto(unit);
          if (!arriving) log(`${state.idx + 1}/${units.length} ${unit.title}`);
          res = await unit.run();
        } catch (e) {
          if (e instanceof Abort) throw e;
          if (e instanceof Renav && (state.renav[unit.id] = (state.renav[unit.id] || 0) + 1) <= 2) await hardNav(unit);
          res = e instanceof DryRun ? { status: 'dry', detail: 'would ' + e.message } : { status: 'manual', detail: e.message };
        }
        log(`  ${STATUS[res.status].text}${res.detail ? ': ' + res.detail : ''}`);
        if (!unit.advertisers) { // advertiser steps are timed per advertiser instead
          state.timing.unitMs += Date.now() - (state.unitStart || Date.now());
          state.timing.units++;
        }
        ui.advertisers(null);
        state.results.push({ id: unit.id, title: unit.title, url: unit.url, manual: unit.manual, status: res.status, detail: res.detail || '' });
        state.idx++;
        state.navFor = null;
        await save();
        await closeLayers().catch((e) => { if (e instanceof Abort) throw e; });
      }
      log('Finished.');
    } catch (e) {
      if (!(e instanceof Abort)) { log('Stopped by an unexpected error: ' + e.message); console.error(TAG, e); } else log('Stopped.');
    }
    state.running = false;
    state.navFor = null;
    busy = false;
    await save();
    ui.showReport();
  }

  async function start(opts) {
    if (document.querySelector('form[action*="login"] input[type="password"]')) {
      alert('fb-ad-disable: log in to Facebook first, then start again.');
      return;
    }
    state = upgrade({ v: 2, running: true, opts, idx: 0, navFor: null, navAt: 0, alias: {}, renav: {}, results: [], log: [] });
    log(`fb-ad-disable ${VERSION} · ${MODE} mode${opts.dryRun ? ' · DRY RUN (nothing will be changed)' : ''}`);
    await save();
    runQueue();
  }

  // Fields added after 1.0.0, so a run saved by an older version can still be resumed.
  function upgrade(st) {
    st.adv = st.adv || {};
    st.timing = st.timing || { unitMs: 0, units: 0, adv: {} };
    st.records = st.records || [];
    return st;
  }

  async function resume() {
    upgrade(state);
    state.running = true;
    state.navAt = 0; // claim the run so no other tab resumes it
    await save();
    runQueue();
  }

  const STATUS = {
    changed: { icon: '✅', text: 'Changed' },
    already: { icon: '☑️', text: 'Already set' },
    dry: { icon: '👁', text: 'Dry run' },
    manual: { icon: '⚠️', text: 'Needs manual check' },
  };

  function reportText() {
    const lines = [`fb-ad-disable ${VERSION} report${state.opts.dryRun ? ' (dry run)' : ''}`, ''];
    for (const r of state.results) {
      lines.push(`${STATUS[r.status].icon} ${r.title}: ${STATUS[r.status].text}${r.detail ? ' (' + r.detail + ')' : ''}`);
      if (r.status === 'manual') lines.push(`     ${r.manual} ${r.url}`);
    }
    return lines.join('\n');
  }

  function logText() {
    return [`fb-ad-disable ${VERSION} log`, `Saved: ${new Date().toISOString()}`, `Mode: ${MODE}`,
      `Options: ${JSON.stringify(state.opts)}`, '', reportText(), '', 'Log', '---', ...state.log].join('\n') + '\n';
  }

  const fileStamp = () => new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');

  // ---------------------------------------------------------------------------
  // Panel UI (shadow DOM, built without innerHTML)
  // ---------------------------------------------------------------------------
  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'class') el.className = v;
      else if (v === true) el.setAttribute(k, '');
      else if (v !== false && v != null) el.setAttribute(k, v);
    }
    for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid);
    return el;
  }

  const CSS = `
    :host { all: initial; }
    .panel { position: fixed; top: 12px; right: 12px; width: 372px; max-height: calc(100vh - 24px); z-index: 2147483647;
      display: flex; flex-direction: column; box-sizing: border-box; border-radius: 12px; overflow: hidden;
      font: 13px/1.45 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      background: #fff; color: #1c1e21; border: 1px solid #d0d4da; box-shadow: 0 8px 30px rgba(0,0,0,.28); }
    header { display: flex; align-items: center; gap: 8px; padding: 10px 12px; background: #14324d; color: #fff; }
    header b { flex: 1; font-size: 14px; }
    header small { opacity: .7; }
    header button { background: none; border: 0; color: #fff; font-size: 18px; line-height: 1; cursor: pointer; padding: 2px 6px; }
    .body { padding: 12px; overflow: auto; }
    h3 { margin: 12px 0 6px; font-size: 11px; letter-spacing: .06em; text-transform: uppercase; color: #5b6570; }
    h3:first-child { margin-top: 0; }
    label.opt { display: grid; grid-template-columns: 20px 1fr; gap: 2px 6px; padding: 5px 0; cursor: pointer; }
    label.opt input { margin: 2px 0 0; }
    label.opt > span { font-weight: 600; }
    label.opt em { grid-column: 2; font-style: normal; color: #5b6570; font-size: 12px; }
    .row { display: flex; align-items: center; gap: 8px; margin-top: 8px; }
    select { font: inherit; padding: 3px 6px; }
    .btns { display: flex; gap: 8px; margin-top: 12px; flex-wrap: wrap; }
    button.b { font: inherit; font-weight: 600; padding: 7px 14px; border-radius: 6px; border: 1px solid #b9c0c8; background: #f1f3f5; color: #1c1e21; cursor: pointer; }
    button.b.primary { background: #14324d; border-color: #14324d; color: #fff; }
    button.b.danger { background: #b3261e; border-color: #b3261e; color: #fff; }
    .note { margin-top: 10px; padding: 8px 10px; border-radius: 6px; background: #fff4d6; color: #5c4300; font-size: 12px; }
    .bar { height: 6px; border-radius: 3px; background: #e3e6ea; overflow: hidden; margin: 8px 0; }
    .bar i { display: block; height: 100%; width: 0; background: #2f7d5b; transition: width .3s; }
    .bar.adv i { background: #2f6ea3; }
    .cap { display: flex; justify-content: space-between; gap: 8px; color: #5b6570; font-size: 12px; }
    [hidden] { display: none !important; }
    .scroll { max-height: 180px; overflow: auto; margin-top: 6px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th, td { text-align: left; padding: 3px 8px 3px 0; border-bottom: 1px solid #e3e6ea; vertical-align: top; }
    button.link { background: none; border: 0; padding: 0; margin-left: 6px; color: #0b5cad; font: inherit; cursor: pointer; text-decoration: underline; }
    .step { font-weight: 600; }
    .sub { color: #5b6570; font-size: 12px; min-height: 1.4em; }
    pre { margin: 8px 0 0; padding: 8px; height: 220px; overflow: auto; border-radius: 6px; background: #f1f3f5; color: #1c1e21;
      font: 11px/1.45 ui-monospace, Menlo, Consolas, monospace; white-space: pre-wrap; word-break: break-word; }
    ul { list-style: none; margin: 0; padding: 0; }
    li { padding: 6px 0; border-bottom: 1px solid #e3e6ea; }
    li:last-child { border-bottom: 0; }
    li div { color: #5b6570; font-size: 12px; }
    a { color: #0b5cad; }
    @media (prefers-color-scheme: dark) {
      .panel { background: #1f2328; color: #e6e8eb; border-color: #3a4048; }
      h3, label.opt em, .sub, li div, .cap { color: #9aa4af; }
      th, td { border-color: #3a4048; }
      button.link { color: #7db8f0; }
      button.b { background: #2c323a; border-color: #454d57; color: #e6e8eb; }
      button.b.primary { background: #2f6ea3; border-color: #2f6ea3; }
      pre { background: #15181c; color: #d5d9de; }
      .bar { background: #3a4048; }
      li { border-color: #3a4048; }
      .note { background: #4a3a10; color: #f3dfa6; }
      a { color: #7db8f0; }
    }`;

  const ui = (() => {
    let host, root, body, logEl, stepEl, subEl, barEl, pctEl, etaEl, advBox, advLabel, advBar, ticker;
    let cur = { i: 0, n: 1 };
    let left = null; // { ms, unknown, at }

    function mount() {
      if (host && host.isConnected) return;
      host = h('div', { id: 'fb-ad-disable-panel' });
      root = host.attachShadow({ mode: 'open' });
      try {
        const sheet = new CSSStyleSheet();
        sheet.replaceSync(CSS);
        root.adoptedStyleSheets = [sheet];
      } catch (e) {
        root.append(h('style', null, CSS));
      }
      body = h('div', { class: 'body' });
      root.append(h('div', { class: 'panel', role: 'region', 'aria-label': 'fb-ad-disable' },
        h('header', null, h('b', null, 'FB Ad Disable'), h('small', null, 'v' + VERSION),
          h('button', { title: 'Close', onclick: close }, '×')),
        body));
      document.documentElement.append(host);
    }

    const fill = (...kids) => {
      clearInterval(ticker);
      body.replaceChildren(...kids.flat().filter((k) => k != null && k !== false));
    };

    function close() {
      if (busy) stopRequested = true;
      clearInterval(ticker);
      if (host) host.remove();
    }

    // Saves text as a file. The link lives in the shadow root so the page never sees the click.
    function download(name, text, type) {
      const url = URL.createObjectURL(new Blob([text], { type }));
      const a = h('a', { href: url, download: name, hidden: true });
      root.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    }

    function copyButton(name, label, text) {
      const b = h('button', { class: 'b', name, onclick: async () => {
        try { await navigator.clipboard.writeText(text()); b.textContent = 'Copied'; } catch (e) { console.log(text()); b.textContent = 'Printed to console'; }
      } }, label);
      return b;
    }

    const logButtons = () => (state.opts.saveLog ? [
      copyButton('copylog', 'Copy log', logText),
      h('button', { class: 'b', name: 'savelog', onclick: () => download(`fb-ad-disable-log-${fileStamp()}.txt`, logText(), 'text/plain') }, 'Save log'),
    ] : []);

    function showMenu() {
      mount();
      const saved = state && state.opts;
      const pref = (key, fallback) => (saved && saved[key] !== undefined ? saved[key] : fallback);
      const option = (name, on, label, ...hint) => h('label', { class: 'opt' },
        h('input', { type: 'checkbox', name, checked: !!on }), h('span', null, label), h('em', null, hint));
      const taskBoxes = TASKS.map((task) => {
        const input = h('input', { type: 'checkbox', name: 'task', value: task.id,
          checked: saved ? saved.tasks.includes(task.id) : task.on });
        return h('label', { class: 'opt' }, input, h('span', null, task.label), h('em', null, task.hint));
      });
      const level = saved ? saved.level : 'default';
      const levelBoxes = LEVELS.map((lv) => h('label', { class: 'opt' },
        h('input', { type: 'radio', name: 'level', value: lv.id, checked: lv.id === level,
          onchange: () => { if (lv.id === 'max') body.querySelector('input[value="offfuture"]').checked = true; } }),
        h('span', null, lv.label), h('em', null, lv.hint)));
      const speed = h('select', { name: 'speed' },
        [['600', 'Fast'], ['1500', 'Normal'], ['3000', 'Slow']].map(([v, name]) =>
          h('option', { value: v, selected: String(saved ? saved.delay : 1500) === v }, name)));

      // How many advertisers earlier runs remembered, with a way to forget them.
      const known = h('span', { id: 'known' });
      const showKnown = async () => {
        const n = Object.keys(await memory.load()).length;
        known.replaceChildren(` ${n} remembered${MODE === 'console' ? ' on this site' : ''}.`,
          n ? h('button', { class: 'link', name: 'forget', type: 'button',
            onclick: async (e) => { e.preventDefault(); await memory.save({}); showKnown(); } }, 'Forget them') : '');
      };
      showKnown();

      const on = (name) => body.querySelector(`input[name="${name}"]`).checked;
      const go = () => {
        const tasks = [...body.querySelectorAll('input[name="task"]:checked')].map((i) => i.value);
        const lv = body.querySelector('input[name="level"]:checked').value;
        if (!tasks.length && lv === 'default') { alert('Select at least one task or a privacy level.'); return; }
        start({ tasks, level: lv, dryRun: on('dry'), delay: Number(speed.value),
          remember: on('remember'), skipKnown: on('skipKnown'), saveInfo: on('saveInfo'), saveLog: on('saveLog') });
      };

      const unfinished = state && state.running && !busy;
      fill(
        unfinished ? h('div', { class: 'note' }, `An unfinished run was found (step ${state.idx + 1}). `,
          h('div', { class: 'btns' }, h('button', { class: 'b primary', name: 'resume', onclick: resume }, 'Resume it'))) : null,
        h('h3', null, 'Advertisers and ad data'), taskBoxes,
        h('h3', null, 'Privacy settings level'), levelBoxes,
        h('h3', null, 'Options'),
        option('dry', pref('dryRun', false), 'Dry run', 'Visit every page and report what would change, without changing anything.'),
        option('remember', pref('remember', true), 'Remember processed advertisers',
          'Keep a list, in this browser only, of the list-based advertisers confirmed as disabled.'),
        option('skipKnown', pref('skipKnown', true), 'Skip remembered advertisers',
          'Only process advertisers that are new since earlier runs.', known),
        option('saveInfo', pref('saveInfo', false), 'Save advertiser details',
          'Build a table with the details of every advertiser processed, to export as CSV at the end.'),
        option('saveLog', pref('saveLog', false), 'Save logs',
          'Keep the full log and add buttons to copy it or save it to a file.'),
        h('div', { class: 'row' }, 'Speed', speed),
        h('div', { class: 'btns' }, h('button', { class: 'b primary', name: 'start', onclick: go }, 'Start')),
        h('div', { class: 'note' }, 'This tab is driven automatically while the run is in progress. Leave it in the foreground and do not click in it.',
          MODE === 'console' ? ' Console mode: when the page reloads and this panel disappears, run the script again to continue.' : ''));
    }

    const duration = (ms) => (ms < 45e3 ? 'under a minute' : ms < 3600e3 ? `about ${Math.round(ms / 60e3)} min`
      : `about ${Math.floor(ms / 3600e3)} h ${Math.round((ms % 3600e3) / 60e3)} min`);

    function paintEta() {
      if (!etaEl || !left) return;
      const ms = Math.max(0, left.ms - (Date.now() - left.at));
      etaEl.textContent = `Time left: ${duration(ms)}${left.unknown ? ', plus advertisers not counted yet' : ''}`;
    }

    // Overall bar: finished steps plus the share of the current advertiser step.
    function paintBar(part = 0) {
      const pct = Math.round(((cur.i + Math.min(1, part)) / cur.n) * 100);
      barEl.style.width = pct + '%';
      pctEl.textContent = pct + '%';
    }

    function showRun() {
      mount();
      stepEl = h('div', { class: 'step', id: 'step' }, 'Starting…');
      barEl = h('i');
      pctEl = h('span', { id: 'pct' });
      etaEl = h('span', { id: 'eta' });
      advLabel = h('span', { id: 'advlabel' });
      advBar = h('i');
      advBox = h('div', { id: 'adv', hidden: true },
        h('div', { class: 'bar adv', role: 'progressbar', 'aria-label': 'Advertisers' }, advBar), h('div', { class: 'cap' }, advLabel));
      subEl = h('div', { class: 'sub' });
      logEl = h('pre', null, state.log.join('\n'));
      fill(stepEl,
        h('div', { class: 'bar', role: 'progressbar', 'aria-label': 'Overall progress' }, barEl),
        h('div', { class: 'cap' }, etaEl, pctEl),
        advBox, subEl, logEl,
        h('div', { class: 'btns' }, h('button', { class: 'b danger', name: 'stop',
          onclick: () => { stopRequested = true; stepEl.textContent = 'Stopping…'; } }, 'Stop'), logButtons()));
      logEl.scrollTop = logEl.scrollHeight;
      ticker = setInterval(paintEta, 1000);
    }

    function showReport() {
      mount();
      const count = (s) => state.results.filter((r) => r.status === s).length;
      const items = state.results.map((r) => h('li', { 'data-id': r.id, 'data-status': r.status },
        `${STATUS[r.status].icon} `, h('b', null, r.title),
        h('div', null, STATUS[r.status].text + (r.detail ? ': ' + r.detail : '')),
        r.status === 'manual' ? h('div', null, r.manual + ' ', h('a', { href: r.url, target: '_blank', rel: 'noopener' }, 'Open page')) : null));
      const rows = state.records || [];
      const details = state.opts.saveInfo ? [
        h('h3', null, `Advertiser details (${rows.length})`),
        h('div', { class: 'scroll' }, h('table', { id: 'advertisers' },
          h('thead', null, h('tr', null, h('th', null, 'Advertiser'), h('th', null, 'Task'), h('th', null, 'Result'))),
          h('tbody', null, rows.map((r) => h('tr', null, h('td', null, r.name), h('td', null, r.task), h('td', null, r.result)))))),
        h('div', { class: 'btns' },
          h('button', { class: 'b', name: 'csv', onclick: () => download(`fb-ad-disable-advertisers-${fileStamp()}.csv`, toCsv(rows), 'text/csv') }, 'Export CSV'),
          copyButton('copycsv', 'Copy CSV', () => toCsv(rows))),
      ] : [];
      fill(
        h('div', { class: 'step', id: 'summary' }, state.opts.dryRun
          ? `Dry run: ${count('dry')} would change, ${count('already')} already set, ${count('manual')} need a manual check`
          : `${count('changed')} changed, ${count('already')} already set, ${count('manual')} need a manual check`),
        h('div', { class: 'sub' }, 'Facebook can ask for extra confirmation or change its pages, so spot-check the changed settings.'),
        h('ul', null, items),
        details,
        h('div', { class: 'btns' }, copyButton('copyreport', 'Copy report', reportText), logButtons(),
          h('button', { class: 'b', name: 'menu', onclick: showMenu }, 'Back to menu'),
          h('button', { class: 'b', onclick: close }, 'Close')));
    }

    return {
      showMenu, showRun, showReport,
      log(line) { if (logEl && logEl.isConnected) { logEl.append('\n' + line); logEl.scrollTop = logEl.scrollHeight; } },
      step(i, n, title) {
        if (!stepEl) return;
        cur = { i, n };
        stepEl.textContent = `Step ${i + 1} of ${n}: ${title}`;
        subEl.textContent = '';
        paintBar();
      },
      // The second bar, shown only while advertisers are being processed. null hides it.
      advertisers(p) {
        if (!advBox) return;
        advBox.hidden = !p;
        if (!p) return;
        const todo = p.total - p.skipped, did = p.done - p.skipped;
        advBar.style.width = (p.total ? Math.round((p.done / p.total) * 100) : 0) + '%';
        advLabel.textContent = `Advertisers: ${did} of ${todo}${p.skipped ? ` · ${p.skipped} skipped (remembered)` : ''}`;
        paintBar(p.total ? p.done / p.total : 0);
      },
      eta(ms, unknown) { left = { ms, unknown, at: Date.now() }; paintEta(); },
      progress(text) { if (subEl) subEl.textContent = text; },
    };
  })();

  // ---------------------------------------------------------------------------
  // Boot
  // ---------------------------------------------------------------------------
  const api = window.__fbAdDisable = {
    version: VERSION,
    async open() {
      if (busy) return;
      state = await store.get();
      ui.showMenu();
    },
  };

  (async function boot() {
    const saved = await store.get();
    // A run that navigated moments ago continues by itself. Anything older waits for "Resume it".
    const fresh = saved && saved.running && saved.navAt && Date.now() - saved.navAt < (MODE === 'console' ? 15 * 60e3 : 2 * 60e3);
    if (fresh) { state = saved; resume(); return; }

    if (MODE === 'console') { api.open(); return; }
    if (MODE === 'userscript') {
      if (typeof GM_registerMenuCommand === 'function') GM_registerMenuCommand('Open FB Ad Disable', api.open);
      return;
    }
    chrome.runtime.onMessage.addListener((m) => { if (m && m.type === 'fb-ad-disable-open') api.open(); });
    const flag = (await chrome.storage.local.get('fbAdDisableOpen')).fbAdDisableOpen;
    if (flag && Date.now() - flag < 60e3) { await chrome.storage.local.remove('fbAdDisableOpen'); api.open(); }
  })().catch((e) => console.error(TAG, e));
})();
