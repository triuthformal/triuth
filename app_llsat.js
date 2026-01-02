import { process_all, warmup_z3 } from "./ll_z3.js";

const out = document.getElementById("out");
const btn = document.getElementById("run");
const inp = document.getElementById("inp_lines");

function setOut(s) {
  out.textContent = String(s);
}

function getLines() {
  // split into list[str], keep non-empty lines (but preserve internal spaces)
  return inp.value
    .split("\n")
    .map((x) => x.trim())
    .filter((x) => x.length > 0);
}

async function init() {
  setOut("Loading Z3 (JS/WASM)...\n");
  try {
    // prints before/after attempts to load Z3
    const msg = await warmup_z3();
    setOut(msg + "\nReady. Paste expressions and click Run.\n");
  } catch (e) {
    setOut("INIT ERROR:\n" + (e && e.stack ? e.stack : String(e)));
  }
}

btn.addEventListener("click", async () => {
  setOut("Run clicked.\nPreparing input...\n");
  try {
    const lines = getLines();
    setOut(
      "Run clicked.\n" +
        `Lines: ${lines.length}\n` +
        "Calling process_all(lines)...\n"
    );

    const result = await process_all(lines);

    // display returned string
    setOut(result);
  } catch (e) {
    setOut("RUN ERROR:\n" + (e && e.stack ? e.stack : String(e)));
  }
});

init();
