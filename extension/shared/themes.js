// Single source of truth for the extension's theme tokens, shared between
// the popup and the content scripts. Loaded as a plain script (not an ES
// module) in both manifest.json's content_scripts and popup.html, so it
// just declares top-level `const`/`function` bindings -- the same pattern
// content.js already uses for values other files in its execution context
// reference directly.

const THEMES = {
  botanic: {
    light: { ink: "#16211C", paper: "#FAF7EA", accent: "#8C5F22", alert: "#7C3B3B", success: "#3F5A42" },
    dark: { ink: "#16211C", paper: "#E4E0C8", accent: "#A6742E", alert: "#7C3B3B", success: "#4C6B4F" },
  },
  midnight: {
    light: { ink: "#12151F", paper: "#FBF8F1", accent: "#9C6575", alert: "#683550", success: "#46664F" },
    dark: { ink: "#12151F", paper: "#ECE4D6", accent: "#B97A82", alert: "#683550", success: "#5B7A6C" },
  },
  fieldstone: {
    light: { ink: "#2B2E2C", paper: "#FAF8F2", accent: "#3E7C74", alert: "#B5533C", success: "#5C7A3D" },
    dark: { ink: "#1B1F1D", paper: "#EDEAE2", accent: "#6FBDB2", alert: "#E07856", success: "#8FB35E" },
  },
};

const DEFAULT_THEME = { name: "botanic", mode: "dark" };
const THEME_STORAGE_KEY = "uiTheme";

// CSS custom properties inherit through Shadow DOM boundaries even though
// stylesheet rules don't, so setting these once on `root` (document.
// documentElement in both the popup page and each content-script-injected
// page) is enough for var(--accent) etc. to resolve correctly anywhere
// downstream, without re-injecting the theme into every shadow root.
function applyTheme(themeName, mode, root) {
  const theme = THEMES[themeName] || THEMES[DEFAULT_THEME.name];
  const tokens = theme[mode] || theme[DEFAULT_THEME.mode];
  const target = root || document.documentElement;

  Object.entries(tokens).forEach(([key, value]) => {
    target.style.setProperty(`--${key}`, value);
  });
  target.dataset.theme = themeName;
  target.dataset.mode = mode;
}

async function loadTheme() {
  const data = await chrome.storage.local.get(THEME_STORAGE_KEY);
  return data[THEME_STORAGE_KEY] || DEFAULT_THEME;
}

async function saveTheme(themeName, mode) {
  await chrome.storage.local.set({ [THEME_STORAGE_KEY]: { name: themeName, mode } });
}

// Call once per page (popup.html on load, each content-script injection on
// boot) to apply whatever's stored and stay in sync with changes made from
// the other side (e.g. picking a theme in the popup updates any
// already-injected banner/badge/highlight on the current tab immediately).
async function initTheme(root) {
  const { name, mode } = await loadTheme();
  applyTheme(name, mode, root);

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local" || !changes[THEME_STORAGE_KEY]) return;
    const next = changes[THEME_STORAGE_KEY].newValue || DEFAULT_THEME;
    applyTheme(next.name, next.mode, root);
  });
}
