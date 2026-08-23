// Card 4: proactive in-page alert offering to quiz the user on everything
// skimmed so far, once enough sections have been flagged to make a quiz
// worthwhile. Complements the toolbar badge (background.js) and the
// per-section stickers (content.js's addSkimSticker) -- this is the one
// that actively invites the user to act, rather than just showing a count
// they might not notice.
//
// Loaded after content.js in manifest.json's content_scripts array, so it
// can reference skimmedSections/safeSendMessage directly -- same
// shared-global-scope pattern opt-in-banner.js uses for startTracking().

const SKIM_ALERT_ID = "read-actually-skim-alert";
const SKIM_ALERT_THRESHOLD = 2; // minimum flagged sections before nudging
let skimAlertDismissed = false;

function removeSkimAlert() {
  const existing = document.getElementById(SKIM_ALERT_ID);
  if (existing) existing.remove();
}

function updateSkimAlert(count) {
  if (skimAlertDismissed || count < SKIM_ALERT_THRESHOLD) {
    if (count < SKIM_ALERT_THRESHOLD) removeSkimAlert();
    return;
  }

  let alert = document.getElementById(SKIM_ALERT_ID);
  if (!alert) {
    alert = document.createElement("div");
    alert.id = SKIM_ALERT_ID;
    alert.innerHTML = `
      <span class="read-actually-skim-alert-icon">\u{1F4CC}</span>
      <span class="read-actually-skim-alert-text"></span>
      <button type="button" class="read-actually-skim-alert-quiz">Quiz me</button>
      <button type="button" class="read-actually-skim-alert-dismiss" aria-label="Dismiss">×</button>
    `;
    document.body.appendChild(alert);

    alert.querySelector(".read-actually-skim-alert-quiz").addEventListener("click", () => {
      const sections = Array.from(skimmedSections.values());
      if (!sections.length) return;
      safeSendMessage({
        type: "SKIM_QUIZ_REQUEST",
        text: sections.map((s) => s.text).join("\n\n"),
        count: sections.length,
      });
      removeSkimAlert();
    });
    alert.querySelector(".read-actually-skim-alert-dismiss").addEventListener("click", () => {
      skimAlertDismissed = true;
      removeSkimAlert();
    });
  }

  alert.querySelector(".read-actually-skim-alert-text").textContent =
    count === 1 ? "1 section skimmed" : `${count} sections skimmed`;
}
