// Popup entry point — wires cards and handles startup routing (Option A).

async function init() {
  CardOnboarding.init();
  CardDashboard.init();
  CardQuiz.init();

  if (MarginaliaPopup.TEST_SHOW_ALL_CARDS) {
    MarginaliaPopup.showAllCardsForTesting();
    return;
  }

  MarginaliaPopup.state.activeTab = await MarginaliaPopup.getActiveTab();

  const pending = await MarginaliaPopup.getPendingManualQuiz();
  if (pending?.text) {
    await MarginaliaPopup.clearPendingManualQuiz();
    await CardQuiz.start(pending.text, {
      source: "manual",
      tabId: pending.tabId || MarginaliaPopup.state.activeTab?.id,
    });
    return;
  }

  const { onboarded } = await chrome.storage.local.get(
    MarginaliaPopup.STORAGE.onboarded
  );
  if (!onboarded) {
    CardOnboarding.show();
    return;
  }

  await CardDashboard.load();
}

init();
