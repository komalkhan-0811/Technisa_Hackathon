// Card 2: Returning user dashboard.

const CardDashboard = {
  els: {
    articleTitle: document.getElementById("article-title"),
    velocity: document.getElementById("stat-velocity"),
    flaggedCount: document.getElementById("flagged-count"),
    flaggedList: document.getElementById("flagged-list"),
    flaggedEmpty: document.getElementById("flagged-empty"),
    checkBtn: document.getElementById("btn-check-understanding"),
    footerFocus: document.getElementById("footer-focus"),
    footerPassed: document.getElementById("footer-passed"),
    settings: document.getElementById("btn-settings"),
  },

  init() {
    this.els.checkBtn.addEventListener("click", () => this.handleCheckUnderstanding());
    this.els.settings.addEventListener("click", () => {
      chrome.storage.local.remove(MarginaliaPopup.STORAGE.onboarded).then(() => {
        CardOnboarding.show();
      });
    });
  },

  async load() {
    MarginaliaPopup.showCard("dashboard");
    MarginaliaPopup.state.activeTab = await MarginaliaPopup.getActiveTab();
    await this.fetchPageData();
  },

  async fetchPageData() {
    const { activeTab } = MarginaliaPopup.state;
    if (!activeTab?.id) return;

    this.els.articleTitle.textContent = MarginaliaPopup.truncateTitle(activeTab.title);

    const sectionsResponse = await MarginaliaPopup.sendTabMessage(activeTab.id, {
      type: "GET_SKIMMED_SECTIONS",
    });
    MarginaliaPopup.state.skimmedSections = sectionsResponse?.sections || [];

    MarginaliaPopup.state.readingStats = await MarginaliaPopup.sendTabMessage(
      activeTab.id,
      { type: "GET_READING_STATS" }
    );

    this.render();
  },

  render() {
    const { skimmedSections, readingStats } = MarginaliaPopup.state;
    const count = skimmedSections.length;

    this.els.flaggedCount.textContent =
      count === 1 ? "1 flagged" : `${count} flagged`;

    this.els.velocity.textContent = readingStats?.wpm
      ? `${Math.round(readingStats.wpm)} wpm`
      : "— wpm";

    this.els.flaggedList.innerHTML = "";
    if (count === 0) {
      this.els.flaggedEmpty.classList.remove("hidden");
    } else {
      this.els.flaggedEmpty.classList.add("hidden");
      skimmedSections.forEach((section, index) => {
        const li = document.createElement("li");
        li.className = "flagged-item";
        li.innerHTML = `<span>${MarginaliaPopup.sectionLabel(section, index)}</span><span class="flagged-item-arrow" aria-hidden="true">→</span>`;
        this.els.flaggedList.appendChild(li);
      });
    }

    this.els.checkBtn.disabled = count === 0;

    MarginaliaPopup.getQuizStats().then((stats) => {
      this.els.footerFocus.textContent = `Focus ${MarginaliaPopup.estimateFocusPercent()}%`;
      this.els.footerPassed.textContent =
        stats.total > 0 ? `Passed ${stats.passed}/${stats.total}` : "Passed —";
    });
  },

  async handleCheckUnderstanding() {
    const { activeTab, skimmedSections } = MarginaliaPopup.state;
    if (!activeTab?.id || skimmedSections.length === 0) return;

    const text = skimmedSections.map((s) => s.text).join("\n\n");
    await CardQuiz.start(text, {
      source: "skimmed",
      tabId: activeTab.id,
      sectionIndex: skimmedSections.length,
    });
  },
};
