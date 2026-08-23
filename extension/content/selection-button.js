// Card 5: floating "Quiz me on this" button anchored to the current text
// selection.
//
// Works on any page, independent of Card 3's opt-in flow -- this is a
// one-off, user-initiated action on a specific passage, not ambient
// tracking, so there's no reason to gate it behind the long-form check.

const SELECTION_BUTTON_ID = "read-actually-selection-button";
let currentSelectionText = "";

function removeSelectionButton() {
  const existing = document.getElementById(SELECTION_BUTTON_ID);
  if (existing) existing.remove();
}

function positionSelectionButton(button, rect) {
  const top = window.scrollY + rect.top - button.offsetHeight - 8;
  const left = window.scrollX + rect.left;
  button.style.top = `${Math.max(top, window.scrollY + 8)}px`;
  button.style.left = `${left}px`;
}

function showSelectionButton(rect, text) {
  removeSelectionButton();
  currentSelectionText = text;

  const button = document.createElement("button");
  button.id = SELECTION_BUTTON_ID;
  button.type = "button";
  button.textContent = TEST_SHOW_ALL_CARDS
    ? "\u{1F516} Quiz me on this (Card 5 -- test mode)"
    : "\u{1F516} Quiz me on this";

  // Without this, mousedown on the button collapses the browser selection
  // (focus moves to the button) before the click handler can read it.
  button.addEventListener("mousedown", (event) => event.preventDefault());

  button.addEventListener("click", () => {
    safeSendMessage({
      type: "MANUAL_QUIZ_REQUEST",
      text: currentSelectionText,
    });
    removeSelectionButton();
  });

  document.body.appendChild(button);
  positionSelectionButton(button, rect);
}

// TEST_SHOW_ALL_CARDS only: force the button visible without a real
// selection to anchor to, positioned near the top of the viewport with
// placeholder text so its design can be reviewed on demand.
function showSelectionButtonSample() {
  // Viewport-relative, matching what a real getBoundingClientRect() would
  // return -- positionSelectionButton() adds the scroll offset itself.
  const fakeRect = { top: 80, left: 24 };
  showSelectionButton(fakeRect, "Sample selected text for test mode.");
}

function initSelectionButton() {
  document.addEventListener("mouseup", (event) => {
    if (event.target && event.target.id === SELECTION_BUTTON_ID) return;

    const selection = window.getSelection();
    const text = selection ? selection.toString().trim() : "";

    // Require a few words -- a single clicked/highlighted word isn't
    // enough for a meaningful quiz question.
    if (!text || countWords(text) < 3) {
      removeSelectionButton();
      return;
    }

    const rect = selection.getRangeAt(0).getBoundingClientRect();
    showSelectionButton(rect, text);
  });

  // Starting a new interaction elsewhere (not on the button itself) should
  // clear a stale button so none get left behind on the page.
  document.addEventListener("mousedown", (event) => {
    if (event.target && event.target.id === SELECTION_BUTTON_ID) return;
    removeSelectionButton();
  });
}
