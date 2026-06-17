(function () {
  const serviceUrl = "http://localhost:47831";
  const overlayId = "build-in-public-gate-overlay";

  function ensureOverlay() {
    let overlay = document.getElementById(overlayId);
    if (overlay) return overlay;
    overlay = document.createElement("div");
    overlay.id = overlayId;
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
    overlay.innerHTML = "<div><div style='font-size:32px;margin-bottom:8px'>X is blocked</div><div>Start a Codex build to keep building in public.</div></div>";
    document.documentElement.appendChild(overlay);
    return overlay;
  }

  function setBlocked(blocked) {
    const overlay = ensureOverlay();
    overlay.style.display = blocked ? "flex" : "none";
  }

  async function tick() {
    try {
      await fetch(`${serviceUrl}/extension/heartbeat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: location.href })
      });
      const response = await fetch(`${serviceUrl}/status`);
      const payload = await response.json();
      setBlocked(!payload.data.twitterAllowed);
    } catch {
      setBlocked(true);
    }
  }

  tick();
  setInterval(tick, 1000);
})();
