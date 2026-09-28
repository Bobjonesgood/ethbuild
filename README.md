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
* **Token-Efficient Output:** Successful build/test output is automatically truncated past 4,000 characters to keep AI token usage predictable on large projects. Failed runs are condensed to just the compiler errors and failing test names (`[FAIL: reason] testName()`), deduplicated, so the AI gets what it needs to fix the problem without a wall of trace output. If the output format isn't recognized, the raw output is returned with a larger 8,000-character cap.
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

---

## Available AI Tools

Once connected, your AI assistant will discover and invoke these tools. Both require `projectPath` -- the absolute path to the root of the smart contract project you want Ethbuild to act on (the folder containing `foundry.toml` or `hardhat.config.js`).

**`compile_contracts`** -- Triggers `forge build` or `npx hardhat compile` inside `projectPath` to check syntax validity.

```json
{ "framework": "foundry", "projectPath": "C:/Users/you/my-contracts" }
```

**`run_test_suite`** -- Runs local framework test files (`forge test` / `npx hardhat test`) inside `projectPath`, with an optional `matchTest` filter to isolate a specific test.

```json
{ "framework": "foundry", "projectPath": "C:/Users/you/my-contracts", "matchTest": "testTransfer" }
```

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

* **Free core (available now):** All local compilation, testing, safety features, and source code are free and open source for individual engineers.
* **Team dashboard (planned):** A hosted dashboard for teams to view shared build metrics. This does not exist yet. Until it launches, the telemetry settings above work with any https endpoint you run yourself.

---

## License

Distributed under the MIT License. Open-source development utility for the Web3 ecosystem.