export const TOOLS = [
  {
    name: "compile_contracts",
    description: "Compiles the local Web3 project using Hardhat or Foundry to check for syntax errors. Use this after code changes.",
    inputSchema: {
      type: "object",
      properties: {
        framework: {
          type: "string",
          enum: ["hardhat", "foundry"],
          description: "The smart contract framework used by the project."
        },
        projectPath: {
          type: "string",
          description: "Absolute path to the root of the smart contract project (the folder containing foundry.toml or hardhat.config.js)."
        }
      },
      required: ["framework", "projectPath"]
    }
  },
  {
    name: "run_test_suite",
    description: "Executes the local smart contract test suite to catch runtime bugs and logic flaws. By default, failures are condensed to the failing test names and reasons to save tokens. Set verbose to true only when you need the full output, such as Foundry call traces, to debug why a test failed.",
    inputSchema: {
      type: "object",
      properties: {
        framework: {
          type: "string",
          enum: ["hardhat", "foundry"],
          description: "The framework being used to run tests."
        },
        matchTest: {
          type: "string",
          description: "Optional: Filter to run a specific test name or function."
        },
        verbose: {
          type: "boolean",
          description: "Optional, defaults to false. When true, returns the full test output instead of a condensed summary. For Foundry this also enables call traces for failing tests (-vvv). Output is still capped at a large safety limit."
        },
        projectPath: {
          type: "string",
          description: "Absolute path to the root of the smart contract project (the folder containing foundry.toml or hardhat.config.js)."
        }
      },
      required: ["framework", "projectPath"]
    }
  },
  {
    name: "deploy_contract",
    description: "Deploys a compiled Foundry contract to a LOCAL Anvil test chain only (127.0.0.1). It cannot deploy to any other network, and it uses Anvil's built-in test account, so no private key is needed or accepted. Anvil must already be running (start it with 'anvil' in a terminal). Foundry projects only.",
    inputSchema: {
      type: "object",
      properties: {
        projectPath: {
          type: "string",
          description: "Absolute path to the root of the Foundry project (the folder containing foundry.toml)."
        },
        contractName: {
          type: "string",
          description: "The name of the contract to deploy, for example 'SimpleStorage'."
        },
        contractPath: {
          type: "string",
          description: "Optional: path to the .sol file relative to the project root, for example 'src/SimpleStorage.sol'. Use this if the contract name alone is ambiguous."
        },
        constructorArgs: {
          type: "array",
          items: { type: "string" },
          description: "Optional: constructor arguments, in order, each as a string. Values may not start with '-'."
        },
        port: {
          type: "integer",
          description: "Optional, defaults to 8545. The port the local Anvil node is listening on."
        }
      },
      required: ["projectPath", "contractName"]
    }
  }
];