# Ethbuild

**Ethbuild** is a high-reliability Model Context Protocol (MCP) server designed to give AI coding assistants (like Claude, Cursor, and Cline) direct terminal access to local smart contract frameworks.

By acting as the AI's local compiler eyes, Ethbuild stops models from hallucinating compilation syntax errors. The AI can autonomously compile smart contracts, interpret output logs, run test suites, and patch logic bugs directly on your machine.

---

## Features

* **Autonomous Smart Contract Compilation:** Supports local framework verification via Hardhat and Foundry execution environments.
* **Bulletproof Execution Safety Engine:** Hardened with a native 45-second watchdog execution cutoff timer to prevent system lockups or frozen IDE instances.
* **Buffer-Overflow Resistance:** Heavy-duty 10MB memory streaming buffer designed to process massive log outputs from complex multi-file smart contract test suites without choking.
* **Input Sanitization Shell-Defenses:** Built-in regex filters to strip malicious or accidental command-chain injections before executing payloads on your terminal.
* **Explicit Project Targeting:** Every tool call takes a `projectPath` argument, so Ethbuild always compiles the project you actually mean -- not wherever the server process happened to start.
* **Token-Efficient Output:** Successful build/test output is automatically truncated past 4,000 characters to keep AI token usage predictable on large projects. Failed runs are condensed to just the compiler errors and failing test names (`[FAIL: reason] testName()`), deduplicated, so the AI gets what it needs to fix the problem without a wall of trace output. If the output format isn't recognized, the raw output is returned with a larger 8,000-character cap. When the AI needs the full picture, `run_test_suite` accepts `verbose: true` to return complete output, including Foundry call traces, up to a 30,000-character safety cap.
* **Safe Local Deployment:** `deploy_contract` lets the AI deploy a Foundry contract to a local Anvil test chain so it can go from compile to test to deploy in one session. It is locked to `127.0.0.1`, accepts no RPC URL and no private key, and cannot reach a real network. See the `deploy_contract` section below.
* **Private by Default:** No telemetry is sent unless you explicitly configure it. See the Configuration section.

---

## Installation

Ethbuild isn't published to the npm registry yet -- install it by cloning and building locally:

```bash
git clone https://github.com/Bobjonesgood/ethbuild.git
cd ethbuild
npm install
npm run build
```

This produces `dist/index.js`, which is the compiled entry point your AI client will launch.

---

## AI Client Configuration

To grant your AI coding agent access to Ethbuild, add this server execution block to your editor's MCP settings file.

**For Claude Desktop:** `claude_desktop_config.json`
**For Cline (in VS Code):** `cline_mcp_settings.json`

```json
{
  "mcpServers": {
    "ethbuild": {
      "command": "node",
      "args": [
        "C:/ethbuild/dist/index.js"
      ]
    }
  }
}
```

> **Note:** Cline's MCP settings file has moved locations across versions. If your server shows as connected but tools aren't behaving as expected, confirm you're editing the file Cline is actually reading -- check `%USERPROFILE%\.cline\data\settings\cline_mcp_settings.json` first.

---

## Framework Requirements

Ethbuild doesn't bundle Foundry or Hardhat itself -- it runs whatever toolchain is already set up in your target project.

