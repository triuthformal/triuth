const out = document.getElementById("out");
const btn = document.getElementById("run");
const inp = document.getElementById("inp_multi"); // textarea id

let pyodideReady = false;

async function init() {
  out.textContent = "Loading...\n";
  const pyodide = await loadPyodide();

  // Load main.py into Pyodide (cache-busted so you get the newest file)
  const code = await (
    await fetch("./main.py?ts=" + Date.now(), { cache: "no-store" })
  ).text();
  await pyodide.runPythonAsync(code);

  window.pyodide = pyodide;
  pyodideReady = true;
  out.textContent += "Ready. Paste lines and click Evaluate.\n";
}

btn.addEventListener("click", async () => {
  if (!pyodideReady) return;

  // multiline text
  const text = inp.value;

  // split into lines (keep non-empty lines)
  const lines = text.split(/\r?\n/).filter((s) => s.trim().length > 0);

  // Pass JS list -> Python
  window.pyodide.globals.set("user_lines", lines);

  // Call your function: app_llsat.process_all(list[str])
  // (assumes main.py defines/imports app_llsat)
  const result = await window.pyodide.runPythonAsync(
    "app_llsat.process_all(user_lines)"
  );

  // result might be a Python list[str]; show nicely
  if (Array.isArray(result)) {
    out.textContent = result; //.join("\n");
  } else {
    out.textContent = String(result);
  }
});

init();
