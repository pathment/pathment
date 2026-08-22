#!/usr/bin/env node
/**
 * Cheap syntax gate for CI: parse every application JS file.
 * Not a style linter — the server has no ESLint config yet; this still
 * catches truncated files and parse errors before a PR is merged.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SKIP_DIRS = new Set(['node_modules', 'coverage', 'logs', 'uploads', '.git']);

function walk(dir, acc = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(ent.name)) continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(full, acc);
    else if (ent.isFile() && ent.name.endsWith('.js')) acc.push(full);
  }
  return acc;
}

const roots = ['src', 'scripts', 'tests'].filter((d) => fs.existsSync(path.join(process.cwd(), d)));
const files = roots.flatMap((d) => walk(d));
let failed = 0;
for (const file of files) {
  const source = fs.readFileSync(file, 'utf8');
  try {
    new vm.Script(source, { filename: file });
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    failed += 1;
  }
}

if (failed) {
  console.error(`syntax-check: ${failed}/${files.length} file(s) failed`);
  process.exit(1);
}
console.log(`syntax-check: ${files.length} files ok`);