* **Foundry:** requires `forge` installed and available on your system PATH ([getfoundry.sh](https://getfoundry.sh)), plus a `foundry.toml` in the project root.
* **Hardhat:** requires `hardhat` installed as a project dependency (`npm install --save-dev hardhat`) and a `hardhat.config.js`/`.ts` in the project root. On a fresh project, the first compile may take a few extra seconds while Hardhat downloads the matching `solc` compiler version -- this is normal.
* **Anvil (only for `deploy_contract`):** Anvil ships with Foundry, so if `forge` is installed you already have it. Check with `anvil --version`.

---

## Available AI Tools

Once connected, your AI assistant will discover and invoke these tools. All three require `projectPath` -- the absolute path to the root of the smart contract project you want Ethbuild to act on (the folder containing `foundry.toml` or `hardhat.config.js`).

**`compile_contracts`** -- Triggers `forge build` or `npx hardhat compile` inside `projectPath` to check syntax validity.

```json
{ "framework": "foundry", "projectPath": "C:/Users/you/my-contracts" }
```

**`run_test_suite`** -- Runs local framework test files (`forge test` / `npx hardhat test`) inside `projectPath`, with an optional `matchTest` filter to isolate a specific test and an optional `verbose` flag.

```json
{ "framework": "foundry", "projectPath": "C:/Users/you/my-contracts", "matchTest": "testTransfer" }
```

By default, failing runs are condensed to the failing test names and reasons. Set `verbose` to `true` when you need the full output to debug a failure:

```json
{ "framework": "foundry", "projectPath": "C:/Users/you/my-contracts", "verbose": true }
```

With Foundry, `verbose` also runs `forge test -vvv`, so failing tests include their call traces and backtraces. With Hardhat, it skips the condensing and returns the full output. In both cases output is capped at 30,000 characters so a huge trace cannot flood the AI's context. `verbose` must be the boolean `true`, not the string `"true"`.

**`deploy_contract`** -- Deploys a compiled Foundry contract to a local Anvil test chain using `forge create`. Foundry projects only.

```json
{ "projectPath": "C:/Users/you/my-contracts", "contractName": "SimpleStorage" }
```

On success it returns the contract address, the transaction hash, and the deployer address:

```
Deployed SimpleStorage to local Anvil (http://127.0.0.1:8545).
Address: 0x...
Transaction: 0x...
Deployer: 0xf39F...
```

Optional arguments:

* `contractPath` -- path to the `.sol` file relative to the project root, such as `src/SimpleStorage.sol`. Use it if the contract name alone is ambiguous.
* `constructorArgs` -- an array of constructor arguments, in order, each given as a string.
* `port` -- the port Anvil is listening on. Defaults to 8545.

```json
{
  "projectPath": "C:/Users/you/my-contracts",
  "contractName": "Token",
  "contractPath": "src/Token.sol",
  "constructorArgs": ["MyToken", "MTK", "1000000"],
  "port": 8545
}
```

**Before you use it:** start Anvil in a separate terminal by running `anvil`, and leave it running. Ethbuild does not start it for you. If no node answers, `deploy_contract` returns a clear error telling you to start one.

**Safety rules.** Because this is the one tool that sends transactions, it is deliberately narrow:

* **Localhost only.** The host is fixed at `127.0.0.1`. There is no argument for an RPC URL, so the AI cannot point the tool at a public network.
* **Chain ID check.** Before deploying, Ethbuild asks the node for its chain ID and refuses unless it is 31337, Anvil's default. A node reporting any other chain ID is rejected, which typically includes forks of real networks.
* **No private keys.** The tool accepts no key. It uses Anvil's well-known public test account, which only holds fake ETH on a local chain, and that key is never included in the tool's output or accepted as an argument, so it never appears in your chat history.
* **No shell.** `forge` is launched directly rather than through a shell, so nothing in an argument can be interpreted as a command.
* **Strict input validation.** The contract name, contract path, constructor arguments, and port are checked before anything runs. Constructor arguments may not start with `-`, so they cannot be read as command-line flags. This also means negative numbers cannot be passed as constructor arguments for now.
* **No telemetry.** Deploys are not included in team telemetry.

---

## Configuration (Optional)

Ethbuild works with no configuration. Two optional environment variables enable team telemetry:

* `ETHBUILD_TEAM_KEY` -- your team's access token.
* `ETHBUILD_TELEMETRY_URL` -- the https endpoint that should receive the metrics.

Telemetry stays off unless **both** are set, and there is no default endpoint, so nothing is ever sent to a server you did not choose. Non-https URLs are ignored.

Ethbuild does not read `.env` files. Set the variables in the `env` block of your MCP server config:

```json
{
  "mcpServers": {
    "ethbuild": {
      "command": "node",
      "args": [
        "C:/ethbuild/dist/index.js"
      ],
      "env": {
        "ETHBUILD_TEAM_KEY": "your-team-key-here",
        "ETHBUILD_TELEMETRY_URL": "https://your-dashboard.example.com/ingest"
      }
    }
  }
}
```

A template of these variables is included as `.env.example`.

**What telemetry sends:** a timestamp, the framework (foundry or hardhat), whether the run was a compile or a test, whether it succeeded or failed, and the operating system. It never sends your code, file paths, or command output.

---

## Roadmap and Business Model

Ethbuild follows an open-core model:

* **Free core (available now):** All local compilation, testing, local deployment, safety features, and source code are free and open source for individual engineers.
* **Hardhat deployments (planned):** `deploy_contract` currently supports Foundry projects only.
* **Team dashboard (planned):** A hosted dashboard for teams to view shared build metrics. This does not exist yet. Until it launches, the telemetry settings above work with any https endpoint you run yourself.

---

## License

Distributed under the MIT License. Open-source development utility for the Web3 ecosystem.