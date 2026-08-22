// Shared popup utilities, constants, and navigation.

const MarginaliaPopup = {
  // Set to false before shipping — shows all popup cards stacked for visual QA.
  TEST_SHOW_ALL_CARDS: false,

  STORAGE: {
    onboarded: "onboarded",
    quizStats: "quizStats",
  },

  SESSION: {
    pendingManualQuiz: "pendingManualQuiz",
  },

  MS_PER_100_WORDS: 1500,

  cards: {
    onboarding: document.getElementById("card-onboarding"),
    dashboard: document.getElementById("card-dashboard"),
    quiz: document.getElementById("card-quiz"),
    settings: document.getElementById("card-settings"),
  },

  state: {
    activeTab: null,
    skimmedSections: [],
    readingStats: null,
  },

  showCard(name) {
    if (this.TEST_SHOW_ALL_CARDS) return;
    Object.entries(this.cards).forEach(([key, el]) => {
      el.classList.toggle("hidden", key !== name);
    });
  },

  showAllCardsForTesting() {
    Object.values(this.cards).forEach((el) => el.classList.remove("hidden"));
    document.getElementById("app").classList.add("test-all-visible");
  },

  async getActiveTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab;
  },

  sendTabMessage(tabId, message) {
    return new Promise((resolve) => {
      chrome.tabs.sendMessage(tabId, message, (response) => {
        if (chrome.runtime.lastError) {
          resolve(null);
          return;
        }
        resolve(response);
      });
    });
  },

  // chrome.storage.local, not .session -- verified live that a value
  // background.js writes to storage.session is unreadable from this popup
  // page (even after explicitly widening its access level), while
  // storage.local round-trips correctly. The longer persistence isn't a
  // real concern since this key is always cleared immediately after being
  // read (here, and again as a safety net in CardQuiz.finish()).
  async getPendingManualQuiz() {
    const data = await chrome.storage.local.get(this.SESSION.pendingManualQuiz);
    return data[this.SESSION.pendingManualQuiz] || null;
  },

  async clearPendingManualQuiz() {
    await chrome.storage.local.remove(this.SESSION.pendingManualQuiz);
  },

  async getQuizStats() {
    const data = await chrome.storage.local.get(this.STORAGE.quizStats);
    return data[this.STORAGE.quizStats] || { passed: 0, total: 0 };
  },

  async recordQuizResult(correct) {
    const stats = await this.getQuizStats();
    stats.total += 1;
    if (correct) stats.passed += 1;
    await chrome.storage.local.set({ [this.STORAGE.quizStats]: stats });
  },

  sectionLabel(section, index) {
    const sectionNum = section.id?.replace("section-", "") ?? index + 1;
    const words = section.wordCount || 0;
    const estReadSec = ((words / 100) * this.MS_PER_100_WORDS) / 1000;
    const skimSec = Math.max(0.8, estReadSec * 0.15).toFixed(1);
    return `Section ${Number(sectionNum) + 1} — skimmed in ${skimSec}s`;
  },

  truncateTitle(title) {
    if (!title) return "Untitled page";
    return title.length > 72 ? `${title.slice(0, 69)}…` : title;
  },

  estimateFocusPercent() {
    const { skimmedSections } = this.state;
    if (!skimmedSections.length) return 100;
    const flaggedRatio = Math.min(skimmedSections.length / 6, 1);
    return Math.round(100 - flaggedRatio * 35);
  },
};
