#!/usr/bin/env node
// Agent workflow gate (docs/AGENT_RULES.md).
//   start  [--hook] [--offline]  session-start report: unpushed / unmerged work, open PRs, board
//   scan   [--base <ref>]        block fake builds, weakened tests, broken assets, secrets
//   board                        task board counts match the phase files
//   finish [--hook]              before "done": committed, pushed, PR open, scan clean
// Exit code 1 means a blocking problem (scan, board, finish). Hook mode always exits 0.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const STATUSES = ['todo', 'doing', 'blocked', 'done'];
const BINARY_EXT = /\.(png|jpe?g|webp|gif|ico|icns|woff2?|ttf|otf|mp4|webm|mov|wav|mp3)$/i;
const MIN_ASSET_BYTES = { woff2: 1024, woff: 1024, ttf: 1024, otf: 1024, mp4: 1024, webm: 1024, mov: 1024, wav: 256, mp3: 256 };
const ALLOW_MARKER = 'agent-gate: allow';

const isTestPath = (p) => /(\.test\.|\.spec\.|(^|\/)tests?\/|(^|\/)e2e\/|_test\.go$|(^|\/)test_[^/]*\.py$|(^|\/)conftest\.py$)/.test(p);
const isProdCode = (p) =>
  /^(apps\/(daemon|web|desktop)\/src|services\/dub-engine\/vishnu_dub|runtime\/vishnuai\/(internal|pkg|cmd)|packages\/[^/]+\/src)\//.test(p) &&
  !isTestPath(p) && !/\.(md|json)$/.test(p);
const isPerfPath = (p) => /(benchmark|perf|performance)/i.test(p) && !isTestPath(p) && !/\.md$/.test(p);
const isDoc = (p) => /\.md$/i.test(p);
const isGateSelf = (p) => /^scripts\/agent-gate(\.test)?\.mjs$/.test(p);

