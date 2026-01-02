import { warmup, process_all } from "./ll_z3.js";

const out = document.getElementById("out");
const btn = document.getElementById("run");
const inp = document.getElementById("inp_multi");

function setOut(s) {
  out.textContent = String(s);
}

function getLines() {
  return inp.value
    .split(/\r?\n/)
    .map(s => s.trim())
    .filter(Boolean);
}

btn.addEventListener("click", async () => {
  setOut("Run clicked…\n");
  try {
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
