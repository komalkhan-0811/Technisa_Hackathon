// Background service worker (Manifest V3).
//
// Responsibilities:
//   - Hold per-tab session state (skimmed sections reported by content.js).
//   - Relay "generate quiz" requests from the popup to the backend, since
//     the popup has no direct network access restrictions issue but this
//     keeps a single place to add auth/headers/retries later.
//   - Wire up the context menu entry for FR6 (manual highlight -> quiz).

const BACKEND_URL = "http://localhost:8000";

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "quiz-me-on-selection",
    title: "Quiz me on this",
    contexts: ["selection"],
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "quiz-me-on-selection" && info.selectionText) {
    // TODO: forward info.selectionText to the popup/quiz flow (FR6).
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
  return false;
});
