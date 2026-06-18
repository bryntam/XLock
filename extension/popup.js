const serviceUrl = "http://localhost:47831";
async function refresh() {
  try {
    const response = await fetch(`${serviceUrl}/status`);
    const payload = await response.json();
    status.textContent = payload.data.armed
      ? (payload.data.twitterAllowed ? "XLock armed: X is unlocked" : "XLock armed: X is blocked")
      : "XLock paused: X is normal";
  } catch {
    status.textContent = "Local service is not running";
  }
}
async function post(path) {
  await fetch(`${serviceUrl}${path}`, { method: "POST" });
  await refresh();
}
arm.onclick = () => post("/gate/arm");
pause.onclick = () => post("/gate/pause");
end.onclick = () => post("/session/end");
refresh();
