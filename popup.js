const $ = (id) => document.getElementById(id);
const input = $("input"), output = $("output"), codebox = $("codebox");
const copyBtn = $("copyBtn"), status = $("status"), themeBtn = $("themeBtn");
const sourceLang = $("sourceLang"), targetLang = $("targetLang");
const LANG_NAMES = { ko: "한국어", en: "English", ja: "日本語" };
// Theme: starts from the system preference, then the saved choice overrides it.
let isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
function applyTheme() {
  document.documentElement.dataset.theme = isDark ? "dark" : "light";
  themeBtn.title = isDark ? "Switch to light mode" : "Switch to dark mode";
}
applyTheme();
themeBtn.addEventListener("click", () => {
  isDark = !isDark;
  applyTheme();
  saveSettings();
});

const SETTINGS_KEY = "settings";
const DEFAULTS = { sourceLang: "ko", targetLang: "en", text: "", darkMode: null };

// Settings are stored as one JSON-serializable object in chrome.storage.local.
async function loadSettings() {
  try {
    const stored = await chrome.storage.local.get(SETTINGS_KEY);
    return { ...DEFAULTS, ...(stored[SETTINGS_KEY] || {}) };
  } catch {
    return { ...DEFAULTS };
  }
}
async function saveSettings() {
  try {
    await chrome.storage.local.set({
      [SETTINGS_KEY]: { sourceLang: sourceLang.value, targetLang: targetLang.value, text: input.value, darkMode: isDark },
    });
  } catch (e) {
    status.textContent = "Could not save settings: " + e.message;
  }
}

// Auto-grow: expands with content up to MAX_INPUT_HEIGHT, shrinks when text is deleted.
const MAX_INPUT_HEIGHT = 160; // px, about 7 lines
function autoResize() {
  input.style.height = "auto";
  const full = input.scrollHeight + (input.offsetHeight - input.clientHeight);
  input.style.height = Math.min(full, MAX_INPUT_HEIGHT) + "px";
  input.style.overflowY = full > MAX_INPUT_HEIGHT ? "auto" : "hidden";
}
input.addEventListener("input", () => {
  autoResize();
  saveSettings(); // save the draft on every keystroke so closing the popup loses nothing
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let seq = 0; // ignore stale responses
async function translate() {
  const text = input.value.trim();
  if (!text) { codebox.hidden = true; codebox.classList.remove("loading", "done"); return; }
  const sl = sourceLang.value, tl = targetLang.value;
  const mine = ++seq;
  status.textContent = "";
  $("codeLabel").textContent = LANG_NAMES[tl];
  codebox.classList.remove("done");
  codebox.classList.toggle("empty", !output.textContent);
  codebox.classList.add("loading");
  codebox.hidden = false;
  try {
    const url = "https://translate.googleapis.com/translate_a/single?client=gtx&sl=" + sl +
      "&tl=" + tl + "&dt=t&q=" + encodeURIComponent(text);
    // Keep the loading animation visible for at least 350ms so it can be seen.
    const [res] = await Promise.all([fetch(url), sleep(350)]);
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    if (mine !== seq) return;
    output.textContent = data[0].map((seg) => seg[0]).join("");
    codebox.classList.remove("loading", "empty");
    void codebox.offsetWidth; // restart fade-in animation
    codebox.classList.add("done");
  } catch (e) {
    if (mine === seq) {
      codebox.classList.remove("loading", "empty");
      status.textContent = "Translation failed: " + e.message;
    }
  }
}

// If both selects match, move the other one to a different language.
function keepDifferent(changed) {
  if (sourceLang.value !== targetLang.value) return;
  const other = changed === sourceLang ? targetLang : sourceLang;
  other.value = Object.keys(LANG_NAMES).find((c) => c !== changed.value);
}
function onLangChange(e) {
  keepDifferent(e.target);
  saveSettings();
  translate();
}
sourceLang.addEventListener("change", onLangChange);
targetLang.addEventListener("change", onLangChange);

$("swapBtn").addEventListener("click", () => {
  [sourceLang.value, targetLang.value] = [targetLang.value, sourceLang.value];
  saveSettings();
  translate();
});

// Enter = translate, Shift+Enter = new line (IME composition is ignored).
input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    translate();
  }
});

copyBtn.addEventListener("click", async () => {
  await navigator.clipboard.writeText(output.textContent);
  copyBtn.textContent = "Copied!";
  setTimeout(() => (copyBtn.textContent = "Copy"), 1200);
});

(async () => {
  const s = await loadSettings();
  sourceLang.value = s.sourceLang;
  targetLang.value = s.targetLang;
  keepDifferent(sourceLang);
  if (typeof s.darkMode === "boolean") { isDark = s.darkMode; applyTheme(); }
  input.value = s.text || "";
  autoResize();
  input.focus();
  input.select(); // restored text is pre-selected, so Backspace/Delete clears it
})();
