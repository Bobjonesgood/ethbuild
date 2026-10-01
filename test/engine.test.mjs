import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractFailureSummary } from '../dist/engine.js';

// Real output shape from the Desktop project (forge test).
const FORGE_TWO_FAILURES = [
  'Ran 3 tests for test/SimpleStorage.t.sol:SimpleStorageTest',
  '[FAIL: assertion failed: 42 != 99] testDeliberateAssertFailure() (gas: 56593)',
  '[FAIL: deliberate revert for parser testing] testDeliberateRevert() (gas: 514)',
  '[PASS] testSetAndGet() (gas: 53535)',
  'Suite result: FAILED. 1 passed; 2 failed; 0 skipped; finished in 7.00ms',
  '',
  'Failing tests:',
  'Encountered 2 failing tests in test/SimpleStorage.t.sol:SimpleStorageTest',
  '[FAIL: assertion failed: 42 != 99] testDeliberateAssertFailure() (gas: 56593)',
  '[FAIL: deliberate revert for parser testing] testDeliberateRevert() (gas: 514)'
].join('\n');

test('real forge output: failures are listed once each', () => {
  const out = extractFailureSummary(FORGE_TWO_FAILURES);
  assert.ok(out.includes('Failing tests (2):'));
  assert.equal(out.split('testDeliberateAssertFailure()').length - 1, 1);
  assert.equal(out.split('testDeliberateRevert()').length - 1, 1);
  assert.ok(!out.includes('testSetAndGet'), 'passing tests must not appear');
  assert.ok(!out.includes('Suite result'));
  assert.ok(out.includes('[Condensed failure summary. Full output was'));
});

test('CRLF line endings are handled', () => {
  const out = extractFailureSummary(FORGE_TWO_FAILURES.replace(/\n/g, '\r\n'));
  assert.ok(out.includes('Failing tests (2):'));
});

test('compiler errors are extracted with their location lines', () => {
  const text = [
    'Compiling 1 files with Solc 0.8.37',
    'Error (7576): Undeclared identifier.',
    '  --> src/Foo.sol:10:9:',
    '   |',
    '10 |         x = 1;',
    '   |         ^',
    '',
    'Warning (2018): something unrelated'
  ].join('\n');
  const out = extractFailureSummary(text);
  assert.ok(out.includes('Compiler errors (1):'));
  assert.ok(out.includes('Error (7576): Undeclared identifier.'));
  assert.ok(out.includes('src/Foo.sol:10:9'));
  assert.ok(!out.includes('Warning (2018)'));
  assert.ok(!out.includes('Failing tests'));
});

test('compiler errors and failing tests can appear together', () => {
  const text = [
    'Error: something broke',
    '',
    '[FAIL: boom] testX() (gas: 1)'
  ].join('\n');
  const out = extractFailureSummary(text);
  assert.ok(out.includes('Compiler errors (1):'));
  assert.ok(out.includes('Failing tests (1):'));
});

test('more than 10 failures are capped with a count of the rest', () => {
  const lines = [];
  for (let i = 1; i <= 15; i++) {
    lines.push(`[FAIL: reason ${i}] testNumber${i}() (gas: ${i})`);
  }
  const out = extractFailureSummary(lines.join('\n'));
  assert.ok(out.includes('Failing tests (15):'));
  assert.ok(out.includes('testNumber10()'));
  assert.ok(!out.includes('testNumber11()'));
  assert.ok(out.includes('and 5 more failing tests not shown'));
});

test('more than 10 compiler errors are capped with a count of the rest', () => {
  const blocks = [];
  for (let i = 1; i <= 12; i++) {
    blocks.push(`Error (${1000 + i}): problem ${i}`, '', '');
  }
  const out = extractFailureSummary(blocks.join('\n'));
  assert.ok(out.includes('Compiler errors (12):'));
  assert.ok(out.includes('and 2 more compiler errors not shown'));
});

test('output with nothing recognizable returns null', () => {
  assert.equal(extractFailureSummary(''), null);
  assert.equal(extractFailureSummary('Compiler run successful!'), null);
  assert.equal(extractFailureSummary('Some random stderr from a crash'), null);
});

test('a FAIL marker must start the line to count', () => {
  assert.equal(extractFailureSummary('note: [FAIL: not a real failure] foo()'), null);
});
test('two compiler errors separated by a single blank line are both found', () => {
  const text = 'Error (1): first\n  --> a.sol:1:1:\n\nError (2): second\n  --> b.sol:2:2:\n';
  const out = extractFailureSummary(text);
  assert.ok(out.includes('Compiler errors (2):'));
  assert.ok(out.includes('Error (1): first'));
  assert.ok(out.includes('Error (2): second'));
});