// Background service worker (Manifest V3).
//
// Responsibilities:
//   - Hold per-tab session state (skimmed sections reported by content.js).
//   - Relay "generate quiz" requests from the popup to the backend, since
//     this keeps a single place to add auth/headers/retries later.
//   - Card 4: reflect the current tab's skim count on the toolbar badge.
//   - Card 5 (+ the pre-existing right-click entry): relay a manual
//     selection into a quiz request and hand off to the popup (Card 6) via
//     chrome.action.openPopup() -- see the GET_PENDING_MANUAL_TEXT handshake
//     below, which is the interface point popup.js needs to consume.

const BACKEND_URL = "http://localhost:8000";
const BADGE_COLOR = "#a6742e";

// tabId -> selected text, read-once. Popup.js should call
// GET_PENDING_MANUAL_TEXT as soon as it opens; if it gets a non-null text
// back, skip the normal skimmed-sections flow and generate a quiz from
// this text instead.
const pendingManualText = new Map();

function triggerManualQuiz(tabId, text) {
  if (tabId == null || !text) return;
  pendingManualText.set(tabId, text);
  chrome.action.openPopup().catch((err) => {
    console.warn("[background] openPopup failed:", err);
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

  if (message.type === "GET_PENDING_MANUAL_TEXT") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tabId = tabs[0]?.id;
      const text = tabId != null ? pendingManualText.get(tabId) : undefined;
      if (tabId != null) pendingManualText.delete(tabId);
      sendResponse({ text: text || null });
    });
    return true; // async response
  }

  return false;
});
