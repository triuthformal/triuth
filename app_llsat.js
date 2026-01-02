import { warmup, process_all } from "./ll_z3.js";

const out = document.getElementById("out");
const btn = document.getElementById("run");

// Try common ids, then fall back to the first textarea on the page
const inp =
  document.getElementById("inp_multi") ||
  document.getElementById("inp_lines") ||
  document.getElementById("inp") ||
  document.querySelector("textarea");

function setOut(s) {
  out.textContent = String(s);
}

function getLines() {
  if (!inp) {
    throw new Error(
      'Textarea not found. Add id="inp_multi" to your <textarea> (recommended).'
    );
  }
  return inp.value
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

btn.addEventListener("click", async () => {
  try {
    setOut("Run clicked…\n");

    const lines = getLines();
    const result = await process_all(lines); // list[str] -> string

    setOut(result);
  } catch (e) {
    setOut("RUN ERROR:\n" + (e?.stack || String(e)));
  }
});

(async () => {
  try {
    setOut("Warming up…\n");
    const msg = await warmup();
    setOut(msg + "\n\nReady.");
  } catch (e) {
    setOut("INIT ERROR:\n" + (e?.stack || String(e)));
  }
})();