// Content rules applied to added lines. `when` decides which files a rule looks at.
export const LINE_RULES = [
  { id: 'fake-media', level: 'error', when: isProdCode, re: /\b(testsrc2?|anullsrc|sine=frequency|smptebars)\b/,
    msg: 'synthetic ffmpeg media in production code (fake output); fail honestly instead' },
  { id: 'fake-result', level: 'error', when: isProdCode, re: /\b(fake|dummy|placeholder|canned)(Result|Output|Transcript|Subtitles?|Audio|Video|Translation|Score)\b/i,
    msg: 'fake or placeholder result in production code' },
  { id: 'fake-perf', level: 'error', when: isPerfPath, re: /\b(sleep|setTimeout|time\.sleep|Thread\.sleep)\s*\(/,
    msg: 'timer or sleep in a benchmark or performance path (fake performance)' },
  { id: 'skipped-test', level: 'error', when: isTestPath, re: /\b(it|test|describe)\.(skip|only)\s*\(|\bx(it|describe|test)\s*\(|@pytest\.mark\.skip\b|\.todo\s*\(/,
    msg: 'test skipped or focused (.skip/.only/xit/pytest skip); fix the cause or mark the task blocked' },
  { id: 'go-skip', level: 'warning', when: (p) => /_test\.go$/.test(p), re: /\bt\.Skip(f|Now)?\s*\(/,
    msg: 'Go test skip added; make sure it is an environment guard, not a hidden failure' },
  { id: 'history-mock', level: 'error', when: (p) => /src\/test\/setup\.ts$/.test(p), re: /window\.history/,
    msg: 'window.history mocked in test setup (CLAUDE.md forbids weakening setup.ts)' },
  { id: 'secret', level: 'error', when: () => true,
    re: /(sk-(proj-|ant-)?[A-Za-z0-9_-]{24,}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----|gh[pousr]_[A-Za-z0-9]{30,}|AIza[0-9A-Za-z_-]{35}|xox[abprs]-[A-Za-z0-9-]{20,})/,
    msg: 'looks like an API key, token or private key' },
  { id: 'reference-path', level: 'error', when: (p) => !isDoc(p) && p !== '.gitignore',
    re: /File clone Resource|(^|[\s'"`/\\])reference[/\\](ZastTranslate|VoxCPM|OpenCreator-source)/,
    msg: 'code or config points into the read-only reference folder (ADR-0004, ADR-0006)' },
];

export function scanAddedLines(path, lines) {
  if (isGateSelf(path)) return [];
  const findings = [];
  for (const { line, number } of lines) {
    if (line.includes(ALLOW_MARKER)) continue;
    for (const rule of LINE_RULES) {
      if (rule.id !== 'secret' && isDoc(path)) continue;
      if (rule.when(path) && rule.re.test(line)) {
        findings.push({ level: rule.level, rule: rule.id, path, line: number, msg: rule.msg, text: line.trim().slice(0, 140) });
      }
    }
  }
  return findings;
}

export function parseUnifiedDiff(diff) {
  const files = new Map();
  let current = null;
  let lineNo = 0;
  for (const raw of diff.split('\n')) {
    if (raw.startsWith('+++ ')) {
      const p = raw.slice(4).trim();
      current = p === '/dev/null' ? null : p.replace(/^b\//, '');
      if (current && !files.has(current)) files.set(current, []);
    } else if (raw.startsWith('@@')) {
      const m = /\+(\d+)/.exec(raw);
      lineNo = m ? Number(m[1]) : 0;
    } else if (current && raw.startsWith('+') && !raw.startsWith('+++')) {
      files.get(current).push({ line: raw.slice(1), number: lineNo++ });
    } else if (current && !raw.startsWith('-')) {
      lineNo++;
    }
  }
  return files;
}

export function checkCommitMessages(commits) {
  return commits
    .filter((c) => /[㐀-鿿豈-﫿]/.test(c.message))
    .map((c) => ({ level: 'error', rule: 'commit-language', path: c.sha.slice(0, 7), line: 0,
      msg: 'commit message contains Chinese text; AGENTS.md requires English', text: c.message.split('\n')[0].slice(0, 100) }));
}

const splitRow = (row) => row.split(/(?<!\\)\|/).map((c) => c.trim());

export function parsePhaseFile(text) {
  const tasks = [];
  for (const row of text.split(/\r?\n/)) {
    if (!/^\|\s*T\d+\.\d+\s*\|/.test(row)) continue;
    const cells = splitRow(row);
    const raw = (cells[3] ?? '').replace(/\*/g, '');
    const status = (/^[a-z]+/i.exec(raw)?.[0] ?? '').toLowerCase();
    tasks.push({ id: cells[1], status, raw, evidence: cells[4] ?? '' });
  }
  return tasks;
}

export function checkBoard(readmeText, readPhase) {
  const problems = [];
  for (const row of readmeText.split(/\r?\n/)) {
    const m = /^\|\s*(\d+)\s*\|\s*\[[^\]]+\]\(([^)]+\.md)\)\s*\|/.exec(row);
    if (!m) continue;
    const [, phase, file] = m;
    const cells = splitRow(row);
    const claimed = cells.slice(3, 8).map(Number);
    const text = readPhase(file);
    if (text == null) { problems.push({ level: 'error', rule: 'board', path: file, line: 0, msg: `phase ${phase}: file not found` }); continue; }
    const tasks = parsePhaseFile(text);
    for (const t of tasks) {
      if (!STATUSES.includes(t.status)) {
        problems.push({ level: 'error', rule: 'board', path: file, line: 0, msg: `${t.id}: status "${t.raw}" must start with one of ${STATUSES.join(', ')}` });
      } else if (t.status === 'done' && t.evidence.replace(/[\s|]/g, '').length < 10) {
        problems.push({ level: 'error', rule: 'board', path: file, line: 0, msg: `${t.id}: marked done with no evidence` });
      }
    }
    const actual = [tasks.length, ...['done', 'doing', 'blocked', 'todo'].map((s) => tasks.filter((t) => t.status === s).length)];
    if (actual.join() !== claimed.join()) {
      problems.push({ level: 'error', rule: 'board', path: 'docs/tasks/README.md', line: 0,
        msg: `phase ${phase} row says tasks/done/doing/blocked/todo = ${claimed.join('/')}, ${file} has ${actual.join('/')}` });
    }
  }
  return problems;
}

// ---------- git helpers ----------
function sh(cmd, args, opts = {}) {
  try {
    return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024, ...opts }).trim();
  } catch {
    return null;
  }
}
const git = (...args) => sh('git', ['-c', 'core.quotepath=off', ...args]);

function repoRoot() {
  return git('rev-parse', '--show-toplevel') ?? process.cwd();
}

function defaultBase() {
  for (const ref of ['origin/main', 'main']) {
    if (git('rev-parse', '--verify', '--quiet', ref)) return git('merge-base', ref, 'HEAD') ?? ref;
  }
  return null;
}

function runBoard(root) {
  const readme = join(root, 'docs/tasks/README.md');
  if (!existsSync(readme)) return [];
  return checkBoard(readFileSync(readme, 'utf8'), (file) => {
    const p = join(root, 'docs/tasks', file);
    return existsSync(p) ? readFileSync(p, 'utf8') : null;
  });
}

function runScan(root, base) {
  const findings = [];
  // `git diff <base>` compares the working tree with the base: committed, staged and unstaged changes at once.
  const ranges = [[base ?? 'HEAD']];
  const changed = new Set();
  for (const range of ranges) {
    const diff = git('diff', '--unified=0', '--no-color', '--no-ext-diff', ...range) ?? '';
    for (const [path, lines] of parseUnifiedDiff(diff)) {
      changed.add(path);
      findings.push(...scanAddedLines(path, lines));
    }
    for (const row of (git('diff', '--numstat', ...range) ?? '').split('\n').filter(Boolean)) {
      const [add, , path] = row.split('\t');
      changed.add(path);
      if (BINARY_EXT.test(path) && add !== '-') {
        findings.push({ level: 'error', rule: 'binary-as-text', path, line: 0,
          msg: 'binary asset diffed as text: line-ending conversion would corrupt it; mark it binary in .gitattributes' });
      }
    }
  }
  for (const path of changed) {
    if (/(^|\/)\.env(\.[^/]*)?$/.test(path) && !/\.example$/.test(path) && existsSync(join(root, path))) {
      findings.push({ level: 'error', rule: 'env-file', path, line: 0, msg: '.env file must not be committed' });
    }
    const ext = /\.([a-z0-9]+)$/i.exec(path)?.[1]?.toLowerCase();
    const min = ext && (MIN_ASSET_BYTES[ext] ?? (BINARY_EXT.test(path) ? 100 : 0));
    if (min && existsSync(join(root, path))) {
      const { size } = statSync(join(root, path));
      if (size > 0 && size < min) {
        findings.push({ level: 'error', rule: 'placeholder-asset', path, line: 0, msg: `asset is only ${size} bytes; looks like a placeholder, restore the real file` });
      }
    }
  }
  const touchedPhase = [...changed].some((p) => /^docs\/tasks\/phase-.*\.md$/.test(p));
  if (touchedPhase && !changed.has('docs/tasks/README.md')) {
    findings.push({ level: 'warning', rule: 'board-sync', path: 'docs/tasks/README.md', line: 0,
      msg: 'a phase task file changed but the board README did not; check the counts' });
  }
  if (base) {
    const log = git('log', '--format=%H%x00%B%x1e', `${base}..HEAD`) ?? '';
    const commits = log.split('\x1e').map((s) => s.trim()).filter(Boolean).map((s) => { const [sha, message = ''] = s.split('\x00'); return { sha, message }; });
    findings.push(...checkCommitMessages(commits));
  }
  findings.push(...runBoard(root));
  return findings;
}

function branchState() {
  const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
  const upstream = git('rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}');
  const ahead = upstream ? Number(git('rev-list', '--count', `${upstream}..HEAD`) ?? 0) : null;
  const dirty = (git('status', '--porcelain') ?? '').split('\n').filter(Boolean);
  return { branch, upstream, ahead, dirty };
}

function ghJson(args) {
  const out = sh('gh', args, { timeout: 15000 });
  if (!out) return null;
  try { return JSON.parse(out); } catch { return null; }
}

function startReport(root, { offline }) {
  const lines = [];
  const warn = (s) => lines.push(`- ${s}`);
  if (!offline) sh('git', ['fetch', 'origin', '--prune', '--quiet'], { timeout: 20000 });
  const { branch, dirty } = branchState();
  const hasOriginMain = !!git('rev-parse', '--verify', '--quiet', 'origin/main');
  lines.push(`Agent gate (docs/AGENT_RULES.md). Checkout: ${root} on ${branch}${dirty.length ? `, ${dirty.length} uncommitted file(s)` : ''}.`);
  if (branch === 'main' || branch === 'master') warn(`You are on ${branch}. Create a worktree and a phase-<n>/<name> branch before editing.`);

  const unpushed = [];
  const unmerged = [];
  for (const row of (git('for-each-ref', '--format=%(refname:short)\t%(upstream:short)', 'refs/heads') ?? '').split('\n').filter(Boolean)) {
    const [name, up] = row.split('\t');
    if (name === 'main' || name === 'master') continue;
    const notInMain = hasOriginMain ? Number(git('rev-list', '--count', `origin/main..${name}`) ?? 0) : 0;
    if (!notInMain) continue;
    const ahead = up ? Number(git('rev-list', '--count', `${up}..${name}`) ?? 0) : notInMain;
    if (!up || ahead > 0) unpushed.push(`${name} (${ahead} commit(s) not on GitHub)`);
    else unmerged.push(name);
  }
  if (unpushed.length) {
    warn(`Unpushed work on ${unpushed.length} branch(es). Push it and open a PR before starting a new task:`);
    unpushed.slice(0, 12).forEach((b) => lines.push(`    ${b}`));
    if (unpushed.length > 12) lines.push(`    … and ${unpushed.length - 12} more`);
  }
  const prs = ghJson(['pr', 'list', '--state', 'open', '--json', 'number,title,headRefName,isDraft,url']);
  const prBranches = new Set((prs ?? []).map((p) => p.headRefName));
  const noPr = unmerged.filter((b) => !prBranches.has(b));
  if (noPr.length) warn(`Pushed but not merged and no open PR: ${noPr.slice(0, 12).join(', ')}. Open a PR or delete the branch if it is obsolete.`);
  if (prs?.length) {
    warn(`Open PR(s) waiting for review or "merge #N":`);
    prs.slice(0, 10).forEach((p) => lines.push(`    #${p.number}${p.isDraft ? ' (draft)' : ''} ${p.title}: ${p.url}`));
  } else if (prs === null) {
    warn('Could not list PRs (gh not installed, not signed in, or offline).');
  }

  for (const block of (git('worktree', 'list', '--porcelain') ?? '').split(/\n\n+/)) {
    const path = /^worktree (.+)$/m.exec(block)?.[1];
    if (!path || path.replace(/\\/g, '/') === root.replace(/\\/g, '/')) continue;
    const count = (sh('git', ['-C', path, 'status', '--porcelain']) ?? '').split('\n').filter(Boolean).length;
    if (count) warn(`Worktree ${path} has ${count} uncommitted file(s). Its owner must commit or discard them.`);
  }

  if (hasOriginMain) {
    const head = git('rev-parse', '--short=7', 'origin/main');
    const builds = join(root, 'docs/FINAL_BUILDS.md');
    if (existsSync(builds) && head && !readFileSync(builds, 'utf8').includes(head)) {
      warn(`origin/main (${head}) is not recorded in docs/FINAL_BUILDS.md. Record the merged build.`);
    }
  }
  const board = runBoard(root);
  if (board.length) {
    warn(`Task board check failed (${board.length}). Fix before marking tasks done:`);
    board.slice(0, 8).forEach((p) => lines.push(`    ${p.msg}`));
  }
  lines.push('Rule: scan → fix → build → test → commit → push → PR → wait for "merge #N" → record build → next task. One final build before the next task.');
  return { lines, problems: lines.length > 2 };
}

function finishReport(root, { quick }) {
  const issues = [];
  const { branch, upstream, ahead, dirty } = branchState();
  if (dirty.length) issues.push(`${dirty.length} uncommitted file(s) in ${root}. Commit them (or say why not).`);
  if (branch && branch !== 'HEAD' && branch !== 'main') {
    if (!upstream) issues.push(`Branch ${branch} is not on GitHub. Push it: git push -u origin ${branch}`);
    else if (ahead > 0) issues.push(`Branch ${branch} has ${ahead} unpushed commit(s). Push them.`);
    const pr = ghJson(['pr', 'view', branch, '--json', 'number,url,state']);
    if (upstream && !pr) issues.push(`No PR for ${branch}. Open one (gh pr create --draft) and give the owner the link.`);
  }
  if (!quick) {
    const errors = runScan(root, defaultBase()).filter((f) => f.level === 'error');
    if (errors.length) issues.push(`agent-gate scan has ${errors.length} blocking finding(s). Run pnpm gate:scan.`);
  }
  return issues;
}

function printFindings(findings) {
  for (const f of findings) {
    const where = f.line ? `${f.path}:${f.line}` : f.path;
    console.log(`${f.level === 'error' ? 'ERROR' : 'warn '} [${f.rule}] ${where}: ${f.msg}${f.text ? `\n        ${f.text}` : ''}`);
  }
}

function main(argv) {
  const [cmd = 'start', ...rest] = argv;
  const flag = (n) => rest.includes(n);
  const opt = (n) => { const i = rest.indexOf(n); return i >= 0 ? rest[i + 1] : undefined; };
  const root = repoRoot();
  process.chdir(root);

  if (cmd === 'start') {
    const { lines } = startReport(root, { offline: flag('--offline') });
    console.log(lines.join('\n'));
    return 0;
  }
  if (cmd === 'scan' || cmd === 'board') {
    const findings = cmd === 'board' ? runBoard(root) : runScan(root, opt('--base') ?? defaultBase());
    printFindings(findings);
    const errors = findings.filter((f) => f.level === 'error').length;
    console.log(errors ? `\nagent-gate ${cmd}: ${errors} blocking problem(s). Do not push until fixed.` : `agent-gate ${cmd}: clean${findings.length ? ` (${findings.length} warning(s))` : ''}.`);
    return errors ? 1 : 0;
  }
  if (cmd === 'finish') {
    const hook = flag('--hook');
    const issues = finishReport(root, { quick: hook });
    if (hook) {
      if (issues.length) console.log(JSON.stringify({ systemMessage: `Agent gate: before the next task\n- ${issues.join('\n- ')}` }));
      return 0;
    }
    if (issues.length) { issues.forEach((i) => console.log(`- ${i}`)); return 1; }
    console.log('agent-gate finish: committed, pushed, PR open, scan clean.');
    return 0;
  }
  console.error(`unknown command: ${cmd} (start | scan | board | finish)`);
  return 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2));
}
