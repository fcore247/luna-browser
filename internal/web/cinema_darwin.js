// Injected at document start in the main frame. Keep each site's original player,
// media session, subtitles, and controls in the same document and WebKit view.
(() => {
  'use strict';
  if (window !== window.top || location.protocol !== 'https:') return;
  const youtube = ['www.youtube.com', 'youtube.com', 'm.youtube.com'].includes(location.hostname);
  const netflix = ['www.netflix.com', 'netflix.com'].includes(location.hostname);
  if ((!youtube && !netflix) || typeof HTMLElement.prototype.showPopover !== 'function' ||
      !('adoptedStyleSheets' in document) || typeof CSSStyleSheet.prototype.replaceSync !== 'function') return;
  function send(action, id) {
    const request = new CustomEvent('luna-cinema-request', {
      cancelable:true, detail:JSON.stringify({ action, id })
    });
    if (window.dispatchEvent(request)) throw new TypeError('Luna Cinema bridge unavailable');
  }

  const playerSelector = youtube
    ? '#movie_player, .html5-video-player'
    : '.watch-video, .watch-video--player-view, [data-uia="video-canvas"]';
  const fullscreenGetter = Object.getOwnPropertyDescriptor(Document.prototype, 'fullscreenElement')?.get;
  if (!fullscreenGetter) return;

  // IDs differ across documents as a late completion can arrive after navigation.
  let sequence = crypto.getRandomValues(new Uint32Array(1))[0] & 0x3fffffff;
  const nextId = () => ++sequence;
  let session = null;
  let pending = null;
  const marker = 'data-luna-cinema-player';
  const selector = '[' + marker + ']';
  const css = selector + ':popover-open{position:fixed!important;inset:0!important;margin:0!important;' +
    'padding:0!important;border:0!important;box-sizing:border-box!important;width:100vw!important;' +
    'height:100vh!important;min-width:0!important;min-height:0!important;max-width:none!important;' +
    'max-height:none!important;transform:none!important;overflow:hidden!important;background:#000!important}' +
    selector + '::backdrop{background:#000!important}';

  function playerFor(target, options) {
    if (!(target instanceof HTMLElement) || !target.isConnected || target.ownerDocument !== document ||
        !navigator.userActivation?.isActive || !document.fullscreenEnabled ||
        document.visibilityState !== 'visible' || fullscreenGetter.call(document) ||
        document.querySelector('dialog:modal') || (options && ('screen' in Object(options)))) return null;
    if (netflix && !/^\/watch\/\d+(?:\/|$)/.test(location.pathname)) return null;
    if (youtube && /^\/embed\//.test(location.pathname)) return null;

    const root = target === document.body || target === document.documentElement;
    const candidates = root ? document.querySelectorAll(playerSelector) :
      [target.closest(playerSelector) || target.querySelector(playerSelector)];
    for (const candidate of candidates) {
      if (!candidate) continue;
      const surface = (youtube && candidate.closest('ytd-watch-flexy, ytd-watch-grid')) || candidate;
      if (surface.hasAttribute('popover') || surface.hasAttribute(marker)) continue;
      const video = candidate.querySelector('video');
      if (!video || (!root && !target.contains(video) && target !== video)) continue;
      const rect = candidate.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0 || rect.bottom <= 0 || rect.top >= innerHeight) continue;
      return candidate;
    }
    return null;
  }

  function notify(type, target) {
    const receiver = target?.isConnected ? target : document;
    receiver.dispatchEvent(new Event(type, { bubbles:true, composed:true }));
    receiver.dispatchEvent(new Event('webkit' + type, { bubbles:true, composed:true }));
  }

  // A site's fullscreenchange handler can detach and reinsert the very control
  // that invoked it. Only repair that loss if focus fell back to the document.
  let focusRevision = 0;
  let lastControl = null;
  let windowBlurRevision = 0;
  let focusRepair = null;
  const focusChanged = () => { focusRevision++; };
  document.addEventListener('pointerdown', focusChanged, true);
  document.addEventListener('keydown', event => { if (event.key === 'Tab') focusChanged(); }, true);
  document.addEventListener('visibilitychange', focusChanged, true);
  window.addEventListener('blur', () => { windowBlurRevision++; });
  document.addEventListener('focusin', event => {
    if (event.target === document.body || event.target === document.documentElement) return;
    if (event.target !== lastControl) focusChanged();
    lastControl = event.target;
  }, true);

  function playerControl(player, element) {
    return element instanceof HTMLElement && player.contains(element) && !element.isContentEditable &&
      !element.closest('input, textarea, select, [role="textbox"], [inert]') &&
      !element.matches(':disabled, [aria-disabled="true"]') &&
      element.matches('button, a[href], video[controls], [tabindex]');
  }

  function rememberControl(player) {
    const element = document.activeElement;
    if (document.visibilityState !== 'visible' || !document.hasFocus() || !playerControl(player, element)) return null;
    lastControl = element;
    return { element, player, revision:focusRevision, blurRevision:windowBlurRevision };
  }

  function restoreControl(bookmark, nativeOwnsFocus = false) {
    if (!bookmark || bookmark.revision !== focusRevision ||
        (!nativeOwnsFocus && bookmark.blurRevision !== windowBlurRevision) || document.visibilityState !== 'visible' ||
        !document.hasFocus() || (document.activeElement !== document.body &&
        document.activeElement !== document.documentElement)) return;
    const { element, player } = bookmark;
    // If the site replaced its control, use its existing focusable player.
    // Never add a tab stop or choose an unrelated button or editor.
    const destination = element.isConnected ? element : player;
    if (playerControl(player, destination) && visibleRect(destination)) destination.focus({ preventScroll:true });
  }

  // Losing AppKit's first responder during resize temporarily blurs this
  // document. Native sends this ticket only after the same tab owns keyboard
  // focus again. A pointer, Tab, focus selection or visibility change wins.
  Object.defineProperty(window, '__lunaCinemaRestoreFocus', { value(ticket) {
    const repair = focusRepair;
    if (!repair || repair.ticket !== ticket) return;
    const blur = windowBlurRevision;
    const deadline = performance.now() + 200;
    // WebKit's focus notification can follow the native responder callback.
    // Allow that handoff one short window, scoped to the original ticket.
    function finish() {
      window.removeEventListener('focus', onFocus);
      if (focusRepair !== repair) return;
      focusRepair = null;
      if (windowBlurRevision === blur && performance.now() <= deadline) restoreControl(repair.bookmark, true);
    }
    function onFocus() { setTimeout(finish, 0); }
    if (document.hasFocus()) finish();
    else {
      window.addEventListener('focus', onFocus, { once:true });
      setTimeout(finish, 200);
    }
  } });

  function clearPlayer(current) {
    current.observer.disconnect();
    const { surface } = current;
    surface.removeEventListener('toggle', current.keepPlayerPresented);
    if (surface.matches(':popover-open')) surface.hidePopover();
    surface.removeAttribute(marker);
    surface.removeAttribute('popover');
    document.adoptedStyleSheets = document.adoptedStyleSheets.filter(sheet => sheet !== current.style);
  }

  function preparePlayer(target, player, viewport) {
    // YouTube handles fullscreenchange by moving its player to another slot and
    // measuring it there. Keep the stable watch surface in the top layer so the
    // player retains its size throughout that move, including its controls.
    const surface = (youtube && player.closest('ytd-watch-flexy, ytd-watch-grid')) || player;
    const style = new CSSStyleSheet();
    style.replaceSync(css);
    function observeParents() {
      observer.disconnect();
      for (const element of [target, player]) {
        for (let parent = element.parentNode; parent; parent = parent.parentNode) {
          observer.observe(parent, { childList:true });
        }
      }
    }
    function keepPlayerPresented() {
      if (session !== current || pending?.action === 'exit') return;
      if (!surface.isConnected || !player.isConnected || !target.isConnected) {
        exit().catch(() => {});
      } else if (!surface.matches(':popover-open')) {
        try {
          surface.showPopover();
          observeParents();
        }
        catch { exit().catch(() => {}); }
      }
    }
    const observer = new MutationObserver(keepPlayerPresented);
    const current = { target, player, surface, style, observer, viewport, keepPlayerPresented };
    try {
      document.adoptedStyleSheets = [...document.adoptedStyleSheets, style];
      surface.setAttribute(marker, '');
      surface.setAttribute('popover', 'manual');
      surface.showPopover();
      if (!surface.matches(':popover-open')) throw new Error('Player did not enter the top layer');
      observeParents();
      surface.addEventListener('toggle', keepPlayerPresented);
      return current;
    } catch (error) {
      clearPlayer(current);
      throw error;
    }
  }

  function restore() {
    if (!session) return;
    const current = session;
    session = null;
    clearPlayer(current);
    notify('fullscreenchange', current.target);
    return current;
  }

  function visibleRect(element) {
    if (!element.isConnected) return false;
    if (element.checkVisibility && !element.checkVisibility({checkOpacity:true, checkVisibilityCSS:true})) return false;
    const style = getComputedStyle(element);
    if (style.visibility !== 'visible' || Number(style.opacity) === 0) return false;
    const rect = element.getBoundingClientRect();
    return Math.min(innerWidth, rect.right) > Math.max(0, rect.left) &&
           Math.min(innerHeight, rect.bottom) > Math.max(0, rect.top) ? rect : null;
  }

  function reportLayout(ticket, stillCurrent, geometryIsReady, focus) {
    if (!Number.isSafeInteger(ticket) || ticket <= 0) return;
    focusRepair = focus ? { ticket, bookmark:focus } : null;
    const deadline = performance.now() + 3000;
    // A covering window can throttle rAF. Measure after the site's event
    // handlers and promise reactions; native WebKit fences the actual repaint.
    function checkLayout() {
      if (!stillCurrent()) return;
      if (geometryIsReady()) {
        restoreControl(focus);
        try { send('ready', ticket); } catch {}
      } else if (performance.now() < deadline) {
        setTimeout(checkLayout, 16);
      }
    }
    setTimeout(checkLayout, 0);
  }

  function viewportMatches(width, height) {
    return Math.abs(innerWidth - width) <= 1 && Math.abs(innerHeight - height) <= 1;
  }

  function reportCinemaLayout(ticket, current, width, height, focus) {
    const { player, surface } = current;
    reportLayout(ticket, () => session === current && pending?.action !== 'exit', () => {
      if (!viewportMatches(width, height) || !surface.matches(':popover-open')) return false;
      const bounds = visibleRect(surface);
      if (!bounds || Math.abs(bounds.width - width) > 2 || Math.abs(bounds.height - height) > 2) return false;
      // During YouTube's player move the watch surface can already fill the
      // screen while the decoded video still has its former inline dimensions.
      return [...player.querySelectorAll('video')].some(video => {
        if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !video.videoWidth || !video.videoHeight) return false;
        const rect = visibleRect(video);
        if (!rect) return false;
        const scale = Math.min(width / video.videoWidth, height / video.videoHeight);
        const visibleWidth = Math.min(width, rect.right) - Math.max(0, rect.left);
        const visibleHeight = Math.min(height, rect.bottom) - Math.max(0, rect.top);
        return visibleWidth >= video.videoWidth * scale - 2 &&
               visibleHeight >= video.videoHeight * scale - 2;
      });
    }, focus);
  }

  function reportRestoredLayout(ticket, previous, focus) {
    if (!previous) return;
    const { player, surface, viewport } = previous;
    reportLayout(ticket, () => !session && player.isConnected, () => {
      const siteInline = !youtube || viewport.hadFullscreenClass || !player.classList.contains('ytp-fullscreen');
      return viewportMatches(viewport.width, viewport.height) && siteInline && !surface.matches(':popover-open') &&
             visibleRect(player) && [...player.querySelectorAll('video')].some(visibleRect);
    }, focus);
  }

  function command(action, target, player) {
    const id = nextId();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (pending?.id !== id) return;
        pending = null;
        // A late enter must unwind even if the native acknowledgement was lost.
        try { send('exit', nextId()); } catch {}
        restore();
        notify('fullscreenerror', target);
        reject(new TypeError('Luna Cinema timed out'));
      }, 8000);
      focusRepair = null;
      const viewport = action === 'enter' ? {
        width:innerWidth, height:innerHeight, hadFullscreenClass:player.classList.contains('ytp-fullscreen')
      } : null;
      pending = { action, id, target, player, viewport, focus:rememberControl(player), timer, resolve, reject };
      try { send(action, id); }
      catch (error) { clearTimeout(timer); pending = null; reject(error); }
    });
  }

  function exit() {
    if (pending?.action === 'exit') return pending.promise;
    if (!session) return Promise.resolve();
    const promise = command('exit', session.target, session.player);
    if (pending) pending.promise = promise;
    return promise;
  }

  Object.defineProperty(window, '__lunaCinemaReply', { value(id, state, nativeTicket, width, height) {
    if (id === 0 && state === 'exited') {
      focusRepair = null;
      const previous = pending;
      if (previous) { clearTimeout(previous.timer); pending = null; }
      const focus = previous?.focus || (session && rememberControl(session.player));
      reportRestoredLayout(nativeTicket, restore(), focus);
      if (previous?.action === 'exit') previous.resolve();
      else if (previous) previous.reject(new TypeError('Luna Cinema was closed'));
      return;
    }
    const request = pending;
    if (!request || id !== request.id) return;
    clearTimeout(request.timer);
    pending = null;
    try {
      if (state === 'entered' && request.action === 'enter') {
        if (!request.player.isConnected || !request.target.isConnected) throw new TypeError('Player was removed');
        session = preparePlayer(request.target, request.player, request.viewport);
        notify('fullscreenchange', request.target);
        reportCinemaLayout(nativeTicket, session, width, height, request.focus);
      } else if (state === 'exited' && request.action === 'exit') {
        reportRestoredLayout(nativeTicket || id, restore(), request.focus);
      } else {
        throw new TypeError('Luna Cinema is unavailable');
      }
      request.resolve();
    } catch (error) {
      if (state === 'entered') {
        try { send('exit', nextId()); } catch {}
      }
      notify('fullscreenerror', request.target);
      request.reject(error);
    }
  } });

  // Wrap only APIs WebKit actually exposes. Keep native behavior, return types,
  // descriptors and exceptions for all calls outside the supported players.
  function wrap(proto, name, intercept) {
    const descriptor = Object.getOwnPropertyDescriptor(proto, name);
    if (!descriptor?.configurable || typeof descriptor.value !== 'function') return;
    const original = descriptor.value;
    Object.defineProperty(proto, name, { ...descriptor, value:function(...args) {
      return intercept.call(this, () => Reflect.apply(original, this, args), args);
    } });
  }
  function enterNativeOrCinema(fallback, args, legacy) {
    if (session?.target === this) return legacy ? undefined : Promise.resolve();
    if (pending?.action === 'enter' && pending.target === this) return legacy ? undefined : pending.promise;
    const player = playerFor(this, args[0]);
    if (!player || session || pending) return fallback();
    const promise = command('enter', this, player);
    if (pending) pending.promise = promise;
    if (!legacy) return promise;
    promise.catch(() => {});
  }

  for (const name of ['requestFullscreen', 'webkitRequestFullscreen', 'webkitRequestFullScreen']) {
    wrap(Element.prototype, name, function(fallback, args) {
      return enterNativeOrCinema.call(this, fallback, args, name !== 'requestFullscreen');
    });
  }
  for (const name of ['exitFullscreen', 'webkitExitFullscreen', 'webkitCancelFullScreen']) {
    wrap(Document.prototype, name, function(fallback) {
      if (this !== document || !session) return fallback();
      const promise = exit();
      if (name === 'exitFullscreen') return promise;
      promise.catch(() => {});
    });
  }

  for (const name of ['fullscreenElement', 'webkitFullscreenElement', 'webkitCurrentFullScreenElement', 'webkitIsFullScreen']) {
    const descriptor = Object.getOwnPropertyDescriptor(Document.prototype, name);
    if (!descriptor?.configurable || !descriptor.get) continue;
    Object.defineProperty(Document.prototype, name, { ...descriptor, get() {
      if (session && this === document) return name === 'webkitIsFullScreen' ? true : session.target;
      return descriptor.get.call(this);
    } });
  }
  window.addEventListener('keydown', event => {
    if (session && event.isTrusted && event.key === 'Escape') {
      event.preventDefault();
      event.stopImmediatePropagation();
      exit().catch(() => {});
    }
  }, true);
  window.addEventListener('pagehide', () => {
    focusRepair = null;
    lastControl = null;
    if (!pending && !session) return;
    if (pending) {
      clearTimeout(pending.timer);
      pending.reject(new DOMException('Page navigation', 'AbortError'));
      pending = null;
    }
    try { send('exit', nextId()); } catch {}
    restore();
  });
})();
