import './styles/select-menu.css';

const enhanced = new WeakMap();
let initialized = false;
let opened = null;
const arrow = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m6 8 4 4 4-4"/></svg>';

function enhance(select) {
  if (enhanced.has(select) || select.multiple || select.size > 1) return;
  const host = document.createElement('span');
  host.className = 'luna-select';
  select.before(host);
  host.append(select);
  select.classList.add('luna-select-native');
  select.tabIndex = -1;
  select.setAttribute('aria-hidden', 'true');
  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'luna-select-trigger';
  trigger.setAttribute('role', 'combobox');
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');
  const text = document.createElement('span');
  trigger.append(text);
  trigger.insertAdjacentHTML('beforeend', arrow);
  host.append(trigger);
  let list = null;
  let active = -1;
  let typed = '';
  let typingTimer;
  const sync = () => {
    text.textContent = select.selectedOptions[0]?.label || '';
    trigger.disabled = select.disabled;
    const label =
      select.getAttribute('aria-label') ||
      [...(select.labels || [])]
        .map((l) =>
          [...l.childNodes]
            .filter((n) => n.nodeType === Node.TEXT_NODE)
            .map((n) => n.textContent)
            .join(''),
        )
        .join(' ')
        .trim();
    trigger.setAttribute('aria-label', label ? `${label}: ${text.textContent}` : text.textContent);
    if (select.id) trigger.dataset.selectFor = select.id;
  };
  function close(focus = false) {
    if (!list) return;
    try {
      list.hidePopover?.();
    } catch {
      /* Older engines use the fixed-position fallback. */
    }
    list.remove();
    list = null;
    trigger.setAttribute('aria-expanded', 'false');
    trigger.removeAttribute('aria-activedescendant');
    if (opened?.select === select) opened = null;
    if (focus && trigger.isConnected) trigger.focus();
  }
  function mark(index) {
    if (!list) return;
    active = index;
    for (const item of list.children)
      item.classList.toggle('active', Number(item.dataset.index) === active);
    const option = list.querySelector(`[data-index="${active}"]`);
    if (option) {
      trigger.setAttribute('aria-activedescendant', option.id);
      option.scrollIntoView({ block: 'nearest' });
    }
  }
  function choose(index) {
    const option = select.options[index];
    if (!option || option.disabled || select.disabled) return;
    select.selectedIndex = index;
    close(true);
    sync();
    select.dispatchEvent(new Event('input', { bubbles: true }));
    select.dispatchEvent(new Event('change', { bubbles: true }));
  }
  function position() {
    if (!list) return;
    const rect = trigger.getBoundingClientRect();
    const width = Math.min(Math.max(180, rect.width), window.innerWidth - 24);
    const below = window.innerHeight - rect.bottom - 16;
    const above = rect.top - 16;
    const upwards = below < 160 && above > below;
    const height = Math.max(60, Math.min(300, upwards ? above : below));
    list.style.width = `${width}px`;
    list.style.maxHeight = `${height}px`;
    list.style.left = `${Math.min(Math.max(12, rect.left), window.innerWidth - width - 12)}px`;
    list.style.top = upwards ? 'auto' : `${rect.bottom + 7}px`;
    list.style.bottom = upwards ? `${window.innerHeight - rect.top + 7}px` : 'auto';
  }
  function open() {
    if (select.disabled) return;
    opened?.close();
    list = document.createElement('div');
    list.className = 'luna-select-menu';
    list.id = `luna-select-${crypto.randomUUID()}`;
    list.setAttribute('role', 'listbox');
    list.setAttribute('popover', 'manual');
    list.setAttribute('aria-label', trigger.getAttribute('aria-label') || '');
    [...select.options].forEach((option, index) => {
      const item = document.createElement('div');
      item.className = 'luna-select-option';
      item.id = `${list.id}-${index}`;
      item.dataset.index = String(index);
      item.setAttribute('role', 'option');
      item.setAttribute('aria-selected', String(option.selected));
      item.setAttribute('aria-disabled', String(option.disabled));
      const caption = document.createElement('span');
      caption.textContent = option.label;
      const tick = document.createElement('span');
      tick.className = 'luna-option-check';
      tick.textContent = option.selected ? '✓' : '';
      tick.setAttribute('aria-hidden', 'true');
      item.append(caption, tick);
      item.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        choose(index);
      });
      item.addEventListener('pointermove', () => {
        if (!option.disabled) mark(index);
      });
      list.append(item);
    });
    // Keep the listbox inside the active modal's accessibility subtree.
    (select.closest('.setup,[role="dialog"],dialog') || document.body).append(list);
    position();
    list.showPopover?.();
    trigger.setAttribute('aria-expanded', 'true');
    trigger.setAttribute('aria-controls', list.id);
    opened = { select, trigger, close, position };
    mark(select.selectedIndex);
  }
  trigger.addEventListener('click', () => (list ? close() : open()));
  trigger.addEventListener('keydown', (event) => {
    const options = [...select.options].map((o, i) => ({ o, i })).filter(({ o }) => !o.disabled);
    if (!options.length) return;
    const at = options.findIndex(({ i }) => i === (list ? active : select.selectedIndex));
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      const wasOpen = !!list;
      if (!list) open();
      const next =
        event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? options.length - 1
            : !wasOpen
              ? Math.max(0, at)
              : (Math.max(0, at) + (event.key === 'ArrowDown' ? 1 : -1) + options.length) %
                options.length;
      mark(options[next].i);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (list) choose(active);
      else open();
    } else if (event.key === 'Escape') {
      if (list) {
        event.preventDefault();
        event.stopPropagation();
        close(true);
      }
    } else if (event.key === 'Tab') close();
    else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey) {
      typed += event.key.toLocaleLowerCase();
      clearTimeout(typingTimer);
      typingTimer = setTimeout(() => (typed = ''), 600);
      const match = options.find(({ o }) => o.label.toLocaleLowerCase().startsWith(typed));
      if (match) {
        event.preventDefault();
        if (!list) open();
        mark(match.i);
      }
    }
  });
  select.addEventListener('change', sync);
  select.addEventListener('focus', () => trigger.focus());
  enhanced.set(select, { sync });
  sync();
  if (document.activeElement === select) trigger.focus({ preventScroll: true });
}

export function initSelectMenus() {
  if (initialized) return;
  initialized = true;
  let queued = false;
  const scan = () => {
    queued = false;
    document
      .querySelectorAll('#settingsView select, .setup select, #themeDrop select')
      .forEach((select) => {
        if (enhanced.has(select)) enhanced.get(select).sync();
        else enhance(select);
      });
    if (opened && !opened.select.isConnected) opened.close();
  };
  new MutationObserver((records) => {
    if (
      !records.some(
        (r) =>
          (r.type === 'childList' &&
            [...r.addedNodes, ...r.removedNodes].some(
              (n) =>
                n.nodeType === 1 &&
                (n.matches?.('select,option,.setup,#settingsView') || n.querySelector?.('select')),
            )) ||
          (r.type === 'attributes' && r.target.tagName === 'SELECT'),
      )
    )
      return;
    if (!queued) {
      queued = true;
      queueMicrotask(scan);
    }
  }).observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['disabled', 'aria-label'],
  });
  document.addEventListener('pointerdown', (event) => {
    if (
      opened &&
      !opened.trigger.contains(event.target) &&
      !event.target.closest('.luna-select-menu')
    )
      opened.close();
  });
  window.addEventListener('resize', () => opened?.close());
  document.addEventListener(
    'scroll',
    (event) => {
      if (opened && !event.target.closest?.('.luna-select-menu')) opened.position();
    },
    true,
  );
  scan();
}
