// Settings: theme picker, reachable from Card 2's gear icon.
// THEMES / loadTheme / saveTheme / applyTheme come from ../../shared/themes.js.

const CardSettings = {
  els: {
    back: document.getElementById("btn-settings-back"),
    swatches: document.getElementById("theme-swatches"),
    modeToggle: document.getElementById("mode-toggle"),
    resetOnboarding: document.getElementById("btn-reset-onboarding"),
  },

  current: { name: DEFAULT_THEME.name, mode: DEFAULT_THEME.mode },

  init() {
    this.els.back.addEventListener("click", () => CardDashboard.load());

    this.els.swatches.querySelectorAll(".theme-swatch").forEach((btn) => {
      btn.addEventListener("click", () => this.selectTheme(btn.dataset.theme));
    });

    this.els.modeToggle.querySelectorAll(".mode-toggle-option").forEach((btn) => {
      btn.addEventListener("click", () => this.selectMode(btn.dataset.mode));
    });

    this.els.resetOnboarding.addEventListener("click", async () => {
      await chrome.storage.local.remove(MarginaliaPopup.STORAGE.onboarded);
      CardOnboarding.show();
    });
  },

  async show() {
    this.current = await loadTheme();
    this.render();
    MarginaliaPopup.showCard("settings");
  },

  async selectTheme(name) {
    this.current = { ...this.current, name };
    await this.persistAndApply();
  },

  async selectMode(mode) {
    this.current = { ...this.current, mode };
    await this.persistAndApply();
  },

  async persistAndApply() {
    await saveTheme(this.current.name, this.current.mode);
    applyTheme(this.current.name, this.current.mode);
    this.render();
  },

  render() {
    this.els.swatches.querySelectorAll(".theme-swatch").forEach((btn) => {
      const name = btn.dataset.theme;
      const active = name === this.current.name;
      btn.classList.toggle("theme-swatch--active", active);
      btn.querySelector(".theme-swatch-color").style.background =
        THEMES[name][this.current.mode].accent;
    });

    this.els.modeToggle.querySelectorAll(".mode-toggle-option").forEach((btn) => {
      btn.classList.toggle("mode-toggle-option--active", btn.dataset.mode === this.current.mode);
    });
  },
};
