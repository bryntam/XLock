const serviceUrl = "http://localhost:47831";
async function refresh() {
  try {
    const response = await fetch(`${serviceUrl}/status`);
    const payload = await response.json();
    status.textContent = payload.data.twitterAllowed ? "X is unlocked" : "X is blocked";
  } catch {
    status.textContent = "Local service is not running";
  }
}
async function post(path) {
  await fetch(`${serviceUrl}${path}`, { method: "POST" });
  await refresh();
}
start.onclick = () => post("/session/start");
end.onclick = () => post("/session/end");
refresh();
