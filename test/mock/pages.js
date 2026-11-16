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
    // An advertiser's panel says who they are; its button is "Hide ads", or "Unhide" once hidden.
    // Which advertisers are hidden survives a reload. The list loads two entries at a time as it
    // is scrolled. After a hide it is redrawn from the top with the hidden advertisers first, so
    // the ones still to do are further down again, as seen on the real site.
    const DATA = [['Acme', 'Retail company', '1,234 followers', 'http://acme.example/'],
      ['Globex', 'Energy company', '56,789 followers', 'http://globex.example/'],
      ['Initech', 'Software company', '321 followers', 'http://initech.example/'],
      ['Umbrella', 'Pharmaceutical company', '9,001 followers', 'http://umbrella.example/'],
      ['Hooli', 'Internet company', '3,231,099 followers', 'http://hooli.example/']];
    const hiddenNames = () => JSON.parse(sessionStorage.getItem('mock:hidden') || '["Hooli"]');
    const box = m.el('div', { style: 'height:30px;overflow:auto' });
    let loaded = 2;
    box.addEventListener('scroll', () => {
      if (box.scrollTop + box.clientHeight < box.scrollHeight - 2 || loaded >= DATA.length) return;
      loaded += 2;
      render();
    });
    const advertiser = ([name, category, followers, site]) => {
      const hidden = () => hiddenNames().includes(name);
      return m.el('div', { role: 'button', tabindex: '0', onclick: () => {
        const status = m.el('div', { role: 'listitem' }, m.span(hidden() ? 'You chose to hide all ads from this advertiser.' : ''));
        const btn = m.button(hidden() ? 'Unhide' : 'Hide ads', () => {
          if (btn.textContent !== 'Hide ads') return m.rec('decoy', { what: 'Unhide clicked' });
          m.rec('hide', { name });
          sessionStorage.setItem('mock:hidden', JSON.stringify([...hiddenNames(), name]));
          status.firstChild.textContent = 'You chose to hide all ads from this advertiser.';
          btn.querySelector('span').textContent = 'Unhide';
          loaded = 2;
          render();
          box.scrollTop = 0;
        });
        m.dialog(name, 'Back',
          m.el('div', { role: 'listitem' }, m.span(category)), m.el('div', { role: 'listitem' }, m.span('We make things for ' + name)),
          m.button('Facebook Page', () => {}), m.button(followers, () => {}), m.button('Website', () => {}), m.button(site, () => {}),
          m.el('div', { role: 'listitem' }, m.span('Ads from this advertiser')), status, btn);
      } }, m.el('div', { style: 'height:22px' }, m.span(name), m.span(hidden() ? 'You hid their ads' : '')));
    };
    const sorted = () => [...DATA].sort((a, b) => hiddenNames().includes(b[0]) - hiddenNames().includes(a[0]));
    const render = () => box.replaceChildren(...sorted().slice(0, loaded).map(advertiser));
    render();
    m.dialog('Advertisers you saw ads from', 'Close',
      m.el('p', null, m.span('View and hide ads from advertisers you saw ads from.')),
      m.el('div', { role: 'button', onclick: () => m.rec('decoy', { what: 'filter' }) }, m.span('All advertisers')),
      m.el('div', { role: 'button', onclick: () => m.rec('decoy', { what: 'filter' }) }, m.span('All accounts')),
      box);
  },

  // ---- accountscenter: off-Meta activity --------------------------------
  'ac /info_and_permissions': () => {
    const m = window.mock;
    // Meta folded "Your activity off Meta technologies" into "Activity from other businesses".
    // On many accounts nothing is left to clear or disconnect there; the tests cover both cases.
    m.main().append(...[m.el('h1', null, m.span('Your information and permissions')),
      m.button('Export your information', () => {}),
      m.button('Activity from other businesses', () => m.dialog('Activity from other businesses', 'Back',
        window.__flags.offMeta ? offMeta() : otherBusinesses())),
      m.button('App connections', () => {})]);
    // What replaced it: one choice and "Confirm". Nothing to clear, nothing to disconnect.
    const otherBusinesses = () => {
      const ALLOW = 'Allow us to use this activity to show you content that\u2019s more relevant';
      const DENY = 'Don\u2019t allow us to use this activity to show you relevant content';
      let picked = sessionStorage.getItem('mock:other') === 'off' ? DENY : ALLOW;
      return m.el('div', null,
        m.el('p', null, m.span('Choose if we use your activity sent from other businesses or organizations.')),
        m.radios([ALLOW, DENY], picked, (o) => { picked = o; }),
        m.button('Confirm', () => {
          sessionStorage.setItem('mock:other', picked === DENY ? 'off' : 'on');
          m.rec('set', { id: 'other_businesses', value: picked === DENY ? 'off' : 'on' });
          m.closeAll();
        }));
    };
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
        // One button per profile field that says whether it is used, and other categories with "Remove".
        const field = (name, fallback, second) => { // second: a further line, as in "Unspecified" + "Not used"
          const status = m.span(saved('cat:' + name, fallback));
          return m.el('div', { role: 'button', onclick: () => {
            m.dialog(name, 'Back', m.switchEl('Use ' + name, status.textContent === 'Used', (v) => {
              status.textContent = v ? 'Used' : 'Not used';
              sessionStorage.setItem('mock:cat:' + name, status.textContent);
              m.rec('category', { name, value: v });
            }));
          } }, m.span(name), status, second ? m.span(second) : null);
        };
        const other = (name) => {
          const r = m.el('div', null, m.span(name), m.button('Remove', () => { m.rec('uncategory', { name }); r.remove(); }));
          return r;
        };
        m.dialog('Categories used to reach you', 'Close',
          m.el('h2', null, m.span('Choose profile information')),
          field('Employer', 'Used'), field('Job title', 'Not used'), field('Education', 'Unspecified', 'Not used'), field('Relationship status', 'Used'),
          m.el('h2', null, m.span('Categories associated with you')),
          other('Frequent travelers'), other('Early technology adopters'));
      }),
      partners,
      setting('Audience-based advertising', 'Advertisers using your activity or information', null, '', () => {
        // Reached the way a person does: the list opens in a dialog and the address changes.
        history.pushState({}, '', '/ads/audience_based_advertising/');
        const view = m.el('div');
        m.dialog('Audience-based advertising', 'Close', view);
        if (window.__flags.listMode === 'error') return m.somethingWentWrong(view);
        m.advertiserList(view, true);
      }),
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

  // ---- accountscenter: advertisers that uploaded a list (see lib.js) -----
  'ac /ads/audience_based_advertising': () => {
    const m = window.mock;
    if (window.__flags.listMode === 'error') { // Facebook's own error where the list should be
      const view = m.el('div');
      m.dialog('', 'Close', view);
      return m.somethingWentWrong(view);
    }
    m.advertiserList(m.main(), false); // loaded by its address
  },
  'ac /ads/audience_based_advertising/:id': () => {
    window.mock.advertiserPage(window.mock.main());
  },
};

// Addresses Facebook answers with a redirect.
const redirects = {
  'www /adpreferences/advertisers': 'https://accountscenter.facebook.com/ads/ad_topics',
};

module.exports = { pages, redirects };
