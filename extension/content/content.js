// Content script: injected into every page.
//
// Responsibilities (see project spec FR1, FR2, FR5, FR6):
//   1. Extract clean article text via Readability.js (lib/Readability.js).
//   2. Segment the page into sections and track scroll speed / dwell time
//      per section using IntersectionObserver to flag "skimmed" sections.
//   3. On request from the popup/background, return the text of skimmed
//      sections (or the user's current manual selection).
//   4. On an incorrect quiz answer, locate `source_excerpt` in the page via
//      the DOM Range/Selection API, scroll it into view, and highlight it.

// --- State -------------------------------------------------------------

const skimmedSections = new Map(); // sectionId -> { text, wordCount }

// --- TODO: FR1 Text extraction ------------------------------------------
// Use window.Readability (from Readability.js) against a cloned document
// to get { title, textContent } for the full article, e.g.:
//   const article = new Readability(document.cloneNode(true)).parse();

// --- TODO: FR2 Reading behavior tracking --------------------------------
// - Split article into paragraph/heading-delimited sections.
// - Observe each with IntersectionObserver.
// - Track time-in-viewport vs. word count to flag skimmed sections
//   (threshold: ~1.5s / 100 words, tune during build).

// --- TODO: FR5 Highlight-on-wrong-answer ---------------------------------
// function highlightExcerpt(sourceExcerpt) {
//   locate sourceExcerpt in the DOM via Range/Selection API,
//   scrollIntoView, wrap in a <mark> with a highlight class.
// }

// --- TODO: FR6 Manual highlight-and-quiz-me -------------------------------
// Listen for text selection (selectionchange) or a context menu item to
// grab window.getSelection().toString() and send it through the same flow.

// --- Messaging -----------------------------------------------------------

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case "GET_SKIMMED_SECTIONS":
      sendResponse({ sections: Array.from(skimmedSections.values()) });
      break;
    case "GET_SELECTION":
      sendResponse({ text: window.getSelection().toString() });
      break;
    case "HIGHLIGHT_EXCERPT":
      // TODO: call highlightExcerpt(message.sourceExcerpt)
      sendResponse({ ok: false, error: "not implemented" });
      break;
    default:
      break;
  }
  return true;
});
