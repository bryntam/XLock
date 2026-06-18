const serviceUrl = "http://localhost:47831";
async function refresh() {
  try {
    const response = await fetch(`${serviceUrl}/status`);
    const payload = await response.json();
    status.textContent = payload.data.locked
      ? (payload.data.twitterAllowed ? "XLock locked: X is unlocked for Codex" : "XLock locked: X is locked")
      : "XLock unlocked: X is normal";
  } catch {
    status.textContent = "Local service is not running";
  }
}
async function post(path) {
  await fetch(`${serviceUrl}${path}`, { method: "POST" });
  await refresh();
}
lock.onclick = () => post("/gate/lock");
unlock.onclick = () => post("/gate/unlock");
end.onclick = () => post("/session/end");
refresh();
