// Checks the yard/ engine, whose ported modules skip type checking (// @ts-nocheck):
// - every name a module uses is declared, imported or a browser/JS global, and every import exists;
// - simulating ES module evaluation from yard/index.ts, nothing is used at load time (a class it extends, a constant
//   it reads) before its own module has run, which would be a "cannot access before initialization" at startup.
import fs from 'node:fs';
import path from 'node:path';
import { parse } from '@babel/parser';
import traverseMod from '@babel/traverse';
const traverse = traverseMod.default;
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../yard');
const files = []; (function walk(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else if (p.endsWith('.ts')) files.push(p); } })(ROOT);
const BROWSER = new Set(['window', 'document', 'location', 'performance', 'requestAnimationFrame', 'matchMedia', 'getComputedStyle', 'devicePixelRatio', 'ResizeObserver', 'navigator', 'localStorage']);
let bad = 0;
const exportsOf = new Map();
for (const f of files) {
  const ast = parse(fs.readFileSync(f, 'utf8'), { sourceType:'module', plugins:['typescript'], allowAwaitOutsideFunction:true });
  const names = new Set();
  for (const st of ast.program.body) if (st.type === 'ExportNamedDeclaration' && st.declaration) {
    const d = st.declaration; if (d.declarations) d.declarations.forEach(x => names.add(x.id.name)); else if (d.id) names.add(d.id.name);
  }
  exportsOf.set(f, { ast, names });
}
for (const f of files) {
  const { ast } = exportsOf.get(f);
  // imported names must exist in the target module
  for (const st of ast.program.body) if (st.type === 'ImportDeclaration' && st.source.value.startsWith('.')) {
    const target = path.resolve(path.dirname(f), st.source.value) + '.ts', ex = exportsOf.get(target);
    if (!ex) { console.log(`${path.relative(ROOT, f)}: no module ${st.source.value}`); bad++; continue; }
    for (const sp of st.specifiers) if (sp.type === 'ImportSpecifier' && !ex.names.has(sp.imported.name)) { console.log(`${path.relative(ROOT, f)}: ${sp.imported.name} is not exported by ${st.source.value}`); bad++; }
  }
  const free = new Set();
  traverse(ast, { ReferencedIdentifier(p) { const n = p.node.name; if (!p.scope.hasBinding(n) && !BROWSER.has(n) && !(n in globalThis)) free.add(n); } });
  for (const n of free) { console.log(`${path.relative(ROOT, f)}: free ${n}`); bad++; }
}
console.log(bad ? `${bad} problem(s)` : `clean (${files.length} files)`);

// ---- load order: simulate ES module evaluation from the entry and flag anything used at load time before its module ran ----
const importsOf = new Map(), evalDeps = new Map();
for (const f of files) {
  const { ast } = exportsOf.get(f), imps = [], deps = new Set();
  for (const st of ast.program.body) if (st.type === 'ImportDeclaration' && st.source.value.startsWith('.')) imps.push(path.resolve(path.dirname(f), st.source.value) + '.ts');
  traverse(ast, { ReferencedIdentifier(p) {
    if (p.getFunctionParent()) return;
    const b = p.scope.getBinding(p.node.name);
    if (b?.kind === 'module' && b.path.parent.source.value.startsWith('.')) deps.add(`${path.resolve(path.dirname(f), b.path.parent.source.value)}.ts|${p.node.name}`);
  } });
  importsOf.set(f, imps); evalDeps.set(f, deps);
}
const state = new Map(), done = new Set(); let tdz = 0;
(function visit(f) {
  if (state.has(f)) return; state.set(f, 'busy');
  for (const d of importsOf.get(f) ?? []) visit(d);
  for (const dep of evalDeps.get(f)) { const [m, n] = dep.split('|'); if (m !== f && !done.has(m)) { console.log(`LOAD ORDER ${path.relative(ROOT, f)} uses ${n} before ${path.relative(ROOT, m)} has run`); tdz++; } }
  done.add(f);
})(path.join(ROOT, 'index.ts'));
console.log(tdz ? `${tdz} load-order problem(s)` : 'load order ok');
process.exit(bad || tdz ? 1 : 0);
