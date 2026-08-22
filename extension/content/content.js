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
//
// This file only defines the tracking engine -- it does not decide when to
// start. That decision (opt-in gating) lives in opt-in-banner.js, and the
// actual kickoff happens in init.js, which loads last so every other
// content-script file's functions are guaranteed to already be defined.

// --- Config (tune during build/testing) ----------------------------------

const DEBUG = true;

// Matches the flag name used in popup/shared.js (Cards 1, 2, 6) for a
// consistent mental model across the extension: flip it, reload, see every
// card's UI without needing to naturally trigger it. The mechanism differs
// per surface -- there's no single page to stack sections on here like the
// popup has, since these three cards render into three different places
// (injected page DOM, the toolbar badge, a selection-anchored element) --
// but each card file checks this same flag to force itself visible with
// sample data. See opt-in-banner.js, init.js, and selection-button.js.
const TEST_SHOW_ALL_CARDS = true;

const MIN_SECTION_WORDS = 8; // ignore trivial fragments (nav links, captions)
const MS_PER_100_WORDS = 1500; // min visible time to NOT count as skimmed
const PROMINENCE_RATIO = 0.5; // fraction of the section that must be visible...
const PROMINENCE_MIN_MS = 400; // ...for at least this long to count as "seen"
const MAX_INTERVAL_MS = 1000; // cap on dwell credited between two observer
// events -- without this, a paused/idle gap (no scrolling, e.g. the user
// alt-tabbing or reading devtools) gets fully counted as dwell time, since
// IntersectionObserver only fires when the ratio actually changes and can't
// tell "still reading" apart from "stopped scrolling for an unrelated reason".

function log(...args) {
  if (DEBUG) console.log("[skim-detection]", ...args);
}

// --- State -------------------------------------------------------------

const skimmedSections = new Map(); // sectionId -> { id, text, wordCount }
const sectionState = new Map(); // element -> tracking state (see observeSections)

function countWords(text) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function normalizeWhitespace(text) {
  return text.replace(/\s+/g, " ").trim();
}

// --- FR1: Text extraction -------------------------------------------------
// Readability.parse() mutates/strips whatever document it's given, so it
// must run against a clone, never the live document. Its cleaned
// textContent is used as ground truth for "is this really article text"
// (see getSections), not as the source of the observed DOM elements --
// IntersectionObserver needs real, live nodes to watch.

function extractArticleText() {
  try {
    const clone = document.cloneNode(true);
    const article = new Readability(clone).parse();
    return article ? normalizeWhitespace(article.textContent) : null;
  } catch (err) {
    console.warn("[skim-detection] Readability parse failed:", err);
    return null;
  }
}

// --- FR2: Reading behavior tracking ----------------------------------------

function getSections(articleText) {
  const nodes = Array.from(
    document.querySelectorAll("p, h1, h2, h3, h4, h5, h6")
  );

  return nodes
    .map((el, index) => ({
      id: `section-${index}`,
      el,
      text: normalizeWhitespace(el.textContent),
    }))
    .filter((s) => {
      if (countWords(s.text) < MIN_SECTION_WORDS) return false;
      // If Readability extraction failed (e.g. non-article page), skip the
      // article-membership filter rather than tracking nothing.
      if (articleText && !articleText.includes(s.text)) return false;
      return true;
    });
}

function evaluateSkim(state) {
  const minReadMs = (state.wordCount / 100) * MS_PER_100_WORDS;
  const tooFast = state.totalVisibleMs < minReadMs;
  const neverProminent = state.prominentMs < PROMINENCE_MIN_MS;
  return tooFast || neverProminent;
}

function observeSections(sections) {
  const observer = new IntersectionObserver(
    (entries) => {
      const now = performance.now();

      entries.forEach((entry) => {
        const state = sectionState.get(entry.target);
        if (!state) return;

        // Close out the interval since the last observed ratio before
        // applying the new one.
        if (state.lastTimestamp != null) {
          const elapsed = Math.min(now - state.lastTimestamp, MAX_INTERVAL_MS);
          if (state.currentRatio > 0) state.totalVisibleMs += elapsed;
          if (state.currentRatio >= PROMINENCE_RATIO) {
            state.prominentMs += elapsed;
          }
        }
        state.currentRatio = entry.intersectionRatio;
        state.lastTimestamp = now;
        if (entry.intersectionRatio > 0) state.visited = true;

        // Section has fully scrolled past (or back out of view) -- finalize
        // its skim verdict. Dwell time accumulates across repeat visits, so
        // scrolling back up to re-read a section can clear its skim flag.
        if (state.visited && entry.intersectionRatio === 0) {
          const skimmed = evaluateSkim(state);
          if (skimmed) {
            skimmedSections.set(state.id, {
              id: state.id,
              text: state.text,
              wordCount: state.wordCount,
            });
          } else {
            skimmedSections.delete(state.id);
          }
          log(
            skimmed ? "flagged as skimmed:" : "read sufficiently:",
            state.id,
            `(${Math.round(state.totalVisibleMs)}ms visible, ${Math.round(
              state.prominentMs
            )}ms prominent, ${state.wordCount} words)`
          );
          // Card 4: push the current count so background.js can reflect it
          // on the toolbar badge. Fire-and-forget -- no response expected.
          chrome.runtime.sendMessage({
            type: "SKIM_COUNT_UPDATED",
            count: skimmedSections.size,
          });
        }
      });
    },
    { threshold: [0, 0.25, 0.5, 0.75, 1] }
  );

  sections.forEach((section) => {
    sectionState.set(section.el, {
      id: section.id,
      text: section.text,
      wordCount: countWords(section.text),
      totalVisibleMs: 0,
      prominentMs: 0,
      lastTimestamp: null,
      currentRatio: 0,
      visited: false,
    });
    observer.observe(section.el);
  });

  return observer;
}

// Called by opt-in-banner.js once the user clicks "Enable" (Card 3). Takes
// the already-extracted article text so it isn't parsed twice.
function startTracking(articleText) {
  const sections = getSections(articleText);
  log(`tracking ${sections.length} section(s)`);
  observeSections(sections);
}

// --- TODO: FR5 Highlight-on-wrong-answer ---------------------------------
// function highlightExcerpt(sourceExcerpt) {
//   locate sourceExcerpt in the DOM via Range/Selection API,
//   scrollIntoView, wrap in a <mark> with a highlight class.
// }

// --- Messaging -----------------------------------------------------------

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case "GET_SKIMMED_SECTIONS":
      sendResponse({ sections: Array.from(skimmedSections.values()) });
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
