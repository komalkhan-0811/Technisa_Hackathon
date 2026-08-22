// Entry point. Loaded last in manifest.json's content_scripts.js array, so
// every other file (content.js, opt-in-banner.js, selection-button.js) has
// already defined its functions in this shared isolated-world scope by the
// time boot() runs -- calling into them from content.js's own top level
// would race document.readyState timing and risk calling a function that
// hasn't loaded yet.

const MIN_ARTICLE_WORDS = 300; // below this, don't even offer to track
const SAMPLE_BADGE_COUNT = 3; // test-mode-only stand-in for a real skim count

function boot() {
  initTheme(); // apply the stored theme to this page + stay in sync with popup changes
  initSelectionButton(); // Card 5 -- always on, not gated by opt-in

  if (TEST_SHOW_ALL_CARDS) {
    log("TEST_SHOW_ALL_CARDS on: forcing Card 3 + Card 4 visible with sample data");
    showOptInBanner("Sample article text for test mode."); // Card 3, gate bypassed
    chrome.runtime.sendMessage({
      type: "SKIM_COUNT_UPDATED",
      count: SAMPLE_BADGE_COUNT,
    }); // Card 4
    showSelectionButtonSample(); // Card 5, no real selection needed
    return;
  }

  const articleText = extractArticleText();
  const wordCount = articleText ? countWords(articleText) : 0;

  if (wordCount < MIN_ARTICLE_WORDS) {
    log(`page doesn't look like long-form content (${wordCount} words); skipping opt-in prompt`);
    return;
  }

  showOptInBanner(articleText); // Card 3
}

if (document.readyState === "complete") {
  boot();
} else {
  window.addEventListener("load", boot);
}
