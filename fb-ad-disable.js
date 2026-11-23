// ==UserScript==
// @name         FB Ad Disable & Privacy Hardener
// @namespace    https://github.com/privaterra/fb-ad-disable
// @version      1.8.0
// @description  Opt out of advertiser lists, restrict ad data use and tighten Facebook privacy settings from one menu.
// @license      MIT
// @homepageURL  https://github.com/privaterra/fb-ad-disable
// @supportURL   https://github.com/privaterra/fb-ad-disable/issues
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

  const VERSION = '1.8.0';
  const TAG = '[fb-ad-disable]';
  const KEY = 'fbAdDisableState';
  const MEMORY_KEY = 'fbAdDisableAdvertisers';
  const HISTORY_KEY = 'fbAdDisableHistory';
  const PREFS_KEY = 'fbAdDisablePrefs';
  const BACKUP_FORMAT = 1;

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
    unavailable: { en: ["this page isn't available right now", "this content isn't available right now", 'something went wrong'] },
    unhide: { en: ['unhide', 'unhide ads', 'show ads'] },
    hidden: { en: ['you hid their ads', 'you chose to hide all ads'] },
    selectAccount: { en: ['select an account', 'choose an account', 'select account'] },
    seeLess: { en: ['see less', 'see less of this topic', 'see fewer'] },
    on: { en: ['on', 'yes', 'enabled'] },
    off: { en: ['off', 'no', 'disabled'] },
  };
  const LANG = (document.documentElement.lang || 'en').slice(0, 2).toLowerCase();
  const t = (key) => [...L[key].en, ...((LANG !== 'en' && L[key][LANG]) || [])];

  // ---------------------------------------------------------------------------
  // What the script can do
  // ---------------------------------------------------------------------------
  const TASKS = [
    { id: 'lists', on: true, heavy: true, label: 'Disable list-based advertisers',
      hint: 'Advertisers and data brokers that uploaded a contact list containing your details: stop them using it to show you ads or exclude you.' },
    { id: 'seen', on: true, heavy: true, label: 'Hide advertisers you have seen',
      hint: 'Clicks “Hide ads” for every advertiser Facebook lists for you.' },
    { id: 'adsettings', on: true, label: 'Restrict ad data settings',
      hint: 'Activity from ad partners: not used · profile categories: off · ads outside Meta: off · social interactions: Only me.' },
    { id: 'offclear', on: true, label: 'Clear off-Meta activity history',
      hint: 'Disconnects the activity other companies and websites have already sent to Meta about you.' },
    { id: 'offfuture', on: false, label: 'Disconnect future off-Meta activity',
      hint: 'Stops new off-Meta activity being linked to your account. Side effect: “Log in with Facebook” on other sites stops working.' },
    { id: 'topics', on: false, heavy: true, label: 'Ad topics: “See less”',
      hint: 'Walks the ad topics list and picks “See less” for each one.' },
    { id: 'special', on: false, label: 'Special ad topics: “See less”',
      hint: 'Turns off every switch under Ad topics → Special topics (alcohol, parenting, pets, social issues and politics, gambling, body weight control), so you see fewer ads about them. Applies to every account in your Accounts Center. Choosing the Max level ticks this.' },
    { id: 'ai', on: true, label: 'Turn off AI features',
      hint: 'Switches off the AI settings Facebook offers on the web (comment summaries and any AI switch found in settings) and lists the ones you have to change by hand. Meta AI itself cannot be removed.' },
  ];

  const LEVELS = [
    { id: 'default', label: 'Default',
      hint: 'Leave audience and visibility settings exactly as they are.' },
    { id: 'moderate', label: 'Moderate',
      hint: 'Friends only: future and past posts, friends list, email/phone lookup, tagging. No search-engine link. Tag review on. Past posts cannot be bulk-undone.' },
    { id: 'max', label: 'Max',
      hint: 'Most restrictive: everything in Moderate, with “Only me” wherever Facebook offers it and sharing of your posts to other people’s stories off. Also ticks “Disconnect future off-Meta activity” and “Special ad topics” above.' },
  ];

  const SETTINGS = WWW + '/settings/?tab=';
  const ADS = AC + '/ads/';

  // value: string[] = option to select, boolean = switch position, 'alloff' = turn every switch off.
  const AD_TAB = ['manage info'];
  // row: the label, newest wording first. already: text the row shows when nothing needs changing.
  // An option ending in * matches as a prefix.
  const AD_SETTINGS = [
    { id: 'ad_partners', title: 'Activity from other businesses (ad partners)', url: ADS, tab: AD_TAB,
      row: ['activity from other businesses', 'activity information from ad partners'],
      already: ['not using this information'], steps: [['review setting', 'review settings']],
      all: ["don't allow us to use*", "no, don't make my ads more relevant*", "don't use*", 'not using*', "no, don't use*"], confirm: ['confirm', 'save', 'done'],
      say: 'not using this information' },
    { id: 'ad_categories', title: 'Categories used to reach you', url: ADS, tab: AD_TAB,
      row: ['categories used to reach you'], custom: 'adCategories', all: true,
      say: '“Not used” for employer, job title, education and relationship status, with the other categories removed' },
    { id: 'ad_outside', title: 'Ads in other apps (ads shown outside of Meta)', url: ADS, tab: AD_TAB,
      row: ['ads in other apps', 'ads from ad partners', 'ads shown off of meta', 'ads shown off meta', 'ads shown outside of meta'],
      already: ['not showing you ads in other apps'],
      all: ["don't show*", 'not showing*', 'not allowed', "don't allow", 'no'], elseToggle: false, say: 'not showing you ads in other apps' },
    { id: 'ad_about_meta', title: 'Ads about Meta on other platforms', url: ADS, tab: AD_TAB,
      row: ['ads about meta'], already: ['not using this information', 'not using your activity', 'not showing'],
      all: ["don't use*", 'not using*', "don't show*", 'not showing*', 'not allowed', 'no'], elseToggle: false, optional: true,
      say: 'not using your activity' },
    { id: 'ad_social', title: 'Social interactions in ads', url: ADS, tab: AD_TAB,
      row: ['social interactions'], all: ['only me'] },
  ];
  const AD_ROWS = ['categories used to reach you', 'audience-based advertising', 'other settings', 'learn more about ads privacy',
    ...AD_SETTINGS.flatMap((x) => x.row)];

  // Settings tabs. A setting can list several: Facebook moves rows between them,
  // so the next tab is tried when the row is not on the first.
  const TAB = {
    posts: SETTINGS + 'posts',
    stories: SETTINGS + 'stories',
    reels: SETTINGS + 'reels',
    find: SETTINGS + 'how_people_find_and_contact_you',
    followers: SETTINGS + 'followers_and_public_content',
    tagging: SETTINGS + 'profile_and_tagging',
  };

  const FRIENDS = ['friends'], ONLY_ME = ['only me'], FOF = ['friends of friends'], NO_ONE = ['no one', 'only me'];
  const PRIVACY = [
    { id: 'future_posts', title: 'Who can see your future posts', urls: [TAB.posts],
      row: ['who can see your future posts'], moderate: FRIENDS, max: ONLY_ME },
    { id: 'past_posts', title: 'Limit who can see past posts', urls: [TAB.posts],
      custom: 'pastPosts', moderate: true, max: true, say: '“Limit past posts”' },
    { id: 'friend_requests', title: 'Who can send you friend requests', urls: [TAB.find],
      row: ['who can send you friend requests'], moderate: FOF, max: FOF },
    { id: 'friends_list', title: 'Who can see your friends list', urls: [TAB.find],
      row: ['who can see your friends list'], moderate: FRIENDS, max: ONLY_ME },
    { id: 'lookup_email', title: 'Who can look you up by email address', urls: [TAB.find],
      row: ['people with your email address', 'look you up using the email address', 'email address you provided'],
      moderate: FRIENDS, max: NO_ONE, say: { max: '“No one” (or “Only me”)' } },
    { id: 'lookup_phone', title: 'Who can look you up by phone number', urls: [TAB.find],
      row: ['people with your phone number', 'look you up using the phone number', 'phone number you provided'],
      moderate: FRIENDS, max: NO_ONE, say: { max: '“No one” (or “Only me”)' } },
    { id: 'search_engines', title: 'Search engines outside Facebook link to your profile', urls: [TAB.find],
      row: ['search engines outside of facebook', 'search engines to link to your profile', 'search engines outside facebook'],
      moderate: false, max: false },
    { id: 'follow', title: 'Who can follow you', urls: [TAB.followers],
      row: ['who can follow me', 'who can follow you'], moderate: FRIENDS, max: FRIENDS },
    { id: 'following', title: 'Who can see the people, Pages and lists you follow', urls: [TAB.followers, TAB.find, TAB.posts],
      row: ['lists you follow', 'who you follow', 'you follow'], moderate: FRIENDS, max: ONLY_ME },
    { id: 'public_comments', title: 'Who can comment on your public posts', urls: [TAB.followers],
      row: ['who can comment on your public posts', 'public post comments'], moderate: FRIENDS, max: FRIENDS },
    { id: 'public_profile_info', title: 'Who can like or comment on public profile info', urls: [TAB.followers],
      row: ['public profile info'], moderate: FRIENDS, max: FRIENDS },
    { id: 'post_on_profile', title: 'Who can post on your profile', urls: [TAB.tagging],
      row: ['who can post on your profile'], moderate: FRIENDS, max: ONLY_ME },
    { id: 'others_posts', title: 'Who can see what others post on your profile', urls: [TAB.tagging],
      row: ['who can see what others post on your profile'], moderate: FRIENDS, max: ONLY_ME },
    { id: 'tagged_posts', title: 'Who can see posts you are tagged in on your profile', urls: [TAB.tagging],
      row: ["who can see posts you're tagged in on your profile"], moderate: FRIENDS, max: ONLY_ME },
    { id: 'review_tagged', title: 'Review posts you are tagged in before they appear on your profile', urls: [TAB.tagging],
      row: ["review posts you're tagged in before"], moderate: true, max: true },
    { id: 'review_tags', title: 'Review tags people add to your posts', urls: [TAB.tagging],
      row: ['review tags people add to your'], moderate: true, max: true },
    { id: 'share_to_stories', title: 'Allow others to share your posts to their stories', urls: [TAB.tagging, TAB.stories, TAB.posts],
      row: ['share your posts to their stor', 'share your public stor', 'to their own stor'], max: false },
  ];

  // AI. Only what Facebook exposes as a setting on the web can be switched off here.
  const AI_SETTINGS = [
    { id: 'ai_summaries', title: 'AI comment summaries on your posts', urls: [TAB.posts, TAB.followers],
      row: ['comment summaries'], all: false, optional: true },
  ];
  const AI_SCAN = ['posts', 'stories', 'reels', 'tagging', 'followers'];
  const AI_WORDS = /\bmeta ai\b|\bai\b|comment summar|cloud processing|artificial intelligence/;
  const AI_SKIP = /\b(hide|block|limit|restrict|mute|opt out|turn off|disable|label|don't|do not|never)\b/;
  const AI_BY_HAND = [
    { id: 'ai_camera_roll', title: 'AI: camera roll cloud processing', url: WWW + '/settings/',
      manual: 'Phone app only: Facebook app → Settings → “Camera roll sharing suggestions” → switch both options off.' },
    { id: 'ai_training', title: 'AI: use of your information to train Meta AI', url: WWW + '/privacy/genai',
      manual: 'No switch exists. Where your region allows it, this Privacy Center page links to the form to object.' },
    { id: 'ai_chats', title: 'AI: Meta AI chats and memory', url: 'https://www.meta.ai/',
      manual: 'Delete your Meta AI chats and saved memories in Meta AI’s own settings. Meta AI cannot be removed from search or Messenger; you can mute its chat.' },
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
      const pick = a && b ? ((a.savedAt || 0) >= (b.savedAt || 0) ? a : b) : a || b;
      fromWindowName = !!pick && pick === b;
      return pick;
    },
    set: async (v) => {
      const s = JSON.stringify(v);
      try { sessionStorage.setItem(KEY, s); } catch (e) { /* storage blocked */ }
      try { window.name = KEY + ':' + s; } catch (e) { /* ignore */ }
    },
  };

  // "3,231,099 followers", "1.2M likes": a count and the word, nothing else.
  // A category is a short name, or a few of them: "Retail company", "Brand · Science, Technology &
  // Engineering · Information Technology Company". A description is a sentence.
  const isCategory = (x) => x.length <= 200 && x.split(' · ').every((part) => part.length <= 50);
  const FOLLOWERS = /^[\d.,\s]*\d[\d.,]*\s?[kmb]?\+?\s+(followers?|likes?|members?)$/i;

  // A list-based advertiser is known by the address of its page, without the query string: the
  // number in the address is the advertiser, the rest says how the page is to be shown.
  const listKey = (key) => String(key).split(/[?#]/)[0].replace(/\/+$/, '') + '/';

  // List-based advertisers confirmed disabled in earlier runs: { key: { name, result, at } }.
  const memory = {
    // Versions up to 1.6.0 could file an entry of "Hide advertisers you have seen" under the wrong
    // name: a line of an advertiser's own page ("Website") was taken for an advertiser, or an
    // advertiser got the name and details of the page that happened to be open. Such an entry is
    // told by its key not being its name. It is left out, so that the advertiser is read again.
    dropped: 0,
    load: async () => {
      const m = await durable.get(MEMORY_KEY);
      if (!m || typeof m !== 'object' || Array.isArray(m)) return {};
      const misfiled = ([key, e]) => key.startsWith('seen:') && (!e || typeof e !== 'object' || 'seen:' + norm(e.name) !== key);
      const entries = Object.entries(m);
      const kept = entries.filter((x) => !misfiled(x));
      memory.dropped = entries.length - kept.length;
      // Up to 1.6.1 a list-based advertiser's key included the query string of its link.
      const out = new Map();
      for (const [key, e] of kept) {
        // Up to 1.6.1 a description could be stored as the follower count or as the category.
        if (e && typeof e === 'object') {
          const stray = [typeof e.followers === 'string' && e.followers && !FOLLOWERS.test(e.followers) ? e.followers : '',
            typeof e.category === 'string' && e.category && !isCategory(e.category) ? e.category : ''].filter(Boolean);
          if (stray.length) {
            if (stray.includes(e.followers)) e.followers = '';
            if (stray.includes(e.category)) e.category = '';
            e.about = [...stray, typeof e.about === 'string' ? e.about : ''].filter(Boolean).join(' / ').slice(0, 300);
          }
          // 1.6.3 took several categories on one line for a description: put them back.
          if (!e.category && typeof e.about === 'string' && e.about.includes(' · ')) {
            const [first, ...others] = e.about.split(' / ');
            if (isCategory(first)) { e.category = first; e.about = others.join(' / '); }
          }
        }
        const k = key.startsWith('/') ? listKey(key) : key;
        const had = out.get(k);
        if (!had || ((e && e.at) || 0) >= ((had && had.at) || 0)) out.set(k, e);
      }
      return Object.fromEntries(out);
    },
    save: (m) => durable.set(MEMORY_KEY, m),
  };

  // A link or an address is only used when it is https on Facebook's own sites (or Meta AI's).
  // Addresses kept in the saved run are checked too: a saved run is data, not something to trust.
  function safeUrl(value) {
    try {
      const u = new URL(String(value));
      return u.protocol === 'https:' && (/(^|\.)facebook\.com$/.test(u.hostname) || u.hostname === 'www.meta.ai') ? u.href : '';
    } catch (e) { return ''; }
  }

  // A saved run is only accepted when it has the shape this script writes. In console mode the
  // saved run travels in window.name, which any site the tab visited before could have set.
  // The options of a run, rebuilt from whatever was stored or imported. null when they are not ours.
  function cleanOptions(o) {
    if (!o || typeof o !== 'object' || !Array.isArray(o.tasks)) return null;
    const taskIds = TASKS.map((x) => x.id);
    if (!o.tasks.every((x) => taskIds.includes(x)) || !LEVELS.some((x) => x.id === o.level)) return null;
    return {
      tasks: [...new Set(o.tasks)], level: o.level, dryRun: !!o.dryRun,
      delay: Math.min(10000, Math.max(20, Number(o.delay) || 1500)),
      remember: !!o.remember, skipKnown: !!o.skipKnown, saveInfo: !!o.saveInfo, saveLog: !!o.saveLog,
    };
  }

  function sane(st) {
    if (!st || typeof st !== 'object' || Array.isArray(st)) return null;
    st.opts = cleanOptions(st.opts);
    if (!st.opts) return null;
    st.idx = Math.max(0, Math.floor(Number(st.idx)) || 0);
    st.running = st.running === true;
    st.results = (Array.isArray(st.results) ? st.results : []).slice(0, 500)
      .filter((r) => r && typeof r === 'object' && ['changed', 'already', 'dry', 'manual', 'info'].includes(r.status))
      .map((r) => ({ ...r, url: safeUrl(r.url) }));
    st.log = (Array.isArray(st.log) ? st.log : []).filter((x) => typeof x === 'string').slice(-20000);
    st.records = (Array.isArray(st.records) ? st.records : []).filter((r) => r && typeof r === 'object').slice(0, 5000);
    for (const key of ['alias', 'renav', 'alt', 'altSeen', 'altWhy', 'renavAt', 'reloads', 'adv']) {
      if (st[key] != null && (typeof st[key] !== 'object' || Array.isArray(st[key]))) st[key] = {};
    }
    if (st.lists && Array.isArray(st.lists.all)) st.lists.all = st.lists.all.filter((x) => x && isAdvertiserUrl(x.href));
    if (st.lists && st.lists.at && !isAdvertiserUrl(st.lists.at.href)) st.lists.at = null;
    return st;
  }

  // An advertiser's page in Accounts Center: the only address a step may load apart from its own.
  function isAdvertiserUrl(href) {
    try {
      const u = new URL(String(href));
      return u.origin === AC && u.pathname.startsWith('/ads/audience_based_advertising/');
    } catch (e) { return false; }
  }

  let fromWindowName = false; // console mode: the saved run was read from window.name
  let state = null;
  let units = [];
  let stopRequested = false;
  let busy = false;

  // The advertiser database: every advertiser handled, with what Facebook says about it and what
  // happened. Kept in this browser only (and in a backup file when you save one).
  //   key   - a list-based advertiser's address ("/ads/audience_based_advertising/…"), or "seen:" + its name
  //   entry - { task, name, result, at, confirmed, category, about, followers, website, advertiser_id, link, list_uses }
  // "confirmed" is what makes a later run skip the advertiser: the page itself showed it as done.
  //
  // While the script runs it is a Map, not a plain object: keys come from the page, a saved run or a
  // backup file, and a Map takes any key (even "__proto__") as plain data.
  let lastUnits = new Map(); // what the last finished or stopped run reported for each step
  let book = new Map();
  const bookFrom = (entries) => new Map(Object.entries(entries));
  let bookDirty = false;
  const confirmedIn = (entries) => Object.values(entries).filter((e) => e && e.confirmed !== false).length;
  const listKeys = (entries) => Object.keys(entries).filter((k) => k.startsWith('/'));

  const save = async () => {
    state.savedAt = Date.now();
    await store.set(state);
    if (bookDirty) { bookDirty = false; await memory.save(Object.fromEntries(book)); }
  };

  // Facebook answers with these when it will not serve a page for now. One cause is rate
  // limiting: too many of its pages opened in a short time.
  const LIMITED = /something went wrong|try again later|page isn['’]t available right now/i;
  const LIMIT_NOTE = 'This can be Facebook rate limiting, after many of its pages were opened in a short time. Wait a few hours before running this task again';

  class Abort extends Error {}
  class DryRun extends Error {}
  class Renav extends Error { constructor(message, progress = 0) { super(message); this.progress = progress; } }
  class RowMissing extends Error {}
  class Broken extends Error {}

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
  // A needle that ends in * matches as a prefix whatever the mode.
  const hit = (text, needles, mode) => !!text && needles.some((n) =>
    n.endsWith('*') ? text.startsWith(n.slice(0, -1)) : mode === 'exact' ? text === n : mode === 'starts' ? text.startsWith(n) : text.includes(n));

  const dialogs = () => [...document.querySelectorAll('[role="dialog"]')].filter(visible);
  // A dialog really is in front when a point inside it belongs to it. Facebook keeps other,
  // hidden dialogs in the page (chat windows), so "the last one" is not reliable.
  function inFront(d) {
    const r = d.getBoundingClientRect();
    const left = Math.max(r.left, 0), right = Math.min(r.right, innerWidth);
    const top = Math.max(r.top, 0), bottom = Math.min(r.bottom, innerHeight);
    if (right - left < 2 || bottom - top < 2) return false; // off screen
    return [[0.5, 0.5], [0.25, 0.25], [0.75, 0.75]].some(([fx, fy]) => {
      const at = document.elementsFromPoint(left + (right - left) * fx, top + (bottom - top) * fy).find((e) => e.id !== 'fb-ad-disable-panel');
      return !!at && d.contains(at);
    });
  }
  const topLayer = () => dialogs().filter(inFront).pop() || null;
  // The same test for a control or a row: is it what a person would see and click there, or is it
  // covered by something drawn over it? Facebook leaves covered pages of a pop-up in the document.
  const shown = (el) => visible(el) && inFront(el.closest('[role="button"],button,a,[role="link"]') || el);
  // Not in view because the area it sits in was scrolled, which is not the same as covered: part of
  // it lies outside what its scrolling areas (and the window) show.
  // `cache` (a Map) saves working out the same area again for the next element in it.
  const scrolledOut = (el, cache) => {
    if (!visible(el)) return false;
    const area = (p) => {
      if (!p || p === document.documentElement) return [0, innerHeight];
      if (cache && cache.has(p)) return cache.get(p);
      let [top, bottom] = area(p.parentElement);
      if (/auto|scroll|hidden|overlay|clip/.test(getComputedStyle(p).overflowY)) {
        const a = p.getBoundingClientRect();
        top = Math.max(top, a.top);
        bottom = Math.min(bottom, a.bottom);
      }
      if (cache) cache.set(p, [top, bottom]);
      return [top, bottom];
    };
    const r = el.getBoundingClientRect();
    const [top, bottom] = area(el.parentElement);
    return r.top < top - 1 || r.bottom > bottom + 1;
  };

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
    if (!out.length && mode !== 'exact') {
      // The label may be split over several nodes: take the smallest element whose whole text matches.
      for (const el of root.querySelectorAll('span,div,label,h1,h2,h3,h4,p,a')) {
        if (el.textContent.length > 400 || !hit(norm(el.textContent), needles, mode) || !visible(el)) continue;
        if (![...el.children].some((c) => hit(norm(c.textContent), needles, mode))) out.push(el);
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

  // The label of a setting: for each wording in turn an exact match, then one that starts
  // with it, then one that contains it. A heading or a description never wins over the row.
  function findRow(needles) {
    for (const mode of ['exact', 'starts', 'includes']) {
      for (const n of needles) {
        const el = findText([n], { mode })[0];
        if (el) return el;
      }
    }
    return null;
  }

  // The text of the row a label sits in (label, description, current value), without
  // running into a neighbouring row.
  function rowText(el, own) {
    const others = AD_ROWS.filter((x) => !own.includes(x));
    let p = el;
    for (let i = 0; i < 10 && p.parentElement && p.parentElement !== document.body; i++, p = p.parentElement) {
      const text = norm(p.parentElement.textContent);
      if (text.length > 400 || others.some((x) => text.includes(x))) break;
    }
    return norm(p.textContent);
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

  async function waitFor(fn, timeout = 10000, what = 'element', every = 150) {
    const end = Date.now() + timeout;
    for (;;) {
      const v = fn();
      if (v) return v;
      if (Date.now() > end) throw new Error(`could not find ${what}`);
      await sleep(every);
    }
  }

  function click(el) {
    try { el.scrollIntoView({ block: 'center' }); } catch (e) { /* ignore */ }
    el.click();
  }

  // The whole sequence a mouse produces. Some of Facebook's controls only react to this.
  function press(el) {
    try { el.scrollIntoView({ block: 'center' }); } catch (e) { /* ignore */ }
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const inner = document.elementFromPoint(x, y);
    const target = inner && el.contains(inner) ? inner : el;
    const fire = (Type, name, extra) => {
      const init = { bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y, button: 0, ...extra };
      let ev;
      try { ev = new Type(name, { ...init, view: window }); } catch (e) { ev = new Type(name, init); } // a userscript's window is not a Window
      target.dispatchEvent(ev);
    };
    const Pointer = window.PointerEvent || MouseEvent;
    const pointer = { pointerType: 'mouse', isPrimary: true, pointerId: 1 };
    fire(Pointer, 'pointerover', pointer);
    fire(MouseEvent, 'mouseover');
    fire(Pointer, 'pointerdown', { ...pointer, buttons: 1 });
    fire(MouseEvent, 'mousedown', { buttons: 1 });
    try { el.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
    fire(Pointer, 'pointerup', pointer);
    fire(MouseEvent, 'mouseup');
    fire(MouseEvent, 'click');
  }

  // A click that changes a setting. In dry-run mode nothing is clicked.
  function act(el, what) {
    if (state.opts.dryRun) throw new DryRun(what);
    log('  → ' + what);
    click(el);
  }

  const say = (el) => (el.getAttribute('aria-label') || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 70);
  // The same, with a space between the pieces of text of a row: "Hyatt @hyatt", not "Hyatt@hyatt".
  const sayRow = (el) => {
    if (el.getAttribute('aria-label')) return say(el);
    const parts = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) { const text = n.nodeValue.trim(); if (text) parts.push(text); }
    return parts.join(' ').replace(/\s+/g, ' ').slice(0, 70);
  };

  // Elements that appeared after the last row clicks: the pop-up a row opened.
  let fresh = [];

  // Clicks a row and reports whether a new dialog or page opened.
  async function openRow(el) {
    const before = dialogs().length + '|' + location.href;
    const url = location.href;
    const added = [];
    const collect = (muts) => { for (const m of muts) for (const n of m.addedNodes) if (n.nodeType === 1) added.push(n); };
    const mo = new MutationObserver(collect);
    mo.observe(document.body, { childList: true, subtree: true });
    try {
      click(el);
      await settle();
    } finally {
      collect(mo.takeRecords());
      mo.disconnect();
    }
    if (location.href === url) fresh.push(...added.filter((n) => n.isConnected && !n.contains(el)));
    return before !== dialogs().length + '|' + location.href;
  }

  const OPTION_SEL = '[role="radio"],[role="menuitemradio"],[role="option"],[role="menuitem"],[role="checkbox"],label';
  const GROUP_SEL = '[role="dialog"],[role="menu"],[role="listbox"],[role="radiogroup"]';
  const SWITCH_SEL = '[role="switch"],[role="checkbox"],input[type="checkbox"]';

  const floating = (el) => {
    for (let p = el; p && p !== document.body; p = p.parentElement) {
      if (/^(fixed|absolute)$/.test(getComputedStyle(p).position)) return true;
    }
    return false;
  };

  // Options are only ever picked inside a dialog, menu or radio group, or inside a pop-up
  // that the row just opened, so a same-named link elsewhere on the page ("Friends") can
  // never be clicked.
  const findOption = (needles, mode) => findText(needles, { mode }).filter((el) =>
    el.closest(OPTION_SEL) || el.closest(GROUP_SEL) || (fresh.some((n) => n.contains(el)) && floating(el)));

  // A "View" / "Edit" style button that belongs to the row containing `el`.
  // It has to sit on the same line of the screen, so a neighbouring row's button is never taken.
  function rowButton(el, needles = ['view', 'edit', 'change', 'manage']) {
    const r = el.getBoundingClientRect();
    const sameLine = (b) => { const y = b.getBoundingClientRect(); const mid = y.top + y.height / 2; return mid >= r.top - 24 && mid <= r.bottom + 24; };
    for (let p = el.parentElement, i = 0; p && p !== document.body && i < 10 && p.textContent.length < 500; p = p.parentElement, i++) {
      const btn = searchText(p, needles, 'exact').find((b) => b !== el && sameLine(b));
      if (btn) return btn;
    }
    return null;
  }

  function checkedState(el) {
    const holder = el.closest('[role="radio"],[role="menuitemradio"],[role="option"],[role="checkbox"],[role="switch"]');
    if (holder) {
      const v = holder.getAttribute('aria-checked') ?? holder.getAttribute('aria-selected');
      if (v != null) return v === 'true';
    }
    const label = el.closest('label');
    const input = label && label.querySelector('input');
    if (input) return input.checked;
    // The control can sit next to the text instead of around it: the only one in the smallest
    // container around the text is this option's. Two of them means the whole group was reached.
    for (let p = el.parentElement, i = 0; p && p !== document.body && i < 6; p = p.parentElement, i++) {
      const found = p.querySelectorAll('[aria-checked],[aria-selected],input[type="radio"],input[type="checkbox"]');
      if (found.length > 1) break;
      if (found.length === 1) {
        const c = found[0];
        return c.matches('input') ? c.checked : (c.getAttribute('aria-checked') ?? c.getAttribute('aria-selected')) === 'true';
      }
    }
    return null;
  }

  // Selects an option, and reads back what the page then shows:
  //   - shown as selected before: nothing is clicked;
  //   - shown as selected after the click, or the pop-up closed: changed;
  //   - still shown as not selected after the click: changed, with `off` set;
  //   - the page shows no state at all: changed, with `unread` set, because the script cannot tell
  //     whether the option was selected already.
  // With `off` or `unread`, `shown` is what the pop-up looked like, for the log.
  async function choose(needles, mode = 'exact', timeout = 8000) {
    const find = () => findOption(needles, mode)[0];
    await waitFor(find, timeout, `option “${needles[0]}”`);
    return pick(find);
  }

  // The same for an option that is already found. `find` returns it afresh each time: the page may
  // have drawn it again.
  async function pick(find) {
    let el = find();
    if (!el) throw new Error('the option is no longer there');
    const name = say(el);
    const selected = () => { const o = find(); return !!o && checkedState(o) === true; };
    // A pop-up can open before it knows the current choice, with nothing selected yet. Clicking
    // then reports a change on every run. So while no option at all shows as selected, the pop-up
    // gets a moment to show which one is.
    const anySelected = () => {
      const o = find();
      const group = (o && o.closest('[role="radiogroup"],[role="menu"],[role="listbox"],[role="dialog"]')) || topLayer() || document.body;
      return group.querySelector('[aria-checked="true"],[aria-selected="true"],input:checked') !== null;
    };
    if (!selected() && !anySelected()) await waitFor(anySelected, 2500, 'the current choice', 250).catch(() => null);
    if (selected()) return { status: 'already', detail: name };
    el = find() || el;
    const was = snapshot(); // what the pop-up showed before the change, for the log
    act(el, `select “${name}”`);
    await settle();
    const now = find();
    const picked = now ? checkedState(now) : null;
    if (picked === true || !now) return { status: 'changed', detail: name, was };
    return { status: 'changed', detail: name, was, [picked === false ? 'off' : 'unread']: true, shown: snapshot() };
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

  // The switch that belongs to the row containing `el`, if there is one: first the only switch
  // inside a shared container, then the one on the same line of the screen.
  function switchNear(el) {
    for (let p = el, i = 0; p && p !== document.body && i < 12; p = p.parentElement, i++) {
      const found = switchesIn(p);
      if (found.length > 1 || p.textContent.length > 600) break;
      if (found.length === 1) return found[0];
    }
    const r = el.getBoundingClientRect();
    const y = r.top + r.height / 2;
    const near = switchesIn(document.body)
      .map((sw) => { const b = sw.getBoundingClientRect(); return { sw, d: Math.abs(b.top + b.height / 2 - y) }; })
      .filter((x) => x.d <= Math.max(28, r.height))
      .sort((a, b) => a.d - b.d);
    return near.length && (near.length === 1 || near[1].d > near[0].d * 2 + 4) ? near[0].sw : null;
  }

  // What a switch controls: its accessible name, or the text of the row around it.
  function switchLabel(sw) {
    const named = sw.getAttribute('aria-label') ||
      (sw.getAttribute('aria-labelledby') || '').split(/\s+/).map((id) => (document.getElementById(id) || {}).textContent || '').join(' ');
    if (clip(named, 160).length > 3) return clip(named, 160);
    for (let p = sw.parentElement, i = 0; p && p !== document.body && i < 12; p = p.parentElement, i++) {
      if (clip(p.textContent, 400).length > 5) return clip(p.textContent, 160);
    }
    return '';
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
    if (!switchesIn(root).length) throw new Error('the setting opened, but no switches were found in it');
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

  // Loads another page in the middle of a step; the step picks up there when the page has loaded.
  async function travel(unitId, href) {
    if (!isAdvertiserUrl(href)) throw new Error('refused to open an address that is not an advertiser page');
    state.navFor = unitId;
    state.navKeep = true;
    state.navAt = Date.now();
    await save();
    location.assign(href);
    await new Promise(() => {}); // the page unloads
  }

  async function goto(unit) {
    if (!unit.url) return;
    if (state.navFor === unit.id) { // just arrived for this unit; accept wherever Facebook sent us
      state.navFor = null;
      if (!state.navKeep && !at(unit.url)) state.alias[unit.url] = location.origin + location.pathname + location.search;
      state.navKeep = false;
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
  const CSV_COLUMNS = ['task', 'name', 'category', 'about', 'followers', 'website', 'advertiser_id', 'result', 'action', 'remembered',
    'list_uses', 'link', 'facebook_page', 'list_text', 'detail_text', 'error', 'processed_at', 'dry_run'];

  const clip = (s, n) => (s || '').replace(/\s+/g, ' ').trim().slice(0, n);

  // The first piece of text in an element: a list entry's name without its status line.
  function firstText(el) {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const text = clip(n.nodeValue, 80);
      if (text.length > 1) return text;
    }
    return clip(el.textContent, 80);
  }

  // What an open advertiser panel says about the advertiser: the lines between its heading
  // and the ad controls, sorted into category, description, followers and website.
  // With `from` (the heading that carries the advertiser's name) reading starts there: the root
  // may hold more than this one advertiser's page.
  function advertiserInfo(root, from) {
    const stop = [...t('hideAds'), ...t('unhide'), ...t('hidden'), ...t('theyUploaded'), ...t('dontAllow'), 'ads from this advertiser'];
    const lines = [];
    let name = from ? clip(from.textContent, 140) : '';
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    if (from) walker.currentNode = from;
    for (let n = walker.nextNode(); n && lines.length < 12; n = walker.nextNode()) {
      const el = n.parentElement;
      const text = clip(n.nodeValue, 140);
      if (text.length < 2 || !el || /^(SCRIPT|STYLE|NOSCRIPT)$/.test(el.tagName) || !visible(el) || (from && from.contains(n))) continue;
      if (!name) { if (el.closest('h1,h2,[role="heading"]')) name = text; continue; }
      if (hit(norm(text), stop, 'includes')) break;
      if (norm(text) === norm(name)) continue; // the page repeats the name under its heading
      if (!lines.includes(text)) lines.push(text);
    }
    // "3,231,099 followers", "1.2M likes": a count and the word, nothing else. A description that
    // happens to hold a number and "like" or "members" is not a follower count.
    const followers = lines.find((x) => FOLLOWERS.test(x)) || '';
    const website = lines.find((x) => /^(https?:\/\/|www\.)\S+$/i.test(x)) || '';
    const label = /^(facebook page|instagram( account| profile)?|website|page|profile|learn more)$/i;
    const rest = lines.filter((x) => x !== followers && x !== website && !label.test(x));
    // An advertiser without a category starts with its description.
    const category = rest[0] && isCategory(rest[0]) ? rest[0] : '';
    return { name, category, about: rest.filter((x) => x !== category).slice(0, 2).join(' / '), followers, website };
  }

  // One row of the advertiser table: shown as the run goes, and in the report. The long texts
  // are only kept when "Save advertiser details" is on.
  //
  // With a key, the advertiser also goes into the database (unless this is a dry run, which leaves
  // no trace, or remembering is off). `confirmed` says whether the page showed it as done.
  function record(rec, key, confirmed) {
    const row = { ...rec, processed_at: new Date().toISOString(), dry_run: state.opts.dryRun ? 'yes' : 'no' };
    if (key && state.opts.remember && !state.opts.dryRun) {
      const text = (v, n) => clip(v == null ? '' : String(v), n);
      book.set(key, {
        task: row.task, name: text(row.name, 200), result: text(row.result, 80), at: Date.now(), confirmed: !!confirmed,
        category: text(row.category, 200), about: text(row.about, 300), followers: text(row.followers, 80), website: text(row.website, 300),
        advertiser_id: text(row.advertiser_id, 40), link: text(row.link, 500), list_uses: text(row.list_uses, 400),
      });
      bookDirty = true;
      if (confirmed) row.remembered = 'yes';
    }
    if (!state.opts.saveInfo) { delete row.detail_text; delete row.list_text; }
    state.records.push(row);
    ui.advertiserRow(row);
    return row;
  }

  // "  [ 12/215] Name · category · followers · website → result"
  const advLine = (rec, n, total) => `  [${String(n).padStart(String(total).length)}/${total}] ` +
    [rec.name, rec.category, rec.followers, rec.website, rec.list_uses].filter(Boolean).join(' · ') +
    ` → ${rec.result}${rec.remembered ? ', remembered' : ''}${rec.error ? ': ' + rec.error : ''}`;

  // Every value in the file comes from Facebook's pages, and advertisers choose their own names.
  // A spreadsheet runs a cell as a formula when it starts with = + - or @ (and their full-width
  // forms), which can leak data or start a program. So:
  //   - a cell that starts with one of those, after any leading spaces, gets an apostrophe in
  //     front, which makes a spreadsheet show it as text;
  //   - control characters, tabs and line breaks become spaces, so a value cannot open a new
  //     cell or line however the file is read;
  //   - every cell is quoted, so a ";" or a tab inside a value cannot split it into a second
  //     cell where the spreadsheet's list separator is not a comma.
  function csvCell(value) {
    let text = value == null ? '' : String(value);
    text = text.replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, ' ');
    if (/^\s*[=+\-@\uff1d\uff0b\uff0d\uff20]/.test(text)) text = "'" + text;
    return '"' + text.replace(/"/g, '""') + '"';
  }

  // Ad topics have their own, smaller file.
  const TOPIC_COLUMNS = ['name', 'result', 'action', 'remembered', 'error', 'processed_at', 'dry_run'];
  const isTopic = (r) => r.task === 'topic';

  function toCsv(rows, columns = CSV_COLUMNS) {
    return '\uFEFF' + [columns, ...rows.map((r) => columns.map((c) => r[c]))]
      .map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
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

  // Audiences from widest to narrowest. A setting is never moved to a wider one.
  const AUDIENCES = [['public', 'everyone', 'anyone', 'possible connections'], ['friends of friends'], ['friends'], ['only me', 'no one']];
  const strictness = (text) => AUDIENCES.findIndex((names) => names.includes(norm(text)));

  async function applySetting(s, value) {
    if (s.tab) {
      const tab = findText(s.tab)[0];
      if (tab) { click(tab); await settle(); }
    }
    const row = await waitFor(() => findRow(s.row), 10000, 'row', 300).catch(() => null);
    if (!row) throw new RowMissing(`could not find the “${s.title}” row`);
    if (s.already) { // the row itself says what the setting is
      const shown = rowText(row, s.row);
      const now = s.already.find((x) => shown.includes(x));
      if (now) return { status: 'already', detail: now };
    }

    if (typeof value === 'boolean') {
      const onlyInLayer = () => { const layer = topLayer(); const list = layer ? switchesIn(layer) : []; return list.length === 1 ? list[0] : null; };
      let sw = switchNear(row);
      if (!sw) { // not a switch in the row itself: the row opens something
        await openRow(row);
        sw = onlyInLayer() || (row.isConnected ? switchNear(row) : null);
        if (!sw && !findOption([...t('on'), ...t('off')], 'exact').length) {
          const btn = row.isConnected && rowButton(row);
          if (btn) { await openRow(btn); sw = onlyInLayer(); }
        }
      }
      const r = sw ? await setSwitch(sw, value) : await choose(value ? t('on') : t('off'));
      if (r.status === 'changed') await confirmIf([...(s.confirm || t('confirm')), 'turn off', 'turn on']);
      return r;
    }

    // A row usually shows its current value ("People with your email address · No one"). When that
    // is already the wanted one there is nothing to open.
    if (Array.isArray(value)) {
      const holder = row.closest('[role="button"],[role="link"],[role="listitem"]') || row.parentElement;
      if (holder && holder.textContent.length < 300) {
        const label = ownText(row);
        const walker = document.createTreeWalker(holder, NodeFilter.SHOW_TEXT);
        const wanted = strictness(value[0]);
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
          const piece = norm(n.nodeValue);
          if (!piece || piece === label) continue;
          if (hit(piece, value, s.mode || 'exact')) return { status: 'already', detail: clip(n.nodeValue, 80) };
          // Never loosen: "No one" stays when the level only asks for "Friends".
          if (wanted >= 0 && strictness(piece) > wanted) {
            return { status: 'already', detail: `${clip(n.nodeValue, 80)} (stricter than ${describe(value)}, left as it is)` };
          }
        }
      }
    }
    let opened = await openRow(row);
    if (!opened && !(value !== 'alloff' && findOption(value, s.mode || 'exact').length)) {
      const btn = row.isConnected && rowButton(row); // e.g. the "View" link next to the row
      if (btn) opened = await openRow(btn);
    }
    for (const step of s.steps || []) {
      const el = findText(step)[0];
      if (el) await openRow(el);
    }
    if (value === 'alloff') {
      if (!opened) throw new Error('the setting did not open');
      return allSwitchesOff();
    }
    if (accountRows().length) return perAccount(s, value); // one value per account, not one for all
    let r;
    try {
      r = await choose(value, s.mode);
    } catch (e) {
      const layer = topLayer();
      const only = layer ? switchesIn(layer) : [];
      if (e instanceof DryRun || e instanceof Abort || s.elseToggle === undefined || only.length !== 1) throw e;
      r = await setSwitch(only[0], s.elseToggle);
    }
    return settled(r, s);
  }

  // After choose(): confirm, keep what the pop-up showed, and say what the page gave back.
  async function settled(r, s) {
    if (r.status === 'changed') await confirmIf(s.confirm);
    if (r.was) log(`  before the change the pop-up showed: ${r.was}`);
    if (r.off) { // clicked, and the page still said "not selected": not something to report as done
      const e = new Error(`“${r.detail}” was clicked, but the page still showed it as not selected`);
      e.seen = r.shown;
      throw e;
    }
    if (r.unread) {
      // Without a state to read, every run clicks the option and reports a change. Say so, and keep
      // what the pop-up looked like in the log: it is what is needed to teach the script to read it.
      log(`  the page does not show which option is selected; the pop-up showed: ${r.shown}`);
      return { status: 'changed', detail: `${r.detail} (selected; the page does not show whether it was selected before, so this is reported as a change on every run)`, again: true };
    }
    return r;
  }

  // Some Accounts Center settings are kept per account: the row opens a pop-up, "Select an
  // account", with one button per account that shows the account's name, its product ("Facebook",
  // "Instagram") and the current value. The value there is not an option: clicking it opens the
  // account. (Up to 1.6.3 it was taken for the option, clicked, and reported as a change.)
  const PRODUCTS = ['facebook', 'instagram', 'messenger', 'threads', 'whatsapp', 'meta horizon', 'meta quest'];
  function accountRows() {
    const layer = topLayer();
    if (!layer || !findText(t('selectAccount'), { root: layer, mode: 'includes' }).length) return [];
    const pieces = (el) => {
      const out = [];
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) { const raw = clip(n.nodeValue, 80); if (raw) out.push({ raw, text: norm(raw) }); }
      return out;
    };
    const found = [...layer.querySelectorAll('[role="button"],[role="link"],button,a')]
      .filter((el) => visible(el) && pieces(el).some((x) => PRODUCTS.includes(x.text)));
    return found.filter((el) => !found.some((o) => o !== el && el.contains(o))).map((el) => {
      const all = pieces(el);
      const at = all.findIndex((x) => PRODUCTS.includes(x.text));
      return { el, product: all[at], after: all.slice(at + 1) }; // after the product comes the value
    });
  }

  // Sets a per-account setting on every Facebook account in the pop-up. Accounts of other products
  // are read and reported, not changed: this script is about Facebook.
  async function perAccount(s, value) {
    const wanted = strictness(value[0]);
    const said = [];
    const seen = new Set();
    let changed = false, last = null;
    for (let i = 0; i < 12; i++) {
      const rows = accountRows();
      const next = rows.map((r, n) => ({ ...r, key: `${r.product.text}#${rows.slice(0, n).filter((x) => x.product.text === r.product.text).length}` }))
        .find((r) => !seen.has(r.key));
      if (!next) break;
      seen.add(next.key);
      const shown = next.after.find((x) => hit(x.text, value, s.mode || 'exact'));
      const stricter = next.after.find((x) => wanted >= 0 && strictness(x.text) > wanted);
      const now = next.after.map((x) => x.raw).join(' ') || 'no value';
      if (next.product.text !== 'facebook') {
        said.push(`${next.product.raw} shows “${now}” (not a Facebook account: left as it is)`);
      } else if (shown) {
        said.push(`${next.product.raw}: ${shown.raw}`);
      } else if (stricter) {
        said.push(`${next.product.raw}: ${stricter.raw} (stricter than ${describe(value)}, left as it is)`);
      } else {
        await openRow(next.el);
        last = await settled(await choose(value, s.mode), s);
        if (last.status === 'changed') changed = true;
        said.push(`${next.product.raw}: ${last.detail}`);
        // Back to the list of accounts for the next one.
        if (!(await waitFor(() => accountRows().length, 2000).catch(() => 0))) await goBack(1);
      }
    }
    if (!said.length) throw new Error('the list of accounts was empty');
    return { status: changed ? 'changed' : 'already', detail: said.join(' · '), again: !!(last && last.again) };
  }

  // What is on screen when a step fails, for the log: enough to correct a label, with
  // email addresses and long numbers removed.
  // `front`: only what a person sees there now (or would after scrolling), not the covered pages
  // of a pop-up: under an opened entry lies its whole list, which would fill the snapshot.
  function snapshot(front) {
    const layer = topLayer();
    const root = layer || document.querySelector('[role="main"]') || document.body;
    const KIND = '[role]:not([role="main"]):not([role="dialog"]):not([role="none"]):not([role="presentation"]),a,button,h1,h2,h3,h4,label';
    const texts = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n && texts.length < 60; n = walker.nextNode()) {
      const el = n.parentElement;
      const text = clip(n.nodeValue, 70);
      if (text.length < 3 || !el || /^(SCRIPT|STYLE|NOSCRIPT)$/.test(el.tagName) || !visible(el)) continue;
      if (front && !shown(el) && !scrolledOut(el, front)) continue;
      const holder = el.closest(KIND);
      const kind = holder ? `‹${holder.getAttribute('role') || holder.tagName.toLowerCase()}›` : '';
      if (!texts.some((x) => x.startsWith(text))) texts.push(text + kind);
    }
    if (front && texts.length < 3) return snapshot(); // nothing passes for "in front": show everything
    const named = [...root.querySelectorAll('[role="button"][aria-label],button[aria-label],a[aria-label]')].filter(visible).slice(0, 8)
      .map((el) => `button “${clip(el.getAttribute('aria-label'), 30)}”`);
    const controls = [...root.querySelectorAll('[role="radio"],[role="menuitemradio"],[role="switch"],[role="checkbox"],input[type="checkbox"],input[type="radio"]')]
      .filter(visible).slice(0, 15)
      // An option that carries its own text is named by it; a bare switch by the label next to it.
      .map((el) => `${el.getAttribute('role') || el.type} ${(el.matches('input') ? el.checked : el.getAttribute('aria-checked') === 'true') ? 'on' : 'off'} “${
        clip(el.getAttribute('aria-label') || (/^(radio|menuitemradio|option)$/.test(el.getAttribute('role') || '') && el.textContent) || switchLabel(el), 40)}”`);
    return `${layer ? 'pop-up on' : 'page'} ${location.pathname}${location.search} | text: ${texts.join(' · ')} | controls: ${[...controls, ...named].join(', ') || 'none'}`
      .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email]').replace(/\+?\d[\d\s().-]{6,}\d/g, '[number]').slice(0, 2500);
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
    // Facebook offers this button whether or not past posts were limited before.
    return { status: 'changed', detail: 'past posts limited to Friends (Facebook does not show whether they already were, so this is applied on every run)', again: true };
  }

  // Advertisers that uploaded a list with your details. For each one: open it, open
  // "They uploaded or used a list to reach you", click "Don't allow" for both uses
  // (showing ads and excluding you), go back to the list.
  //
  // Facebook answers an advertiser with its error page unless the page is reached the way it
  // expects, and which way that is has changed over time. So the list is reached through the
  // Ad preferences screens as a person would, and an advertiser is opened in up to three ways,
  // moving on when the first advertisers all come up as the error page:
  //   click  - a plain click on the entry
  //   press  - the full mouse sequence on the entry
  //   direct - load each advertiser's own address (needs the extension or userscript)
  async function runLists() {
    const UNIT = 'lists';
    const base = '/ads/audience_based_advertising';
    const keyOf = (a) => listKey(new URL(a.href, location.origin).pathname);
    const anchors = () => [...document.querySelectorAll('a[href*="/ads/audience_based_advertising/"]')]
      .filter((a) => keyOf(a).replace(/\/+$/, '') !== base);
    const o = state.opts;
    const done = new Set((state.listsDone || []).map(listKey)); // a run saved by an earlier version
    const tally = state.listsTally || (state.listsTally = { changed: 0, none: 0, failed: 0, dry: 0, skipped: 0, bare: 0 });
    const prog = state.adv.lists || (state.adv.lists = { done: 0, total: 0, skipped: 0 });
    const ls = state.lists || (state.lists = { way: 'click', ok: 0, bad: 0, at: null, all: [], since: 0 });
    for (const x of ls.all) x.key = listKey(x.key);
    const known = book;
    const broken = () => findText(t('unavailable'), { mode: 'includes' }).length > 0;
    const NOT_SHOWN = 'Facebook showed “This page isn’t available right now”';

    const sync = () => {
      prog.total = Math.max(prog.total, new Set([...done, ...ls.all.map((x) => x.key), ...anchors().map(keyOf)]).size);
      prog.done = done.size;
      prog.skipped = tally.skipped;
      ui.advertisers(prog);
      eta();
    };

    // On an open advertiser: read it and click "Don't allow" for both uses.
    // nav.depth counts the levels opened, for the way back.
    const handle = async (name, rec, nav) => {
      const uploadedRow = () => findText(t('theyUploaded'), { mode: 'includes' })[0];
      const buttons = () => findText([...t('dontAllow'), ...t('allow')])[0];
      const first = await waitFor(() => uploadedRow() || (broken() && 'broken') || buttons(), 8000).catch(() => null);
      if (first === 'broken') throw new Broken(NOT_SHOWN);
      { // the advertiser's panel, or its page when it opened as one
        const box = topLayer() || document.querySelector('[role="main"]') || document.body;
        const info = advertiserInfo(box);
        Object.assign(rec, { about: [info.category, info.about].filter(Boolean).join(' / '), followers: info.followers, website: info.website });
        rec.detail_text = clip(box.innerText, 1000);
        rec.facebook_page = [...box.querySelectorAll('a[href]')].map((a) => a.href)
          .find((x) => !x.includes(base) && !/accountscenter\.facebook\.com/.test(x)) || '';
      }
      const uploaded = uploadedRow();
      if (uploaded) { click(uploaded); nav.depth++; tally.panel = (tally.panel || 0) + 1; await settle(); }
      rec.list_uses = listUses();

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
      // Only what the page itself confirms counts: an "Allow" button and no "Don't allow" left.
      return { clicks, confirmed: !findText(t('dontAllow')).length && findText(t('allow')).length > 0 };
    };

    // Books one advertiser: counts, the details table, the remembered list, the progress bar.
    const conclude = async (key, name, rec, out, started) => {
      rec.action = 'none';
      if (out.error instanceof DryRun) {
        ls.ok++;
        tally.dry++;
        rec.result = 'would be disabled (dry run)';
      } else if (out.error) {
        tally.failed++;
        rec.result = 'failed';
        rec.error = out.error.message;
        if (out.error instanceof Broken) ls.limited = true; // Facebook's error page: possibly rate limiting
        state.listsSeen = state.listsSeen || snapshot();
      } else {
        ls.ok++;
        if (out.clicks) {
          tally.changed++;
          rec.result = 'disabled';
          rec.action = `clicked “Don’t allow” ${out.clicks}×`;
        } else if (out.confirmed) {
          tally.none++;
          rec.result = 'no change needed';
        } else { // neither "Don't allow" nor "Allow": nothing on this page was recognised
          tally.bare++;
          rec.result = 'no list controls found';
          state.listsSeen = state.listsSeen || snapshot();
        }
      }
      done.add(key);
      state.listsDone = [...done];
      const row = record(rec, key, !out.error && out.confirmed);
      log(advLine(row, done.size, Math.max(prog.total, done.size)));
      tick(UNIT, started);
      await save();
      sync();
    };

    const finish = () => {
      if (!done.size) throw new Error('no list-based advertisers were found');
      const skipped = (tally.skipped ? `, ${tally.skipped} skipped as remembered` : '') +
        // How the result was reached, so that "no change needed" can be checked against one advertiser by hand.
        `. Advertisers opened by ${ls.way === 'direct' ? 'their own address' : ls.way === 'press' ? 'a full mouse click' : 'a click'}; ` +
        `“They uploaded or used a list” panel opened on ${tally.panel || 0}`;
      const bare = tally.bare ? `, ${tally.bare} had no list controls` : '';
      const all = done.size + (ls.left || 0);
      // Advertisers that were listed but never reached: the step is not finished, and says so.
      const left = ls.left ? `. ${ls.left} of the ${all} advertisers were not reached: Facebook stopped showing the rest of the list. ` +
        `Run this task again${o.remember ? '; the ones done are remembered' : ''}` : '';
      const detail = (o.dryRun
        ? `${tally.dry} of ${done.size} advertisers would be disabled${bare}${tally.failed ? `, ${tally.failed} failed` : ''}${skipped}`
        : `${tally.changed} disabled, ${tally.none} needed no change${bare}, ${tally.failed} failed (of ${done.size})${skipped}`) + left;
      // Nothing recognised on any advertiser page means the labels are wrong, not that all is well.
      const lost = tally.failed + tally.bare > 0 && tally.changed + tally.none + tally.dry === 0;
      const status = lost || ls.left ? 'manual' : o.dryRun ? 'dry' : tally.changed ? 'changed' : 'already';
      return { status, detail, seen: tally.failed + tally.bare + (ls.left || 0) ? state.listsSeen : '', limited: !!ls.limited };
    };

    // ---- direct: every advertiser's page is loaded by its address -----------------------------
    const direct = async () => {
      if (MODE === 'console') {
        throw new Error('Facebook only opens these advertisers when each page is loaded on its own. A pasted script cannot survive those page loads: use the extension or the userscript for this task');
      }
      const here = () => location.pathname.replace(/\/+$/, '');
      for (;;) {
        check();
        const cur = ls.at;
        if (cur) {
          if (here() !== new URL(cur.href).pathname.replace(/\/+$/, '')) await travel(UNIT, cur.href); // a reload took us elsewhere
          const rec = { task: 'list-based', name: cur.name, advertiser_id: advertiserId(cur.href), link: cur.href, list_text: cur.name };
          let out;
          try { out = await handle(cur.name, rec, { depth: 0 }); } catch (e) { if (e instanceof Abort) throw e; out = { error: e }; }
          ls.at = null;
          if (out.error instanceof Broken && !ls.ok && ++ls.bad >= 4) {
            throw new Error('Facebook shows “This page isn’t available right now” for every advertiser, however it is opened. Open one by hand from Ad preferences → Manage info → Audience-based advertising to see whether Facebook shows it to you at all');
          }
          await conclude(cur.key, cur.name, rec, out, ls.since || Date.now());
        }
        const next = ls.all.find((x) => !done.has(x.key));
        if (!next) break;
        ls.at = next;
        ls.since = Date.now();
        await travel(UNIT, next.href);
      }
      return finish();
    };
    if (ls.way === 'direct') return direct();

    // ---- reach the list ----------------------------------------------------------------------
    const listOrError = () => anchors().length || (broken() && 'error');
    let found = await waitFor(listOrError, 6000).catch(() => null);
    if (!found && !/audience_based_advertising/.test(location.pathname)) {
      // The way a person gets there: Ad preferences → Manage info → Audience-based advertising.
      const tab = findText(AD_TAB)[0];
      if (tab) { click(tab); await settle(); }
      const row = await waitFor(() => findRow(['audience-based advertising']), 8000, 'row', 300).catch(() => null);
      if (row) {
        await openRow(row);
        found = await waitFor(listOrError, 10000).catch(() => null);
      }
    }
    if (found === 'error') { // Facebook's own error where the list should be
      const shown = clip((findText(t('unavailable'), { mode: 'includes' })[0] || {}).textContent, 80);
      const e = new RowMissing(`Facebook showed “${shown}” instead of the list of advertisers. That is Facebook’s own error and is often temporary: ` +
        'open Ad preferences → Manage info → Audience-based advertising by hand, and run this task again once the list shows there');
      e.facebook = true;
      throw e;
    }
    if (!found) throw new RowMissing('could not find the list of advertisers');
    const home = new URL(location.href);
    const atHome = () => sameUrl(new URL(location.href), home);
    const expand = async () => {
      const more = findText(t('seeMore'));
      if (!more.length) return false;
      more.forEach(click);
      await settle();
      return true;
    };
    // Back to the list after an advertiser. Facebook opens an advertiser either as a page of its
    // own (the address changes) or as a panel over the list. For a page: go back only until the
    // list's address is showing again, never further. For a panel: one Back per level opened.
    const backToList = async (depth, moved) => {
      if (!moved) { await goBack(depth); return; }
      for (let i = 0; i < depth + 2 && !atHome(); i++) {
        const backs = findLabel(t('back'));
        if (backs.length) click(backs[backs.length - 1]); else history.back();
        await settle();
      }
    };

    // Opens the list further, "See more" by "See more", until `until()` is true or nothing more
    // comes. `patient` waits a little for a "See more" that is slow to show, as it is when
    // Facebook answers slowly.
    const grow = async (until, patient) => {
      for (let i = 0, stale = 0, n = anchors().length; i < 80 && stale < 2 && !until(); i++) {
        if (!(await expand())) {
          if (!patient) break;
          await sleep(1500);
        }
        const now = anchors().length;
        stale = now > n ? 0 : stale + 1;
        n = now;
      }
      return until();
    };
    // Count first: open the whole list so the advertiser bar knows its total.
    ui.progress('Counting advertisers…');
    await grow(() => false, false);
    const seenKeys = new Set(ls.all.map((x) => x.key));
    for (const a of anchors()) {
      const key = keyOf(a);
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);
      ls.all.push({ key, href: a.href, name: sayRow(a.closest('[role="listitem"]') || a) || key });
    }
    if (o.skipKnown) {
      let skipped = 0;
      for (const x of ls.all) {
        const was = known.get(x.key);
        if (done.has(x.key) || !was || was.confirmed === false) continue;
        done.add(x.key);
        skipped++;
        record({ task: 'list-based', name: was.name || x.name, advertiser_id: advertiserId(x.href), link: x.href,
          about: was.about, followers: was.followers, website: was.website, list_uses: was.list_uses,
          result: 'skipped (remembered from an earlier run)', action: 'none', remembered: 'yes' });
      }
      tally.skipped += skipped;
      state.listsDone = [...done];
      if (skipped) log(`  ${skipped} advertisers skipped: remembered from earlier runs`);
    }
    sync();
    log(`  ${prog.total} advertisers found, ${prog.total - prog.done} to process`);
    ui.progress('');

    // ---- one advertiser at a time, opened from the list -----------------------------------------
    for (;;) {
      check();
      await expand(); // the list can collapse again after coming back

      const next = anchors().find((a) => !done.has(keyOf(a)));
      if (!next) {
        if (done.size && !anchors().length && (!atHome() || broken())) throw new Renav('the advertiser list is no longer open', done.size);
        // Nothing left on screen is not the end while advertisers that were listed are still to do:
        // Facebook then shows less of the list than it did. Open it further; failing that, load the
        // page afresh, as long as each fresh load gets further; after that, say how many are left.
        const left = ls.all.filter((x) => !done.has(x.key)).length;
        if (left) {
          if (await grow(() => anchors().some((a) => !done.has(keyOf(a))), true)) continue;
          const stall = ls.stall || (ls.stall = { at: -1, n: 0 });
          if (done.size > stall.at) { stall.at = done.size; stall.n = 0; }
          if (++stall.n <= 2) { await save(); throw new Renav('the list stopped showing its remaining advertisers', done.size); }
          ls.left = left;
          ls.limited = true;
          state.listsSeen = state.listsSeen || snapshot();
        }
        break;
      }
      const started = Date.now();
      const key = keyOf(next);
      const item = next.closest('[role="listitem"]');
      const name = sayRow(item || next) || key;
      const rec = { task: 'list-based', name, advertiser_id: advertiserId(next.href), link: next.href,
        list_text: clip((item || next).textContent, 300) };
      const nav = { depth: 0 };
      let moved = false, out;
      try {
        const opener = (item && item.querySelector('a[role="link"]')) || next;
        opener.addEventListener('click', (e) => e.preventDefault(), { once: true }); // let the page open it, not the browser
        if (ls.way === 'press') press(opener); else click(opener);
        nav.depth++;
        await settle();
        moved = !atHome();
        out = await handle(name, rec, nav);
      } catch (e) {
        if (e instanceof Abort) throw e;
        out = { error: e };
      }
      await backToList(nav.depth, moved);

      if (out.error instanceof Broken && !ls.ok) {
        // The error page before any advertiser has opened properly: the way of opening is at fault,
        // not this advertiser. It is not booked; it is tried again the next way.
        ls.limited = true;
        if (!ls.told) { ls.told = true; log(`  ${NOT_SHOWN}. ${LIMIT_NOTE}; the script first tries opening advertisers another way.`); }
        if (++ls.bad >= 2) {
          ls.bad = 0;
          ls.way = ls.way === 'click' ? 'press' : 'direct';
          log(`  ${NOT_SHOWN} for the first advertisers; opening them another way (${ls.way})`);
          if (ls.way === 'direct') { await save(); return direct(); }
        }
        await save();
        continue;
      }
      await conclude(key, name, rec, out, started);
      if (done.size >= 2000) break;
    }
    return finish();
  }

  // Walks a list one entry at a time: open it, run `action`, come back.
  //   action(got, name) -> { status: 'changed' | 'already', info, verify }
  //   words     - how to phrase the result from the counts
  //   each()    - told about every entry: (name, outcome, done, total, info, error, confirmed)
  //   already() - true for an entry that needs no visit
  //   ready()   - what shows that the page of an opened entry is in front (its control), or null.
  //               With it, an entry only counts as opened once that is seen.
  //   reopen()  - opens the list again from the page it is reached from, when "Back" went past it.
  //
  // Facebook draws the page of an opened entry over the list, inside the same pop-up, and leaves
  // the covered list in the document. The opened page has list items of its own ("Facebook Page",
  // "Website", the line with "Unhide"…), some with a button that does harm when clicked. So what
  // an entry is gets decided the way a person would: only rows that sit with the rows in front,
  // and only while those are in front. Nothing else in the pop-up is ever clicked as an entry.
  async function drillList(doneKey, action, { words, each = () => {}, ignore = [], already, panel, probe, ready, reopen } = {}) {
    const scope = () => topLayer() || document.body;
    const skip = [...t('back'), ...t('close'), ...t('seeAll'), ...t('seeMore'), ...t('confirm'), ...ignore];
    // A long list is looked at many times in a row. What was found is kept for a moment, and thrown
    // away after everything this function does to the page.
    let memo = { at: 0 };
    const kept = (what, find) => {
      if (Date.now() - memo.at > 80) memo = { at: Date.now() };
      if (!(what in memo)) memo[what] = find();
      return memo[what];
    };
    const fresh = () => { memo = { at: 0 }; };
    // What the entries are made of, list items or plain buttons, is settled on the first look at the
    // list and kept: a covered page of the same pop-up can hold the other kind.
    let kind = '', lastKind = '';
    const all = () => kept('all', () => {
      // A row the caller names is not an entry ("See less · 919 topics" is not a topic).
      const items = [...scope().querySelectorAll('[role="listitem"],[role="row"]')].filter((el) => visible(el) && norm(el.textContent) &&
        !ignore.includes(norm(firstText(el))));
      lastKind = kind || (!topLayer() || items.some((el) => shown(el) || scrolledOut(el)) ? 'items' : 'buttons');
      if (lastKind === 'items') return items;
      // A pop-up whose entries are plain buttons or links.
      return [...scope().querySelectorAll('[role="button"],[role="link"],a[href],[tabindex="0"]')].filter((el) => {
        const text = norm(el.textContent);
        return visible(el) && text.length > 1 && text.length < 120 && !skip.includes(text) && !skip.includes(norm(el.getAttribute('aria-label'))) &&
          !skip.includes(norm(firstText(el)));
      });
    });
    // An entry is known by its name: its status line ("You hid their ads") changes as the run goes.
    const keyOf = (el) => norm(firstText(el));
    // The heading a person sees at the top of what is in front. The list this step works on has one;
    // another list with another heading is another page, even when it shows some of the same names.
    const headings = () => [...scope().querySelectorAll('h1,h2,[role="heading"]')].filter((el) => norm(el.textContent) && visible(el));
    const headText = (el) => norm(el.textContent).slice(0, 80);
    const headNow = () => { const el = headings().find(shown); return el ? headText(el) : ''; };
    // The heading of the list, as it was when this page load first showed the list. Not kept across
    // page loads: the list is found afresh after each.
    let head = '';
    // Another page is in front: it shows a heading, and the list's own is covered. A heading that
    // was merely scrolled out of view with the list is still there (a live run of 1.7.1 lost its
    // list that way).
    const elsewhere = () => {
      if (!head || headings().some((el) => headText(el) === head && (shown(el) || scrolledOut(el)))) return false;
      return !!headNow();
    };
    const done = new Set(state[doneKey] || []);
    const names = new Set(state[doneKey + 'Names'] || []); // every entry the list has shown
    const count = state[doneKey + 'Count'] || (state[doneKey + 'Count'] = { changed: 0, dry: 0, same: 0, failed: 0, unsure: 0, known: 0 });
    count.unsure = count.unsure || 0; // a run saved by an earlier version has no such counts
    count.known = count.known || 0;
    let fails = 0, note = '';
    let seen = state[doneKey + 'Seen'] || ''; // what the page showed at the first failure, kept across page loads

    // The element that holds the list's rows, while the list is what is in front; null otherwise.
    // Two rows known to be entries (any row, on the first look) must be in front: an opened page
    // shows one known name at most, the entry's own. One row is enough when it is still to do and is
    // not the entry being handled: that cannot be an opened entry's page, and a list that loses the
    // entries that are done ends with a single row. And no opened page may be in front.
    let current = '';
    const listBox = () => kept('box', () => {
      const front = all().filter((el) => (!names.size || names.has(keyOf(el))) && shown(el));
      const keys = new Set(front.map(keyOf));
      if (keys.size < Math.min(2, names.size || 1) && ![...keys].some((k) => names.size && k !== current && !done.has(k))) return null;
      if (panel && panel()) return null;
      if (elsewhere()) return null; // another page's list
      let box = front[0].parentElement;
      for (const el of front) while (box && !box.contains(el)) box = box.parentElement;
      return box;
    });
    // In a long list, the one container that holds most of what is listed: the list itself. Tabs,
    // filters and other buttons of the pop-up sit outside it and are not entries.
    // Rows of a page that lies covered under the one in front are not counted.
    const listRoot = () => kept('root', () => {
      const areas = new Map();
      const items = all().filter((el) => shown(el) || scrolledOut(el, areas));
      if (items.length < 12) return null;
      const tally = new Map();
      for (const el of items) for (let p = el.parentElement, d = 0; p && d < 8; p = p.parentElement, d++) tally.set(p, (tally.get(p) || 0) + 1);
      let best = null;
      for (const [p, n] of tally) if (n >= items.length * 0.7 && (!best || best.contains(p))) best = p; // the deepest such
      return best;
    });
    const inRoot = (el) => { const root = listRoot(); return !root || root.contains(el); };
    // What can be learned as entries now: the rows that sit with the rows in front.
    const rows = () => { const box = listBox(); return box ? all().filter((el) => box.contains(el) && inRoot(el)) : []; };
    // What can be picked now: every listed row that was learned as an entry, wherever in the list
    // it is. (A long list comes in several containers; the rows in front are only one of them.)
    const entries = () => (listBox() ? all().filter((el) => names.has(keyOf(el)) && inRoot(el)) : []);
    const inEntry = (el) => all().some((item) => names.has(keyOf(item)) && item.contains(el));
    const listShowing = () => !!listBox();
    // The list can be in front and yet show none of its rows: it was scrolled to a part without any.
    // A row that is out of view, not covered, is scrolled back in before the list is taken for gone.
    const bring = () => {
      if (listBox()) return true;
      const row = all().find((el) => (!names.size || names.has(keyOf(el))) && !shown(el) && scrolledOut(el));
      if (!row) return false;
      try { row.scrollIntoView({ block: 'center' }); } catch (e) { /* ignore */ }
      fresh();
      return !!listBox();
    };
    const learn = () => {
      const list = rows();
      for (const el of list) names.add(keyOf(el));
      if (list.length) {
        if (!kind) kind = lastKind;
        if (!head) head = headNow();
      }
      state[doneKey + 'Names'] = [...names];
      return names.size;
    };
    // The next entry to open: the first one, in the list's order, that a person could click, scrolled
    // into view when it is not. A row with the same name on a covered page of the pop-up stays
    // covered whatever is scrolled: it is passed over, and only taken when nothing else is left.
    const covered = new WeakSet();
    const next = async () => {
      const open = entries().filter((x) => !done.has(keyOf(x)));
      for (const el of open) {
        if (covered.has(el)) continue;
        if (shown(el)) return el;
        try { el.scrollIntoView({ block: 'center' }); } catch (e) { /* ignore */ }
        if (await waitFor(() => shown(el), 500, 'the row', 50).catch(() => false)) { fresh(); return el; }
        covered.add(el);
      }
      fresh();
      return open[0];
    };
    // Close whatever is in front of the list: the Back button of the page in front, one press at a
    // time, giving a page that closes slowly the time to go before pressing anything else.
    const backToList = async () => {
      fresh();
      for (let i = 0; i < 4 && !listShowing(); i++) {
        if (await waitFor(listShowing, i ? 3000 : 1000).catch(() => false)) break;
        const backs = findLabel(t('back'), scope());
        const btn = backs.filter(shown).pop() || backs.pop() || findLabel(t('back')).pop();
        if (!btn) { bring(); break; }
        click(btn);
        await settle();
        fresh();
      }
      return (await waitFor(listShowing, 3000).catch(() => false)) === true;
    };
    // The list cannot be brought back, or has stopped showing entries it showed before: load the
    // page afresh, as long as each fresh load gets further. After that, say what was left.
    const startOver = async (why, left) => {
      const stall = state[doneKey + 'Stall'] || (state[doneKey + 'Stall'] = { at: -1, n: 0 });
      if (done.size > stall.at) { stall.at = done.size; stall.n = 0; }
      if (++stall.n <= 2) {
        log(`  ${why} (${done.size} of ${names.size} done): loading the page again`);
        await save();
        throw new Renav(why, done.size);
      }
      log(`  ${why} (${done.size} of ${names.size} done). The pop-up showed: ${snapshot(new Map())}`);
      note = left;
    };

    await waitFor(() => { fresh(); return all().some(shown) || (bring() && all().some(shown)); }, 8000, 'a list on this page');
    // More entries: a "See more" in the pop-up, or the end of a list that loads as it scrolls.
    // Keeps going while the list grows, until `until()` is true or nothing more comes.
    const load = async (until) => {
      if (!topLayer()) return false;
      const started = Date.now();
      for (let i = 0, stale = 0; i < 120 && stale < 2 && Date.now() - started < 240000; i++) {
        check();
        fresh();
        if (until() || !bring()) break;
        const before = all().length, known = names.size;
        const btns = searchText(scope(), [...t('seeMore'), ...t('seeAll')], 'exact').filter(shown);
        if (btns.length) { btns.forEach(click); await settle(); fresh(); }
        const list = rows();
        if (list.length) { try { list[list.length - 1].scrollIntoView({ block: 'end' }); } catch (e) { /* ignore */ } await settle(); fresh(); }
        learn();
        stale = all().length > before || names.size > known ? 0 : stale + 1;
        ui.progress(`${names.size} entries found…`);
      }
      fresh();
      return until();
    };
    const more = () => load(() => entries().some((x) => !done.has(keyOf(x))));
    // Count first: load the whole list, so the bar has its total and nothing is left unseen at the end.
    learn();
    await load(() => false);
    ui.progress('');
    each(null, null, done.size, learn());
    // A few failures in a row end the step: three when nothing has worked yet (the labels are wrong),
    // more once entries are being handled (single entries can fail to open).
    const tolerated = () => (count.changed + count.dry + count.same + count.unsure ? 8 : 3);
    while (fails < tolerated() && done.size < 2000) {
      check();
      fresh();
      if (!bring() && !(await backToList())) {
        if (names.size && [...names].every((n) => done.has(n))) break; // nothing the list held is left to do
        const again = reopen && (await reopen()) && (await waitFor(() => { fresh(); return listShowing(); }, 6000).catch(() => false));
        if (!again) {
          await startOver('the list is no longer on screen', ', the list could not be brought back on screen: run this task again');
          break;
        }
      }
      learn();
      const el = await next();
      if (!el) {
        if (await more()) continue;
        const missing = names.size - done.size;
        if (missing > 0) await startOver('the list stopped showing its remaining entries', `, ${missing} more were listed at first but are no longer shown: run this task again`);
        break;
      }
      const key = keyOf(el);
      const name = firstText(el);
      current = key;
      let outcome, info = {}, error = '', confirmed = true;
      const state0 = already ? already(el) : false;
      if (state0 === 'known') { // done in an earlier run and remembered: not opened
        count.known++;
        outcome = 'known';
      } else if (state0) {
        count.same++;
        outcome = 'same';
      } else {
        try {
          const target = el.querySelector('a,[role="button"],[role="link"]') || el;
          const was = probe ? probe() : null; // what was on screen before, to tell what the click brought
          let got = null;
          click(target);
          await settle();
          if (ready) { // the entry counts as opened only once its own page is in front
            const there = () => { fresh(); return ready(was, name, { inEntry }); };
            got = await waitFor(there, 5000).catch(() => null);
            if (!got && listShowing()) { // the click did nothing: the whole sequence a mouse produces
              press(target);
              await settle();
              got = await waitFor(there, 5000).catch(() => null);
            }
            if (!got) throw new Error('its page did not open');
          }
          const r = await action(got, name);
          info = r.info || {};
          if (r.status === 'changed') {
            await confirmIf();
            confirmed = r.verify ? await r.verify() : true; // only what the page then shows counts
            if (confirmed) count.changed++; else count.unsure++;
            outcome = 'changed';
          } else { count.same++; outcome = 'same'; }
          fails = 0;
        } catch (e) {
          if (e instanceof Abort) throw e;
          info = e.info || {};
          if (e instanceof DryRun) { count.dry++; outcome = 'dry'; fails = 0; } else {
            count.failed++;
            outcome = 'failed';
            error = e.message;
            fails++;
            const shot = snapshot(new Map());
            if (!seen) { seen = shot; state[doneKey + 'Seen'] = seen; }
            // In the log once for each kind of failure: it is what shows how the page differs from what was expected.
            const kinds = state[doneKey + 'Kinds'] || (state[doneKey + 'Kinds'] = []);
            if (!kinds.includes(error) && kinds.length < 6) { kinds.push(error); log(`  “${name}” ${error}. The page showed: ${shot}`); }
          }
        }
        await backToList();
      }
      done.add(key); // booked once, whatever happens next
      current = '';
      state[doneKey] = [...done];
      each(name, outcome, done.size, Math.max(names.size, done.size), info, error, confirmed);
      await save();
    }
    const said = words || { dry: (c) => `${c.dry} would be changed`, done: (c) => `${c.changed} changed of ${done.size}` };
    if (fails >= tolerated() && !(count.changed + count.dry + count.same + count.unsure + count.known)) {
      const e = new Error('none of the entries in the list could be handled');
      e.seen = seen;
      throw e;
    }
    if (fails >= tolerated()) note += `, stopped after ${fails} entries in a row could not be handled`;
    const failed = (count.unsure ? `, ${count.unsure} clicked but not shown as changed afterwards` : '') +
      (count.failed ? `, ${count.failed} could not be handled` : '') + note;
    if (state.opts.dryRun) return { status: 'dry', detail: said.dry(count) + failed, seen };
    // Left unfinished with nothing changed is not "already set": the rest was never looked at.
    return { status: count.changed + count.unsure ? 'changed' : note ? 'manual' : 'already', detail: said.done(count) + failed, seen };
  }

  // "Hide ads" for every advertiser Facebook lists.
  async function runSeen() {
    // Only inside the open pop-up when there is one: a "See all" on the page behind it is another list.
    const expand = searchText(topLayer() || document.body, [...t('seeMore'), ...t('seeAll')], 'exact');
    if (expand.length) { expand.forEach(click); await settle(); }
    await waitFor(() => findText(t('hideAds')).length, 5000).catch(() => null);

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
      prog.done++;
      prog.total = Math.max(prog.total, prog.done);
      log(advLine(record(rec), prog.done, prog.total));
      tick('seen', started);
      ui.advertisers(prog);
      eta();
    }
    if (n + dry) return state.opts.dryRun ? { status: 'dry', detail: `${dry} advertisers would be hidden` } : { status: 'changed', detail: `${n} advertisers hidden` };

    // No "Hide ads" buttons in the list itself: open each advertiser and look inside.
    const listed = /advertis/i.test(location.pathname) ||
      findText(['advertisers you saw ads from', "advertisers you've seen", 'advertisers you have seen'], { mode: 'includes' }).length > 0;
    if (!listed) throw new Error('the advertisers list was not found');

    // An advertiser's page has "Hide ads", or "Unhide" when its ads are hidden already. Only one
    // that a person would see counts: pages opened earlier can still be in the document, covered.
    const control = () => {
      const root = topLayer() || document.body;
      const hide = searchText(root, t('hideAds'), 'exact');
      const unhide = searchText(root, t('unhide'), 'exact');
      const front = (list) => list.filter(shown).pop();
      let el = front(hide) || front(unhide);
      if (!el) { // further down its page than the pop-up shows
        for (const c of [...hide, ...unhide].reverse()) {
          try { c.scrollIntoView({ block: 'center' }); } catch (e) { /* ignore */ }
          if (shown(c)) { el = c; break; }
        }
      }
      return el ? { el, hide: hide.includes(el) } : null;
    };
    // What the page in front says about the advertiser, read from the heading that carries its name.
    // When no heading does, nothing is read: details of another advertiser would be worse than none.
    const details = (ctl, name) => {
      const root = topLayer() || document.body;
      const want = norm(name);
      const heads = [...root.querySelectorAll('h1,h2,[role="heading"]')].filter((h) => {
        const text = norm(h.textContent);
        return visible(h) && text.length > 1 && (text === want || text.startsWith(want) || want.startsWith(text));
      });
      const head = heads.filter(shown).pop() || heads.pop();
      let box = head ? head.parentElement : null;
      while (box && !box.contains(ctl)) box = box.parentElement;
      return box ? advertiserInfo(box, head) : {};
    };

    let last = Date.now();
    const same = (c) => (c.same ? `, ${c.same} already hidden` : '');
    return drillList('seenDone', async (ctl, name) => {
      const info = details(ctl.el, name);
      if (!ctl.hide) return { status: 'already', info };
      try { act(ctl.el, `hide ads from ${name}`); } catch (e) { e.info = info; throw e; }
      await settle();
      const verify = async () => !!(await waitFor(() => { const c = control(); return c && !c.hide; }, 4000).catch(() => null));
      return { status: 'changed', info, verify };
    }, {
      panel: control,
      ready: () => control(),
      ignore: ['all advertisers', 'all accounts'], // the filters above the list
      // The list already says which advertisers are hidden. They are only opened when their details are wanted.
      // With details wanted, a hidden advertiser is still opened once; after that its details come from the database.
      already: (el) => hit(norm(el.textContent), t('hidden'), 'includes') &&
        (!state.opts.saveInfo || (state.opts.skipKnown && (book.get('seen:' + norm(firstText(el))) || {}).confirmed === true)),
      words: {
        dry: (c) => `${c.dry} advertisers would be hidden${same(c)}`,
        done: (c) => `${c.changed} advertisers hidden${same(c)}`,
      },
      each: (name, outcome, did, total, info, error, confirmed) => {
        prog.done = did;
        prog.total = Math.max(prog.total, total);
        ui.advertisers(prog);
        if (name) {
          const key = 'seen:' + norm(name);
          const was = book.get(key) || {}; // what an earlier run read, when this one did not open the advertiser
          const got = info && (info.category || info.about || info.followers || info.website) ? info : was;
          const result = outcome === 'changed' && !confirmed ? '“Hide ads” clicked, not shown as hidden afterwards'
            : { changed: 'ads hidden', dry: 'would be hidden (dry run)', same: 'already hidden', failed: 'failed' }[outcome];
          const rec = record({ task: 'seen', name, category: got.category, about: got.about,
            followers: got.followers, website: got.website, error, action: outcome === 'changed' ? 'clicked “Hide ads”' : 'none', result },
          key, confirmed && (outcome === 'changed' || outcome === 'same'));
          log(advLine(rec, did, prog.total));
          tick('seen', last);
        }
        last = Date.now();
        eta();
      },
    });
  }

  // The Ad topics pop-up, opened from the "Customize ads" tab. Null when its section is not there.
  async function openAdTopics() {
    const tab = findText(['customize ads', 'customise ads'])[0];
    if (tab) { click(tab); await settle(); }
    const find = () => findText(['ad topics'])[0] || findText(['ad topics'], { mode: 'includes' })[0];
    const label = await waitFor(find, 10000).catch(() => null);
    if (!label) return null;
    const all = rowButton(label, [...t('seeAll'), 'view and manage topics', 'see all topics']); // "See all" next to it
    await openRow(all || label);
    return label;
  }
  // A button of the pop-up by its words, and whether a person could click it now (scrolled into
  // view when it is not): a covered page of the pop-up stays in the document with its buttons.
  const BTN = '[role="button"],button,a,[role="link"]';
  const layerButton = (words) => searchText(topLayer() || document.body, words, 'exact').map((el) => el.closest(BTN)).filter(Boolean)[0] || null;
  const inView = async (el) => {
    if (el && !shown(el)) { try { el.scrollIntoView({ block: 'center' }); } catch (e) { /* ignore */ } await sleep(300); }
    return !!el && shown(el);
  };

  // "Special topics", a row of the Ad topics pop-up, opens a page with one switch per topic (seen in
  // the log of a live run of 1.7.2): on is the normal state, off is "See less", and the row then
  // says so. The words "See less" there sit in the switch's label: a click on them flips the
  // switch, whichever way it is. Only the switches are read and clicked.
  const SPECIAL = ['special topics'];
  const specialSwitches = () => {
    const layer = topLayer();
    if (!layer) return [];
    const areas = new Map();
    return switchesIn(layer).map((sw) => {
      const row = sw.closest('label') || sw;
      const name = clip((row === sw ? switchLabel(sw) : firstText(row)).replace(/\s*see (less|fewer)\s*$/i, ''), 80);
      return { sw, row, name };
    }).filter((x) => x.name && (shown(x.row) || scrolledOut(x.row, areas)));
  };
  // From the first page of the pop-up, or from a page opened from it: "Back" until the row is there.
  async function openSpecial() {
    await waitFor(() => layerButton(SPECIAL), 6000).catch(() => null);
    for (let i = 0; i < 3 && !(await inView(layerButton(SPECIAL))); i++) {
      const back = findLabel(t('back'), topLayer() || document.body).filter(shown).pop();
      if (!back) break;
      click(back);
      await settle();
    }
    const row = layerButton(SPECIAL);
    if (!(await inView(row))) return false;
    click(row);
    await settle();
    const there = () => !!topLayer() && [...topLayer().querySelectorAll('h1,h2,[role="heading"]')].some((el) => SPECIAL.includes(norm(el.textContent)) && shown(el)) &&
      specialSwitches().length > 0;
    return !!(await waitFor(there, 6000).catch(() => false));
  }

  // Every special topic set to "See less": its switch turned off.
  async function runSpecial() {
    if (!(await openAdTopics())) throw new RowMissing('could not find the “Ad topics” section');
    if (!(await openSpecial())) throw new RowMissing('could not find “Special topics” in the Ad topics pop-up');
    const names = [...new Set(specialSwitches().map((x) => x.name))];
    const out = { changed: [], same: [], dry: [], unsure: [] };
    let n = 0;
    for (const name of names) {
      check();
      const find = () => specialSwitches().find((x) => x.name === name);
      const it = find();
      if (!it) continue;
      let result, action = 'none';
      if (!switchOn(it.sw)) {
        out.same.push(name);
        result = 'already “See less”';
      } else {
        try {
          const layer = topLayer();
          act(it.sw, `turn off “${name}”`);
          await settle();
          if (topLayer() !== layer) await confirmIf(); // a question in a pop-up of its own
          action = 'switched off';
          const off = await waitFor(() => { const now = find(); return !!now && !switchOn(now.sw); }, 4000).catch(() => false);
          if (off) { out.changed.push(name); result = 'set to “See less”'; } else { out.unsure.push(name); result = 'switched off, but shown as on afterwards'; }
        } catch (e) {
          if (!(e instanceof DryRun)) throw e;
          out.dry.push(name);
          result = 'would be set to “See less” (dry run)';
        }
      }
      log(advLine(record({ task: 'topic', name: `${name} (special topic)`, result, action }, null, false), ++n, names.length));
    }
    if (!n) throw new Error('“Special topics” opened, but no switches were found in it');
    const list = (a) => `${a.length} ${a === out.dry ? 'would be set to “See less”' : a === out.changed ? 'set to “See less”' : 'switched off but shown as on afterwards'} (${a.join(' · ')})`;
    const detail = [out.dry, out.changed, out.unsure].filter((a) => a.length).map(list)
      .concat(out.same.length ? [`${out.same.length} already “See less”`] : []).join(', ') +
      (out.unsure.length ? ': check those by hand' : '') + '. The choice applies to every account in this Accounts Center';
    const status = out.dry.length ? 'dry' : out.changed.length ? 'changed' : out.unsure.length ? 'manual' : 'already';
    return { status, detail, seen: out.unsure.length ? snapshot(new Map()) : undefined };
  }

  // "See less" for every ad topic Facebook lists. Works like the advertiser steps: a count and a
  // bar, one line and one table row per topic, and topics that are done are remembered.
  async function runTopics() {
    const label = await openAdTopics();
    const same = (c) => (c.same ? `, ${c.same} already “See less”` : '') + (c.known ? `, ${c.known} skipped as remembered` : '');
    const words = {
      dry: (c) => `${c.dry} topics would be set to “See less”${same(c)}`,
      done: (c) => `${c.changed} topics set to “See less”${same(c)}`,
    };
    if (!label) {
      // After a page load in the middle of the step, Facebook can answer with a page that stays
      // blank. What was done before that still counts, and is said.
      const c = state.topicsDoneCount;
      if (!c || !(state.topicsDone || []).length) throw new RowMissing('could not find the “Ad topics” section');
      const blank = (document.body.innerText || '').trim().length < 30;
      return {
        status: 'manual', limited: blank, seen: state.topicsDoneSeen || snapshot(),
        detail: `${state.opts.dryRun ? words.dry(c) : words.done(c)}${c.failed ? `, ${c.failed} could not be handled` : ''}. ` +
          `Then ${blank ? 'Facebook showed a blank page' : 'the “Ad topics” section was not found'} after the page was loaded again, ` +
          `so the rest of the list was not reached. Run this task again${state.opts.remember ? '; the topics done are remembered' : ''}`,
      };
    }

    // The pop-up opens on a summary (seen in a live run of 1.7.1): three topics, "Special topics",
    // and the topics already chosen. The topics themselves are behind "View and manage topics".
    const VIEW = ['view and manage topics', 'view all topics', 'see all topics'];
    // Only a button a person could click now: the summary stays in the document under the list.
    const enter = async (wait) => {
      const btn = await waitFor(() => layerButton(VIEW), wait).catch(() => null);
      if (!(await inView(btn))) return false;
      click(btn);
      await settle();
      await waitFor(() => { const b = layerButton(VIEW); return !b || !shown(b); }, 8000).catch(() => null);
      return true;
    };
    const summary = await enter(4000);
    if (summary && !state.topicsEntered) { state.topicsEntered = true; log('  the topics are listed behind “View and manage topics”: opened'); }

    const prog = state.adv.topics || (state.adv.topics = { done: 0, total: 0, skipped: 0, noun: 'Topics' });
    ui.advertisers(prog);
    // The "See less" a person would see right now. One can also be part of the list itself (a tab,
    // a filter, the value shown on a topic), so a topic only counts as opened when a "See less"
    // turns up that was not there before the topic was clicked, and is not inside a topic's row.
    const options = () => findOption(t('seeLess'), 'exact').filter(shown);
    const pieces = (el) => {
      const out = [];
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) { const text = norm(n.nodeValue); if (text) out.push(text); }
      return out;
    };
    let last = Date.now();
    const res = await drillList('topicsDone', async ({ opt, others }) => {
      // A topic's page has one "See less". A page that brings several is something else, and what a
      // click does there is not known: nothing is clicked.
      if (others >= 1) throw new Error('opens a page with several “See less” choices: not changed, set it by hand');
      // The option that came up, or the one the page drew in its place.
      const r = await pick(() => (opt.isConnected && visible(opt) ? opt : options()[0] || null));
      if (r.status !== 'changed') return { status: 'already' };
      if (r.off) throw new Error('“See less” was clicked, but the page still showed it as not selected');
      return { status: 'changed' };
    }, {
      ignore: [...t('seeLess'), 'no preference', 'learn more', ...SPECIAL], // "Special topics" is a page of switches, not a topic
      reopen: summary ? () => enter(1500) : null,
      probe: () => new Set(options()),
      ready: (was, name, { inEntry }) => {
        const came = options().filter((o) => !was.has(o) && !inEntry(o));
        return came.length ? { opt: came[0], others: came.length - 1 } : null;
      },
      // Not opened: a topic remembered as done, or one whose row already says "See less".
      already: (el) => {
        if (pieces(el).slice(1).some((x) => t('seeLess').includes(x))) return true;
        return state.opts.skipKnown && (book.get('topic:' + norm(firstText(el))) || {}).confirmed === true ? 'known' : false;
      },
      words,
      each: (name, outcome, did, total, info, error, confirmed) => {
        prog.done = did;
        prog.total = Math.max(prog.total, total);
        if (outcome === 'known') prog.skipped = (prog.skipped || 0) + 1;
        ui.advertisers(prog);
        if (name) {
          const result = outcome === 'changed' && !confirmed ? '“See less” clicked, not shown as selected afterwards'
            : { changed: 'set to “See less”', dry: 'would be set to “See less” (dry run)', same: 'already “See less”',
              known: 'skipped (remembered from an earlier run)', failed: 'failed' }[outcome];
          const rec = record({ task: 'topic', name, result, error, action: outcome === 'changed' ? 'selected “See less”' : 'none',
            remembered: outcome === 'known' ? 'yes' : undefined },
          outcome === 'known' ? null : 'topic:' + norm(name), confirmed && (outcome === 'changed' || outcome === 'same'));
          if (outcome !== 'known') log(advLine(rec, did, prog.total)); // the skipped ones get one line together, below
          if (outcome !== 'known') tick('topics', last);
        }
        last = Date.now();
        eta();
      },
    });
    const known = (state.topicsDoneCount || {}).known || 0;
    if (known) log(`  ${known} topics skipped: remembered from earlier runs`);
    // The special topics are another task's. When it is not part of this run, they are looked at
    // and the report says how they stand; nothing there is clicked.
    if (!state.opts.tasks.includes('special')) {
      try {
        if (await openSpecial()) {
          const all = specialSwitches();
          const still = all.filter((x) => switchOn(x.sw)).map((x) => x.name);
          const note = still.length ? `${still.length} of ${all.length} are not set to “See less” (${still.join(' · ')}); the task “Special ad topics” sets them`
            : `all ${all.length} are set to “See less”`;
          log(`  Special topics, looked at and left as they are: ${note}`);
          res.detail += `. Special topics: ${note}`;
        }
      } catch (e) {
        if (e instanceof Abort) throw e;
      }
    }
    return res;
  }

  // Finds a row, walking down the Accounts Center menus to it when it is not on screen yet.
  async function reach(target, via, what) {
    const find = () => findText(target, { mode: 'includes' })[0];
    let el = await waitFor(find, 6000).catch(() => null);
    for (const step of via) {
      if (el) break;
      const next = findText(step, { mode: 'includes' })[0];
      if (!next) continue;
      await openRow(next);
      el = await waitFor(find, 5000).catch(() => null);
    }
    if (!el) throw new RowMissing(`could not find ${what}`);
    return el;
  }

  const OFF_META_PATH = [['your information and permissions'],
    ['your activity off meta technologies', 'activity off meta', 'off-meta activity', 'off-facebook activity'],
    ['activity from other businesses']]; // what Meta is folding it into

  // "Activity from other businesses" replaced the off-Meta activity page on many accounts. It
  // has no history to clear and nothing to disconnect: one choice, whether Meta may use what
  // other businesses send it about you.
  const OTHER_BUSINESSES = ["don't allow us to use*", "don't use*", 'not using*'];
  const REPLACED = 'Meta replaced off-Meta activity with “Activity from other businesses”';
  const replacement = () => findOption(OTHER_BUSINESSES, 'exact')[0];

  async function runOffClear() {
    let row;
    try {
      row = await reach(['clear previous activity', 'clear history', 'clear activity', 'disconnect previous activity'], OFF_META_PATH, '“Clear previous activity”');
    } catch (e) {
      const now = replacement();
      if (!(e instanceof RowMissing) || !now) throw e;
      const chosen = checkedState(now) === true;
      return { status: 'info', detail: `${REPLACED}, which keeps no history to clear. ` +
        (chosen ? `It is set to “${say(now)}”` : `“${say(now)}” is not selected there yet: the “Disconnect future off-Meta activity” task selects it`) };
    }
    if (!(await openRow(row))) throw new Error('the confirmation did not open');
    const btn = findText(['clear previous activity', 'clear history', 'clear']).filter((el) => el !== row).pop();
    if (!btn) throw new Error('the “Clear” button was not found');
    act(btn, 'clear previous off-Meta activity');
    await settle();
    return { status: 'changed', detail: 'previous activity cleared' };
  }

  async function runOffFuture() {
    let row;
    try {
      row = await reach(['manage future activity', 'disconnect future activity', 'future activity'], OFF_META_PATH, '“Manage future activity”');
    } catch (e) {
      if (!(e instanceof RowMissing) || !replacement()) throw e;
      const picked = await choose(OTHER_BUSINESSES); // the choice that takes its place
      if (picked.status === 'changed') await confirmIf(['confirm', 'save', 'done']);
      return { status: picked.status, detail: `${REPLACED}: ${picked.detail}` };
    }
    await openRow(row);
    const again = findText(['manage future activity']).filter((el) => el !== row).pop(); // explainer screen
    if (again) await openRow(again);
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

  // Turns off every switch on a settings page whose label is about AI. Labels that
  // already describe a restriction ("Hide…", "Block…") are left alone.
  async function scanAi() {
    const root = () => document.querySelector('[role="main"]') || document.body;
    await waitFor(() => switchesIn(root()).length, 4000).catch(() => null);
    const seen = new Set();
    const off = [], would = [];
    for (let i = 0; i < 20; i++) {
      check();
      const sw = switchesIn(root()).find((x) => {
        const label = norm(switchLabel(x));
        return label && !seen.has(label) && AI_WORDS.test(label) && !AI_SKIP.test(label.slice(0, 40));
      });
      if (!sw) break;
      const label = switchLabel(sw);
      seen.add(norm(label));
      if (!switchOn(sw)) continue;
      try {
        act(sw, `turn off “${label}”`);
        off.push(label);
        await settle();
        await confirmIf([...t('confirm'), 'turn off']);
      } catch (e) {
        if (!(e instanceof DryRun)) throw e;
        would.push(label);
      }
    }
    if (!seen.size) return { status: 'info', detail: 'no AI switches on this page' };
    if (would.length) return { status: 'dry', detail: `would turn off: ${would.join('; ')}` };
    return off.length ? { status: 'changed', detail: `turned off: ${off.join('; ')}` }
      : { status: 'already', detail: `${seen.size} AI switch${seen.size > 1 ? 'es' : ''} already off` };
  }

  // "Categories used to reach you": one row per profile field (employer, job title, education,
  // relationship status) that says whether it is used, and a list of other categories to remove.
  async function adCategories() {
    const tab = findText(AD_TAB)[0];
    if (tab) { click(tab); await settle(); }
    const row = await waitFor(() => findRow(['categories used to reach you']), 10000, 'row', 300).catch(() => null);
    if (!row) throw new RowMissing('could not find the “Categories used to reach you” row');
    if (!(await openRow(row))) throw new Error('the setting did not open');
    const layer = () => topLayer() || document.body;
    if (switchesIn(layer()).length) return allSwitchesOff(); // older layout: one switch per category

    const FIELDS = ['employer', 'job title', 'education', 'relationship status'];
    const OFF = ['not used', 'unspecified', 'not using', 'off'];
    const notes = [];
    let changed = 0, found = 0;
    for (const field of FIELDS) {
      check();
      const label = searchText(layer(), [field], 'exact')[0];
      if (!label) continue;
      found++;
      const holder = label.closest('[role="button"],[role="link"],[role="listitem"]') || label.parentElement;
      const parts = []; // "Unspecified", "Not used": the pieces of text next to the label
      const walker = document.createTreeWalker(holder, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const piece = norm(n.nodeValue);
        if (piece && piece !== field && !parts.includes(piece)) parts.push(piece);
      }
      const status = parts.join(', ');
      if (OFF.some((x) => status.includes(x))) { notes.push(`${field}: ${status}`); continue; }
      // In use, or the row does not say: open it and switch it off.
      await openRow(label);
      const inside = topLayer();
      const only = inside ? switchesIn(inside) : [];
      const r = only.length === 1 ? await setSwitch(only[0], false)
        : await choose(["don't use*", 'do not use*', 'not used', 'no', 'off'], 'exact', 5000);
      if (r.status === 'changed') { changed++; await confirmIf(); }
      notes.push(`${field}: ${r.status === 'changed' ? 'switched off' : 'not used'}`);
      if (FIELDS.filter((f) => searchText(layer(), [f], 'exact').length).length < 2) await goBack(1); // back to the list of fields
    }
    // "Categories associated with you": each one has a Remove button.
    let removed = 0;
    for (let i = 0; i < 60; i++) {
      const btn = searchText(layer(), ['remove'], 'exact')[0];
      if (!btn) break;
      act(btn, 'remove a category associated with you');
      removed++;
      await settle();
      await confirmIf();
    }
    if (!found && !removed) throw new Error('the setting opened, but none of its rows were recognised');
    if (removed) notes.push(`${removed} other categories removed`);
    return { status: changed + removed ? 'changed' : 'already', detail: notes.join(' · ') };
  }

  const CUSTOM = { pastPosts, adCategories };

  function buildUnits(o) {
    const units = [];
    const on = (id) => o.tasks.includes(id);
    // The address to use now, and whether another one is left to try if the row is not there.
    const where = (id, urls) => { const i = Math.min(state.alt[id] || 0, urls.length - 1); return { url: urls[i], next: i < urls.length - 1 }; };
    const setting = (s, value) => ({
      id: s.id, title: s.title, optional: s.optional, ...where(s.id, s.urls || [s.url]),
      manual: `Set to ${(typeof s.say === 'object' ? s.say[o.level] : s.say) || describe(value)}.`,
      run: () => (s.custom ? CUSTOM[s.custom]() : applySetting(s, value)),
    });
    const offMeta = [AC + '/info_and_permissions/', WWW + '/off_facebook_activity/'];
    if (on('lists')) units.push({ id: 'lists', advertisers: true, title: 'Disable list-based advertisers',
      ...where('lists', [ADS, ADS + 'audience_based_advertising/']),
      manual: 'Ad preferences → Manage info → Audience-based advertising. Open each advertiser → “They uploaded or used a list to reach you” → choose “Don’t allow” for both options.', run: runLists });
    if (on('seen')) units.push({ id: 'seen', advertisers: true, title: 'Hide advertisers you have seen', url: WWW + '/adpreferences/advertisers',
      manual: 'Click “Hide ads” next to each advertiser.', run: runSeen });
    if (on('adsettings')) for (const s of AD_SETTINGS) units.push(setting(s, s.all));
    if (on('topics')) units.push({ id: 'topics', advertisers: true, noun: 'topics', title: 'Ad topics: See less', url: ADS,
      manual: 'On the “Customize ads” tab, click “See all” next to “Ad topics”, then “View and manage topics”, and choose “See less” for each topic.', run: runTopics });
    if (on('special')) units.push({ id: 'special', title: 'Special ad topics: See less', url: ADS,
      manual: 'On the “Customize ads” tab, click “See all” next to “Ad topics”, then “Special topics”, and turn every switch off.', run: runSpecial });
    const gone = 'Facebook does not offer this on your account. Meta is replacing it with “Activity from other businesses”, which the ad data task sets';
    const offPath = 'Accounts Center → Your information and permissions → Your activity off Meta technologies (or “Activity from other businesses”)';
    if (on('offclear')) units.push({ id: 'offclear', title: 'Clear off-Meta activity history', optional: true, gone, ...where('offclear', offMeta),
      manual: `${offPath} → “Clear previous activity”, then confirm.`, run: runOffClear });
    if (on('offfuture')) units.push({ id: 'offfuture', title: 'Disconnect future off-Meta activity', optional: true, gone, ...where('offfuture', offMeta),
      manual: `${offPath} → “Manage future activity” → “Disconnect future activity”, then confirm.`, run: runOffFuture });
    if (on('ai')) {
      for (const s of AI_SETTINGS) units.push(setting(s, s.all));
      for (const tab of AI_SCAN) units.push({ id: 'ai_scan_' + tab, title: `AI switches on the “${tab}” settings page`, url: TAB[tab],
        manual: 'Look through this settings page for switches that mention AI and turn them off.', run: scanAi });
      for (const item of AI_BY_HAND) units.push({ ...item, byHand: true });
    }
    if (o.level !== 'default') for (const s of PRIVACY) if (s[o.level] !== undefined) units.push(setting(s, s[o.level]));
    // The menu section a step belongs to, for the "last run" notes.
    const own = ['lists', 'seen', 'topics', 'special', 'offclear', 'offfuture'];
    for (const u of units) u.task = own.includes(u.id) ? u.id : u.id.startsWith('ai_') ? 'ai' : u.id.startsWith('ad_') ? 'adsettings' : 'privacy';
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
    book = bookFrom(await memory.load());
    bookDirty = false;
    lastUnits = new Map(Object.entries((cleanHistory(await durable.get(HISTORY_KEY)) || {}).units || {}));
    if (memory.dropped) { // say so once, and store the database without them
      log(`  ${memory.dropped} entries of the advertiser database were filed under the wrong name by an earlier version: removed, those advertisers are read again`);
      bookDirty = true;
    }
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
        fresh = [];
        // The step's line in the log: once, and before the step loads its page. Written after the
        // page load it was lost for every step that starts with one.
        if (state.headed !== state.idx) {
          state.headed = state.idx;
          log(`${state.idx + 1}/${units.length} ${unit.title}`);
        }
        if (unit.byHand) {
          res = { status: 'manual', detail: 'can only be done by hand' };
        } else {
          try {
            await goto(unit);
            res = await unit.run();
          } catch (e) {
            if (e instanceof Abort) throw e;
            if (e instanceof Renav) { // reload the page, as long as each reload gets further than the last
              if (e.progress > (state.renavAt[unit.id] ?? -1)) { state.renavAt[unit.id] = e.progress; state.renav[unit.id] = 0; }
              if ((state.renav[unit.id] = (state.renav[unit.id] || 0) + 1) <= 2) await hardNav(unit);
            }
            const tried = state.altSeen[unit.id] || (state.altSeen[unit.id] = []);
            if (e.facebook) state.altWhy[unit.id] = e.message; // Facebook's own error says more than "not found"
            if (e instanceof RowMissing && unit.next) { // Facebook may keep this row on another page
              tried.push(snapshot());
              state.alt[unit.id] = (state.alt[unit.id] || 0) + 1;
              log('  not on this page, trying the next one');
              await closeLayers();
              units = buildUnits(state.opts);
              // The address bar can already show the next address while the page is still the old one: load it for real.
              if (at(units[state.idx].url)) await hardNav(units[state.idx]);
              continue;
            }
            if (state.altWhy[unit.id] && e instanceof RowMissing) e.message = state.altWhy[unit.id];
            const seen = [...tried, e.seen || snapshot()].join(' || ').slice(0, 6000);
            if (e instanceof DryRun) res = { status: 'dry', detail: 'would ' + e.message };
            else if (e instanceof RowMissing && unit.optional) res = { status: 'info', detail: unit.gone || 'this setting is not shown for your account', seen };
            else res = { status: 'manual', detail: e.message, seen };
          }
        }
        // A setting that the last run changed to the very same value has not stayed changed, or the
        // page gives the script no way to tell. Either way it is worth a look by hand.
        const plain = clip(res.detail, 200);
        const prev = lastUnits.get(unit.id);
        if (res.status === 'changed' && !state.opts.dryRun && !res.again && !unit.advertisers &&
            prev && prev.status === 'changed' && prev.detail === plain) {
          res.detail = `${res.detail}. The last run reported this same change: the choice may not be staying, or the page does not show it. Check it by hand`;
          res.repeat = true;
        }
        log(`  ${STATUS[res.status].text}${res.detail ? ': ' + res.detail : ''}`);
        if (res.seen) log(`  the page showed: ${res.seen}`);
        // Facebook's "try again later" pages, wherever they turned up in this step.
        // So is a page that stayed blank.
        res.limited = res.status !== 'info' && (!!res.limited || LIMITED.test(`${res.detail || ''} ${res.seen || ''}`) ||
          /\| text:\s*\| controls: none/.test(res.seen || ''));
        if (res.limited) log(`  ${LIMIT_NOTE}.`);
        if (!unit.advertisers) { // advertiser steps are timed per advertiser instead
          state.timing.unitMs += Date.now() - (state.unitStart || Date.now());
          state.timing.units++;
        }
        ui.advertisers(null);
        state.results.push({ id: unit.id, task: unit.task, title: unit.title, url: unit.url, manual: unit.manual, status: res.status,
          detail: res.detail || '', plain, seen: res.seen || '', limited: !!res.limited });
        state.idx++;
        state.navFor = null;
        await save();
        await closeLayers().catch((e) => { if (e instanceof Abort) throw e; });
      }
      log('Finished.');
      state.finished = true;
    } catch (e) {
      if (!(e instanceof Abort)) { log('Stopped by an unexpected error: ' + e.message); console.error(TAG, e); } else log('Stopped.');
      const unit = units[state.idx];
      if (unit) { // the report says where the run was cut short, with the advertiser counts so far
        const sofar = unit.advertisers && state.adv[unit.id] ? ` (${state.adv[unit.id].done} of ${state.adv[unit.id].total} ${unit.noun || 'advertisers'} looked at)` : '';
        state.results.push({ id: unit.id, task: unit.task, title: unit.title, url: unit.url, manual: unit.manual, status: 'manual',
          detail: `stopped before this step finished${sofar}`, seen: unit.id === 'lists' ? state.listsSeen || '' : '' });
      }
    }
    state.running = false;
    state.navFor = null;
    busy = false;
    await save();
    await saveHistory().catch((e) => console.error(TAG, e));
    ui.showReport();
  }

  // When each section was last run and how it went, kept in this browser for the menu.
  async function saveHistory() {
    const hist = (await durable.get(HISTORY_KEY)) || { tasks: {} };
    const now = Date.now();
    const groups = {};
    for (const r of state.results) (groups[r.task || 'privacy'] = groups[r.task || 'privacy'] || []).push(r);
    const WORDS = [['changed', 'changed'], ['dry', 'would change'], ['already', 'already set'], ['manual', 'need a manual check'], ['info', 'nothing to do']];
    for (const [task, rs] of Object.entries(groups)) {
      const n = (st) => rs.filter((r) => r.status === st).length;
      hist.tasks[task] = {
        at: now,
        dryRun: !!state.opts.dryRun,
        level: task === 'privacy' ? state.opts.level : '',
        limited: rs.some((r) => r.limited),
        note: rs.length === 1 ? `${STATUS[rs[0].status].text}${rs[0].detail ? ': ' + clip(rs[0].detail, 140) : ''}`
          : WORDS.filter(([st]) => n(st)).map(([st, word]) => `${n(st)} ${word}`).join(', '),
      };
    }
    if (!state.opts.dryRun) { // what each step reported, for the next run to compare with
      const units = new Map(Object.entries((cleanHistory(hist) || {}).units || {}));
      for (const r of state.results) units.set(r.id, { at: now, status: r.status, detail: clip(r.plain == null ? r.detail : r.plain, 200) });
      hist.units = Object.fromEntries(units);
    }
    hist.last = { at: now, dryRun: !!state.opts.dryRun, finished: !!state.finished, version: VERSION };
    await durable.set(HISTORY_KEY, hist);
  }

  async function start(opts) {
    if (document.querySelector('form[action*="login"] input[type="password"]')) {
      alert('fb-ad-disable: log in to Facebook first, then start again.');
      return;
    }
    state = upgrade({ v: 2, running: true, opts, idx: 0, navFor: null, navAt: 0, alias: {}, renav: {}, results: [], log: [],
      runId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}` });
    markTab();
    prefs = opts;
    await durable.set(PREFS_KEY, opts);
    log(`fb-ad-disable ${VERSION} · ${MODE} mode${opts.dryRun ? ' · DRY RUN (nothing will be changed)' : ''}`);
    await save();
    runQueue();
  }

  // Fields added after 1.0.0, so a run saved by an older version can still be resumed.
  function upgrade(st) {
    st.adv = st.adv || {};
    st.alt = st.alt || {};
    st.altSeen = st.altSeen || {};
    st.altWhy = st.altWhy || {};
    st.renavAt = st.renavAt || {};
    st.reloads = st.reloads || {};
    st.timing = st.timing || { unitMs: 0, units: 0, adv: {} };
    st.records = st.records || [];
    return st;
  }

  // Marks this tab as the one doing the run, so only it picks the run up after a reload.
  const TAB_KEY = KEY + 'Tab';
  const markTab = () => { try { sessionStorage.setItem(TAB_KEY, String(state.runId)); } catch (e) { /* storage blocked */ } };
  const isRunTab = (st) => { try { return !!st.runId && sessionStorage.getItem(TAB_KEY) === String(st.runId); } catch (e) { return false; } };

  // reloaded: the page reloaded in the middle of a step, which the script did not ask for.
  async function resume(reloaded = false) {
    upgrade(state);
    if (reloaded) {
      const n = state.reloads[state.idx] = (state.reloads[state.idx] || 0) + 1;
      log(`The page reloaded during step ${state.idx + 1}; ${n > 2 ? 'skipping it' : 'trying it again'}.`);
      if (n > 2) { // do not loop on a step that reloads the page every time
        const unit = buildUnits(state.opts)[state.idx];
        if (unit) state.results.push({ id: unit.id, task: unit.task, title: unit.title, url: unit.url, manual: unit.manual, status: 'manual', detail: 'the page kept reloading', seen: '' });
        state.idx++;
      }
      state.navFor = null;
    }
    state.running = true;
    state.navAt = 0; // claim the run so no other tab resumes it
    markTab();
    await save();
    runQueue();
  }

  const STATUS = {
    changed: { icon: '✅', text: 'Changed' },
    already: { icon: '☑️', text: 'Already set' },
    dry: { icon: '👁', text: 'Dry run' },
    manual: { icon: '⚠️', text: 'Needs manual check' },
    info: { icon: 'ℹ️', text: 'Nothing to do' },
  };

  function reportText() {
    const lines = [`fb-ad-disable ${VERSION} report${state.opts.dryRun ? ' (dry run)' : ''}`, ''];
    for (const r of state.results) {
      lines.push(`${STATUS[r.status].icon} ${r.title}: ${STATUS[r.status].text}${r.detail ? ' (' + r.detail + ')' : ''}`);
      if (r.status === 'manual') lines.push(`     ${r.manual} ${r.url}`);
      if (r.limited) lines.push(`     ${LIMIT_NOTE}.`);
      if (r.seen) lines.push(`     The page showed: ${r.seen}`);
    }
    return lines.join('\n');
  }

  function logText() {
    return [`fb-ad-disable ${VERSION} log`, `Saved: ${new Date().toISOString()}`, `Mode: ${MODE}`,
      `Options: ${JSON.stringify(state.opts)}`, '', reportText(), '', 'Log', '---', ...state.log].join('\n') + '\n';
  }

  const fileStamp = () => new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');

  // ---------------------------------------------------------------------------
  // Backup file: everything this browser keeps, to carry to another browser or
  // to bring back after the saved data is lost (a reinstall, a new profile).
  //
  //   { app: "fb-ad-disable", format: 1, version, exportedAt,
  //     options:     the settings of the menu,
  //     advertisers: the advertiser database,
  //     history:     when each section last ran and how it went }
  //
  // A file to import is data from outside: every part is rebuilt from the fields
  // this script knows, with lengths capped, and anything else is dropped.
  // ---------------------------------------------------------------------------
  let prefs = null; // the options last used or imported: what the menu starts from

  const short = (v, n) => clip(typeof v === 'string' ? v : '', n);
  const past = (v) => (Number.isFinite(v) && v > 0 ? Math.min(v, Date.now()) : 0);

  function cleanAdvertisers(input) {
    const out = [];
    if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
    for (const [key, e] of Object.entries(input)) {
      if (out.length >= 20000) break;
      // The two kinds of key this script writes. Nothing else, so no "__proto__" either.
      if (key.length > 400 || !(key.startsWith('/ads/audience_based_advertising/') || key.startsWith('seen:') || key.startsWith('topic:'))) continue;
      if (!e || typeof e !== 'object' || Array.isArray(e)) continue;
      out.push([key.startsWith('/') ? listKey(key) : key, {
        task: key.startsWith('/') ? 'list-based' : key.startsWith('topic:') ? 'topic' : 'seen',
        name: short(e.name, 200), result: short(e.result, 80), at: past(e.at), confirmed: e.confirmed !== false,
        category: short(e.category, 200), about: short(e.about, 300), followers: short(e.followers, 80), website: short(e.website, 300),
        advertiser_id: short(e.advertiser_id, 40), link: safeUrl(e.link), list_uses: short(e.list_uses, 400),
      }]);
    }
    return Object.fromEntries(out); // each key becomes the object's own entry, whatever it is called
  }

  function cleanHistory(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
    const given = input.tasks && typeof input.tasks === 'object' ? input.tasks : {};
    const tasks = {};
    for (const id of [...TASKS.map((x) => x.id), 'privacy']) {
      const e = Object.prototype.hasOwnProperty.call(given, id) ? given[id] : null;
      if (!e || typeof e !== 'object' || !past(e.at)) continue;
      tasks[id] = { at: past(e.at), dryRun: !!e.dryRun, level: LEVELS.some((x) => x.id === e.level) ? e.level : '',
        limited: !!e.limited, note: short(e.note, 300) };
    }
    const l = input.last;
    const last = l && typeof l === 'object' && past(l.at)
      ? { at: past(l.at), dryRun: !!l.dryRun, finished: !!l.finished, version: short(l.version, 20) } : null;
    // What each step reported: { id: { at, status, detail } }, for ids shaped like this script's.
    const units = [];
    const given2 = input.units && typeof input.units === 'object' && !Array.isArray(input.units) ? input.units : {};
    for (const [id, e] of Object.entries(given2)) {
      if (units.length >= 200) break;
      if (!/^[a-z][a-z0-9_]{0,40}$/.test(id) || !e || typeof e !== 'object' || !past(e.at) || !['changed', 'already', 'dry', 'manual', 'info'].includes(e.status)) continue;
      units.push([id, { at: past(e.at), status: e.status, detail: short(e.detail, 200) }]);
    }
    return last || Object.keys(tasks).length ? { last, tasks, units: Object.fromEntries(units) } : null;
  }

  async function exportData() {
    return JSON.stringify({
      app: 'fb-ad-disable', format: BACKUP_FORMAT, version: VERSION, exportedAt: new Date().toISOString(),
      options: prefs || (state && state.opts) || null,
      advertisers: cleanAdvertisers(await memory.load()),
      history: cleanHistory(await durable.get(HISTORY_KEY)),
    }, null, 2) + '\n';
  }

  // Merges a backup file into what this browser keeps. For an advertiser or a section that both
  // have, the more recent entry stays. The settings in the file replace the menu's.
  async function importData(text) {
    if (typeof text !== 'string' || text.length > 20e6) throw new Error('the file is too large to be a backup');
    const data = parse(text);
    if (!data || typeof data !== 'object' || data.app !== 'fb-ad-disable') throw new Error('it is not an fb-ad-disable backup file');
    if (!(data.format >= 1 && data.format <= BACKUP_FORMAT)) throw new Error('it was made by a newer version of fb-ad-disable: update first');

    const options = cleanOptions(data.options);
    if (options) { prefs = options; await durable.set(PREFS_KEY, options); }

    const incoming = cleanAdvertisers(data.advertisers);
    const mine = bookFrom(await memory.load());
    let added = 0;
    for (const [key, e] of Object.entries(incoming)) {
      const have = mine.get(key);
      if (!have) added++;
      if (!have || e.at > (have.at || 0)) mine.set(key, e);
    }
    await memory.save(Object.fromEntries(mine));
    book = mine;

    const history = cleanHistory(data.history);
    if (history) {
      const cur = cleanHistory(await durable.get(HISTORY_KEY)) || { last: null, tasks: {}, units: {} };
      for (const [id, e] of Object.entries(history.tasks)) if (!cur.tasks[id] || e.at > cur.tasks[id].at) cur.tasks[id] = e;
      const units = new Map(Object.entries(cur.units || {}));
      for (const [id, e] of Object.entries(history.units || {})) if (!units.has(id) || e.at > units.get(id).at) units.set(id, e);
      cur.units = Object.fromEntries(units);
      if (history.last && (!cur.last || history.last.at > cur.last.at)) cur.last = history.last;
      await durable.set(HISTORY_KEY, cur);
    }
    return { options: !!options, advertisers: Object.keys(incoming).length, added, history: !!history };
  }

  // ---------------------------------------------------------------------------
  // Panel UI (shadow DOM, built without innerHTML)
  // ---------------------------------------------------------------------------
  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'class') el.className = v;
      else if (k === 'href' && !/^blob:/.test(v) && !safeUrl(v)) continue; // never a javascript: or foreign link
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
    .last { color: #2f6ea3 !important; }
    .last:empty { display: none; }
    .warn { display: block; color: #b3261e !important; font-weight: 600; }
    .row { display: flex; align-items: center; gap: 8px; margin-top: 8px; }
    select { font: inherit; padding: 3px 6px; }
    .btns { display: flex; gap: 8px; margin-top: 12px; flex-wrap: wrap; }
    button.b { font: inherit; font-weight: 600; padding: 7px 14px; border-radius: 6px; border: 1px solid #b9c0c8; background: #f1f3f5; color: #1c1e21; cursor: pointer; }
    button.b.primary { background: #14324d; border-color: #14324d; color: #fff; }
    button.b.danger { background: #b3261e; border-color: #b3261e; color: #fff; }
    .note { margin-top: 10px; padding: 8px 10px; border-radius: 6px; background: #fff4d6; color: #5c4300; font-size: 12px; }
    .note.ok { background: #dff3e6; color: #17472b; }
    .note .btns { margin-top: 8px; }
    .bar { height: 6px; border-radius: 3px; background: #e3e6ea; overflow: hidden; margin: 8px 0; }
    .bar i { display: block; height: 100%; width: 0; background: #2f7d5b; transition: width .3s; }
    .bar.adv i { background: #2f6ea3; }
    .cap { display: flex; justify-content: space-between; gap: 8px; color: #5b6570; font-size: 12px; }
    [hidden] { display: none !important; }
    .scroll { max-height: 180px; overflow: auto; margin-top: 6px; }
    .rows { max-height: 150px; }
    pre { height: 160px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th, td { text-align: left; padding: 3px 8px 3px 0; border-bottom: 1px solid #e3e6ea; vertical-align: top; }
    th { position: sticky; top: 0; background: #fff; }
    button.link { background: none; border: 0; padding: 0; margin-left: 6px; color: #0b5cad; font: inherit; cursor: pointer; text-decoration: underline; }
    .step { font-weight: 600; }
    .sub { color: #5b6570; font-size: 12px; min-height: 1.4em; }
    pre { margin: 8px 0 0; padding: 8px; overflow: auto; border-radius: 6px; background: #f1f3f5; color: #1c1e21;
      font: 11px/1.45 ui-monospace, Menlo, Consolas, monospace; white-space: pre-wrap; word-break: break-word; }
    ul { list-style: none; margin: 0; padding: 0; }
    li { padding: 6px 0; border-bottom: 1px solid #e3e6ea; }
    li:last-child { border-bottom: 0; }
    li div, li details { color: #5b6570; font-size: 12px; }
    li details { word-break: break-word; }
    summary { cursor: pointer; }
    a { color: #0b5cad; }
    @media (prefers-color-scheme: dark) {
      .panel { background: #1f2328; color: #e6e8eb; border-color: #3a4048; }
      h3, label.opt em, .sub, li div, li details, .cap { color: #9aa4af; }
      th, td { border-color: #3a4048; }
      th { background: #1f2328; }
      button.link { color: #7db8f0; }
      .last { color: #7db8f0 !important; }
      .warn { color: #ff8a80 !important; }
      button.b { background: #2c323a; border-color: #454d57; color: #e6e8eb; }
      button.b.primary { background: #2f6ea3; border-color: #2f6ea3; }
      pre { background: #15181c; color: #d5d9de; }
      .bar { background: #3a4048; }
      li { border-color: #3a4048; }
      .note { background: #4a3a10; color: #f3dfa6; }
      .note.ok { background: #173d27; color: #bfe8cd; }
      a { color: #7db8f0; }
    }`;

  const ui = (() => {
    let host, root, body, logEl, stepEl, subEl, barEl, pctEl, etaEl, advBox, advLabel, advBar, rowsBox, rowsBody, ticker;
    let imported = null; // what the last import did, shown at the top of the menu
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

    // Always offered. The "Save logs" option decides how much of the log is kept, not whether it can be saved.
    const logButtons = () => [
      copyButton('copylog', 'Copy log', logText),
      h('button', { class: 'b', name: 'savelog', onclick: () => download(`fb-ad-disable-log-${fileStamp()}.txt`, logText(), 'text/plain') }, 'Save log'),
    ];

    function showMenu() {
      mount();
      const saved = prefs || (state && state.opts);
      const pref = (key, fallback) => (saved && saved[key] !== undefined ? saved[key] : fallback);
      const option = (name, on, label, ...hint) => h('label', { class: 'opt' },
        h('input', { type: 'checkbox', name, checked: !!on }), h('span', null, label), h('em', null, hint));
      const HEAVY = ' Opens many Facebook pages in a row: run too often, Facebook may answer “Something went wrong” for a while (rate limiting).';
      const taskBoxes = TASKS.map((task) => {
        const input = h('input', { type: 'checkbox', name: 'task', value: task.id,
          checked: saved ? saved.tasks.includes(task.id) : task.on });
        return h('label', { class: 'opt' }, input, h('span', null, task.label), h('em', null, task.hint + (task.heavy ? HEAVY : '')),
          h('em', { class: 'last', 'data-last': task.id }));
      });
      // When this browser last ran the script, and how each section went then.
      const ago = (at) => {
        const m = Math.round((Date.now() - at) / 60e3);
        return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 48 * 60 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`;
      };
      const when = (at) => `${new Date(at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })} (${ago(at)})`;
      const lastRun = h('div', { class: 'sub', id: 'lastrun' });
      const showHistory = async () => {
        const hist = await durable.get(HISTORY_KEY);
        if (!hist || !hist.last) { lastRun.textContent = 'Not run in this browser yet.'; return; }
        lastRun.textContent = `Last run: ${when(hist.last.at)}${hist.last.dryRun ? ', dry run' : ''}${hist.last.finished ? '' : ', stopped early'}`;
        for (const el of body.querySelectorAll('[data-last]')) {
          const was = hist.tasks[el.dataset.last];
          if (!was) continue;
          el.replaceChildren(...[
            was.limited ? h('b', { class: 'warn' }, `⚠ Facebook showed an error page here ${ago(was.at)} (“Something went wrong” or similar). That can be rate limiting: wait a few hours before running this again.`) : null,
            `Last run ${when(was.at)}${was.dryRun ? ', dry run' : ''}${was.level ? `, level ${was.level}` : ''}: ${was.note}`,
          ].filter(Boolean));
        }
      };
      showHistory();
      const level = saved ? saved.level : 'default';
      const levelBoxes = LEVELS.map((lv) => h('label', { class: 'opt' },
        h('input', { type: 'radio', name: 'level', value: lv.id, checked: lv.id === level,
          onchange: () => { if (lv.id === 'max') for (const id of ['offfuture', 'special']) body.querySelector(`input[value="${id}"]`).checked = true; } }),
        h('span', null, lv.label), h('em', null, lv.hint)));
      const speed = h('select', { name: 'speed' },
        [['600', 'Fast'], ['1500', 'Normal'], ['3000', 'Slow']].map(([v, name]) =>
          h('option', { value: v, selected: String(saved ? saved.delay : 1500) === v }, name)));

      // How many advertisers earlier runs remembered, with a way to forget them.
      const known = h('span', { id: 'known' });
      // Saved data: what this browser keeps, a file to carry it elsewhere, and a prompt to import
      // one when nothing is saved here (a new browser, or the extension loaded from a new folder).
      const dataLine = h('div', { class: 'sub', id: 'saved' });
      const picker = h('input', { type: 'file', name: 'importfile', accept: '.json,application/json', hidden: true, onchange: async () => {
        const file = picker.files && picker.files[0];
        if (!file) return;
        try {
          const got = await importData(await file.text());
          imported = { ok: true, text: `Imported ${file.name}: ${[got.options ? 'settings' : '', `${got.advertisers} advertiser${got.advertisers === 1 ? '' : 's'} (${got.added} new here)`, got.history ? 'run history' : ''].filter(Boolean).join(', ')}.` };
        } catch (e) {
          imported = { ok: false, text: `Could not import ${file.name}: ${e.message}.` };
        }
        showMenu(); // again, now from the imported settings
      } });
      const importButton = () => h('button', { class: 'b', name: 'import', type: 'button', onclick: () => picker.click() }, 'Import from file');
      const firstTime = h('div', { class: 'note', id: 'firsttime', hidden: true },
        'Nothing is saved in this browser yet. If you saved your data to a file after an earlier run, import it before you start: it brings back your settings and the advertisers already processed.',
        h('div', { class: 'btns' }, importButton()));
      const showKnown = async () => {
        const entries = await memory.load();
        const hist = await durable.get(HISTORY_KEY);
        const all = Object.keys(entries).length;
        const n = listKeys(entries).filter((k) => entries[k] && entries[k].confirmed !== false).length;
        known.replaceChildren(` ${n} remembered${MODE === 'console' ? ' on this site' : ''}.`,
          all ? h('button', { class: 'link', name: 'forget', type: 'button',
            onclick: async (e) => { e.preventDefault(); await memory.save({}); book = new Map(); showKnown(); } }, 'Forget them') : '');
        const topicCount = Object.keys(entries).filter((k) => k.startsWith('topic:')).length;
        const advCount = all - topicCount;
        dataLine.textContent = all ? `${advCount} advertiser${advCount === 1 ? '' : 's'}${topicCount ? ` and ${topicCount} ad topic${topicCount === 1 ? '' : 's'}` : ''} in the database, ${confirmedIn(entries)} of them done.`
          : 'No advertisers in the database yet.';
        firstTime.hidden = !!(all || (hist && hist.last) || imported);
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
        firstTime,
        imported ? h('div', { class: imported.ok ? 'note ok' : 'note', id: 'importmsg' }, imported.text) : null,
        lastRun,
        h('h3', null, 'Advertisers and ad data'), taskBoxes,
        h('h3', null, 'Privacy settings level'), h('div', { class: 'sub last', 'data-last': 'privacy' }), levelBoxes,
        h('h3', null, 'Options'),
        option('dry', pref('dryRun', false), 'Dry run', 'Visit every page and report what would change, without changing anything.'),
        option('remember', pref('remember', true), 'Remember processed advertisers and ad topics',
          'Keep a list, in this browser only, of the advertisers and ad topics confirmed as done.'),
        option('skipKnown', pref('skipKnown', true), 'Skip remembered advertisers and ad topics',
          'Only process advertisers and ad topics that are new since earlier runs.', known),
        option('saveInfo', pref('saveInfo', false), 'Save advertiser details',
          'Keep everything Facebook shows about each advertiser and add CSV export to the report. Advertisers whose ads are already hidden are opened too, to read their details.'),
        option('saveLog', pref('saveLog', true), 'Keep the full log',
          'Keep every log line of the run, not only the last 300. Copy log and Save log are always there, during the run and in the report.'),
        h('div', { class: 'row' }, 'Speed', speed),
        h('h3', null, 'Saved data'),
        h('div', { class: 'sub' }, 'Your settings, the advertiser database and the run history are kept in this browser. A file lets you keep a copy, or move them to another browser.'),
        dataLine,
        h('div', { class: 'btns' },
          h('button', { class: 'b', name: 'export', type: 'button',
            onclick: async () => download(`fb-ad-disable-backup-${fileStamp()}.json`, await exportData(), 'application/json') }, 'Export to file'),
          importButton(), picker),
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

    // One line of the advertiser table: who, what Facebook says about them, what happened.
    const mark = (r) => (/failed|no list controls/.test(r.result) ? '⚠️' : /^would/.test(r.result) ? '👁' : /^skipped/.test(r.result) ? '⏭'
      : /^(disabled|ads hidden)/.test(r.result) ? '✅' : '☑️');
    // "2 list uses, 1 still allowed": what the advertiser's page said before anything was clicked.
    const uses = (r) => {
      if (!r.list_uses) return '';
      const all = r.list_uses.split(' | ');
      return `${all.length} list use${all.length > 1 ? 's' : ''}, ${all.filter((x) => /: allowed$/.test(x)).length} allowed`;
    };
    const advRow = (r) => h('tr', { title: [r.error, r.about, r.website, r.list_uses].filter(Boolean).join(' · ') },
      h('td', null, r.name),
      h('td', null, [r.category, r.followers, uses(r)].filter(Boolean).join(' · ')),
      h('td', null, `${mark(r)} ${r.result}${r.remembered && !/^skipped/.test(r.result) ? ' · remembered' : ''}`));
    const advHead = (what = 'Advertiser') => h('thead', null, h('tr', null, h('th', null, what), h('th', null, 'Details'), h('th', null, 'Result')));
    const topicRow = (r) => h('tr', { title: r.error || '' }, h('td', null, r.name),
      h('td', null, `${mark(r)} ${r.result}${r.remembered && !/^skipped/.test(r.result) ? ' · remembered' : ''}`));

    // The second bar, shown only while advertisers are being processed. null hides it.
    function paintAdvertisers(p) {
      if (!advBox) return;
      advBox.hidden = !p;
      if (!p) return;
      const skipped = p.skipped || 0;
      advBar.style.width = (p.total ? Math.round((p.done / p.total) * 100) : 0) + '%';
      advLabel.textContent = `${p.noun || 'Advertisers'}: ${p.done - skipped} of ${p.total - skipped}${skipped ? ` · ${skipped} skipped (remembered)` : ''}`;
      paintBar(p.total ? p.done / p.total : 0);
    }

    function showRun() {
      mount();
      imported = null;
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
      // Advertisers as they are processed (the last 300 after a page load).
      rowsBody = h('tbody', null, state.records.slice(-300).map(advRow));
      rowsBox = h('div', { class: 'scroll rows', id: 'advrows', hidden: !state.records.length }, h('table', null, advHead('Advertiser or topic'), rowsBody));
      fill(stepEl,
        h('div', { class: 'bar', role: 'progressbar', 'aria-label': 'Overall progress' }, barEl),
        h('div', { class: 'cap' }, etaEl, pctEl),
        advBox, rowsBox, subEl, logEl,
        h('div', { class: 'btns' }, h('button', { class: 'b danger', name: 'stop',
          onclick: () => { stopRequested = true; stepEl.textContent = 'Stopping…'; } }, 'Stop'), logButtons()));
      logEl.scrollTop = logEl.scrollHeight;
      rowsBox.scrollTop = rowsBox.scrollHeight;
      // After a page load in the middle of an advertiser step, the advertiser bar comes straight back.
      const unit = buildUnits(state.opts)[state.idx];
      if (unit && unit.advertisers && state.adv[unit.id]) paintAdvertisers(state.adv[unit.id]);
      ticker = setInterval(paintEta, 1000);
    }

    // At the end of a run: save everything to a file? Not after a dry run, which changed nothing.
    function askToSave() {
      if (state.opts.dryRun) return null;
      const box = h('div', { class: 'note', id: 'savedata' },
        'Save your data to a file? It holds your settings, the advertisers processed so far and the run history. Import it from the menu to pick up where you left off, in another browser or after a reinstall.');
      box.append(h('div', { class: 'btns' },
        h('button', { class: 'b primary', name: 'savedata', type: 'button', onclick: async () => {
          const name = `fb-ad-disable-backup-${fileStamp()}.json`;
          download(name, await exportData(), 'application/json');
          box.replaceChildren(`Saved as ${name}. To use it, open the menu and choose “Import from file”.`);
        } }, 'Save to file'),
        h('button', { class: 'b', name: 'nosave', type: 'button', onclick: () => box.remove() }, 'Not now')));
      return box;
    }

    function showReport() {
      mount();
      const count = (s) => state.results.filter((r) => r.status === s).length;
      const items = state.results.map((r) => h('li', { 'data-id': r.id, 'data-status': r.status },
        `${STATUS[r.status].icon} `, h('b', null, r.title),
        h('div', null, STATUS[r.status].text + (r.detail ? ': ' + r.detail : '')),
        r.status === 'manual' ? h('div', null, r.manual + ' ', h('a', { href: r.url, target: '_blank', rel: 'noopener' }, 'Open page')) : null,
        r.limited ? h('div', { class: 'warn' }, `${LIMIT_NOTE}.`) : null,
        r.seen ? h('details', null, h('summary', null, 'What the page showed'), r.seen) : null));
      const rows = (state.records || []).filter((r) => !isTopic(r));
      const topics = (state.records || []).filter(isTopic);
      // The advertiser table is always shown; exporting it with the full details is the option.
      const details = [...(rows.length ? [
        h('h3', null, `Advertisers (${rows.length})`),
        h('div', { class: 'scroll' }, h('table', { id: 'advertisers' }, advHead(), h('tbody', null, rows.map(advRow)))),
        state.opts.saveInfo ? h('div', { class: 'btns' },
          h('button', { class: 'b', name: 'csv', onclick: () => download(`fb-ad-disable-advertisers-${fileStamp()}.csv`, toCsv(rows), 'text/csv') }, 'Export CSV'),
          copyButton('copycsv', 'Copy CSV', () => toCsv(rows))) : null,
      ] : []), ...(topics.length ? [ // ad topics: their own table and their own file
        h('h3', null, `Ad topics (${topics.length})`),
        h('div', { class: 'scroll' }, h('table', { id: 'topics' },
          h('thead', null, h('tr', null, h('th', null, 'Topic'), h('th', null, 'Result'))), h('tbody', null, topics.map(topicRow)))),
        h('div', { class: 'btns' },
          h('button', { class: 'b', name: 'topicscsv', onclick: () => download(`fb-ad-disable-topics-${fileStamp()}.csv`, toCsv(topics, TOPIC_COLUMNS), 'text/csv') }, 'Export topics CSV'),
          copyButton('copytopicscsv', 'Copy topics CSV', () => toCsv(topics, TOPIC_COLUMNS))),
      ] : [])];
      fill(
        h('div', { class: 'step', id: 'summary' }, state.opts.dryRun
          ? `Dry run: ${count('dry')} would change, ${count('already')} already set, ${count('manual')} need a manual check`
          : `${count('changed')} changed, ${count('already')} already set, ${count('manual')} need a manual check`),
        h('div', { class: 'sub' }, 'Facebook can ask for extra confirmation or change its pages, so spot-check the changed settings.'),
        askToSave(),
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
      advertisers: (p) => paintAdvertisers(p),
      advertiserRow(r) {
        if (!rowsBody || !rowsBody.isConnected) return;
        rowsBody.append(advRow(r));
        rowsBox.hidden = false;
        rowsBox.scrollTop = rowsBox.scrollHeight;
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
      state = sane(await store.get());
      prefs = cleanOptions(await durable.get(PREFS_KEY)) || (state && state.opts) || null;
      ui.showMenu();
    },
    _csv: toCsv, // for the tests
    _info: advertiserInfo,
    _export: exportData,
    _import: importData,
  };

  (async function boot() {
    const saved = sane(await store.get());
    // A run that navigated moments ago continues by itself. Anything older waits for "Resume it".
    // So does a run read from window.name: another site could have left it in the tab, so it is
    // shown with "Resume it" for you to decide, never started by itself.
    const fresh = saved && saved.running && saved.navAt && Date.now() - saved.navAt < (MODE === 'console' ? 15 * 60e3 : 2 * 60e3);
    if (fresh && !fromWindowName) { state = saved; resume(); return; }
    // The page reloaded under a run in this very tab (Facebook does that at times): carry on.
    if (MODE !== 'console' && saved && saved.running && isRunTab(saved) && Date.now() - (saved.savedAt || 0) < 10 * 60e3) {
      state = saved;
      resume(true);
      return;
    }

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
