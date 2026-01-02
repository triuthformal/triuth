// app_llsat.js
const out = document.getElementById("out");
const btn = document.getElementById("run");
const inp = document.getElementById("inp_multi");

let pyodideReady = false;

async function init() {
  out.textContent = "Loading Pyodide...\n";

  const pyodide = await loadPyodide();

  // Make Python print() / errors visible in the <pre>
  pyodide.setStdout({ batched: (s) => (out.textContent += s) });
  pyodide.setStderr({ batched: (s) => (out.textContent += s) });

  // If ll_z3.py imports other local files, make sure they are served too.
  // Pre-load ll_z3.py into the in-memory FS so `import ll_z3` works reliably.
  const llz3Code = await (
    await fetch("./ll_z3.py?ts=" + Date.now(), { cache: "no-store" })
  ).text();
  pyodide.FS.writeFile("ll_z3.py", llz3Code);

  // (Optional) run main.py if you use it for setup; safe to omit if not needed.
  // const mainCode = await (await fetch("./main.py?ts=" + Date.now(), { cache: "no-store" })).text();
  // await pyodide.runPythonAsync(mainCode);

  window.pyodide = pyodide;
  pyodideReady = true;
  out.textContent += "Ready. Paste lines and click Run.\n";
}

btn.addEventListener("click", async () => {
  if (!pyodideReady) return;

  try {
    out.textContent = ""; // clear output

    const lines = inp.value
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    // JS array -> Python list[str]
    const pyLines = window.pyodide.toPy(lines);
    window.pyodide.globals.set("user_lines", pyLines);

    // Call: ll_z3.process_all(list[str]) -> str
    const result = await window.pyodide.runPythonAsync(`
import ll_z3
res = ll_z3.process_all(user_lines)
res
`);

    out.textContent = String(result);

    // cleanup
    pyLines.destroy?.();
  } catch (e) {
    out.textContent = "Error:\n" + (e?.stack || e);
  }
});

init();
