// app_llsat.js
const out = document.getElementById("out");
const btn = document.getElementById("run");
const inp = document.getElementById("inp_multi");

let pyodideReady = false;

async function init() {
  out.textContent = "Loading Pyodide...\n";
  const pyodide = await loadPyodide();

  pyodide.setStdout({ batched: (s) => (out.textContent += s) });
  pyodide.setStderr({ batched: (s) => (out.textContent += s) });

  // Install z3-solver via micropip (if available for Pyodide)
  out.textContent += "Installing z3-solver...\n";
  await pyodide.loadPackage("micropip");
  await pyodide.runPythonAsync(`
import micropip
await micropip.install("z3-solver")
`);

  // Load ll_z3.py into Pyodide FS so import works
  const llz3Code = await (
    await fetch("./ll_z3.py?ts=" + Date.now(), { cache: "no-store" })
  ).text();
  pyodide.FS.writeFile("ll_z3.py", llz3Code);

  window.pyodide = pyodide;
  pyodideReady = true;
  out.textContent += "Ready.\n";
}

btn.addEventListener("click", async () => {
  if (!pyodideReady) return;

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
    out.textContent = "Error:\n" + (e?.stack || e);
  }
});

init();
