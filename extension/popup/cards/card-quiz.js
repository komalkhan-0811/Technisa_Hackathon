// Card 6: Quiz flow (skimmed sections or manual selection via Option A).

const CardQuiz = {
  els: {
    loading: document.getElementById("quiz-loading"),
    content: document.getElementById("quiz-content"),
    error: document.getElementById("quiz-error"),
    progress: document.getElementById("quiz-progress"),
    badgeText: document.getElementById("quiz-badge-text"),
    headline: document.getElementById("quiz-headline"),
    meta: document.getElementById("quiz-meta"),
    question: document.getElementById("quiz-question"),
    options: document.getElementById("quiz-options"),
    feedback: document.getElementById("quiz-feedback"),
    feedbackTitle: document.getElementById("quiz-feedback-title"),
    feedbackBody: document.getElementById("quiz-feedback-body"),
    locateBtn: document.getElementById("btn-locate-source"),
    nextBtn: document.getElementById("btn-quiz-next"),
  },

  questions: [],
  currentIndex: 0,
  answered: false,
  tabId: null,
  source: "skimmed",
  dismissTimer: null,

  init() {
    this.els.locateBtn.addEventListener("click", () => this.handleLocateSource());
    this.els.nextBtn.addEventListener("click", () => this.handleNextQuestion());
  },

  showLoading() {
    MarginaliaPopup.showCard("quiz");
    this.els.loading.classList.remove("hidden");
    this.els.content.classList.add("hidden");
    this.els.error.classList.add("hidden");
  },

  showError(message) {
    this.els.loading.classList.add("hidden");
    this.els.content.classList.add("hidden");
    this.els.error.classList.remove("hidden");
    this.els.error.textContent = message;
  },

  clearDismissTimer() {
    if (this.dismissTimer) {
      clearTimeout(this.dismissTimer);
      this.dismissTimer = null;
    }
  },

  async start(text, { source, tabId, sectionIndex = 1 }) {
    this.source = source;
    this.tabId = tabId;
    this.questions = [];
    this.currentIndex = 0;
    this.showLoading();

    const { skimmedSections } = MarginaliaPopup.state;
    const numQuestions = Math.min(
      3,
      Math.max(1, source === "manual" ? 2 : skimmedSections.length || 2)
    );

    chrome.runtime.sendMessage(
      { type: "GENERATE_QUIZ", text, numQuestions },
      (result) => {
        if (!result?.ok) {
          this.showError("Quiz generation failed. Is the backend running?");
          return;
        }

        this.questions = result.data.questions || [];
        if (!this.questions.length) {
          this.showError("No questions could be generated from this passage.");
          return;
        }

        this.els.loading.classList.add("hidden");
        this.els.content.classList.remove("hidden");

        if (source === "skimmed") {
          this.els.badgeText.textContent = `Section ${sectionIndex} skimmed`;
          this.els.headline.classList.remove("hidden");
          this.els.meta.classList.remove("hidden");
          const words = skimmedSections.reduce((n, s) => n + (s.wordCount || 0), 0);
          const estSec =
            ((words / 100) * MarginaliaPopup.MS_PER_100_WORDS) / 1000;
          const skimSec = Math.max(0.8, estSec * 0.15).toFixed(1);
          this.els.meta.textContent = `${skimSec}s vs. ${estSec.toFixed(0)}s estimated`;
        } else {
          this.els.badgeText.textContent = "Selected passage";
          this.els.headline.classList.add("hidden");
          this.els.meta.classList.add("hidden");
        }

        this.renderQuestion();
      }
    );
  },

  renderQuestion() {
    this.clearDismissTimer();
    this.answered = false;

    const q = this.questions[this.currentIndex];
    const total = this.questions.length;

    this.els.progress.textContent = `Question ${this.currentIndex + 1}/${total}`;
    this.els.question.textContent = q.question;
    this.els.options.innerHTML = "";
    this.els.feedback.classList.add("hidden");
    this.els.feedback.classList.remove(
      "quiz-feedback--correct",
      "quiz-feedback--incorrect"
    );
    this.els.locateBtn.classList.add("hidden");
    this.els.nextBtn.classList.add("hidden");

    q.options.forEach((optionText, index) => {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "quiz-option";
      btn.setAttribute("role", "option");
      btn.innerHTML = `<span class="option-radio" aria-hidden="true"></span><span>${optionText}</span>`;
      btn.addEventListener("click", () => this.handleOptionSelect(index, btn));
      li.appendChild(btn);
      this.els.options.appendChild(li);
    });
  },

  lockOptions(selectedBtn) {
    this.els.options.querySelectorAll(".quiz-option").forEach((btn) => {
      btn.classList.add("quiz-option--locked");
      btn.disabled = true;
    });
    selectedBtn.classList.add("quiz-option--selected");
  },

  handleOptionSelect(optionIndex, selectedBtn) {
    if (this.answered) return;
    this.answered = true;

    const q = this.questions[this.currentIndex];
    const correct = optionIndex === q.correct_index;
    const correctText = q.options[q.correct_index];

    this.lockOptions(selectedBtn);
    MarginaliaPopup.recordQuizResult(correct);

    this.els.options.querySelectorAll(".quiz-option").forEach((btn, i) => {
      if (i === q.correct_index) btn.classList.add("quiz-option--correct");
      if (i === optionIndex && !correct) {
        btn.classList.add("quiz-option--incorrect");
      }
    });

    this.els.feedback.classList.remove("hidden");
    this.els.feedback.classList.toggle("quiz-feedback--correct", correct);
    this.els.feedback.classList.toggle("quiz-feedback--incorrect", !correct);

    if (correct) {
      this.els.feedbackTitle.textContent = "Correct";
      this.els.feedbackBody.textContent =
        this.currentIndex < this.questions.length - 1
          ? "Nice — moving on when you're ready."
          : "Card dismisses in 3s.";
      this.els.locateBtn.classList.add("hidden");

      if (this.currentIndex < this.questions.length - 1) {
        this.els.nextBtn.classList.remove("hidden");
        this.els.nextBtn.textContent = "Next question";
      } else {
        this.dismissTimer = setTimeout(() => this.finish(), 3000);
      }
    } else {
      this.els.feedbackTitle.textContent = "Not quite";
      this.els.feedbackBody.textContent = `The answer was “${correctText}”.`;
      this.els.locateBtn.classList.remove("hidden");
      this.els.nextBtn.classList.remove("hidden");
      this.els.nextBtn.textContent =
        this.currentIndex < this.questions.length - 1 ? "Next question" : "Done";
    }
  },

  handleLocateSource() {
    const q = this.questions[this.currentIndex];
    if (this.tabId && q?.source_excerpt) {
      MarginaliaPopup.sendTabMessage(this.tabId, {
        type: "HIGHLIGHT_EXCERPT",
        sourceExcerpt: q.source_excerpt,
      });
    }
    window.close();
  },

  handleNextQuestion() {
    this.clearDismissTimer();
    if (this.currentIndex < this.questions.length - 1) {
      this.currentIndex += 1;
      this.renderQuestion();
    } else {
      this.finish();
    }
  },

  async finish() {
    await MarginaliaPopup.clearPendingManualQuiz();
    const { onboarded } = await chrome.storage.local.get(
      MarginaliaPopup.STORAGE.onboarded
    );
    if (onboarded) {
      await CardDashboard.load();
    } else {
      CardOnboarding.show();
    }
  },
};
