// Card 1: First-time onboarding.

const CardOnboarding = {
  els: {
    gotIt: document.getElementById("btn-got-it"),
    enableSite: document.getElementById("btn-enable-site"),
  },

  init() {
    this.els.gotIt.addEventListener("click", () => this.handleGotIt());
    this.els.enableSite.addEventListener("click", () => this.handleEnableSite());
  },

  show() {
    ReadActuallyPopup.showCard("onboarding");
  },

  async handleGotIt() {
    await chrome.storage.local.set({
      [ReadActuallyPopup.STORAGE.onboarded]: true,
    });
    await CardDashboard.load();
  },

  async handleEnableSite() {
    const { activeTab } = ReadActuallyPopup.state;
    if (activeTab?.id) {
      await ReadActuallyPopup.sendTabMessage(activeTab.id, {
        type: "ENABLE_TRACKING_ON_SITE",
      });
    }
    await chrome.storage.local.set({
      [ReadActuallyPopup.STORAGE.onboarded]: true,
    });
    await CardDashboard.load();
  },
};
