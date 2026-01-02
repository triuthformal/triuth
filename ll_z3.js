// ll_z3.js
// GitHub-Pages-safe:
// - Accepts list of strings
// - Returns ONE string
// - Tries Z3 (WASM) only when crossOriginIsolated=true
// - Otherwise uses a pure-JS SAT fallback
// - Even in Z3 mode, wraps check() in a timeout to avoid hanging

let Z3 = null;
let z3Mode = "unknown"; // "z3" or "fallback" or "unknown"

// ---------------------- helpers ----------------------

function withTimeout(promise, ms, label = "operation") {
  return Promise.race([
    promise,
    new Promise((_, rej) =>
      setTimeout(() => rej(new Error(`Timeout after ${ms}ms during ${label}`)), ms)
    ),
  ]);
}

function canUseZ3OnThisPage() {
  // Z3 WASM builds often rely on cross-origin isolation (SharedArrayBuffer/threads).
  // GitHub Pages typically isn't crossOriginIsolated.
  return typeof window !== "undefined" && window.crossOriginIsolated === true;
}

// ---------------------- prefix parser ----------------------

function tokenize(s) {
  const out = [];
  let cur = "";
  for (const ch of s) {
    if (ch === "(" || ch === ")") {
      if (cur.trim()) out.push(cur.trim());
      cur = "";
      out.push(ch);
    } else if (/\s/.test(ch)) {
      if (cur.trim()) out.push(cur.trim());
      cur = "";
    } else {
      cur += ch;
    }
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

function parseExpr(tokens, idx) {
  if (idx.i >= tokens.length) throw new Error("Unexpected end of input");
  const t = tokens[idx.i];

  if (t === "(") {
    idx.i++;
    if (idx.i >= tokens.length) throw new Error("Expected operator after '('");
    const op = tokens[idx.i++].toLowerCase();
    const args = [];
    while (idx.i < tokens.length && tokens[idx.i] !== ")") {
      args.push(parseExpr(tokens, idx));
    }
    if (idx.i >= tokens.length || tokens[idx.i] !== ")") {
      throw new Error("Missing ')'");
    }
    idx.i++;
    return { kind: "app", op, args };
  }

  if (t === ")") throw new Error("Unexpected ')'");
  idx.i++;
  return { kind: "var", name: t };
}

function parseLine(s) {
  const tokens = tokenize(s);
  const idx = { i: 0 };
  const ast = parseExpr(tokens, idx);
  if (idx.i !== tokens.length) {
    throw new Error("Extra tokens: " + tokens.slice(idx.i).join(" "));
  }
  return ast;
}

function collectVars(ast, set) {
  if (ast.kind === "var") set.add(ast.name);
  else for (const a of ast.args) collectVars(a, set);
}

// ---------------------- pure-JS fallback SAT ----------------------
// 3-valued evaluation (true/false/null) for pruning during backtracking.

function triEval(ast, env) {
  if (ast.kind === "var") {
    return Object.prototype.hasOwnProperty.call(env, ast.name) ? env[ast.name] : null;
  }

  const op = ast.op;
  const xs = ast.args.map(a => triEval(a, env));

  if (op === "not") {
    if (xs.length !== 1) throw new Error("not expects 1 arg");
    return xs[0] === null ? null : !xs[0];
  }

  if (op === "and") {
    if (xs.length < 2) throw new Error("and expects >=2 args");
    if (xs.some(v => v === false)) return false;
    if (xs.every(v => v === true)) return true;
    return null;
  }

  if (op === "or") {
    if (xs.length < 2) throw new Error("or expects >=2 args");
    if (xs.some(v => v === true)) return true;
    if (xs.every(v => v === false)) return false;
    return null;
  }

  if (op === "implies") {
    if (xs.length !== 2) throw new Error("implies expects 2 args");
    const A = xs[0], B = xs[1];
    const notA = (A === null) ? null : !A;
    // or(notA, B) with tri-logic
    if (notA === true || B === true) return true;
    if (notA === false && B === false) return false;
    return null;
  }

  throw new Error("Unknown operator: " + op);
}

function satSolve(ast) {
  const varsSet = new Set();
  collectVars(ast, varsSet);
  const vars = Array.from(varsSet).sort();
  const env = Object.create(null);

  function dfs(i) {
    const v = triEval(ast, env);
    if (v === false) return null;     // prune
    if (v === true) {
      // Complete the model deterministically
      for (let j = i; j < vars.length; j++) env[vars[j]] = false;
      return { ...env };
    }
    if (i >= vars.length) return null;

    const name = vars[i];

    env[name] = false;
    let r = dfs(i + 1);
    if (r) return r;

    env[name] = true;
    r = dfs(i + 1);
    if (r) return r;

    delete env[name];
    return null;
  }

  const model = dfs(0);
  return { sat: model !== null, model, vars };
}

// ---------------------- Z3 (WASM) path ----------------------

async function tryInitZ3() {
  if (Z3) return true;

  // z3-solver often expects `global` to exist.
  globalThis.global = globalThis;

  // z3-solver browser build expects initZ3 to be defined by z3-built.js
  // Ensure index.html includes:
  // <script src="https://cdn.jsdelivr.net/npm/z3-solver@4.15.4/build/z3-built.js"></script>
  if (!globalThis.initZ3) {
    throw new Error(
      "initZ3 missing. Load z3-built.js before ll_z3.js (see index.html)."
    );
  }

  // Import browser build (CDN ESM)
  const mod = await import("https://esm.sh/z3-solver@4.15.4/build/browser");
  const { init } = mod;

  const { Context } = await init();
  Z3 = Context("main");
  return true;
}

function astToZ3(ast, env) {
  if (ast.kind === "var") {
    if (!env[ast.name]) env[ast.name] = Z3.Bool.const(ast.name);
    return env[ast.name];
  }

  const op = ast.op;
  const args = ast.args.map(a => astToZ3(a, env));

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

// ---------------------- public API ----------------------

export async function warmup() {
  let msg = "Before Z3 init attempt…\n";

  if (!canUseZ3OnThisPage()) {
    z3Mode = "fallback";
    msg += "Z3 disabled: window.crossOriginIsolated is false.\n";
    msg += "Using pure-JS fallback SAT solver (GitHub Pages-safe).\n";
    return msg;
  }

  try {
    msg += "Attempting Z3 init…\n";
    await tryInitZ3();
    z3Mode = "z3";
    msg += "After Z3 init attempt: SUCCESS (Z3 mode)\n";
  } catch (e) {
    z3Mode = "fallback";
    msg += "After Z3 init attempt: FAILED\n";
    msg += (e?.stack || String(e)) + "\n";
    msg += "Falling back to pure-JS SAT.\n";
  }
  return msg;
}

// list[str] -> string
export async function process_all(lines) {
  if (z3Mode === "unknown") await warmup();

  const out = [];
  out.push(`Mode: ${z3Mode}`);
  out.push(`Received ${lines.length} line(s).`);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    out.push("");
    out.push(`Line ${i + 1}: ${line}`);

    try {
      const ast = parseLine(line);

      if (z3Mode === "z3") {
        const env = Object.create(null);
        const f = astToZ3(ast, env);
        const s = new Z3.Solver();
        s.add(f);

        let r;
        try {
          // check() is async in browser build; timeout prevents infinite hang
          r = await withTimeout(s.check(), 2000, "solver.check()");
        } catch (e) {
          // If Z3 hangs, switch to fallback permanently
          z3Mode = "fallback";
          out.push("Z3 check() hung/failed; switching to fallback.");
          out.push("Reason: " + (e?.message || String(e)));

          const fb = satSolve(ast);
          out.push(`Result: ${fb.sat ? "sat" : "unsat"}`);
          if (fb.sat) {
            const assigns = fb.vars.map(v => `${v}=${fb.model[v] ? "true" : "false"}`);
            out.push("Model: " + (assigns.length ? assigns.join(", ") : "(no vars)"));
          }
          continue;
        }

        // normalize result
        let rStr = String(r);
        if (r === Z3.SATISFIABLE || rStr === "sat") rStr = "sat";
        else if (r === Z3.UNSATISFIABLE || rStr === "unsat") rStr = "unsat";
        else if (r === Z3.UNKNOWN || rStr === "unknown") rStr = "unknown";

        out.push(`Result: ${rStr}`);

        if (rStr === "sat") {
          const mMaybe = s.model();
          const m =
            mMaybe && typeof mMaybe.then === "function" ? await mMaybe : mMaybe;

          const names = Object.keys(env).sort();
          const assigns = [];
          for (const n of names) {
            const v = env[n];
            const valMaybe = m.eval(v);
            const val =
              valMaybe && typeof valMaybe.then === "function"
                ? await valMaybe
                : valMaybe;
            assigns.push(`${n}=${val.toString()}`);
          }
          out.push("Model: " + (assigns.length ? assigns.join(", ") : "(no vars)"));
        }
      } else {
        const fb = satSolve(ast);
        out.push(`Result: ${fb.sat ? "sat" : "unsat"}`);
        if (fb.sat) {
          const assigns = fb.vars.map(v => `${v}=${fb.model[v] ? "true" : "false"}`);
          out.push("Model: " + (assigns.length ? assigns.join(", ") : "(no vars)"));
        }
      }
    } catch (e) {
      out.push("Error: " + (e?.message || String(e)));
    }
  }

  return out.join("\n");
}
