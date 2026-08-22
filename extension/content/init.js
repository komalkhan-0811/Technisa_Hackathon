// Entry point. Loaded last in manifest.json's content_scripts.js array, so
// every other file (content.js, opt-in-banner.js, selection-button.js) has
// already defined its functions in this shared isolated-world scope by the
// time boot() runs -- calling into them from content.js's own top level
// would race document.readyState timing and risk calling a function that
// hasn't loaded yet.

const MIN_ARTICLE_WORDS = 300; // below this, don't even offer to track

function boot() {
  initSelectionButton(); // Card 5 -- always on, not gated by opt-in

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
