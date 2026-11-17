const [src, dst, input, box, lang, out, copy, swap, theme] =
  ["src", "dst", "input", "box", "lang", "out", "copy", "swap", "theme"].map((id) => document.getElementById(id));
const TIMEOUT_MS = 10000;
let dark = matchMedia("(prefers-color-scheme: dark)").matches; // system theme until the user picks one
let last = "";  // key of the last request, so identical requests are skipped
let ctrl;       // lets a newer request cancel the previous one
let saveTimer, copyTimer;
let restored = false; // saving is blocked until the saved session is loaded, so it cannot be overwritten

const applyTheme = () => (document.documentElement.style.colorScheme = dark ? "dark" : "light");
const saveNow = () => restored && chrome.storage.local.set({ src: src.value, dst: dst.value, text: input.value, dark }).catch(console.warn);
const save = () => { clearTimeout(saveTimer); saveTimer = setTimeout(saveNow, 200); }; // debounced
addEventListener("pagehide", saveNow); // flush when the popup closes

async function translate() {
  const text = input.value.trim();
  const key = `${src.value}>${dst.value}:${text}`;
  box.hidden = !text;
  if (!text) { ctrl?.abort(); last = ""; return; }
  if (key === last) return;
  last = key;
  ctrl?.abort();
  ctrl = new AbortController();
  box.classList.add("loading");
  lang.textContent = dst.selectedOptions[0]?.text ?? "";
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&dt=t&sl=${src.value}&tl=${dst.value}&q=${encodeURIComponent(text)}`;
    // cancelled by a newer request, or by the timeout so the spinner can never hang forever
    const res = await fetch(url, { signal: AbortSignal.any([ctrl.signal, AbortSignal.timeout(TIMEOUT_MS)]) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data?.[0])) throw new Error("Unexpected response");
    out.textContent = data[0].map((s) => s[0]).join("");
  } catch (e) {
    if (e.name === "AbortError") return; // a newer request took over
    out.textContent = "Error: " + (e.name === "TimeoutError" ? "request timed out" : e.message);
    last = ""; // allow retrying
  }
  box.classList.remove("loading");
}

// any typing or language change: save it; language changes also re-translate
document.addEventListener("input", (e) => { save(); if (e.target !== input) translate(); });

// Enter = translate, Shift+Enter = new line (ignored while an IME is composing)
input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); translate(); }
});

swap.onclick = () => { [src.value, dst.value] = [dst.value, src.value]; save(); translate(); };
theme.onclick = () => { dark = !dark; applyTheme(); save(); };
copy.onclick = async () => {
  clearTimeout(copyTimer); // repeated clicks must not stack timers
  try {
    await navigator.clipboard.writeText(out.textContent);
    copy.textContent = "Copied!";
  } catch {
    copy.textContent = "Failed";
  }
  copyTimer = setTimeout(() => (copy.textContent = "Copy"), 1200);
};

// restore the last session; the restored text is selected so Backspace/Delete clears it
const defaults = () => ({ src: "ko", dst: "en", text: "", dark });
chrome.storage.local.get(defaults()).catch(defaults).then((s) => {
  if (typeof s.dark === "boolean") dark = s.dark;
  applyTheme();
  src.value = s.src;
  dst.value = s.dst;
  if (!src.value) src.value = "ko"; // saved value no longer valid
  if (!dst.value) dst.value = "en";
  input.value = String(s.text ?? "");
  input.focus();
  input.select();
}).catch(console.warn).finally(() => { restored = true; document.body.classList.add("ready"); });
