import { execFile } from 'child_process';
import { request } from 'http';

export interface DeployResult {
  text: string;
  isError: boolean;
}

export interface DeployParams {
  projectPath: string;
  contractName: unknown;
  contractPath?: unknown;
  constructorArgs?: unknown;
  port?: unknown;
}

// SAFETY: the host is fixed. There is deliberately no way to pass an RPC URL.
const ANVIL_HOST = '127.0.0.1';
const DEFAULT_PORT = 8545;

// Anvil's default chain ID. Anything else (a fork, a real network) is refused.
const ANVIL_CHAIN_ID = 31337;

// Anvil's well-known account #0 test key. It is public and only ever holds
// fake ETH on a local chain. It is held here so the AI never has to pass a
// private key through tool arguments.
const ANVIL_DEFAULT_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';

const DEPLOY_TIMEOUT_MS = 60000;
const MAX_ERROR_CHARS = 4000;
const MAX_CONSTRUCTOR_ARGS = 20;
const MAX_ARG_LENGTH = 500;

function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) {
    return text;
  }
  return text.slice(0, maxChars) + `\n[... ${text.length - maxChars} characters truncated ...]`;
}

function fail(text: string): DeployResult {
  return { text, isError: true };
}

/**
 * Asks the node on 127.0.0.1:<port> for its chain ID.
 * Returns null if it is a local Anvil chain, or an error message if not.
 */
function checkAnvil(port: number): Promise<string | null> {
  const notRunning =
    `No Anvil node responded on ${ANVIL_HOST}:${port}. Start one with 'anvil' in a terminal, then try again.`;

  return new Promise((resolve) => {
    const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] });

    const req = request(
      {
        host: ANVIL_HOST,
        port,
        method: 'POST',
        path: '/',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body)
        },
        timeout: 3000
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            const chainId = parseInt(String(parsed.result), 16);
            if (chainId === ANVIL_CHAIN_ID) {
              resolve(null);
            } else {
              resolve(
                `Refusing to deploy: the node on port ${port} reports chain ID ${chainId}, not ${ANVIL_CHAIN_ID} (Anvil's default). deploy_contract only deploys to a plain local Anvil chain.`
              );
            }
          } catch (e) {
            resolve(`The service on ${ANVIL_HOST}:${port} did not answer like an Ethereum node. Start Anvil with 'anvil' and try again.`);
          }
        });
      }
    );

    req.on('timeout', () => {
      req.destroy();
      resolve(notRunning);
    });
    req.on('error', () => resolve(notRunning));
    req.write(body);
    req.end();
  });
}

interface ForgeRun {
  stdout: string;
  stderr: string;
  failed: boolean;
  timedOut: boolean;
}

// execFile runs forge directly with no shell, so nothing in an argument can
// be interpreted as a shell command.
function runForge(args: string[], cwd: string): Promise<ForgeRun> {
  return new Promise((resolve) => {
    execFile(
      'forge',
      args,
      {
        cwd,
        timeout: DEPLOY_TIMEOUT_MS,
        maxBuffer: 1024 * 1024 * 10,
        windowsHide: true
      },
      (error, stdout, stderr) => {
        resolve({
          stdout: (stdout || '').trim(),
          stderr: (stderr || '').trim(),
          failed: !!error,
          timedOut: !!(error && (error as any).killed)
        });
      }
    );
  });
}

function parseDeployJson(text: string): { deployer?: string; deployedTo?: string; transactionHash?: string } | null {
  // Newer Forge prints pretty-formatted multi-line JSON, so try the whole
  // output first, then the span from the first { to the last }.
  const candidates: string[] = [text];
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end > start) {
    candidates.push(text.slice(start, end + 1));
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed.deployedTo === 'string') {
        return parsed;
      }
    } catch (e) {
      // not valid JSON, try the next candidate
    }
  }

  // Fallback: older Forge printed one JSON object per line.
  const lines = text.split(/\r?\n/);
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (line.startsWith('{') && line.endsWith('}')) {
      try {
        const parsed = JSON.parse(line);
        if (parsed && typeof parsed.deployedTo === 'string') {
          return parsed;
        }
      } catch (e) {
        // keep looking
      }
    }
  }
  return null;
}

/**
 * Deploys a Foundry contract to a local Anvil node. Foundry only, localhost
 * only, using Anvil's public default test key.
 */
