// Background service worker (Manifest V3).
//
// Responsibilities:
//   - Relay "generate quiz" requests from the popup to the backend.
//   - Reflect current tab skim count on toolbar badge.
//   - Relay manual selections and skimmed content into in-page overlays or pending storage state.

const BACKEND_URL = "http://localhost:8000";
const BADGE_COLOR = "#a6742e";
const CURRENT_QUIZ_KEY = "currentQuiz";
const MANUAL_QUIZ_QUESTION_COUNT = 3;

function quizModalMessageType(source) {
  return source === "skimmed"
    ? "OPEN_SKIM_QUIZ_MODAL"
    : "OPEN_MANUAL_QUIZ_MODAL";
}

function sendTabMessage(tabId, message) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (chrome.runtime.lastError) {
        console.warn("[background] tab message failed:", chrome.runtime.lastError.message);
        resolve(null);
        return;
      }
      resolve(response);
    });
  });
}

async function triggerQuiz(tabId, text, meta = {}) {
  if (tabId == null || !text) return;
  const source = meta.source || "manual";
  const count = source === "skimmed"
    ? Math.max(1, Number(meta.count) || 1)
    : MANUAL_QUIZ_QUESTION_COUNT;
  const trimmedText = text.trim();

  // 1. Length validation guardrails
  if (trimmedText.length < 100) {
    await sendTabMessage(tabId, {
      type: quizModalMessageType(source),
      source,
      error: "Selection is too short. Please highlight at least 100 characters (about 1-2 full sentences).",
    });
    return;
  }

  if (trimmedText.length > 8000) {
    await sendTabMessage(tabId, {
      type: quizModalMessageType(source),
      source,
      error: "Selection is too long (over 8,000 characters). Please highlight a shorter section.",
    });
    return;
  }

  try {
    // 2. Notify content script overlay to show loading state
    await sendTabMessage(tabId, {
      type: quizModalMessageType(source),
      source,
      loading: true,
    });

    // 3. Fetch quiz directly from backend
    const response = await fetch(`${BACKEND_URL}/generate-quiz`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: trimmedText, num_questions: count, source }),
    });

    if (!response.ok) {
      let detail = `Backend returned ${response.status}.`;
      try {
        const errorData = await response.json();
        if (errorData.detail) detail = errorData.detail;
      } catch {
        // Fallback status text if JSON parsing fails
      }
      throw new Error(detail);
    }

    const quizData = await response.json();

    // 4. Store state for popups and components
    await chrome.storage.local.set({ [CURRENT_QUIZ_KEY]: quizData });

    // 5. Send payload to overlay modal
    await sendTabMessage(tabId, {
      type: quizModalMessageType(source),
      source,
      loading: false,
      quizData,
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.warn("[background] Direct overlay generation failed, falling back to popup flow:", errorMsg);

    // 6. Send error message to overlay
    await sendTabMessage(tabId, {
      type: quizModalMessageType(source),
      source,
      loading: false,
      error: errorMsg,
    });

  }
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "quiz-me-on-selection",
    title: "⚡ Quiz me on this selection",
    contexts: ["selection"],
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "quiz-me-on-selection" && info.selectionText) {
    triggerQuiz(tab?.id, info.selectionText, { source: "manual" });
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "GENERATE_QUIZ") {
    fetch(`${BACKEND_URL}/generate-quiz`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: message.text?.trim(),
        num_questions:
          message.source === "manual"
            ? MANUAL_QUIZ_QUESTION_COUNT
            : Math.max(1, Number(message.numQuestions) || 1),
        source: message.source || "skimmed",
      }),
    })
      .then(async (res) => {
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error(data?.detail || `Backend returned ${res.status}`);
        }
        return data;
      })
      .then((data) => sendResponse({ ok: true, data }))
      .catch((err) => sendResponse({ ok: false, error: String(err?.message || err) }));
    return true; // Keep message channel open for async response
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
    triggerQuiz(sender.tab?.id, message.text, { source: "manual" });
    return false;
  }

  if (message.type === "SKIM_QUIZ_REQUEST") {
    triggerQuiz(sender.tab?.id, message.text, {
      source: "skimmed",
      count: message.count,
    });
    return false;
  }

  return false;
});