const out = document.getElementById("out");
const btn = document.getElementById("run");
const inp = document.getElementById("inp");

let pyodideReady = false;

async function init() {
  out.textContent = "Loading...\n";
  const pyodide = await loadPyodide();

  // Load main.py into Pyodide (cache-busted so you get the newest file)
  const code = await (await fetch("./main.py?ts=" + Date.now(), { cache: "no-store" })).text();
  await pyodide.runPythonAsync(code);

  // Store pyodide globally so button can use it
  window.pyodide = pyodide;
  pyodideReady = true;
  out.textContent += "Ready. Type something and click Evaluate.\n";
}

btn.addEventListener("click", async () => {
  if (!pyodideReady) return;

  const text = inp.value;

  // Pass JS string -> Python
  window.pyodide.globals.set("user_text", text);

  // Call the Python function and get its returned string
  const result = await window.pyodide.runPythonAsync("process(user_text)");

  out.textContent = String(result);
});

init();

