// Popup entry point — wires cards and handles startup routing (Option A).

async function init() {
  initTheme(); // apply the stored theme + stay in sync with changes made elsewhere

  CardOnboarding.init();
  CardDashboard.init();
  CardQuiz.init();
  CardSettings.init();

  if (ReadActuallyPopup.TEST_SHOW_ALL_CARDS) {
    ReadActuallyPopup.showAllCardsForTesting();
    return;
  }

  ReadActuallyPopup.state.activeTab = await ReadActuallyPopup.getActiveTab();

  const pending = await ReadActuallyPopup.getPendingManualQuiz();
  if (pending?.text) {
    await ReadActuallyPopup.clearPendingManualQuiz();
    const tabId = pending.tabId || ReadActuallyPopup.state.activeTab?.id;
    const source = pending.source || "manual";

    // Card 4's skim alert (unlike the popup's own dashboard flow) opens the
    // popup straight into a quiz without CardDashboard.load() ever running,
    // so state.skimmedSections is still empty here -- fetch it now so the
    // quiz card's "Xs vs Ys estimated" meta line has real numbers instead
    // of computing off zero sections.
    if (source === "skimmed" && tabId) {
      const sectionsResponse = await ReadActuallyPopup.sendTabMessage(tabId, {
        type: "GET_SKIMMED_SECTIONS",
      });
      ReadActuallyPopup.state.skimmedSections = sectionsResponse?.sections || [];
    }

    await CardQuiz.start(pending.text, {
      source,
      tabId,
      sectionIndex: pending.count || ReadActuallyPopup.state.skimmedSections.length || 1,
    });
    return;
  }

  const { onboarded } = await chrome.storage.local.get(
    ReadActuallyPopup.STORAGE.onboarded
  );
  if (!onboarded) {
    CardOnboarding.show();
    return;
  }

  await CardDashboard.load();
}

init();
