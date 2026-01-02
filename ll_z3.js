// ll_z3.js
// API you want:
//   process_all(lines: string[]) -> Promise<string>   (returns ONE string)

let Z3 = null;
let z3Mode = "unknown"; // "z3" or "fallback"

// ---------- Parser for prefix boolean formulas ----------

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
    } else cur += ch;
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
    if (tokens[idx.i] !== ")") throw new Error("Missing ')'");
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
  if (idx.i !== tokens.length) throw new Error("Extra tokens: " + tokens.slice(idx.i).join(" "));
  return ast;
}

function collectVars(ast, set) {
  if (ast.kind === "var") set.add(ast.name);
  else for (const a of ast.args) collectVars(a, set);
}

// ---------- Fallback SAT (pure JS, GitHub Pages-safe) ----------
// 3-valued eval: true/false/null(unknown). false means "definitely false" under partial assignment.
function triEval(ast, env) {
  if (ast.kind === "var") return Object.prototype.hasOwnProperty.call(env, ast.name) ? env[ast.name] : null;

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
    // (A -> B) == (not A) or B, in tri-logic
    const A = xs[0], B = xs[1];
    const notA = (A === null) ? null : !A;
    // or(notA, B)
    if (notA === true || B === true) return true;
    if (notA === false && B === false) return false;
    if (notA === false && B === null) return null;
    if (notA === null && B === false) return null;
    return null;
  }

  throw new Error("Unknown operator: " + op);
}

function satSolve(ast) {
  const vars = Array.from((() => { const s = new Set(); collectVars(ast, s); return s; })()).sort();
  const env = Object.create(null);

  function dfs(i) {
    const v = triEval(ast, env);
    if (v === false) return null;          // prune
    if (v === true) {
      // fill remaining vars with false for a complete model
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

// ---------- Z3 path (only if it actually initializes) ----------

async function tryInitZ3() {
  if (Z3) return true;

  // z3-solver code often looks for `global`. Ensure it exists.
  globalThis.global = globalThis;

  // z3-solver browser init expects globalThis.initZ3 to exist. :contentReference[oaicite:2]{index=2}
  if (!globalThis.initZ3) {
    throw new Error(
      "initZ3 missing. Ensure z3-built.js is loaded before your module."
    );
  }

  // Import the browser build explicitly (avoids node build selection weirdness)
  const { init } = await import("https://esm.sh/z3-solver@4.15.4/build/browser");

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

  if (op === "not") return Z3.Not(args[0]);
  if (op === "and") return Z3.And(...args);
  if (op === "or") return Z3.Or(...args);
  if (op === "implies") return Z3.Implies(args[0], args[1]);
  throw new Error("Unknown operator: " + op);
}

// ---------- Public functions ----------

export async function warmup() {
  let msg = "Before Z3 init attempt…\n";
  try {
    msg += "Attempting Z3 init…\n";
    await tryInitZ3();
     = "z3";
    msg += "After Z3 init attempt: SUCCESS (Z3 mode)\n";
  } catch (e) {
     = "fallback";
    msg += "After Z3 init attempt: FAILED\n";
    msg += (e?.stack || String(e)) + "\n";
    msg += "\nFalling back to pure-JS SAT (works on GitHub Pages).\n";
  }
  return msg;
}

export async function process_all(lines) {
  if (z3Mode === "unknown") {
    await warmup();
  }

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
        // --- inside: if (z3Mode === "z3") { ... } ---
        
        const env = Object.create(null);
        const f = astToZ3(ast, env);
        const s = new Z3.Solver();
        s.add(f);
        
        // check() is async in the browser bindings
        const r = await s.check();
        
        // normalize result (sometimes it's "sat"/"unsat"/"unknown", sometimes constants)
        let rStr = String(r);
        if (r === Z3.SATISFIABLE || rStr === "sat") rStr = "sat";
        else if (r === Z3.UNSATISFIABLE || rStr === "unsat") rStr = "unsat";
        else if (r === Z3.UNKNOWN || rStr === "unknown") rStr = "unknown";
        
        out.push(`Result: ${rStr}`);
        
        if (rStr === "sat") {
          // model() may be sync or async depending on build
          const mMaybe = s.model();
          const m = (mMaybe && typeof mMaybe.then === "function") ? await mMaybe : mMaybe;
        
          const names = Object.keys(env).sort();
          const assigns = [];
          for (const n of names) {
            const v = env[n];
        
            const valMaybe = m.eval(v);
            const val = (valMaybe && typeof valMaybe.then === "function") ? await valMaybe : valMaybe;
        
            assigns.push(`${n}=${val.toString()}`);
          }
          out.push("Model: " + (assigns.length ? assigns.join(", ") : "(no vars)"));
        }

      } else {
        const { sat, model, vars } = satSolve(ast);
        out.push(`Result: ${sat ? "sat" : "unsat"}`);
        if (sat) {
          const assigns = vars.map(v => `${v}=${model[v] ? "true" : "false"}`);
          out.push("Model: " + (assigns.length ? assigns.join(", ") : "(no vars)"));
        }
      }
    } catch (e) {
      out.push("Error: " + (e?.message || String(e)));
    }
  }

  return out.join("\n");
}
