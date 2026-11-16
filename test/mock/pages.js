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

  // ---- www.facebook.com/adpreferences/advertisers -----------------------
  'www /adpreferences/advertisers': () => {
    const m = window.mock;
    const item = (name) => {
      const btn = m.button('Hide ads', () => {
        if (btn.textContent !== 'Hide ads') return;
        m.rec('hide', { name });
        btn.querySelector('span').textContent = 'Undo';
      });
      return m.el('div', { role: 'listitem' }, m.span(name), btn);
    };
    const list = m.el('div', { role: 'list' }, ['Acme', 'Globex', 'Initech'].map(item));
    const more = m.button('See more', () => { list.append(item('Umbrella'), item('Hooli')); more.remove(); });
    m.main().append(m.el('h1', null, m.span('Advertisers you’ve seen')), list, more);
  },

  // ---- accountscenter: off-Meta activity --------------------------------
  'ac /info_and_permissions': () => {
    const m = window.mock;
    m.main().append(m.el('h1', null, m.span('Your information and permissions')),
      m.row('Download your information', '', () => {}),
      m.row('Your activity off Meta technologies', '', () => m.dialog('Your activity off Meta technologies', 'Back', offMeta())));
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
    const manage = m.el('div', { hidden: '' },
      m.row('Activity information from ad partners', '', () => {
        m.dialog('Activity information from ad partners', 'Back', m.button('Review setting', () => {
          let picked = 'Yes, make my ads more relevant by using this information';
          m.dialog('Do you want us to use this information?', 'Back',
            m.radios([picked, 'No, don’t make my ads more relevant by using this information'], picked, (o) => { picked = o; }),
            m.button('Confirm', () => { m.rec('set', { id: 'ad_partners', value: picked.slice(0, 2) }); m.closeAll(); }));
        }));
      }),
      m.row('Categories used to reach you', '', () => {
        m.dialog('Categories used to reach you', 'Back', ['Employer', 'Job title', 'Education', 'Relationship status'].map((c, i) =>
          m.el('div', null, m.span(c), m.switchEl(c, i % 2 === 0, (v) => m.rec('category', { name: c, value: v })))));
      }),
      m.popupRow('ad_outside', 'Ads shown outside of Meta', 'Allowed', ['Allowed', 'Not allowed']),
      m.row('Social interactions', '', () => {
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
  'ac /ads/audience_based_advertising': () => {
    const m = window.mock;
    // which uses are still allowed per advertiser: [show ads, exclude from ads]
    const advertisers = [
      { id: 1, name: 'Data Broker One', allow: [true, true] },
      { id: 2, name: 'Already Done Inc', allow: [false, false] },
      { id: 3, name: 'Shop Three', allow: [true, true] },
      { id: 4, name: 'Half Done LLC', allow: [false, true] },
      { id: 5, name: 'No List Corp', allow: null },
    ];
    const list = m.el('div', { role: 'list' });
    const more = m.button('See more', () => render(true));

    function open(a) {
      const first = m.dialog(a.name, 'Back', m.el('p', null, 'You may have interacted with their website, app or store.'));
      // Going back to the list collapses it again, as the real page does.
      first.querySelector('[aria-label="Back"]').addEventListener('click', () => render(false));
      if (!a.allow) return;
      first.append(m.row('They uploaded or used a list to reach you.', '', () => {
        m.dialog('List usage', 'Back', ['Showing ads to you using a list', 'Excluding you from ads using a list'].map((label, i) => {
          const btn = m.button(a.allow[i] ? 'Don’t allow' : 'Allow', () => {
            a.allow[i] = !a.allow[i];
            m.rec('listuse', { id: a.id, use: i, allow: a.allow[i] });
            btn.querySelector('span').textContent = a.allow[i] ? 'Don’t allow' : 'Allow';
          });
          return m.el('div', null, m.span(label), btn);
        }));
      }));
    }

    function render(expanded) {
      list.replaceChildren(...advertisers.slice(0, expanded ? 5 : 3).map((a) =>
        m.el('div', { role: 'listitem' }, m.el('a', { role: 'link', 'data-adv': a.id,
          href: '/ads/audience_based_advertising/?advertiser_id=' + a.id }, m.span(a.name)))));
      if (expanded) more.remove(); else m.main().append(more);
    }
    // Like React, the page handles clicks with one delegated listener. The link opens a
    // side panel; if nobody prevented the default action the browser would also navigate.
    document.addEventListener('click', (e) => {
      const link = e.target.closest('a[data-adv]');
      if (!link) return;
      const a = advertisers.find((x) => String(x.id) === link.dataset.adv);
      if (!e.defaultPrevented) m.rec('navigated', { id: a.id });
      e.preventDefault();
      open(a);
    });
    m.main().append(m.el('h1', null, m.span('Audience-based advertising')),
      m.el('a', { href: '/ads/audience_based_advertising/' }, m.span('Audience-based advertising')), list);
    render(false);
  },
};

module.exports = { pages };
