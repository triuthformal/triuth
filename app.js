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

  const code = await (await fetch("./main.py?ts=" + Date.now(), { cache: "no-store" })).text();

  const indented = code.split("\n").map(line => "    " + line).join("\n");

  const wrapped = `
import sys, io
_buf = io.StringIO()
_old = sys.stdout
sys.stdout = _buf
try:
${indented}
finally:
    sys.stdout = _old
_buf.getvalue()
`;

  const printed = await pyodide.runPythonAsync(wrapped);
  if (printed) out.textContent += printed;
});


// btn.addEventListener("click", async () => {
//   if (!pyodide) return;
//   out.textContent += "\nRunning main.py...\n";

//   const code = await (await fetch("./main.py?ts=" + Date.now(), { cache: "no-store" })).text();
//   // const code = await (await fetch("./main.py")).text();
//   const result = await pyodide.runPythonAsync(code);

//   if (result !== undefined) out.textContent += String(result) + "\n";
// });

init();
