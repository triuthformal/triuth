const out = document.getElementById("out");
const btn = document.getElementById("run");

let pyodide;

async function init() {
  out.textContent = "Loading Pyodide...\n";
  pyodide = await loadPyodide();
  out.textContent += "Ready.\n";
}

btn.addEventListener("click", async () => {
  if (!pyodide) return;
  out.textContent += "\nRunning main.py...\n";

  const code = await (await fetch("./main.py")).text();
  const result = await pyodide.runPythonAsync(code);

  if (result !== undefined) out.textContent += String(result) + "\n";
});

init();
