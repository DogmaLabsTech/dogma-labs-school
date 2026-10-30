// pnpm test:fast: run only the vitest tests the change touches.
// Changed = committed on this branch since it left the default branch + uncommitted + untracked + deleted.
// Extra args go to vitest (e.g. `pnpm test:fast --reporter=dot`).
// `--base=<ref>` compares against that ref instead of the default branch. `--dry-run` prints the plan and stops.
// Tier T1 of the testing rules; `pnpm test` is the full suite (T2). Playwright stays T2 only:
// for e2e changes use `pnpm test:e2e --only-changed` on the ROG.
//
// `vitest related` follows imports only, so the plan adds what imports cannot see, and when it cannot
// be sure it runs the full suite and says why. Selection never fails silently.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, relative, resolve } from 'node:path';

// A change to one of these can alter every test, so selection is not safe: run the full suite.
const FULL_SUITE_TRIGGERS = new Set([
  'vitest.config.ts',
  'vitest.eval.config.ts',
  'tests/setup-env.ts',
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'tsconfig.json',
  'tsconfig.build.json',
  '.nvmrc',
]);
// Files vitest can trace through imports.
const MODULE_EXT = /\.(?:[cm]?[jt]s|[jt]sx)$/;
const DOC_EXT = /\.md$/;
// Keep in step with `test.include` in vitest.config.ts. Test files elsewhere (render-service/test,
// .github/scripts) are not part of `pnpm test`.
const VITEST_TEST = /^tests\/.*\.test\.ts$/;
const OTHER_TEST = /\.test\.(?:[cm]?[jt]s|[jt]sx)$/;
// A test that reads files as text sees changes imports cannot show (source guards, css and doc checks).
const READS_FILES = /readFileSync|readdirSync|readdir\(|import\.meta\.glob|readFile\(/;
// Never part of the app's module graph. packages/docs is a standalone sub-app (own lockfile, outside the
// pnpm workspace) that no test touches.
const IGNORED_PREFIXES = ['.pm/', '.claude/', '.scratch/', 'node_modules/', 'packages/docs/'];
// Playwright owns these; vitest never runs them.
const PLAYWRIGHT = /^(?:e2e\/|playwright\.config\.ts$)/;
// The workspace packages reach the tests through their built dist/ (package.json main), not through
// their sources, so an import trace never links a package change to a test.
const WORKSPACE_PACKAGE = /^packages\//;
// Folders whose docs are read or served at run time; a doc here that no test names cannot be ruled out.
const APP_DIRS = ['app/', 'lib/', 'components/', 'public/', 'skills/', 'configs/', 'community/', 'types/', 'assets/', 'eval/'];

const git = (args) => {
  const r = spawnSync('git', args, { encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : null;
};
const lines = (s) => (s ?? '').split('\n').filter(Boolean);
const keep = (f) => !IGNORED_PREFIXES.some((p) => f.startsWith(p));
const inAppDirs = (f) => APP_DIRS.some((p) => f.startsWith(p));
const isPackageJson = (f) => f === 'package.json' || /\/package\.json$/.test(f);

function defaultBranchRef(override) {
  if (override) return override;
  const head = git(['symbolic-ref', '--short', 'refs/remotes/origin/HEAD']);
  const candidates = [head, 'origin/main', 'origin/master', 'main', 'master'].filter(Boolean);
  return candidates.find((ref) => git(['rev-parse', '--verify', '--quiet', ref]) !== null) ?? null;
}

// changed: files that exist now. deleted: files gone (a rename counts as a delete of the old path).
function changedFiles(override) {
  const ref = defaultBranchRef(override);
  const base = ref ? git(['merge-base', ref, 'HEAD']) : null;
  const status = lines(git(['diff', '--name-status', '--no-renames', base ?? 'HEAD']));
  const deleted = status.filter((l) => l.startsWith('D\t')).map((l) => l.slice(2));
  const tracked = status.filter((l) => !l.startsWith('D\t')).map((l) => l.split('\t')[1]);
  const untracked = lines(git(['ls-files', '--others', '--exclude-standard']));
  const changed = [...new Set([...tracked, ...untracked])].filter(keep).filter((f) => existsSync(f));
  return { ref: base ? ref : null, changed, deleted: deleted.filter(keep) };
}

function repoFiles() {
  return [...new Set([...lines(git(['ls-files'])), ...lines(git(['ls-files', '--others', '--exclude-standard']))])].filter(keep);
}

// Does test `t` (source `text`) read changed file `f`? Returns why, or null. Only what the test reads counts:
// a quoted path naming f or its file name, or a folder it scans (readdirSync / import.meta.glob) that holds f.
let baseCounts;
function baseCount(base) {
  if (!baseCounts) {
    baseCounts = new Map();
    for (const f of repoFiles()) baseCounts.set(basename(f), (baseCounts.get(basename(f)) ?? 0) + 1);
  }
  return baseCounts.get(base) ?? 0;
}
const QUOTED = /(['"`])((?:\\.|(?!\1)[^\\\n])*)\1/g;
const isDir = (p) => existsSync(p) && statSync(p).isDirectory();
function whyReads(t, text, f) {
  const lits = [...text.matchAll(QUOTED)].map((m) => m[2]).filter((l) => l.length > 0 && l.length < 200);
  const base = basename(f);
  const abs = resolve(f);
  const names = (l) => {
    if (resolve(dirname(t), l) === abs || resolve(l) === abs) return true;
    const tail = l.replace(/^(?:\.\.?\/)+/, '');
    if (tail.includes('/')) return f === tail || f.endsWith('/' + tail);
    // a bare file name counts only when no other file in the repo has it (README.md, index.ts are everywhere)
    return tail === base && baseCount(base) === 1;
  };
  if (lits.some(names)) return `names ${base}`;
  if (!/readdirSync|readdir\(|import\.meta\.glob/.test(text)) return null;
  const inside = (dir) => {
    const rel = relative(dir, f);
    return rel !== '' && !rel.startsWith('..') && !rel.startsWith('/');
  };
  for (const l of lits) {
    if (/\*/.test(l) && /import\.meta\.glob/.test(text)) {
      const root = l.startsWith('/') ? '.' : dirname(t);
      const re = new RegExp('^' + resolve(root, l.replace(/^\//, '')).replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*\//g, '(?:.*/)?').replace(/\*/g, '[^/]*') + '$');
      if (re.test(resolve(f))) return `globs ${l}`;
      continue;
    }
    if (!/^[\w./-]+$/.test(l)) continue;
    // a bare '..' is one piece of a path built with join(), not a folder the test scans
    if (/^(?:\.\.\/?)+$/.test(l)) continue;
    if (l.startsWith('/')) continue;
    const dir = l.startsWith('.') ? resolve(dirname(t), l) : resolve(l);
    // a folder inside the repo, not the repo root or something above it
    if (relative('.', dir) === '' || relative('.', dir).startsWith('..')) continue;
    if (isDir(dir) && inside(dir)) return `scans ${relative('.', dir) || '.'}/`;
  }
  return null;
}

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const baseArg = args.find((a) => a.startsWith('--base='))?.slice('--base='.length);
const passthrough = args.filter((a) => a !== '--dry-run' && !a.startsWith('--base='));

const found = changedFiles(baseArg);
const { ref } = found;
const label = ref ? `against ${ref}` : 'against HEAD (no default branch found)';

// Playwright files and test files outside the vitest include never reach vitest; say so and set them aside.
const skipped = [];
const setAside = (f) => {
  if (PLAYWRIGHT.test(f)) return skipped.push(`${f} (Playwright, T2: pnpm test:e2e --only-changed)`), true;
  if (OTHER_TEST.test(f) && !VITEST_TEST.test(f)) return skipped.push(`${f} (a test outside the vitest include, not run by pnpm test)`), true;
  return false;
};
const changed = found.changed.filter((f) => !setAside(f));
const deleted = found.deleted.filter((f) => !setAside(f));
const noteSkipped = () => {
  for (const s of skipped) console.log(`test:fast: skipped ${s}`);
};

if (changed.length === 0 && deleted.length === 0) {
  noteSkipped();
  console.log(`test:fast: no changed files ${label}${skipped.length ? ' that vitest runs' : ''}, nothing to run.`);
  process.exit(0);
}

// ---- the plan: why the full suite (if it must), else the files to relate and the tests to add ----
const fullReasons = [];
const modules = [];
const named = new Map(); // test file -> the changed file it names
const docsOnly = []; // docs outside the app folders that no test names

for (const f of changed) {
  if (FULL_SUITE_TRIGGERS.has(f) || isPackageJson(f)) {
    fullReasons.push(`${f} changed (test config/setup/deps)`);
  } else if (WORKSPACE_PACKAGE.test(f)) {
    fullReasons.push(`${f} is in a workspace package that the tests use through its built dist/, so its importers cannot be traced`);
  } else if (MODULE_EXT.test(f)) {
    modules.push(f);
  }
}

// A deleted or renamed file may have been imported anywhere, and `related` cannot trace a file that is gone.
for (const f of deleted) {
  if (DOC_EXT.test(f) && !inAppDirs(f)) continue;
  fullReasons.push(`${f} was deleted or renamed, so its importers cannot be traced`);
}

const tests = repoFiles()
  .filter((t) => VITEST_TEST.test(t) && existsSync(t))
  .map((t) => ({ t, text: readFileSync(t, 'utf8') }));

// A non-module file (css, html, json, art, docs): tests that read it by path or file name.
const nonModules = changed.filter((f) => !FULL_SUITE_TRIGGERS.has(f) && !isPackageJson(f) && !WORKSPACE_PACKAGE.test(f) && !MODULE_EXT.test(f));
for (const f of nonModules) {
  let hit = false;
  for (const { t, text } of tests) {
    const why = whyReads(t, text, f);
    if (!why) continue;
    hit = true;
    if (!named.has(t)) named.set(t, `${why} (${f})`);
  }
  if (hit) continue;
  if (DOC_EXT.test(f) && !inAppDirs(f)) docsOnly.push(f);
  else fullReasons.push(`${f} is not a JS/TS module and no test names it, so its effect cannot be traced`);
}

// Tests that read sources as text: imports do not link them, so add the ones whose reads cover a changed module.
const readers = new Map(); // test file -> why
for (const f of modules) {
  for (const { t, text } of tests) {
    if (!READS_FILES.test(text) || readers.has(t) || t === f) continue;
    const why = whyReads(t, text, f);
    if (why) readers.set(t, `${why} (${f})`);
  }
}

const extra = [...new Set([...named.keys(), ...readers.keys()])];
const toRelate = [...new Set([...modules, ...extra])];

noteSkipped();
if (fullReasons.length === 0 && toRelate.length === 0) {
  console.log(`test:fast: only docs changed ${label} (${docsOnly.join(', ') || 'none'}), nothing to run.`);
  process.exit(0);
}

const fullArgs = ['exec', 'vitest', 'run', ...passthrough];
const relatedArgs = ['exec', 'vitest', 'related', '--run', ...passthrough, ...toRelate];
const full = fullReasons.length > 0;

if (full) {
  for (const why of fullReasons) console.log(`test:fast: ${why}; running the full suite.`);
} else {
  console.log(`test:fast: ${changed.length + deleted.length} changed file(s) ${label}; running only the tests that touch them.`);
  for (const f of modules) console.log(`  related to ${f}`);
  for (const [t, why] of named) console.log(`  also run: ${t}, it reads: ${why}`);
  for (const [t, why] of readers) console.log(`  always run: reads sources: ${t}, ${why}`);
}

if (dryRun) {
  console.log(`test:fast (dry run): pnpm ${(full ? fullArgs : relatedArgs).join(' ')}`);
  process.exit(0);
}

// Run vitest, echoing its output; also watch for "No test files found" so a plan that selects nothing is not a silent pass.
function runVitest(vitestArgs, onDone) {
  const child = spawn('pnpm', vitestArgs, { stdio: ['inherit', 'pipe', 'pipe'] });
  let seen = '';
  const tee = (stream, out) =>
    stream.on('data', (chunk) => {
      out.write(chunk);
      seen = (seen + chunk).slice(-4000);
    });
  tee(child.stdout, process.stdout);
  tee(child.stderr, process.stderr);
  child.on('close', (code) => onDone(code ?? 1, /No test files found/i.test(seen)));
}

runVitest(full ? fullArgs : relatedArgs, (code, nothingSelected) => {
  if (!full && nothingSelected) {
    console.log('\ntest:fast: !! 0 tests were selected for these changes; that is not a pass. Running the full suite instead.');
    runVitest(fullArgs, (fullCode) => process.exit(fullCode));
    return;
  }
  process.exit(code);
});
