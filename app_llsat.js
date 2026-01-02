// app_llsat.js
const out = document.getElementById("out");
const btn = document.getElementById("run");
const inp = document.getElementById("inp_multi");

let pyodideReady = false;

function log(msg) {
  out.textContent += msg + "\n";
}

btn.addEventListener("click", async () => {
  if (!pyodideReady) {
    log("Click ignored: still initializing (wait for 'Ready').");
    return;
  }

  try {
    out.textContent = "";

    const lines = inp.value
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);

    const pyLines = window.pyodide.toPy(lines);
    window.pyodide.globals.set("user_lines", pyLines);

    const result = await window.pyodide.runPythonAsync(`
import ll_z3
res = ll_z3.process_all(user_lines)
res
`);

    out.textContent = String(result);
    pyLines.destroy?.();
  } catch (e) {
    out.textContent = "Run error:\n" + (e?.stack || String(e));
  }
});

async function init() {
  try {
    btn.disabled = true;

    out.textContent = "Loading Pyodide...\n";
    const pyodide = await loadPyodide();

    // show Python print() and errors in <pre>
    pyodide.setStdout({ batched: (s) => (out.textContent += s) });
    pyodide.setStderr({ batched: (s) => (out.textContent += s) });

    // >>> BEFORE attempting z3 install
    log("About to attempt loading/installing Z3 (z3-solver) via micropip...");

    await pyodide.loadPackage("micropip");

    // Attempt install; prints happen inside Python too
    await pyodide.runPythonAsync(`
print("PY: Starting micropip.install('z3-solver')...")
import micropip
await micropip.install("z3-solver")
print("PY: Finished micropip.install('z3-solver').")
`);

    // <<< AFTER attempting z3 install
    log("Back in JS: Z3 install attempt finished (no exception thrown).");

    // Load ll_z3.py into Pyodide FS so `import ll_z3` works
    log("Loading ll_z3.py...");
    const llz3Code = await (
      await fetch("./ll_z3.py?ts=" + Date.now(), { cache: "no-store" })
    ).text();
    pyodide.FS.writeFile("ll_z3.py", llz3Code);

    log("Testing import ll_z3...");
    await pyodide.runPythonAsync(`
import ll_z3
print("PY: Imported ll_z3 successfully.")
`);

    window.pyodide = pyodide;
    pyodideReady = true;
    btn.disabled = false;
    log("Ready.");
  } catch (e) {
    btn.disabled = true;
    out.textContent += "\nINIT ERROR:\n" + (e?.stack || String(e)) + "\n";
  }
}

init();
