// Card 3: opt-in prompt banner.
//
// Shown once per page load, only on pages that look like long-form content
// (gated by init.js's word-count heuristic before this is even called).
// "Not now" doesn't persist to chrome.storage -- a plain in-memory guard
// (the DOM node itself) is enough, since a fresh page load should always
// get a fresh choice (reload = re-prompt is intentional, per spec).

const OPT_IN_BANNER_ID = "read-actually-optin-banner";

function showOptInBanner(articleText) {
  if (document.getElementById(OPT_IN_BANNER_ID)) return; // already shown

  const banner = document.createElement("div");
  banner.id = OPT_IN_BANNER_ID;
  const label = TEST_SHOW_ALL_CARDS ? " (Card 3 -- test mode)" : "";
  banner.innerHTML = `
    <span class="read-actually-optin-icon">\u{1F516}</span>
    <span class="read-actually-optin-text">Track your reading on this page?${label}</span>
    <button type="button" class="read-actually-optin-enable">Enable</button>
    <button type="button" class="read-actually-optin-dismiss">Not now</button>
  `;
  document.body.appendChild(banner);

  banner.querySelector(".read-actually-optin-enable").addEventListener("click", () => {
    startTracking(articleText); // defined in content.js
    banner.remove();
  });
  banner.querySelector(".read-actually-optin-dismiss").addEventListener("click", () => {
    banner.remove();
  });
}
