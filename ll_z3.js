// Z3 official JS bindings are distributed as "z3-solver". :contentReference[oaicite:1]{index=1}
//
// Using esm.sh here keeps the repo tiny for GitHub Pages.
// If you later want to vendor files locally, you can replace this import with local copies.
import { init } from "https://esm.sh/z3-solver@4.15.4";

let _z3 = null; // { Context, Z3 }

async function getZ3() {
  if (_z3) return _z3;

  // Some environments expect a "global" alias; harmless if already present.
  if (!globalThis.global) globalThis.global = globalThis;

  const before = "About to initialize Z3 via z3-solver (JS/WASM)...";
  // Note: init() returns { Context, em } in common examples. :contentReference[oaicite:2]{index=2}
  const { Context } = await init();
  const Z3 = Context("main");

  _z3 = { Context, Z3, before };
  return _z3;
}

// Prints something before and after it attempts to load Z3.
export async function warmup_z3() {
  const start = "WARMUP: starting...\n";
  const mid = "WARMUP: about to attempt Z3 init...\n";
  try {
    const { before } = await getZ3();
    return start + mid + before + "\nWARMUP: Z3 init finished.";
  } catch (e) {
    return (
      start +
      mid +
      "WARMUP: Z3 init FAILED:\n" +
      (e && e.stack ? e.stack : String(e))
    );
  }
}

// --- Parsing (prefix boolean expressions) ---

function tokenize(s) {
  // Split on whitespace and parentheses, keeping parentheses as tokens
  const out = [];
  let cur = "";
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === "(" || ch === ")") {
      if (cur.trim().length) out.push(cur.trim());
      cur = "";
      out.push(ch);
    } else if (/\s/.test(ch)) {
      if (cur.trim().length) out.push(cur.trim());
      cur = "";
    } else {
      cur += ch;
    }
  }
  if (cur.trim().length) out.push(cur.trim());
  return out;
}

function parseExpr(tokens, idxObj) {
  // returns AST node
  if (idxObj.i >= tokens.length) throw new Error("Unexpected end of input");

  const t = tokens[idxObj.i];

  if (t === "(") {
    idxObj.i++; // consume '('
    if (idxObj.i >= tokens.length) throw new Error("Expected operator after '('");
    const op = tokens[idxObj.i++].toLowerCase();
    const args = [];

    while (idxObj.i < tokens.length && tokens[idxObj.i] !== ")") {
      args.push(parseExpr(tokens, idxObj));
    }
    if (idxObj.i >= tokens.length || tokens[idxObj.i] !== ")") {
      throw new Error("Missing ')'");
    }
    idxObj.i++; // consume ')'
    return { kind: "app", op, args };
  }

  if (t === ")") throw new Error("Unexpected ')'");
  idxObj.i++; // consume atom
  return { kind: "var", name: t };
}

function parseLine(s) {
  const tokens = tokenize(s);
  const idxObj = { i: 0 };
  const ast = parseExpr(tokens, idxObj);
  if (idxObj.i !== tokens.length) {
    throw new Error("Extra tokens after end: " + tokens.slice(idxObj.i).join(" "));
  }
  return ast;
}

function collectVars(ast, set) {
  if (ast.kind === "var") set.add(ast.name);
  else for (const a of ast.args) collectVars(a, set);
}

function astToZ3(ast, Z3, env) {
  if (ast.kind === "var") {
    if (!env[ast.name]) env[ast.name] = Z3.Bool.const(ast.name);
    return env[ast.name];
  }

  const op = ast.op;
  const args = ast.args.map((a) => astToZ3(a, Z3, env));

  if (op === "not") {
    if (args.length !== 1) throw new Error("not expects 1 arg");
    return Z3.Not(args[0]);
  }
  if (op === "and") {
    if (args.length < 2) throw new Error("and expects >=2 args");
    return Z3.And(...args);
  }
  if (op === "or") {
    if (args.length < 2) throw new Error("or expects >=2 args");
    return Z3.Or(...args);
  }
  if (op === "implies") {
    if (args.length !== 2) throw new Error("implies expects 2 args");
    return Z3.Implies(args[0], args[1]);
  }

  throw new Error("Unknown operator: " + op);
}

// --- Public API: takes list of strings, returns a string ---

export async function process_all(lines) {
  const { Z3 } = await getZ3();

  const results = [];
  results.push(`Received ${lines.length} line(s).`);

  for (let k = 0; k < lines.length; k++) {
    const line = lines[k];
    results.push("");
    results.push(`Line ${k + 1}: ${line}`);

    try {
      const ast = parseLine(line);

      const vars = new Set();
      collectVars(ast, vars);

      const env = Object.create(null);
      const formula = astToZ3(ast, Z3, env);

      const solver = new Z3.Solver();
      solver.add(formula);

      const r = solver.check(); // compares with Z3.SATISFIABLE in many examples :contentReference[oaicite:3]{index=3}
      let rStr = String(r);

      // Normalize common outputs
      if (r === Z3.SATISFIABLE) rStr = "sat";
      else if (r === Z3.UNSATISFIABLE) rStr = "unsat";
      else if (r === Z3.UNKNOWN) rStr = "unknown";

      results.push(`Result: ${rStr}`);

      if (r === Z3.SATISFIABLE) {
        const model = solver.model();
        const names = Array.from(vars).sort();
        if (names.length === 0) {
          results.push("Model: (no variables)");
        } else {
          const assigns = [];
          for (const nm of names) {
            const v = env[nm] || Z3.Bool.const(nm);
            const val = model.eval(v).toString();
            assigns.push(`${nm}=${val}`);
          }
          results.push("Model: " + assigns.join(", "));
        }
      }
    } catch (e) {
      results.push("Error: " + (e && e.message ? e.message : String(e)));
    }
  }

  return results.join("\n");
}
