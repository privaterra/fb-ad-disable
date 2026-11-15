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

  // A layer on top of the page. `nav` is "Back" or "Close".
  function dialog(title, nav, ...content) {
    const d = el('div', { role: 'dialog', style: 'border:2px solid #888;margin:8px;padding:8px;background:#fff' },
      el('div', { role: 'button', 'aria-label': nav, onclick: () => d.remove() }, '←'),
      el('h2', null, span(title)),
      ...content);
    document.body.append(d);
    return d;
  }
  const closeAll = () => document.querySelectorAll('[role="dialog"],[role="menu"]').forEach((d) => d.remove());

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
      document.body.append(m);
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

  window.mock = { el, span, rec, main, button, dialog, closeAll, radios, switchEl, row, audienceRow, menuRow, inlineSwitchRow, dialogSwitchRow, onOffRow };
})();
