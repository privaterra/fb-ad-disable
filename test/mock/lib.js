// Browser-side helpers for the mock Facebook pages used by the tests.
// They imitate the structures the script relies on: text in nested spans, click
// handlers on wrapper elements, role=dialog layers with Back/Close buttons,
// role=radio / role=switch controls and curly apostrophes.
(function () {
  const el = (tag, attrs, ...kids) => {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v);
    }
    for (const kid of kids.flat()) if (kid != null) e.append(kid);
    return e;
  };
  const span = (text) => el('span', null, text);
  const rec = (type, data) => window.__record(JSON.stringify({ type, ...data }));
  const main = () => document.getElementById('main');

  function button(label, onclick) {
    return el('div', { role: 'button', tabindex: '0', onclick }, el('div', null, span(label)));
  }

  // Like Facebook, the page keeps a dialog that is not on screen (a chat window) after
  // everything else. Code that takes "the last dialog" as the open one gets this instead.
  const offscreen = el('div', { role: 'dialog', 'aria-label': 'Chats', style: 'position:fixed;left:-5000px;top:0;width:300px;height:200px' },
    el('div', { role: 'switch', 'aria-label': 'Chat sounds', 'aria-checked': 'true', onclick: () => rec('decoy', { what: 'offscreen switch' }) }, '⬤'),
    el('div', { role: 'button', 'aria-label': 'Close', onclick: () => rec('decoy', { what: 'offscreen close' }) }, 'x'));
  document.body.append(offscreen);

  // A layer on top of the page. `nav` is "Back" or "Close".
  function dialog(title, nav, ...content) {
    const d = el('div', { role: 'dialog', style: 'position:fixed;top:30px;left:30px;width:440px;max-height:620px;overflow:auto;border:2px solid #888;padding:8px;background:#fff' },
      el('div', { role: 'button', 'aria-label': nav, onclick: () => d.remove() }, '←'),
      el('h2', null, span(title)),
      ...content);
    offscreen.before(d);
    return d;
  }
  // closeAll.keep: a dialog that stays (the one holding the advertiser list).
  const closeAll = () => document.querySelectorAll('[role="dialog"],[role="menu"]').forEach((d) => { if (d !== offscreen && d !== closeAll.keep) d.remove(); });

  function radios(options, current, onpick) {
    return el('div', { role: 'radiogroup' }, options.map((o) => {
      const r = el('div', { role: 'radio', 'aria-checked': String(o === current), onclick: () => {
        r.parentElement.querySelectorAll('[role="radio"]').forEach((x) => x.setAttribute('aria-checked', 'false'));
        r.setAttribute('aria-checked', 'true');
        if (onpick) onpick(o);
      } }, el('div', null, span(o), el('div', null, span('Description of ' + o.toLowerCase()))));
      return r;
    }));
  }

  function switchEl(label, on, onchange) {
    const s = el('div', { role: 'switch', 'aria-label': label, 'aria-checked': String(on), onclick: () => {
      const next = s.getAttribute('aria-checked') !== 'true';
      s.setAttribute('aria-checked', String(next));
      onchange(next);
    } }, '⬤');
    return s;
  }

  function row(label, value, onclick) {
    const valueEl = span(value || '');
    const r = el('div', { class: 'row', style: 'padding:6px;border-bottom:1px solid #ccc', onclick },
      el('div', null, span(label)), el('div', null, valueEl));
    r.setValue = (v) => { valueEl.textContent = v; };
    return r;
  }

  // Row -> dialog with radios -> "Done" commits.
  function audienceRow(id, label, current, options) {
    const r = row(label, current, () => {
      let picked = current;
      dialog(label, 'Close', radios(options, current, (o) => { picked = o; }),
        button('Done', () => { current = picked; r.setValue(picked); rec('set', { id, value: picked }); closeAll(); }));
    });
    return r;
  }

  // Row -> role=menu (not a dialog); picking commits immediately.
  function menuRow(id, label, current, options) {
    const r = row(label, current, () => {
      const m = el('div', { role: 'menu' }, options.map((o) =>
        el('div', { role: 'menuitemradio', 'aria-checked': String(o === current), onclick: () => {
          current = o; r.setValue(o); rec('set', { id, value: o }); m.remove();
        } }, span(o))));
      offscreen.before(m);
    });
    return r;
  }

  // Row with its own switch.
  function inlineSwitchRow(id, label, on) {
    const input = el('input', { type: 'checkbox', role: 'switch', 'aria-label': label });
    input.checked = on;
    input.addEventListener('change', () => rec('set', { id, value: input.checked }));
    return el('div', { class: 'row', style: 'padding:6px;border-bottom:1px solid #ccc' }, el('div', null, span(label)), input);
  }

  // Row -> dialog with a single switch.
  function dialogSwitchRow(id, label, on) {
    return row(label, on ? 'On' : 'Off', () => {
      dialog(label, 'Close', switchEl(label, on, (v) => { on = v; rec('set', { id, value: v }); }));
    });
  }

  // Row -> dialog with On/Off radios and "Save".
  function onOffRow(id, label, on) {
    return row(label, on ? 'On' : 'Off', () => {
      let picked = on ? 'On' : 'Off';
      dialog(label, 'Close', radios(['On', 'Off'], picked, (o) => { picked = o; }),
        button('Save', () => { on = picked === 'On'; rec('set', { id, value: on }); closeAll(); }));
    });
  }

  // n nested wrappers, as in Facebook's markup.
  const deep = (node, n) => { for (let i = 0; i < n; i++) node = el('div', null, node); return node; };

  // Row whose label does nothing; the "View" link on its right opens the picker, which commits at once.
  function viewRow(id, label, current, options) {
    const value = span(current);
    return el('div', { class: 'row', style: 'display:flex;gap:12px;padding:6px;border-bottom:1px solid #ccc' },
      deep(el('div', null, span(label), el('div', null, value)), 3),
      deep(el('div', { role: 'button', onclick: () => {
        dialog('Who can Facebook suggest your profile to', 'Close', radios(options, current, (o) => {
          current = o; value.textContent = o; rec('set', { id, value: o }); closeAll();
        }));
      } }, span('View')), 2));
  }

  // Rows with a switch far from the label in the markup, several of them in one container.
  function deepSwitchRows(...rows) {
    return el('div', { class: 'group' }, rows.map(([id, label, on]) =>
      el('div', { style: 'display:flex;align-items:center;justify-content:space-between;height:44px;border-bottom:1px solid #ccc' },
        deep(span(label), 14), deep(switchEl(label, on, (v) => rec('set', { id, value: v })), 9))));
  }

  // Row -> dialog with a checkbox; unticking asks for confirmation with "Turn Off".
  function checkboxDialogRow(id, label, boxLabel, on) {
    return row(label, on ? 'On' : 'Off', () => {
      const box = el('input', { type: 'checkbox' });
      box.checked = on;
      box.addEventListener('change', () => {
        if (box.checked) { on = true; rec('set', { id, value: true }); return; }
        dialog('Are you sure?', 'Close', button('Turn Off', () => { on = false; rec('set', { id, value: false }); closeAll(); }),
          button('Cancel', () => closeAll()));
      });
      dialog(label, 'Close', el('label', null, box, span(boxLabel)));
    });
  }

  // Row -> a floating panel that is not a dialog and whose choices have no roles.
  function popupRow(id, label, current, options) {
    return row(label, current, () => {
      const pop = el('div', { style: 'position:absolute;top:120px;left:60px;width:300px;border:1px solid #888;background:#fff;padding:8px' },
        options.map((o) => el('div', { style: 'padding:6px', onclick: () => { rec('set', { id, value: o }); pop.remove(); } }, span(o))));
      offscreen.before(pop);
    });
  }

  // ---- advertisers that uploaded a list ------------------------------------
  // Each advertiser is a page with its own address. Whether that page opens, or Facebook's
  // error page comes up instead, depends on how it is reached (window.__flags.listMode):
  //   ui     - only when the list was reached through the Ad preferences screens
  //   press  - only after a real mouse sequence on the entry
  //   direct - only when the advertiser's address is loaded
  //   never  - never
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

  function errorPage(view) {
    view.replaceChildren(el('h1', null, span('This page isn\u2019t available right now')),
      el('p', null, span('This may be because of a technical error that we\u2019re working to get fixed.')),
      button('Reload page', () => rec('decoy', { what: 'Reload page' })));
  }

  function advertiserDetail(view, a, withBack) {
    if (a.broken) return errorPage(view);
    view.replaceChildren(...[
      withBack && el('div', { role: 'button', 'aria-label': 'Back', onclick: () => history.back() }, '←'),
      el('h1', null, span(a.name)),
      el('p', null, 'You may have interacted with their website, app or store.'),
      a.allow && row('They uploaded or used a list to reach you.', '', () => {
        dialog('List usage', 'Back', ['Showing ads to you using a list', 'Excluding you from ads using a list'].map((label, i) => {
          const btn = button(a.allow[i] ? 'Don\u2019t allow' : 'Allow', () => {
            a.allow[i] = !a.allow[i];
            rec('listuse', { id: a.id, use: i, allow: a.allow[i] });
            btn.querySelector('span').textContent = a.allow[i] ? 'Don\u2019t allow' : 'Allow';
          });
          return el('div', null, span(label), btn);
        }));
      }),
    ].filter(Boolean));
  }

  // The list. viaUi: it was reached by clicking through Ad preferences, not by its address.
  function advertiserList(view, viaUi) {
    const mode = window.__flags.listMode;
    let expanded = false, pressedAt = 0;
    // listCut: after that many advertisers were opened, Facebook shows less of the list than it
    // did (seen in a live run): only its first part, with a "See more" that brings nothing.
    const opened = () => Number(sessionStorage.getItem('mock:opened') || 0);
    const cut = () => !!window.__flags.listCut && opened() >= window.__flags.listCut;
    const list = () => view.replaceChildren(...[
      el('div', { role: 'button', 'aria-label': 'Back', onclick: () => rec('decoy', { what: 'left the advertiser list' }) }, '←'),
      el('h1', null, span('Audience-based advertising')),
      el('a', { href: LIST }, span('Audience-based advertising')),
      el('div', { role: 'list' }, advertisers.slice(0, expanded && !cut() ? 6 : 3).map((a) =>
        el('div', { role: 'listitem' }, el('a', { role: 'link', 'data-adv': a.id,
          href: `${LIST}${1000000 + a.id}/?should_show_back_button=true` }, span(a.name))))),
      expanded && !cut() ? null : button('See more', () => { if (cut()) return; expanded = true; list(); }),
    ].filter(Boolean));

    document.addEventListener('pointerdown', (e) => { if (e.target.closest('a[data-adv]')) pressedAt = Date.now(); }, true);
    // Like React, one delegated listener. If nobody prevented the default action the browser would navigate.
    document.addEventListener('click', (e) => {
      const link = e.target.closest('a[data-adv]');
      if (!link) return;
      const a = advertisers.find((x) => String(x.id) === link.dataset.adv);
      if (!e.defaultPrevented) rec('navigated', { id: a.id });
      e.preventDefault();
      history.pushState({}, '', link.getAttribute('href'));
      const opens = mode === 'ui' ? viaUi : mode === 'press' ? Date.now() - pressedAt < 1000 : false;
      pressedAt = 0;
      if (opens) { sessionStorage.setItem('mock:opened', String(opened() + 1)); advertiserDetail(view, a, true); } else errorPage(view);
    });
    // Going back one step too far, or forward again, lands on the error page, as on the real site.
    window.addEventListener('popstate', () => {
      closeAll.keep = view.closest('[role="dialog"]');
      closeAll();
      if (location.pathname === LIST) { expanded = false; list(); } else if (location.pathname.startsWith(LIST)) errorPage(view);
      else if (closeAll.keep) closeAll.keep.remove();
      closeAll.keep = null;
    });
    list();
  }

  // An advertiser's address loaded on its own.
  function advertiserPage(view) {
    const a = advertisers.find((x) => location.pathname.includes(String(1000000 + x.id)));
    if (a && window.__flags.listMode === 'direct') advertiserDetail(view, a, false); else errorPage(view);
  }

  function somethingWentWrong(view) {
    view.replaceChildren(el('h2', null, span('Something went wrong')), el('p', null, span('Please try again later.')));
  }

  // A layer built by the page itself, placed like any other.
  const attach = (d) => { offscreen.before(d); return d; };

  window.mock = { attach, somethingWentWrong, advertiserList, advertiserPage, deep, viewRow, deepSwitchRows, checkboxDialogRow, popupRow, el, span, rec, main, button, dialog, closeAll, radios, switchEl, row, audienceRow, menuRow, inlineSwitchRow, dialogSwitchRow, onOffRow };
})();
