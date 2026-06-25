(function () {
  const legacyOverlayId = "xlock-overlay";
  const overlayId = "xlock-overlay-v2";
  const scriptVersion = "xlock-background-status-v2";
  const statusCacheKey = "xlockLastStatus";
  const fallbackWindowMs = 30_000;
  const scrollKeys = new Set(["ArrowDown", "ArrowUp", "End", "Home", "PageDown", "PageUp", " "]);
  let tickInFlight = false;
  let scrollLock = null;

  if (window.__xlockContentScriptVersion === scriptVersion) return;
  window.__xlockContentScriptVersion = scriptVersion;

  function ensureOverlay() {
    let overlay = document.getElementById(overlayId);
    if (overlay) {
      overlay.dataset.xlockVersion = scriptVersion;
      return overlay;
    }
    overlay = document.createElement("div");
    overlay.id = overlayId;
    overlay.dataset.xlockVersion = scriptVersion;
    overlay.style.cssText = [
      "position:fixed",
      "inset:0",
      "z-index:2147483647",
      "display:flex",
      "align-items:center",
      "justify-content:center",
      "background:rgba(10,12,16,.94)",
      "color:#f7f7f0",
      "font:600 18px -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif",
      "text-align:center",
      "padding:24px"
    ].join(";");
    overlay.innerHTML = "<div><div style='font-size:32px;margin-bottom:8px'>X is locked</div><div>Start a Codex build to unlock X while you ship.</div></div>";
    document.documentElement.appendChild(overlay);
    return overlay;
  }

  function preventScroll(event) {
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  function preventScrollKey(event) {
    if (!scrollKeys.has(event.key)) return;
    preventScroll(event);
  }

  function restoreScrollPosition() {
    if (!scrollLock) return;
    window.scrollTo(scrollLock.x, scrollLock.y);
  }

  function enableScrollLock() {
    if (scrollLock) return;

    scrollLock = {
      x: window.scrollX,
      y: window.scrollY,
      htmlOverflow: document.documentElement.style.overflow,
      htmlOverscrollBehavior: document.documentElement.style.overscrollBehavior,
      bodyOverflow: document.body?.style.overflow || "",
      bodyOverscrollBehavior: document.body?.style.overscrollBehavior || ""
    };

    document.documentElement.style.overflow = "hidden";
    document.documentElement.style.overscrollBehavior = "none";
    if (document.body) {
      document.body.style.overflow = "hidden";
      document.body.style.overscrollBehavior = "none";
    }

    window.addEventListener("wheel", preventScroll, { capture: true, passive: false });
    window.addEventListener("touchmove", preventScroll, { capture: true, passive: false });
    window.addEventListener("keydown", preventScrollKey, { capture: true });
    window.addEventListener("scroll", restoreScrollPosition, { capture: true });
  }

  function disableScrollLock() {
    if (!scrollLock) return;

    window.removeEventListener("wheel", preventScroll, { capture: true });
    window.removeEventListener("touchmove", preventScroll, { capture: true });
    window.removeEventListener("keydown", preventScrollKey, { capture: true });
    window.removeEventListener("scroll", restoreScrollPosition, { capture: true });

    document.documentElement.style.overflow = scrollLock.htmlOverflow;
    document.documentElement.style.overscrollBehavior = scrollLock.htmlOverscrollBehavior;
    if (document.body) {
      document.body.style.overflow = scrollLock.bodyOverflow;
      document.body.style.overscrollBehavior = scrollLock.bodyOverscrollBehavior;
    }

    const { x, y } = scrollLock;
    scrollLock = null;
    window.scrollTo(x, y);
  }

  function setBlocked(blocked) {
    if (!blocked) {
      document.getElementById(overlayId)?.remove();
      document.getElementById(legacyOverlayId)?.remove();
      disableScrollLock();
      return;
    }

    document.getElementById(legacyOverlayId)?.remove();
    ensureOverlay();
    enableScrollLock();
  }

  function blockedFromPayload(payload) {
    return Boolean(payload?.data?.locked && !payload.data.twitterAllowed);
  }

  function blockedFromCache(cache) {
    if (!cache?.data || typeof cache.updatedAt !== "number") return null;
    if (Date.now() - cache.updatedAt > fallbackWindowMs) return null;
    return Boolean(cache.data.locked && !cache.data.twitterAllowed);
  }

  async function rememberStatus(payload) {
    if (!payload?.data) return;
    await chrome.storage.local.set({
      [statusCacheKey]: {
        data: payload.data,
        updatedAt: Date.now()
      }
    });
  }

  async function readCachedBlocked() {
    const result = await chrome.storage.local.get(statusCacheKey);
    return blockedFromCache(result?.[statusCacheKey]);
  }

  async function tick() {
    if (tickInFlight) return;
    tickInFlight = true;

    try {
      const response = await chrome.runtime.sendMessage({ type: "xlock-status", url: location.href });
      if (!response?.ok) {
        const cachedBlocked = blockedFromCache(response?.cached) ?? await readCachedBlocked();
        if (cachedBlocked !== null) {
          setBlocked(cachedBlocked);
          return;
        }
        throw new Error(response?.error || "XLock status unavailable");
      }
      const payload = response.payload;
      await rememberStatus(payload);
      setBlocked(blockedFromPayload(payload));
    } catch {
      const cachedBlocked = await readCachedBlocked();
      setBlocked(cachedBlocked === null ? false : cachedBlocked);
    } finally {
      tickInFlight = false;
    }
  }

  tick();
  setInterval(tick, 1000);
})();
