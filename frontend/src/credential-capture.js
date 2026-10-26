// Injected by Luna into every top-level page, but into its own isolated JavaScript world: page
// scripts cannot call, replace or observe anything defined here. It reports a submitted login to
// Luna (the origin is taken from WebKit, not from this script) and fills a login after the user
// confirmed with Touch ID. The password only ever travels to the native app.
(() => {
  if (window.top !== window || window.__lunaCredentials) return;
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  if (location.protocol !== 'https:' && !(location.protocol === 'http:' && loopback)) return;
  window.__lunaCredentials = true;

  const visible = (el) => {
    const box = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    return (
      box.width > 0 && box.height > 0 && style.visibility !== 'hidden' && style.display !== 'none'
    );
  };
  const passwordFields = (root) =>
    [...(root || document).querySelectorAll('input[type="password"]')].filter(
      (el) => visible(el) && !el.disabled,
    );
  const textTypes = ['', 'text', 'email', 'tel'];
  const userFields = (root) =>
    [...(root || document).querySelectorAll('input')].filter(
      (el) =>
        visible(el) &&
        !el.disabled &&
        !el.readOnly &&
        textTypes.includes((el.getAttribute('type') || '').toLowerCase()),
    );
  // The last text-like field before the password field, in document order.
  const usernameFor = (password) => {
    let found = null;
    for (const el of userFields(password.form || document))
      if (el.compareDocumentPosition(password) & Node.DOCUMENT_POSITION_FOLLOWING) found = el;
    return found;
  };

  let reported = '';
  function report(root) {
    const filled = passwordFields(root).filter((el) => el.value);
    if (!filled.length) return;
    const password = filled.find((el) => el.autocomplete !== 'new-password') || filled[0];
    const user = usernameFor(password);
    const body = { username: user ? user.value : '', password: password.value };
    const key = body.username + '\u0000' + body.password;
    if (key === reported) return;
    reported = key;
    try {
      window.webkit.messageHandlers.lunaCreds.postMessage(body);
    } catch {
      /* Luna's handler is missing: nothing to report to. */
    }
  }
  const submitLike = /log ?in|anmelden|sign ?in|einloggen|weiter|continue|submit|senden/i;
  document.addEventListener(
    'submit',
    (event) => report(event.target instanceof HTMLFormElement ? event.target : document),
    true,
  );
  document.addEventListener(
    'click',
    (event) => {
      const button = event.target.closest?.('button, input[type="submit"], [role="button"]');
      if (!button) return;
      const explicit = button.matches('input[type="submit"], button[type="submit"]');
      const implicit = button.matches('button:not([type])') && button.form;
      if (explicit || implicit || submitLike.test(button.textContent || button.value || ''))
        report(button.form || document);
    },
    true,
  );
  document.addEventListener(
    'keydown',
    (event) => {
      const el = event.target;
      if (event.key === 'Enter' && el instanceof HTMLInputElement && el.type === 'password')
        report(el.form || document);
    },
    true,
  );

  const assign = (el, value) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };
  // Called by Luna after Touch ID and an origin check. Handles one-step and two-step logins.
  window.__lunaFill = (username, password) => {
    const passwords = passwordFields();
    const result = { ok: false, username: false, password: false };
    if (passwords.length) {
      const field = passwords[0];
      const user = username ? usernameFor(field) : null;
      if (user) {
        assign(user, username);
        result.username = true;
      }
      assign(field, password);
      result.password = true;
      result.ok = true;
      return result;
    }
    const first = userFields().find(
      (el) =>
        /username|email/i.test(el.autocomplete || '') ||
        (el.getAttribute('type') || '').toLowerCase() === 'email',
    );
    if (first && username) {
      assign(first, username);
      result.username = true;
      result.ok = true;
      return result;
    }
    result.error = 'no-form';
    return result;
  };
})();
