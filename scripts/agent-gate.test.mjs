import assert from 'node:assert/strict';
import test from 'node:test';
import { checkBoard, checkCommitMessages, parsePhaseFile, parseUnifiedDiff, scanAddedLines } from './agent-gate.mjs';

const added = (...lines) => lines.map((line, i) => ({ line, number: i + 1 }));
const rules = (path, ...lines) => scanAddedLines(path, added(...lines)).map((f) => f.rule);

test('flags synthetic ffmpeg media in production code but not in tests or docs', () => {
  assert.deepEqual(rules('apps/daemon/src/creator/dub.ts', "args.push('-f', 'lavfi', '-i', 'anullsrc=r=48000')"), ['fake-media']);
  assert.deepEqual(rules('services/dub-engine/vishnu_dub/tts.py', 'cmd = ["ffmpeg", "-i", "testsrc=size=640x360"]'), ['fake-media']);
  assert.deepEqual(rules('apps/daemon/test/unit/dub.test.ts', "expect(args).not.toContain('anullsrc')"), []);
  assert.deepEqual(rules('docs/AGENT_RULES.md', 'Never use anullsrc'), []);
});

test('flags placeholder results in production code', () => {
  assert.deepEqual(rules('apps/daemon/src/api/routes.ts', 'return fakeTranscript;'), ['fake-result']);
  assert.deepEqual(rules('apps/daemon/src/api/routes.ts', 'return transcript;'), []);
});

test('flags sleep and timers in benchmark paths only', () => {
  assert.deepEqual(rules('apps/daemon/src/benchmark/run.ts', 'await new Promise((r) => setTimeout(r, 100));'), ['fake-perf']);
  assert.deepEqual(rules('services/dub-engine/vishnu_dub/benchmark.py', 'time.sleep(0.1)'), ['fake-perf']);
  assert.deepEqual(rules('apps/daemon/src/queue.ts', 'setTimeout(retry, 100);'), []);
});

test('flags skipped and focused tests', () => {
  assert.deepEqual(rules('apps/web/src/a.test.tsx', "it.skip('renders', () => {})"), ['skipped-test']);
  assert.deepEqual(rules('apps/web/src/a.test.tsx', "describe.only('suite', () => {})"), ['skipped-test']);
  assert.deepEqual(rules('services/dub-engine/vishnu_dub/tests/test_api.py', '@pytest.mark.skip(reason="flaky")'), ['skipped-test']);
  assert.deepEqual(rules('services/dub-engine/vishnu_dub/tests/test_api.py', '@pytest.mark.skipif(not HAS_GPU, reason="needs GPU")'), []);
  assert.deepEqual(rules('apps/web/src/a.test.tsx', "it('renders', () => {})"), []);
});

test('flags a window.history mock in the web test setup', () => {
  assert.deepEqual(rules('apps/web/src/test/setup.ts', "Object.defineProperty(window, 'history', { value: {} }); window.history"), ['history-mock']);
});

test('flags secrets everywhere, including docs', () => {
  assert.deepEqual(rules('docs/guides/x.md', 'key: sk-proj-abcdefghijklmnopqrstuvwxyz123456'), ['secret']);
  assert.deepEqual(rules('apps/daemon/src/x.ts', 'const k = "AKIAABCDEFGHIJKLMNOP";'), ['secret']);
  assert.deepEqual(rules('apps/daemon/src/x.ts', 'const k = process.env.OPENAI_API_KEY;'), []);
});

test('flags code that points into the reference folder', () => {
  assert.deepEqual(rules('scripts/dub-engine.mjs', "const dir = 'reference/ZastTranslate';"), ['reference-path']);
  assert.deepEqual(rules('apps/daemon/src/x.ts', "path.join(root, 'File clone Resource')"), ['reference-path']);
  assert.deepEqual(rules('AGENTS.md', 'Never run anything in `reference/ZastTranslate`'), []);
});

test('the allow marker suppresses a reviewed line', () => {
  assert.deepEqual(rules('apps/daemon/src/x.ts', "if (args.includes('anullsrc')) throw new Error('refused'); // agent-gate: allow (guard)"), []);
});

test('parses added lines and their numbers from a unified diff', () => {
  const diff = ['diff --git a/a.ts b/a.ts', '--- a/a.ts', '+++ b/a.ts', '@@ -1,0 +5,2 @@', '+one', '+two', '--- a/b.ts', '+++ /dev/null', '@@ -1 +0,0 @@', '-gone'].join('\n');
  const files = parseUnifiedDiff(diff);
  assert.deepEqual(files.get('a.ts'), [{ line: 'one', number: 5 }, { line: 'two', number: 6 }]);
  assert.equal(files.has('b.ts'), false);
});

test('flags Chinese commit messages', () => {
  const found = checkCommitMessages([{ sha: 'a'.repeat(40), message: 'fix: 修复字幕' }, { sha: 'b'.repeat(40), message: 'fix: subtitles' }]);
  assert.equal(found.length, 1);
  assert.equal(found[0].rule, 'commit-language');
});

const phase = [
  '| ID | Task | Status | Evidence |',
  '|---|---|---|---|',
  '| T1.1 | A | done | `pnpm test` → 10/10 passed |',
  '| T1.2 | B | doing | |',
  '| T1.3 | C | todo | |',
].join('\n');

test('parses phase task rows and statuses', () => {
  assert.deepEqual(parsePhaseFile(phase).map((t) => [t.id, t.status]), [['T1.1', 'done'], ['T1.2', 'doing'], ['T1.3', 'todo']]);
});

test('board check passes when counts match and fails when they drift', () => {
  const row = (counts) => `| 1 | [Phase one](phase-1.md) | ${counts} | Phase 0 | — | In progress |`;
  assert.deepEqual(checkBoard(row('3 | 1 | 1 | 0 | 1'), () => phase), []);
  const drift = checkBoard(row('3 | 2 | 0 | 0 | 1'), () => phase);
  assert.equal(drift.length, 1);
  assert.match(drift[0].msg, /3\/2\/0\/0\/1.*3\/1\/1\/0\/1/);
});

test('board check rejects done without evidence and free-form statuses', () => {
  const bad = phase.replace('| T1.1 | A | done | `pnpm test` → 10/10 passed |', '| T1.1 | A | done | |').replace('| T1.3 | C | todo |', '| T1.3 | C | research done; adapters todo |');
  const msgs = checkBoard('| 1 | [P](phase-1.md) | 3 | 1 | 1 | 0 | 0 |', () => bad).map((p) => p.msg).join('\n');
  assert.match(msgs, /T1\.1: marked done with no evidence/);
  assert.match(msgs, /T1\.3: status "research done; adapters todo"/);
});
