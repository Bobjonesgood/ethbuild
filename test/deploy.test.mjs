import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deployContract } from '../dist/deploy.js';

// Port 1 is a valid port that nothing listens on. Inputs that pass validation
// reach the Anvil check and fail there, so these tests never launch forge and
// never need a running Anvil.
const NO_ANVIL_PORT = 1;

function params(overrides = {}) {
  return {
    projectPath: 'C:/not-used',
    contractName: 'SimpleStorage',
    port: NO_ANVIL_PORT,
    ...overrides
  };
}

async function expectError(overrides, fragment) {
  const result = await deployContract(params(overrides));
  assert.equal(result.isError, true);
  assert.ok(
    result.text.includes(fragment),
    `expected "${fragment}" in: ${result.text}`
  );
}

test('contractName must be a plain identifier', async () => {
  const bad = [undefined, null, 42, '', 'Simple;Storage', 'Simple Storage',
    '1Simple', '../Simple', 'Simple$(calc)', 'A'.repeat(101)];
  for (const contractName of bad) {
    await expectError({ contractName }, 'plain contract name');
  }
});

test('contractPath must be a relative .sol path inside the project', async () => {
  const bad = ['../secret.sol', 'src/../../x.sol', 'src\\..\\x.sol', '/etc/x.sol',
    'C:/x.sol', 'src/x.txt', '-flag.sol', 'src/x.sol; calc'];
  for (const contractPath of bad) {
    await expectError({ contractPath }, 'contractPath');
  }
  await expectError({ contractPath: 123 }, "'contractPath' must be a string");
});

test('a valid contractPath passes validation', async () => {
  await expectError({ contractPath: 'src/SimpleStorage.sol' }, 'No Anvil node responded');
  await expectError({ contractPath: 'src\\SimpleStorage.sol' }, 'No Anvil node responded');
});

test('port must be an integer from 1 to 65535', async () => {
  for (const port of [0, -1, 65536, 1.5, '8545', NaN]) {
    await expectError({ port }, "'port' must be an integer");
  }
});

test('constructorArgs must be a short array', async () => {
  await expectError({ constructorArgs: 'abc' }, "'constructorArgs' must be an array");
  await expectError({ constructorArgs: new Array(21).fill('1') }, "'constructorArgs' must be an array");
});

test('constructor arguments cannot be read as flags', async () => {
  for (const arg of ['-5', '--rpc-url', '--private-key', -5]) {
    await expectError({ constructorArgs: [arg] }, "may not start with '-'");
  }
});

test('constructor arguments reject bad types, line breaks and length', async () => {
  await expectError({ constructorArgs: [{}] }, 'string, number, or boolean');
  await expectError({ constructorArgs: [null] }, 'string, number, or boolean');
  await expectError({ constructorArgs: ['a\nb'] }, 'too long or contains line breaks');
  await expectError({ constructorArgs: ['a\0b'] }, 'too long or contains line breaks');
  await expectError({ constructorArgs: ['x'.repeat(501)] }, 'too long or contains line breaks');
});

test('valid constructor arguments pass validation', async () => {
  await expectError({ constructorArgs: ['42', 7, true, 'hello world'] }, 'No Anvil node responded');
});

test('no Anvil running gives a clear error and does not deploy', async () => {
  const result = await deployContract(params());
  assert.equal(result.isError, true);
  assert.ok(result.text.includes('No Anvil node responded on 127.0.0.1:1'));
  assert.ok(!result.text.includes('0xac0974'), 'the test key must never appear in output');
});