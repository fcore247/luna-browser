// Installed only in Luna's isolated WebKit content world. The native bridge
// authenticates the origin using WKFrameInfo. Neither credentials nor form
// tokens are written to the page, local storage, or the browser UI.
(() => {
  if (window.top !== window || window.__lunaCredentials) return;
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  if (location.protocol !== 'https:' && !(location.protocol === 'http:' && loopback)) return;
  window.__lunaCredentials = true;

  const buttonSelector =
    'button, input[type="submit"], input[type="button"], input[type="image"], [role="button"], a[href]';
  const loginWords = /\blog[\s_-]?in\b|\bsign[\s_-]?in\b|anmeld|einlog/i;
  const nextWords = /\b(next|continue|weiter|fortfahren|submit|senden)\b/i;
  const otherAction =
    /register|registrier|sign[\s_-]?up|create (?:an? )?account|konto erstellen|passwort (?:anzeigen|vergessen|ändern|zurücksetzen)|(?:forgot|reset|change|show|hide) password|newsletter|subscribe|abonnier/i;
  const otherProvider = /\b(google|microsoft|facebook|apple|github|passkey|sso)\b/i;
  const transaction =
    /delete|delet(?:ion|ing)|remove|purchase|checkout|payment|transfer|withdraw|order.confirm|löschen|loeschen|kaufen|bestellen|zahl(?:en|ung)|überweis/i;
  const textTypes = ['text', 'email', 'tel'];
  const post = (message) => window.webkit.messageHandlers.lunaCreds.postMessage(message);
  const hasToken = (el, token) => el.autocomplete.toLowerCase().split(/\s+/).includes(token);
  const editedPasswords = new WeakSet();
  const isPassword = (el) =>
    el.type === 'password' ||
    (el.type === 'text' &&
      (editedPasswords.has(el) ||
        hasToken(el, 'current-password') ||
        hasToken(el, 'new-password')));
  const hint = (el) => [el.name, el.id, el.getAttribute('aria-label')].filter(Boolean).join(' ');
  const userHint = (el) =>
    hasToken(el, 'username') ||
    hasToken(el, 'email') ||
    el.type === 'email' ||
    /user(?:name)?|email|e-mail|benutzer|account|kennung|login/i.test(hint(el));
  const otp = (el) =>
    hasToken(el, 'one-time-code') ||
    /\botp\b|totp|one.?time|verification.?code|mfa.?code|sms.?code/i.test(hint(el));
  const visible = (el) => {
    if (!el.isConnected || el.closest('[inert]')) return false;
    if (typeof el.checkVisibility === 'function') {
      if (!el.checkVisibility({ opacityProperty: true, checkOpacity: true })) return false;
    } else {
      // An ancestor's opacity applies to its children without being inherited.
      for (let ancestor = el; ancestor; ancestor = ancestor.parentElement)
        if (getComputedStyle(ancestor).opacity === '0') return false;
    }
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility === 'visible';
  };
  const nativeSubmit = (el) =>
    (el instanceof HTMLButtonElement && el.type === 'submit') ||
    (el instanceof HTMLInputElement && ['submit', 'image'].includes(el.type));
  const label = (el) =>
    (
      el.getAttribute('aria-label') ||
      el.textContent?.trim() ||
      el.getAttribute('value') ||
      el.title ||
      ''
    ).slice(0, 500);

  // form.elements includes controls associated by form="id" outside the form.
  // Formless widgets are scoped to their nearest common login container.
  function fields(scope) {
    const inputs =
      scope instanceof HTMLFormElement ? [...scope.elements] : [...scope.querySelectorAll('input')];
    return inputs.filter(
      (el) =>
        el instanceof HTMLInputElement &&
        !el.disabled &&
        (scope instanceof HTMLFormElement || !el.form),
    );
  }
  function buttons(scope) {
    const list = [...scope.querySelectorAll(buttonSelector)];
    if (scope instanceof HTMLFormElement)
      for (const el of scope.elements)
        if (el.matches(buttonSelector) && !list.includes(el)) list.push(el);
    return list.filter(
      (el) =>
        visible(el) &&
        (scope instanceof HTMLFormElement ? !el.form || el.form === scope : !el.form),
    );
  }
  function scopeFor(el, fromButton = false) {
    if (el.form || el.closest('form')) return el.form || el.closest('form');
    const root = el.getRootNode();
    for (let p = el.parentElement; p; p = p.parentElement) {
      if (p.matches('[role="form"], dialog, fieldset, section')) return p;
      if (
        fromButton
          ? p.querySelector('input')
          : [...p.querySelectorAll(buttonSelector)].some(
              (button) =>
                !otherAction.test(label(button)) &&
                !otherProvider.test(label(button)) &&
                (nativeSubmit(button) ||
                  loginWords.test(label(button)) ||
                  nextWords.test(label(button))),
            )
      )
        return p;
    }
    return root;
  }
  function usernameFor(inputs, password) {
    const candidates = inputs.filter(
      (el) => textTypes.includes(el.type) && !isPassword(el) && !otp(el) && visible(el),
    );
    const before = candidates.filter(
      (el) => el.compareDocumentPosition(password) & Node.DOCUMENT_POSITION_FOLLOWING,
    );
    return (
      before.find(userHint) ||
      candidates.find(userHint) ||
      inputs.find(
        (el) =>
          el.value &&
          !isPassword(el) &&
          (el.type === 'hidden' || el.readOnly || !visible(el)) &&
          userHint(el),
      ) ||
      before.at(-1)
    );
  }
  const isNew = (el) =>
    hasToken(el, 'new-password') ||
    /new.?pass|neues.?pass|confirm|repeat.?pass|wiederhol|bestätig/i.test(hint(el));
  const formHint = (scope) =>
    scope instanceof Element
      ? [scope.id, scope.className, scope.getAttribute('aria-label'), scope.getAttribute('action')]
          .filter(Boolean)
          .join(' ')
      : '';
  function chooseButton(scope) {
    const all = buttons(scope);
    const acceptable = all.filter(
      (el) =>
        !otherAction.test(label(el)) &&
        !otherProvider.test(label(el)) &&
        !transaction.test(label(el)),
    );
    const logins = acceptable.filter((el) => loginWords.test(label(el)));
    if (logins.length) return logins.length === 1 ? logins[0] : null;
    const next = acceptable.filter((el) =>
      /^(next|continue|weiter|fortfahren|submit|senden)[\s.!→]*$/i.test(label(el)),
    );
    if (next.length) return next.length === 1 ? next[0] : null;
    const submits = acceptable.filter(
      (el) => nativeSubmit(el) && /^(ok)?$/i.test(label(el).trim()),
    );
    return submits.length === 1 ? submits[0] : null;
  }
  function sameOriginAction(scope, button) {
    const form = scope instanceof HTMLFormElement ? scope : null;
    const action = button?.hasAttribute('formaction')
      ? button.getAttribute('formaction')
      : form?.getAttribute('action');
    if (transaction.test(action || '') || otherAction.test(action || '')) return false;
    const target = button?.getAttribute('formtarget') ?? form?.getAttribute('target') ?? '';
    if (target && !['_self', '_top', '_parent'].includes(target.toLowerCase())) return false;
    try {
      if (new URL(action || location.href, document.baseURI).origin !== location.origin)
        return false;
      if (button instanceof HTMLAnchorElement && new URL(button.href).origin !== location.origin)
        return false;
      return true;
    } catch {
      return false;
    }
  }

  function passwordPost(form, submitter) {
    const method = submitter?.getAttribute('formmethod') ?? form.getAttribute('method');
    return method?.toLowerCase() === 'post' && sameOriginAction(form, submitter);
  }

  function guardPasswordSubmission(login, operation, submitter = null) {
    const { scope, password } = login;
    if (!password || !(scope instanceof HTMLFormElement)) {
      operation();
      return true;
    }
    let submitted = true;
    const guard = (event) => {
      if (event.target !== scope) return;
      submitter = event.submitter;
      if (!passwordPost(scope, submitter)) {
        submitted = false;
        event.preventDefault();
      }
    };
    const guardData = (event) => {
      if (passwordPost(scope, submitter)) return;
      // A site's submit handler can change the method and stop the event from
      // bubbling. This is the browser's final form-data construction step.
      submitted = false;
      for (const key of [...event.formData.keys()]) event.formData.delete(key);
    };
    window.addEventListener('submit', guard, true);
    window.addEventListener('submit', guard);
    scope.addEventListener('formdata', guardData);
    try {
      operation();
      return submitted;
    } finally {
      window.removeEventListener('submit', guard, true);
      window.removeEventListener('submit', guard);
      scope.removeEventListener('formdata', guardData);
    }
  }

  function activateLogin(login) {
    const { scope, button } = login;
    // Missing and invalid methods default to GET. Filling still works, but
    // activating the form could put the password in history and access logs.
    if (login.password && scope instanceof HTMLFormElement && !passwordPost(scope, button))
      return false;
    return guardPasswordSubmission(
      login,
      () => {
        if (button) button.click();
        else HTMLFormElement.prototype.requestSubmit.call(scope);
      },
      button,
    );
  }

  function candidate(scope) {
    const inputs = fields(scope);
    const context = formHint(scope) + ' ' + location.pathname;
    if (
      !inputs.length ||
      inputs.some((el) => otp(el) && visible(el)) ||
      otherAction.test(formHint(scope)) ||
      transaction.test(formHint(scope))
    )
      return null;
    const passwords = inputs.filter((el) => isPassword(el) && visible(el));
    if (
      passwords.length > 1 ||
      passwords.some((el) => el.type !== 'password' || isNew(el) || el.readOnly)
    )
      return null;
    const button = chooseButton(scope);
    if (
      (!button && (!(scope instanceof HTMLFormElement) || buttons(scope).length)) ||
      !sameOriginAction(scope, button)
    )
      return null;
    const buttonLabel = button ? label(button) : '';
    const password = passwords[0];
    if (
      !loginWords.test(buttonLabel) &&
      !loginWords.test(context) &&
      !/authentica|(?:^|[\s/])sessions?\b/i.test(context) &&
      !(
        passwords.length === 0 &&
        nextWords.test(buttonLabel) &&
        inputs.some((el) => hasToken(el, 'username'))
      )
    )
      return null;
    if (password) {
      const username = usernameFor(inputs, password);
      if (
        !username &&
        !hasToken(password, 'current-password') &&
        !loginWords.test(buttonLabel) &&
        !loginWords.test(formHint(scope) + ' ' + location.pathname)
      )
        return null;
      return { scope, username, password, button, stage: 'password' };
    }
    const users = inputs.filter(
      (el) => textTypes.includes(el.type) && !el.readOnly && visible(el) && userHint(el),
    );
    if (
      users.length !== 1 ||
      !(
        loginWords.test(buttonLabel) ||
        loginWords.test(formHint(scope)) ||
        loginWords.test(location.pathname) ||
        hasToken(users[0], 'username')
      )
    )
      return null;
    return { scope, username: users[0], password: null, button, stage: 'username' };
  }

  let active = null,
    generation = 0;
  const documentID = crypto.randomUUID();
  function refresh() {
    const inputs = [...document.querySelectorAll('input')].filter(
      (el) =>
        !el.disabled && (el.type === 'password' || (textTypes.includes(el.type) && userHint(el))),
    );
    const scopes = new Set(inputs.map((el) => scopeFor(el)));
    const candidates = [...scopes].map(candidate).filter(Boolean);
    const found = candidates.length === 1 ? candidates[0] : null;
    if (
      found &&
      active &&
      ['scope', 'username', 'password', 'button', 'stage'].every((k) => found[k] === active[k])
    )
      return active;
    if (!found && !active) return null;
    active = found && { ...found, token: documentID + '-' + ++generation };
    post({ kind: 'loginForm', form: active?.token || '', stage: active?.stage || '' });
    return active;
  }
  let scheduled = false;
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => {
      scheduled = false;
      refresh();
    }, 40);
  }
  const relevant = (node) =>
    node instanceof Element &&
    (node.matches('input, button, form, [role="button"]') ||
      node.querySelector('input, button, [role="button"]'));
  new MutationObserver((records) => {
    checkAttempt();
    if (
      records.some((r) =>
        r.type === 'attributes'
          ? relevant(r.target)
          : [...r.addedNodes, ...r.removedNodes].some(relevant),
      )
    )
      schedule();
  }).observe(document, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: [
      'type',
      'name',
      'id',
      'autocomplete',
      'readonly',
      'disabled',
      'hidden',
      'style',
      'class',
      'action',
      'formaction',
      'form',
      'aria-label',
      'aria-disabled',
      'role',
      'inert',
    ],
  });
  document.addEventListener('DOMContentLoaded', schedule, { once: true });
  schedule();

  let usernameStep = null,
    lastReport = null,
    dedupTimer,
    stepTimer;
  function credentials(scope) {
    const inputs = fields(scope);
    const passwords = inputs.filter((el) => {
      if (!isPassword(el) || !visible(el)) return false;
      if (scope instanceof HTMLFormElement) return true;
      const owner = scopeFor(el);
      return owner === scope || owner.contains(scope);
    });
    if (!passwords.length) {
      return null;
    }
    if (passwords.some(otp)) return;
    const newFields = passwords.filter(isNew);
    let password;
    if (newFields.length) {
      password = newFields[0];
      if (!password.value || newFields.some((el) => el.value !== password.value)) return;
    } else {
      const current = passwords.find((el) => hasToken(el, 'current-password'));
      if (
        passwords.length > 1 &&
        !passwords.every((el) => el.value && el.value === passwords[0].value)
      ) {
        // Unlabelled current / new / confirmation forms can still establish
        // the new password when the final two fields agree.
        if (
          passwords.length !== 3 ||
          !passwords[1].value ||
          passwords[1].value !== passwords[2].value
        )
          return;
        password = passwords[1];
      } else password = current || passwords[0];
    }
    if (!password.value) return;
    const username =
      usernameFor(inputs, password)?.value ||
      (usernameStep?.until > Date.now() ? usernameStep.username : '');
    return { username, password: password.value };
  }
  function sendCredential(body) {
    if (!body || (lastReport?.username === body.username && lastReport.password === body.password))
      return;
    editedPassword = null;
    lastReport = body;
    clearTimeout(dedupTimer);
    dedupTimer = setTimeout(() => {
      lastReport = null;
    }, 1000);
    post(lastReport);
  }
  function report(scope) {
    const body = credentials(scope);
    if (body) {
      sendCredential(body);
      return;
    }
    const login = candidate(scope);
    if (login?.stage === 'username' && login.username.value) {
      const username = login.username.value;
      if (usernameStep?.username !== username) post({ kind: 'usernameStep', username });
      usernameStep = { username, until: Date.now() + 300000 };
      clearTimeout(stepTimer);
      stepTimer = setTimeout(() => {
        usernameStep = null;
      }, 300000);
    }
  }
  let editedPassword = null,
    pendingAttempt = null,
    attemptTimer,
    trustedForm = null,
    gestureTimer;
  function clearAttempt() {
    pendingAttempt = null;
    clearTimeout(attemptTimer);
  }
  function checkAttempt(navigating = false) {
    if (!pendingAttempt) return;
    const { field, scope, body } = pendingAttempt;
    if (
      !navigating &&
      (field.isConnected || fields(scope).some((el) => el.type === 'password' && visible(el)))
    )
      return;
    clearAttempt();
    sendCredential(body);
  }
  document.addEventListener(
    'input',
    (event) => {
      if (!event.isTrusted) return;
      clearAttempt();
      const field = event.composedPath()[0];
      if (field instanceof HTMLInputElement && isPassword(field)) {
        editedPasswords.add(field);
        editedPassword = field;
      }
    },
    true,
  );
  window.addEventListener('pagehide', () => checkAttempt(true));
  function markGesture(scope) {
    trustedForm = scope;
    clearTimeout(gestureTimer);
    gestureTimer = setTimeout(() => {
      trustedForm = null;
    }, 0);
  }
  function eventControl(event) {
    return event
      .composedPath()
      .find((node) => node instanceof Element && node.matches(buttonSelector));
  }
  document.addEventListener(
    'submit',
    (event) => {
      if (
        event.isTrusted &&
        event.target instanceof HTMLFormElement &&
        event.target === trustedForm
      )
        report(event.target);
    },
    true,
  );
  document.addEventListener(
    'click',
    (event) => {
      if (!event.isTrusted) return;
      clearAttempt();
      const button =
        eventControl(event) || event.composedPath().find((el) => el instanceof HTMLElement);
      if (
        !button ||
        button.matches(
          'html, body, label, form, textarea, select, input:not([type="submit"]):not([type="button"]):not([type="image"])',
        ) ||
        button.closest('label, [contenteditable="true"]')
      )
        return;
      const title = label(button);
      if (
        otherProvider.test(title) ||
        transaction.test(title) ||
        /show password|hide password|passwort anzeigen|passwort verbergen|forgot|vergessen|abbrechen|cancel|schließen|close|zurück|\bback\b/i.test(
          title,
        )
      )
        return;
      const scope = scopeFor(button, true);
      markGesture(scope);
      if (
        !nativeSubmit(button) &&
        !loginWords.test(title) &&
        !nextWords.test(title) &&
        !/register|registrier|sign[\s_-]?up|change password|passwort ändern/i.test(title)
      ) {
        // Custom SPA actions can have no button role or login label. Only report
        // once the user acts in this login widget and the edited field actually
        // disappears or its document navigates.
        if (
          !editedPassword?.value ||
          !visible(editedPassword) ||
          !fields(scope).includes(editedPassword) ||
          (button instanceof HTMLAnchorElement && button.getAttribute('href')?.match(/^[^#]/))
        )
          return;
        const body = credentials(scope);
        if (body) {
          pendingAttempt = { field: editedPassword, scope, body };
          attemptTimer = setTimeout(clearAttempt, 10000);
        }
        return;
      }
      if (
        button.form &&
        nativeSubmit(button) &&
        !button.form.noValidate &&
        !button.formNoValidate &&
        !button.form.matches(':valid')
      )
        return;
      report(scope);
    },
    true,
  );
  document.addEventListener(
    'keydown',
    (event) => {
      const el = event.composedPath()[0];
      if (
        event.isTrusted &&
        event.key === 'Enter' &&
        !event.isComposing &&
        el instanceof HTMLInputElement &&
        (el.type === 'password' || textTypes.includes(el.type)) &&
        !otp(el)
      ) {
        const scope = scopeFor(el);
        markGesture(scope);
        report(scope);
      }
    },
    true,
  );

  const assign = (el, value) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };
  window.__lunaFill = (
    username,
    password,
    submit = false,
    form = '',
    expectedOrigin = location.origin,
  ) => {
    const result = { ok: false, username: false, password: false };
    if (submit) Object.assign(result, { submitted: false, stage: '' });
    const fail = (error) => ({ ...result, error });
    if (expectedOrigin !== location.origin) return fail('origin');
    const login = refresh();
    if (submit) {
      if (!login || (form && form !== login.token) || !sameOriginAction(login.scope, login.button))
        return fail('no-form');
      result.stage = login.stage;
      if (
        login.submitted ||
        login.waiting ||
        (login.username?.value && login.username.value !== username) ||
        (login.password?.value && login.password.value !== password)
      )
        return fail('conflict');
      if (submit === 2) return { ...result, ok: true };
      if (document.visibilityState !== 'visible') return fail('tab');
      if (login.username && username && !login.username.value) {
        if (login.username.readOnly || !visible(login.username)) return fail('conflict');
        guardPasswordSubmission(login, () => assign(login.username, username));
        result.username = true;
      }
      if (login.password && password && !login.password.value) {
        if (
          expectedOrigin !== location.origin ||
          !login.password.isConnected ||
          !sameOriginAction(login.scope, login.button)
        )
          return fail('origin');
        guardPasswordSubmission(login, () => assign(login.password, password));
        result.password = true;
      }
      const complete = () => {
        if (
          document.visibilityState !== 'visible' ||
          expectedOrigin !== location.origin ||
          refresh() !== login ||
          !sameOriginAction(login.scope, login.button) ||
          login.button?.disabled ||
          login.button?.getAttribute('aria-disabled') === 'true' ||
          (login.username && username && login.username.value !== username) ||
          (login.password && (!password || login.password.value !== password))
        )
          return fail('no-form');
        if (
          login.scope instanceof HTMLFormElement &&
          !login.scope.noValidate &&
          !login.button?.formNoValidate &&
          !login.scope.matches(':valid')
        )
          return fail('invalid');
        login.submitted = true;
        result.submitted = activateLogin(login);
        result.ok = true;
        return result;
      };
      // Some sites enable the login action after validating the edited fields.
      // Wait only for this particular control and check the form again before
      // submitting. Losing foreground focus cancels the pending action.
      if (login.button?.disabled || login.button?.getAttribute('aria-disabled') === 'true') {
        login.waiting = true;
        return new Promise((resolve) => {
          const finish = (event) => {
            observer.disconnect();
            clearTimeout(timer);
            window.removeEventListener('blur', finish);
            document.removeEventListener('visibilitychange', finish);
            login.waiting = false;
            resolve(event ? fail('tab') : complete());
          };
          const observer = new MutationObserver(() => {
            if (
              !login.button.isConnected ||
              (!login.button.disabled && login.button.getAttribute('aria-disabled') !== 'true')
            )
              finish();
          });
          observer.observe(login.button, {
            attributes: true,
            attributeFilter: ['disabled', 'aria-disabled'],
          });
          window.addEventListener('blur', finish, { once: true });
          document.addEventListener('visibilitychange', finish, { once: true });
          const timer = setTimeout(finish, 1500);
        });
      }
      return complete();
    }
    // Manual filling also works on forms with no submit control.
    const all = [...document.querySelectorAll('input')].filter((el) => !el.disabled && visible(el));
    const field =
      login?.password || all.find((el) => el.type === 'password' && !isNew(el) && !el.readOnly);
    const user = field
      ? usernameFor(fields(scopeFor(field)), field)
      : all.find((el) => textTypes.includes(el.type) && userHint(el) && !otp(el));
    if (user && username && !user.readOnly && visible(user)) {
      assign(user, username);
      result.username = true;
    }
    if (field && field.isConnected && password) {
      assign(field, password);
      result.password = true;
    }
    result.ok = result.username || result.password;
    return result.ok ? result : fail('no-form');
  };
})();
