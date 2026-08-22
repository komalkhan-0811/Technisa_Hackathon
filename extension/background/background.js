// Background service worker (Manifest V3).
//
// Responsibilities:
//   - Relay "generate quiz" requests from the popup to the backend, since
//     this keeps a single place to add auth/headers/retries later.
//   - Card 4: reflect the current tab's skim count on the toolbar badge.
//   - Card 5 (+ the pre-existing right-click entry): relay a manual
//     selection into a pending quiz request in chrome.storage.local
//     (key/shape matches shared.js's SESSION.pendingManualQuiz on the
//     popup side: { text, tabId }), then hand off via
//     chrome.action.openPopup(). popup.js reads and clears this itself on
//     open -- background.js only ever writes it.

const BACKEND_URL = "http://localhost:8000";
const BADGE_COLOR = "#a6742e";
const PENDING_MANUAL_QUIZ_KEY = "pendingManualQuiz";

// Deliberately chrome.storage.local, not .session: verified live that a
// value background.js writes to storage.session is unreadable from any
// other extension context (popup opened via page.goto() or via
// chrome.tabs.create(), even after explicitly calling setAccessLevel to
// widen it) in this environment. storage.local has no such restriction and
// was confirmed to round-trip correctly. Its longer persistence (survives
// browser restarts, vs. session's tab-session lifetime) isn't a real
// concern here since popup.js clears this key immediately after reading it
// (see shared.js's clearPendingManualQuiz, called both on consumption and
// at quiz end).
function triggerManualQuiz(tabId, text) {
  if (tabId == null || !text) return;
  chrome.storage.local
    .set({ [PENDING_MANUAL_QUIZ_KEY]: { text, tabId } })
    .then(() => chrome.action.openPopup())
    .catch((err) => {
      console.warn("[background] triggerManualQuiz failed:", err);
    });
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "quiz-me-on-selection",
    title: "Quiz me on this",
    contexts: ["selection"],
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "quiz-me-on-selection" && info.selectionText) {
    triggerManualQuiz(tab?.id, info.selectionText);
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "GENERATE_QUIZ") {
    fetch(`${BACKEND_URL}/generate-quiz`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: message.text,
        num_questions: message.numQuestions || 2,
      }),
    })
      .then((res) => res.json())
      .then((data) => sendResponse({ ok: true, data }))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true; // keep the message channel open for the async response
  }

  if (message.type === "SKIM_COUNT_UPDATED") {
    const tabId = sender.tab?.id;
    if (tabId != null) {
      chrome.action.setBadgeText({
        tabId,
        text: message.count > 0 ? String(message.count) : "",
      });
      chrome.action.setBadgeBackgroundColor({ tabId, color: BADGE_COLOR });
    }
    return false;
  }

  if (message.type === "MANUAL_QUIZ_REQUEST") {
    triggerManualQuiz(sender.tab?.id, message.text);
    return false;
  }

  return false;
});
