const serviceUrl = "http://localhost:47831";
const xUrlPattern = /^https:\/\/(x|twitter)\.com\//;
const statusCacheKey = "xlockLastStatus";

function isXUrl(url) {
  return typeof url === "string" && xUrlPattern.test(url);
}

async function inject(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content.js"]
    });
  } catch {
    // Tabs can disappear or deny script injection while Arc is switching spaces.
  }
}

async function injectOpenXTabs() {
  const tabs = await chrome.tabs.query({ url: ["https://x.com/*", "https://twitter.com/*"] });
  await Promise.all(tabs.map((tab) => typeof tab.id === "number" ? inject(tab.id) : undefined));
}

async function readStatus(url) {
  const response = await fetch(`${serviceUrl}/status`);
  const payload = await response.json();
  await rememberStatus(payload);

  fetch(`${serviceUrl}/extension/heartbeat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url })
  }).catch(() => undefined);

  return payload;
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

async function cachedStatus() {
  const result = await chrome.storage.local.get(statusCacheKey);
  return result?.[statusCacheKey] || null;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "xlock-status") return false;

  readStatus(message.url)
    .then((payload) => sendResponse({ ok: true, payload }))
    .catch(async (error) => {
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
        cached: await cachedStatus()
      });
    });

  return true;
});

chrome.runtime.onInstalled.addListener(() => {
  injectOpenXTabs().catch(() => undefined);
});

chrome.runtime.onStartup.addListener(() => {
  injectOpenXTabs().catch(() => undefined);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && isXUrl(tab.url)) inject(tabId);
});

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    const tab = await chrome.tabs.get(tabId);
    if (isXUrl(tab.url)) inject(tabId);
  } catch {
    // The active tab can disappear while Arc is changing windows or spaces.
  }
});

injectOpenXTabs().catch(() => undefined);
