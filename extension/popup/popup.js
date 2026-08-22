// Popup UI logic (FR4).
//
// - Enables "Check my understanding" only if content.js reports at least
//   one skimmed section for the active tab.
// - On click: asks content.js for skimmed section text, sends it to
//   background.js (GENERATE_QUIZ), renders the returned questions.
// - On answer: checks correctness; on wrong answer, asks content.js to
//   highlight the question's source_excerpt (FR5).

const checkBtn = document.getElementById("check-understanding-btn");
const statusText = document.getElementById("status-text");
const quizContainer = document.getElementById("quiz-container");

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function init() {
  const tab = await getActiveTab();
  if (!tab) return;

  chrome.tabs.sendMessage(tab.id, { type: "GET_SKIMMED_SECTIONS" }, (response) => {
    if (chrome.runtime.lastError) {
      statusText.textContent = "Reload the page to enable tracking.";
      return;
    }
    const sections = response?.sections || [];
    checkBtn.disabled = sections.length === 0;
    statusText.textContent = sections.length
      ? `${sections.length} skimmed section(s) detected.`
      : "No skimmed sections detected yet — keep reading.";
  });
}

checkBtn.addEventListener("click", async () => {
  const tab = await getActiveTab();
  if (!tab) return;

  statusText.textContent = "Generating quiz...";
  checkBtn.disabled = true;

  chrome.tabs.sendMessage(tab.id, { type: "GET_SKIMMED_SECTIONS" }, (sectionsResponse) => {
    const sections = sectionsResponse?.sections || [];
    const text = sections.map((s) => s.text).join("\n\n");

    chrome.runtime.sendMessage(
      { type: "GENERATE_QUIZ", text, numQuestions: 2 },
      (result) => {
        checkBtn.disabled = false;
        if (!result?.ok) {
          statusText.textContent = "Quiz generation failed. Try again.";
          return;
        }
        statusText.textContent = "";
        renderQuiz(result.data.questions, tab.id);
      }
    );
  });
});

function renderQuiz(questions, tabId) {
  quizContainer.innerHTML = "";
  quizContainer.classList.remove("hidden");

  questions.forEach((q, qIndex) => {
    const qEl = document.createElement("div");
    qEl.className = "question";

    const title = document.createElement("p");
    title.textContent = q.question;
    qEl.appendChild(title);

    q.options.forEach((option, oIndex) => {
      const optBtn = document.createElement("button");
      optBtn.textContent = option;
      optBtn.className = "option-btn";
      optBtn.addEventListener("click", () => {
        const correct = oIndex === q.correct_index;
        optBtn.classList.add(correct ? "correct" : "incorrect");
        if (!correct) {
          chrome.tabs.sendMessage(tabId, {
            type: "HIGHLIGHT_EXCERPT",
            sourceExcerpt: q.source_excerpt,
          });
        }
      });
      qEl.appendChild(optBtn);
    });

    quizContainer.appendChild(qEl);
  });
}

init();