export async function deployContract(params: DeployParams): Promise<DeployResult> {
  // --- Validate every input before running anything ---

  const { contractName, contractPath, constructorArgs, port } = params;

  if (typeof contractName !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]{0,99}$/.test(contractName)) {
    return fail("Ethbuild Error: 'contractName' is required and must be a plain contract name such as 'SimpleStorage'.");
  }

  let target = contractName;
  if (contractPath !== undefined && contractPath !== null && contractPath !== '') {
    if (typeof contractPath !== 'string') {
      return fail("Ethbuild Error: 'contractPath' must be a string such as 'src/SimpleStorage.sol'.");
    }
    const normalized = contractPath.replace(/\\/g, '/');
    if (
      !/^[A-Za-z0-9_][A-Za-z0-9_\-./]*\.sol$/.test(normalized) ||
      normalized.includes('..')
    ) {
      return fail("Ethbuild Error: 'contractPath' must be a relative path inside the project ending in .sol, such as 'src/SimpleStorage.sol'.");
    }
    target = `${normalized}:${contractName}`;
  }

  let portNumber = DEFAULT_PORT;
  if (port !== undefined && port !== null) {
    if (typeof port !== 'number' || !Number.isInteger(port) || port < 1 || port > 65535) {
      return fail("Ethbuild Error: 'port' must be an integer between 1 and 65535.");
    }
    portNumber = port;
  }

  const ctorArgs: string[] = [];
  if (constructorArgs !== undefined && constructorArgs !== null) {
    if (!Array.isArray(constructorArgs) || constructorArgs.length > MAX_CONSTRUCTOR_ARGS) {
      return fail(`Ethbuild Error: 'constructorArgs' must be an array of at most ${MAX_CONSTRUCTOR_ARGS} values.`);
    }
    for (const item of constructorArgs) {
      if (typeof item !== 'string' && typeof item !== 'number' && typeof item !== 'boolean') {
        return fail("Ethbuild Error: each constructor argument must be a string, number, or boolean.");
      }
      const value = String(item);
      if (value.length > MAX_ARG_LENGTH || /[\r\n\0]/.test(value)) {
        return fail("Ethbuild Error: a constructor argument is too long or contains line breaks.");
      }
      if (value.startsWith('-')) {
        return fail("Ethbuild Error: constructor arguments may not start with '-', to prevent them being read as command flags.");
      }
      ctorArgs.push(value);
    }
  }

  // --- Confirm a local Anvil chain is actually there ---

  const anvilProblem = await checkAnvil(portNumber);
  if (anvilProblem) {
    return fail(`Ethbuild Error: ${anvilProblem}`);
  }

  // --- Build and run the command ---

  const rpcUrl = `http://${ANVIL_HOST}:${portNumber}`;
  const baseArgs = ['create', target, '--rpc-url', rpcUrl, '--private-key', ANVIL_DEFAULT_KEY];
  // --constructor-args takes a list, so it must come last.
  const tailArgs = ctorArgs.length > 0 ? ['--constructor-args', ...ctorArgs] : [];

  // Newer Foundry needs --broadcast to actually send the transaction; older
  // versions reject it. Try with it, then retry without if it is not known.
  let run = await runForge([...baseArgs, '--broadcast', '--json', ...tailArgs], params.projectPath);
  const combinedFirst = `${run.stdout}\n${run.stderr}`;
  if (run.failed && /--broadcast/.test(combinedFirst) && /(unexpected argument|unrecognized|unknown)/i.test(combinedFirst)) {
    run = await runForge([...baseArgs, '--json', ...tailArgs], params.projectPath);
  }

  if (run.timedOut) {
    return fail(`Ethbuild Error: deploy did not finish within ${DEPLOY_TIMEOUT_MS / 1000}s and was stopped.`);
  }

  if (run.failed) {
    const detail = run.stderr || run.stdout || 'forge create failed with no output.';
    return fail(`Deploy failed:\n${truncate(detail, MAX_ERROR_CHARS)}`);
  }

  const parsed = parseDeployJson(run.stdout);
  if (parsed && parsed.deployedTo) {
    const lines = [
      `Deployed ${contractName} to local Anvil (${rpcUrl}).`,
      `Address: ${parsed.deployedTo}`
    ];
    if (parsed.transactionHash) {
      lines.push(`Transaction: ${parsed.transactionHash}`);
    }
    if (parsed.deployer) {
      lines.push(`Deployer: ${parsed.deployer}`);
    }
    return { text: lines.join('\n'), isError: false };
  }

  // forge finished without an error but the output was not the JSON we expected.
  return {
    text: `Deploy command finished, but the result could not be parsed. Raw output:\n${truncate(run.stdout || run.stderr, MAX_ERROR_CHARS)}`,
    isError: false
  };
}