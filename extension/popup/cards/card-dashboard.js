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
    // Opens the theme picker (CardSettings); "reset onboarding" moved there
    // as a link rather than being this button's whole job.
    this.els.settings.addEventListener("click", () => CardSettings.show());
  },

  async load() {
    ReadActuallyPopup.showCard("dashboard");
    ReadActuallyPopup.state.activeTab = await ReadActuallyPopup.getActiveTab();
    await this.fetchPageData();
  },

  async fetchPageData() {
    const { activeTab } = ReadActuallyPopup.state;
    if (!activeTab?.id) return;

    this.els.articleTitle.textContent = ReadActuallyPopup.truncateTitle(activeTab.title);

    const sectionsResponse = await ReadActuallyPopup.sendTabMessage(activeTab.id, {
      type: "GET_SKIMMED_SECTIONS",
    });
    ReadActuallyPopup.state.skimmedSections = sectionsResponse?.sections || [];

    ReadActuallyPopup.state.readingStats = await ReadActuallyPopup.sendTabMessage(
      activeTab.id,
      { type: "GET_READING_STATS" }
    );

    this.render();
  },

  render() {
    const { skimmedSections, readingStats } = ReadActuallyPopup.state;
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
      const displaySections = ReadActuallyPopup.throttleFlaggedSections(skimmedSections);
      displaySections.forEach((section, index) => {
        const li = document.createElement("li");
        li.className = "flagged-item";
        li.innerHTML = `<span>${ReadActuallyPopup.sectionLabel(section, index)}</span><span class="flagged-item-arrow" aria-hidden="true">→</span>`;
        this.els.flaggedList.appendChild(li);
      });
    }

    this.els.checkBtn.disabled = count === 0;

    ReadActuallyPopup.getQuizStats().then((stats) => {
      this.els.footerFocus.textContent = `Focus ${ReadActuallyPopup.estimateFocusPercent()}%`;
      this.els.footerPassed.textContent =
        stats.total > 0 ? `Passed ${stats.passed}/${stats.total}` : "Passed —";
    });
  },

  async handleCheckUnderstanding() {
    const { activeTab, skimmedSections } = ReadActuallyPopup.state;
    if (!activeTab?.id || skimmedSections.length === 0) return;

    const text = skimmedSections.map((s) => s.text).join("\n\n");
    await CardQuiz.start(text, {
      source: "skimmed",
      tabId: activeTab.id,
      sectionIndex: skimmedSections.length,
    });
  },
};
