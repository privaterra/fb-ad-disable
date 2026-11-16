// Mock Facebook pages, keyed by "host path". Each value is a browser-side
// function (serialised into the page) that builds the page with window.mock.
const pages = {
  // ---- www.facebook.com/settings/?tab=... -------------------------------
  'www /settings': () => {
    const m = window.mock;
    const tab = new URLSearchParams(location.search).get('tab') || 'home';
    const A = ['Public', 'Friends', 'Friends except...', 'Only me'];
    const tabs = ['posts', 'stories', 'reels', 'how_people_find_and_contact_you', 'followers_and_public_content', 'profile_and_tagging'];
    const LOOKUP = ['Possible Connections', 'Friends of Friends', 'Friends', 'No one'];
    document.body.prepend(m.el('nav', null,
      // Decoy: same text as an audience option, outside any dialog. Must never be clicked.
      m.el('a', { href: '/friends', onclick: (e) => { e.preventDefault(); m.rec('decoy', {}); } }, m.span('Friends')),
      tabs.map((x) => m.el('a', { href: '/settings/?tab=' + x, style: 'margin-left:8px' }, m.span(x)))));

    const rows = {
      posts: () => [
        m.audienceRow('future_posts', 'Who can see your future posts?', 'Public', A),
        m.row('Limit who can see past posts', '', () => {
          m.dialog('Limit who can see past posts', 'Close', m.button('Limit Past Posts', () => {
            m.dialog('Limit all past posts?', 'Close',
              m.button('Limit Past Posts', () => { m.rec('set', { id: 'past_posts', value: true }); m.closeAll(); }),
              m.button('Cancel', () => m.closeAll()));
          }));
        }),
        m.inlineSwitchRow('ai_summaries', 'Allow comment summaries on your posts', true),
      ],
      stories: () => [
        // Facebook moved this row here from "Profile and tagging".
        m.inlineSwitchRow('share_to_stories', 'Allow others to share your posts to their stories?', true),
      ],
      reels: () => [
        m.deepSwitchRows(
          ['reel_ai', 'Allow Meta AI to suggest remixes of your reels', true],
          ['reel_hide_ai', 'Hide AI stickers on your reels', true], // already a restriction: must stay on
          ['reel_autoplay', 'Autoplay reels', true]),
      ],
      how_people_find_and_contact_you: () => [
        m.menuRow('friend_requests', 'Who can send you friend requests?', 'Everyone', ['Everyone', 'Friends of friends']),
        m.audienceRow('friends_list', 'Who can see your friends list?', 'Public', A),
        m.el('h3', null, m.span('Who can Facebook suggest your profile to based on your phone number or email address')),
        m.viewRow('lookup_email', 'People with your email address', 'Possible Connections', LOOKUP),
        m.viewRow('lookup_phone', 'People with your phone number', 'No one', LOOKUP),
        m.checkboxDialogRow('search_engines', 'Do you want search engines outside of Facebook to link to your profile?',
          'Allow search engines outside of Facebook to link to your profile', true),
      ],
      followers_and_public_content: () => [
        m.audienceRow('follow', 'Who Can Follow Me', 'Public', ['Public', 'Friends']),
        m.audienceRow('following', 'Who can see the people, Pages, and lists you follow?', 'Public', A),
        m.audienceRow('public_comments', 'Who can comment on your public posts?', 'Public', ['Public', 'Friends of friends', 'Friends']),
        // "Public Profile Info" is deliberately missing: the script must report it for manual follow-up.
      ],
      profile_and_tagging: () => [
        m.audienceRow('post_on_profile', 'Who can post on your profile?', 'Friends', ['Friends', 'Only me']),
        m.audienceRow('others_posts', 'Who can see what others post on your profile?', 'Friends', A),
        m.audienceRow('tagged_posts', 'Who can see posts you’re tagged in on your profile?', 'Friends of friends', A),
        m.el('h3', null, m.span('Reviewing')),
        m.deepSwitchRows(
          ['review_tagged', 'Review posts you’re tagged in before the post appears on your profile?', false],
          ['review_tags', 'Review tags people add to your own posts before the tags appear on Facebook?', false]),
      ],
    };
    m.main().append(m.el('h1', null, m.span('Settings: ' + tab)), ...(rows[tab] ? rows[tab]() : []));
  },

  // ---- accountscenter: advertisers you saw ads from ------------------------
  // www.facebook.com/adpreferences/advertisers redirects here (see `redirects` below).
  'ac /ads/ad_topics': () => {
    const m = window.mock;
    m.main().append(m.el('h1', null, m.span('Ad preferences')),
      m.el('div', { style: 'display:flex;justify-content:space-between' }, m.el('h2', null, m.span('Ad topics')),
        m.el('div', { role: 'button', onclick: () => m.rec('decoy', { what: 'See all on the page behind the pop-up' }) }, m.span('See all'))));
    const advertiser = (name) => m.el('div', { role: 'button', tabindex: '0', onclick: () => {
      const btn = m.button('Hide ads', () => {
        if (btn.textContent !== 'Hide ads') return;
        m.rec('hide', { name });
        btn.querySelector('span').textContent = 'Undo';
      });
      m.dialog(name, 'Back', m.el('p', null, 'You saw an ad from this advertiser.'), btn);
    } }, m.span(name));
    m.dialog('Advertisers you saw ads from', 'Close',
      m.el('p', null, m.span('View and hide ads from advertisers you saw ads from.')),
      m.el('div', { role: 'button', onclick: () => m.rec('decoy', { what: 'filter' }) }, m.span('All advertisers')),
      m.el('div', { role: 'button', onclick: () => m.rec('decoy', { what: 'filter' }) }, m.span('All accounts')),
      ['Acme', 'Globex', 'Initech', 'Umbrella', 'Hooli'].map(advertiser));
  },

  // ---- accountscenter: off-Meta activity --------------------------------
  'ac /info_and_permissions': () => {
    const m = window.mock;
    // Meta has removed this setting for many accounts; the tests cover both cases.
    m.main().append(m.el('h1', null, m.span('Your information and permissions')),
      m.row('Download your information', '', () => {}),
      window.__flags.offMeta ? m.row('Your activity off Meta technologies', '', () => m.dialog('Your activity off Meta technologies', 'Back', offMeta())) : null);
    const offMeta = () => m.el('div', null,
      m.row('Recent activity', '', () => {}),
      m.row('Clear previous activity', '', () => {
        m.dialog('Clear previous activity', 'Close', m.el('p', null, 'This disconnects your previous activity.'),
          m.button('Clear', () => { m.rec('offclear', {}); m.closeAll(); }));
      }),
      m.row('Manage future activity', '', () => {
        m.dialog('Manage future activity', 'Close', m.button('Manage future activity', () => {
          m.dialog('Future activity', 'Back',
            m.radios(['Connect future activity', 'Disconnect future activity'], 'Connect future activity'),
            m.button('Continue', () => {
              const off = document.querySelector('[role="radio"][aria-checked="true"]').textContent.startsWith('Disconnect');
              if (!off) return m.closeAll();
              m.dialog('Disconnect future activity?', 'Back',
                m.button('Disconnect future activity', () => { m.rec('offfuture', {}); m.closeAll(); }));
            }));
        }));
      }));
  },

  // The old address no longer leads to the settings.
  'www /off_facebook_activity': () => {
    window.mock.main().append(window.mock.el('h1', null, window.mock.span('This content isn\u2019t available right now')));
  },

  // ---- accountscenter: ad preferences -----------------------------------
  'ac /ads': () => {
    const m = window.mock;
    // What a row says about its setting survives a reload, as on the real page.
    const saved = (id, fallback) => sessionStorage.getItem('mock:' + id) || fallback;
    const setting = (label, desc, id, fallback, onclick) => {
      const value = m.span(id ? saved(id, fallback) : '');
      const r = m.el('div', { class: 'row', style: 'padding:6px;border-bottom:1px solid #ccc', onclick },
        m.el('div', null, m.span(label)), m.el('div', null, m.span(desc)), m.el('div', null, value));
      r.set = (text) => { sessionStorage.setItem('mock:' + id, text); value.textContent = text; };
      return r;
    };
    const partners = setting('Activity from other businesses', 'Choose whether we use this activity to show you relevant content.',
      'ad_partners', 'Using this information', () => {
        m.dialog('Activity from other businesses', 'Back', m.button('Review setting', () => {
          let picked = 'Use this information';
          m.dialog('Do you want us to use this information?', 'Back',
            m.radios([picked, 'Don’t use this information'], picked, (o) => { picked = o; }),
            m.button('Confirm', () => {
              const off = picked.startsWith('Don');
              m.rec('set', { id: 'ad_partners', value: off ? 'off' : 'on' });
              partners.set(off ? 'Not using this information' : 'Using this information');
              m.closeAll();
            }));
        }));
      });
    const otherApps = setting('Ads in other apps', 'Choose whether you see ads from Meta Audience Network in other apps.',
      'ad_outside', 'Showing you ads in other apps', () => {
        // A floating panel that is not a dialog and whose choices have no roles.
        const pop = m.el('div', { style: 'position:absolute;top:120px;left:60px;width:300px;border:1px solid #888;background:#fff;padding:8px' },
          ['Show me ads in other apps', 'Don’t show me ads in other apps'].map((o) => m.el('div', { style: 'padding:6px', onclick: () => {
            const off = o.startsWith('Don');
            m.rec('set', { id: 'ad_outside', value: off ? 'off' : 'on' });
            otherApps.set(off ? 'Not showing you ads in other apps' : 'Showing you ads in other apps');
            pop.remove();
          } }, m.span(o))));
        document.body.append(pop);
      });
    const manage = m.el('div', { hidden: '' },
      m.el('h3', null, m.span('Information used to show you ads')),
      setting('Categories used to reach you', 'Information you share on your profile or other categories used to reach you.', null, '', () => {
        m.dialog('Categories used to reach you', 'Back', ['Employer', 'Job title', 'Education', 'Relationship status'].map((c, i) =>
          m.el('div', null, m.span(c), m.switchEl(c, i % 2 === 0, (v) => m.rec('category', { name: c, value: v })))));
      }),
      partners,
      setting('Audience-based advertising', 'Advertisers using your activity or information', null, '', () => {}),
      // A heading, not a row: clicking it does nothing useful.
      m.el('h3', { onclick: () => m.rec('decoy', { what: 'section heading' }) }, m.span('Ads shown outside of Meta')),
      otherApps,
      setting('Ads about Meta', 'Choose whether we use your activity to show you ads about Meta on other platforms.', null, '', () => {
        m.dialog('Ads about Meta', 'Back', m.switchEl('Use your activity for ads about Meta', sessionStorage.getItem('mock:ad_about_meta') !== 'off',
          (v) => { sessionStorage.setItem('mock:ad_about_meta', v ? 'on' : 'off'); m.rec('set', { id: 'ad_about_meta', value: v }); }));
      }),
      m.el('h3', null, m.span('Other settings')),
      setting('Social interactions', 'Choose who can see your social interactions alongside ads.', null, '', () => {
        m.dialog('Social interactions', 'Back', m.radios(['Friends', 'Only me'], 'Friends', (o) => m.rec('set', { id: 'ad_social', value: o })));
      }));
    const topic = (name) => m.el('div', { role: 'button', onclick: () => {
      m.dialog(name, 'Back', m.radios(['No preference', 'See less'], 'No preference', (o) => m.rec('topic', { name, value: o })));
    } }, m.span(name));
    const customize = m.el('div', null,
      m.el('div', { style: 'display:flex;justify-content:space-between' }, m.el('h2', null, m.span('Advertisers you saw ads from')),
        m.el('div', { role: 'button', onclick: () => m.rec('decoy', { what: 'wrong See all' }) }, m.span('See all'))),
      m.el('p', null, m.span('Choose the ad topics you want to see less of.')),
      m.el('div', { style: 'display:flex;justify-content:space-between' }, m.el('h2', null, m.span('Ad topics')),
        m.el('div', { role: 'button', onclick: () => m.dialog('Ad topics', 'Back', ['Alcohol', 'Parenting', 'Pets'].map(topic)) }, m.span('See all'))));
    const show = (which) => { customize.hidden = which !== customize; manage.hidden = which !== manage; };
    m.main().append(
      m.el('h1', null, m.span('Ad preferences')),
      m.el('div', { role: 'tablist' },
        m.el('div', { role: 'tab', onclick: () => show(customize) }, m.span('Customize ads')),
        m.el('div', { role: 'tab', onclick: () => show(manage) }, m.span('Manage info'))),
      customize, manage);
  },

  // ---- accountscenter: advertisers that uploaded a list ------------------
  // Each advertiser opens as a page with its own address. Going back one step too far,
  // or forward again, lands on Facebook's error page, as on the real site.
  'ac /ads/audience_based_advertising': () => {
    const m = window.mock;
    const LIST = '/ads/audience_based_advertising/';
    // allow: which uses are still allowed [show ads, exclude from ads]; null = no list controls.
    const advertisers = [
      { id: 1, name: 'Data Broker One', allow: [true, true] },
      { id: 2, name: 'Already Done Inc', allow: [false, false] },
      { id: 3, name: 'Shop Three', allow: [true, true] },
      { id: 4, name: 'Half Done LLC', allow: [false, true] },
      { id: 5, name: 'No List Corp', allow: null },
      { id: 6, name: 'Broken Page Ltd', broken: true },
    ];
    const view = m.el('div');
    m.main().append(view);
    let expanded = false;

    function list() {
      view.replaceChildren(...[
        m.el('div', { role: 'button', 'aria-label': 'Back', onclick: () => m.rec('decoy', { what: 'left the advertiser list' }) }, '←'),
        m.el('h1', null, m.span('Audience-based advertising')),
        m.el('a', { href: LIST }, m.span('Audience-based advertising')),
        m.el('div', { role: 'list' }, advertisers.slice(0, expanded ? 6 : 3).map((a) =>
          m.el('div', { role: 'listitem' }, m.el('a', { role: 'link', 'data-adv': a.id,
            href: `${LIST}${1000000 + a.id}/?should_show_back_button=true` }, m.span(a.name))))),
        expanded ? null : m.button('See more', () => { expanded = true; list(); }),
      ].filter(Boolean));
    }

    function broken() {
      view.replaceChildren(m.el('h1', null, m.span('This page isn’t available right now')),
        m.el('p', null, m.span('This may be because of a technical error that we’re working to get fixed.')),
        m.button('Reload page', () => {}));
    }

    function detail(a) {
      if (a.broken) return broken();
      view.replaceChildren(...[
        m.el('div', { role: 'button', 'aria-label': 'Back', onclick: () => history.back() }, '←'),
        m.el('h1', null, m.span(a.name)),
        m.el('p', null, 'You may have interacted with their website, app or store.'),
        a.allow && m.row('They uploaded or used a list to reach you.', '', () => {
          m.dialog('List usage', 'Back', ['Showing ads to you using a list', 'Excluding you from ads using a list'].map((label, i) => {
            const btn = m.button(a.allow[i] ? 'Don’t allow' : 'Allow', () => {
              a.allow[i] = !a.allow[i];
              m.rec('listuse', { id: a.id, use: i, allow: a.allow[i] });
              btn.querySelector('span').textContent = a.allow[i] ? 'Don’t allow' : 'Allow';
            });
            return m.el('div', null, m.span(label), btn);
          }));
        }),
      ].filter(Boolean));
    }

    // Like React, one delegated listener. If nobody prevented the default action the browser would navigate.
    document.addEventListener('click', (e) => {
      const link = e.target.closest('a[data-adv]');
      if (!link) return;
      const a = advertisers.find((x) => String(x.id) === link.dataset.adv);
      if (!e.defaultPrevented) m.rec('navigated', { id: a.id });
      e.preventDefault();
      history.pushState({}, '', link.getAttribute('href'));
      detail(a);
    });
    window.addEventListener('popstate', () => {
      m.closeAll();
      if (location.pathname === LIST) { expanded = false; list(); } else broken();
    });
    list();
  },
};

// Addresses Facebook answers with a redirect.
const redirects = {
  'www /adpreferences/advertisers': 'https://accountscenter.facebook.com/ads/ad_topics',
};

module.exports = { pages, redirects };
