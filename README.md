\# 🚀 Ethbuild



\*\*Ethbuild\*\* is a high-reliability Model Context Protocol (MCP) server designed to give AI coding assistants (like Claude, Cursor, and Roo Code) direct terminal access to local smart contract frameworks. 



By acting as the AI's local compiler eyes, Ethbuild stops models from hallucinating compilation syntax errors. The AI can autonomously compile smart contracts, interpret output logs, run test suites, and patch logic bugs directly on your machine.



\---



\## ✨ Features



\*   ⚙️ \*\*Autonomous Smart Contract Compilation:\*\* Supports local framework verification via Hardhat and Foundry execution environments.

\*   🛡️ \*\*Bulletproof Execution Safety Engine:\*\* Hardened with a native 45-second watchdog execution cutoff timer to prevent system lockups or frozen IDE instances.

\*   🧠 \*\*Buffer-Overflow Resistance:\*\* Heavy-duty 10MB memory streaming buffer designed to process massive log outputs from complex multi-file smart contract test suites without chocking.

\*   🕵️‍♂️ \*\*Input Sanitization Shell-Defenses:\*\* Built-in regex filters to strip malicious or accidental command-chain injections before executing payloads on your terminal.



\---



\## 📥 Installation



Install Ethbuild globally on your system instantly using the Node Package Manager:



```bash

npm install -g ethbuild

```



\---



\## 🛠️ AI Client Configuration



To grant your AI coding agent access to Ethbuild, add this server execution block directly into your editor's MCP settings configuration file:



\### 🧩 For Claude Desktop / Cursor / Roo Code (`cline\_mcp\_settings.json`)



```json

{

&#x20; "mcpServers": {

&#x20;   "ethbuild": {

&#x20;     "command": "node",

&#x20;     "args": \[

&#x20;       "C:/ethbuild/dist/index.js"

&#x20;     ]

&#x20;   }

&#x20; }

}

```



\---



\## 📖 Available AI Tools



Once connected, your AI assistant will naturally discover and invoke these operational capabilities:



\*   `compile\_contracts`: Triggers `forge build` or `npx hardhat compile` inside your workspace directory to parse active syntax validity.

\*   `run\_test\_suite`: Runs local framework test files (`forge test` / `npx hardhat test`) with optional filters to isolate unique bugs.



\---



\## 💰 Monetization Structure



Ethbuild operates on an \*\*Open-Core Freemium Model\*\*:

\*   \*\*Free Core Tier:\*\* 100% of the local compilation, safety sandboxing, testing utility, and source capabilities are free and open-source forever for individual engineers.

\*   \*\*Premium Enterprise Tier:\*\* Teams can seamlessly append a shared `ETHBUILD\_TEAM\_KEY` to stream silent background webhook performance metric analytics straight to a central company dashboard.



\---



\## 📄 License



Distributed under the MIT License. Open-source development utility for the global Web3 ecosystem.



