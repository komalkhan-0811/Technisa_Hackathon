// Card 5: floating "Quiz me on this" button anchored to the current text
// selection.
//
// Works on any page, independent of Card 3's opt-in flow -- this is a
// one-off, user-initiated action on a specific passage, not ambient
// tracking, so there's no reason to gate it behind the long-form check.

const SELECTION_BUTTON_ID = "read-actually-selection-button";
// const SELECTION_BUTTON_ID = "marginalia-selection-button";
const MIN_SELECTION_CHARACTERS = 30;
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
  function updateSelectionButton() {
    const selection = window.getSelection();
    const text = selection ? selection.toString().trim() : "";

    // Ignore short accidental selections; the backend also needs enough
    // context to produce useful comprehension questions.
    if (text.length < MIN_SELECTION_CHARACTERS) {
      removeSelectionButton();
      return;
    }

    const rect = selection.getRangeAt(0).getBoundingClientRect();
    showSelectionButton(rect, text);
  }

  document.addEventListener("mouseup", (event) => {
    if (event.target && event.target.id === SELECTION_BUTTON_ID) return;
    updateSelectionButton();
  });

  document.addEventListener("selectionchange", updateSelectionButton);

  // Starting a new interaction elsewhere (not on the button itself) should
  // clear a stale button so none get left behind on the page.
  document.addEventListener("mousedown", (event) => {
    if (event.target && event.target.id === SELECTION_BUTTON_ID) return;
    removeSelectionButton();
  });
}

const QUIZ_OVERLAY_ID = "marginalia-quiz-overlay";

function removeQuizOverlay() {
  document.getElementById(QUIZ_OVERLAY_ID)?.remove();
}

function showQuizOverlay(quizData, errorMessage, loading) {
  removeQuizOverlay();

  const host = document.createElement("div");
  host.id = QUIZ_OVERLAY_ID;
  const shadow = host.attachShadow({ mode: "open" });
  const questions = (quizData?.questions || []).slice(0, 3);

  shadow.innerHTML = `
    <link rel="stylesheet" href="${chrome.runtime.getURL("content/quiz-overlay.css")}">
    <section class="overlay" role="dialog" aria-modal="true" aria-label="Quiz">
      <button class="close" type="button" aria-label="Close quiz">&times;</button>
      <p class="eyebrow">Marginalia / selected passage</p>
      <h2>Check your understanding</h2>
      <p class="progress">${loading ? "Generating quiz..." : ""}</p>
      <div class="question"></div>
      <div class="options" role="list"></div>
      <p class="feedback" role="status"></p>
      <button class="next" type="button" hidden>Next question</button>
    </section>`;

  document.documentElement.appendChild(host);
  const overlay = shadow.querySelector(".overlay");
  const questionElement = shadow.querySelector(".question");
  const optionsElement = shadow.querySelector(".options");
  const feedbackElement = shadow.querySelector(".feedback");
  const progressElement = shadow.querySelector(".progress");
  const nextButton = shadow.querySelector(".next");
  let questionIndex = 0;

  shadow.querySelector(".close").addEventListener("click", removeQuizOverlay);

  if (loading) {
    questionElement.textContent = "Reading your selected passage...";
    return;
  }

  if (errorMessage || !questions.length) {
    questionElement.textContent = errorMessage || "No questions were generated.";
    progressElement.textContent = "Quiz unavailable";
    return;
  }

  function renderQuestion() {
    const question = questions[questionIndex];
    progressElement.textContent = `Question ${questionIndex + 1} of ${questions.length}`;
    questionElement.textContent = question.question;
    optionsElement.innerHTML = "";
    feedbackElement.textContent = "";
    nextButton.hidden = true;
    nextButton.textContent =
      questionIndex === questions.length - 1 ? "Finish quiz" : "Next question";

    question.options.forEach((optionText, optionIndex) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "option";
      button.textContent = optionText;
      button.addEventListener("click", () => {
        optionsElement.querySelectorAll("button").forEach((option) => {
          option.disabled = true;
        });
        const correct = optionIndex === question.correct_index;
        button.classList.add(correct ? "correct" : "incorrect");
        feedbackElement.textContent = correct
          ? "Correct."
          : `Not quite. The answer was: ${question.options[question.correct_index]}`;
        nextButton.hidden = false;
      });
      optionsElement.appendChild(button);
    });
  }

  nextButton.addEventListener("click", () => {
    if (questionIndex === questions.length - 1) {
      removeQuizOverlay();
      return;
    }
    questionIndex += 1;
    renderQuestion();
  });

  renderQuestion();
}
