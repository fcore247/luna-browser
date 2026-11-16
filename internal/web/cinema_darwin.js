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

  function visibleInViewport(element) {
    if (!element.isConnected) return false;
    if (element.checkVisibility && !element.checkVisibility({checkOpacity:true, checkVisibilityCSS:true})) return false;
    const style = getComputedStyle(element);
    if (style.visibility !== 'visible' || Number(style.opacity) === 0) return false;
    const rect = element.getBoundingClientRect();
    return Math.min(innerWidth, rect.right) > Math.max(0, rect.left) &&
           Math.min(innerHeight, rect.bottom) > Math.max(0, rect.top);
  }

  function reportRestoredLayout(ticket, previous) {
    if (!previous || !Number.isSafeInteger(ticket) || ticket <= 0) return;
    const { player, surface, viewport } = previous;
    const deadline = performance.now() + 400;
    // A covering window can throttle rAF in WebKit. Once the site's inline
    // layout is measurable, native code waits for WebKit's next presentation.
    function checkLayout() {
      if (session || !player.isConnected) return;
      const normalViewport = Math.abs(innerWidth - viewport.width) <= 1 &&
                             Math.abs(innerHeight - viewport.height) <= 1;
      const siteInline = !youtube || viewport.hadFullscreenClass || !player.classList.contains('ytp-fullscreen');
      if (normalViewport && siteInline && !surface.matches(':popover-open') && visibleInViewport(player) &&
          [...player.querySelectorAll('video')].some(visibleInViewport)) {
        try { send('ready', ticket); } catch {}
      } else if (performance.now() < deadline) {
        setTimeout(checkLayout, 16);
      }
    }
    // Site handlers and exitFullscreen().then(...) finish before measuring.
    setTimeout(checkLayout, 0);
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
      const viewport = action === 'enter' ? {
        width:innerWidth, height:innerHeight, hadFullscreenClass:player.classList.contains('ytp-fullscreen')
      } : null;
      pending = { action, id, target, player, viewport, timer, resolve, reject };
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

  Object.defineProperty(window, '__lunaCinemaReply', { value(id, state, nativeExitTicket) {
    if (id === 0 && state === 'exited') {
      const previous = pending;
      if (previous) { clearTimeout(previous.timer); pending = null; }
      reportRestoredLayout(nativeExitTicket, restore());
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
      } else if (state === 'exited' && request.action === 'exit') {
        reportRestoredLayout(nativeExitTicket || id, restore());
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
