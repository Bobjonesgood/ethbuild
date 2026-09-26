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
    description: "Executes the local smart contract test suite to catch runtime bugs and logic flaws.",
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
        projectPath: {
          type: "string",
          description: "Absolute path to the root of the smart contract project (the folder containing foundry.toml or hardhat.config.js)."
        }
      },
      required: ["framework", "projectPath"]
    }
  }
];