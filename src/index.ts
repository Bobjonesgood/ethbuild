import { existsSync } from "fs";
import { join } from "path";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { TOOLS } from "./schema.js";
import { safeExecuteCommand } from "./engine.js";
import { deployContract } from "./deploy.js";
import { logBuildTelemetry } from "./telemetry.js";

// Initialize the Ethbuild Core Server
const server = new Server(
  {
    name: "ethbuild",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

function errorResult(text: string) {
  return {
    content: [{ type: "text", text }],
    isError: true
  };
}

// Only the two supported frameworks are accepted. Missing means foundry,
// as before. Anything else is rejected instead of silently using Hardhat.
function parseFramework(value: unknown): 'hardhat' | 'foundry' | null {
  if (value === undefined || value === null || value === '') {
    return 'foundry';
  }
  if (value === 'foundry' || value === 'hardhat') {
    return value;
  }
  return null;
}

// matchTest is passed to forge as a single argument (no shell), so the risk
// is it being read as a flag. Reject anything that starts with '-', contains
// control characters, or is unreasonably long. Returns an error or null.
function checkMatchTest(value: unknown): string | null {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  if (typeof value !== 'string') {
    return "Ethbuild Error: 'matchTest' must be a string.";
  }
  if (value.length > 200) {
    return "Ethbuild Error: 'matchTest' is too long (200 characters maximum).";
  }
  if (/[\x00-\x1f\x7f]/.test(value)) {
    return "Ethbuild Error: 'matchTest' may not contain control characters or line breaks.";
  }
  if (value.startsWith('-')) {
    return "Ethbuild Error: 'matchTest' may not start with '-', so it cannot be read as a command flag.";
  }
  return null;
}

// 1. Expose our schemas so AI editors know what tools are available
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: TOOLS };
});

// 2. Process active execution requests sent from the AI client
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  // Accept the correct camelCase name, or the common snake_case slip,
  // so a small naming mistake from the AI client still works.
  const rawProjectPath = (args?.projectPath ?? args?.project_path) as string | undefined;

  try {
    // Every tool below needs a real project path. Fail loudly and clearly
    // instead of silently falling back to this server's own folder, which
    // would compile or test the wrong project without any warning.
    if (!rawProjectPath || rawProjectPath.trim() === '') {
      return errorResult("Ethbuild Error: Missing required argument 'projectPath'. Pass the absolute path to the project's root folder (the one containing foundry.toml or hardhat.config.js).");
    }

    const workingDirectory = rawProjectPath;

    if (name === "compile_contracts") {
      const framework = parseFramework(args?.framework);
      if (!framework) {
        return errorResult("Ethbuild Error: 'framework' must be either 'foundry' or 'hardhat'.");
      }

      const commandBase = framework === 'foundry' ? 'forge' : 'npx';
      const commandArgs = framework === 'foundry' ? ['build'] : ['hardhat', 'compile'];

      const result = await safeExecuteCommand(commandBase, commandArgs, workingDirectory);

      // Silently log metrics in the background for team keys
      logBuildTelemetry(framework, 'compile', !result.isError);

      return {
        content: [{ type: "text", text: `Compiler Output:\n${result.stdout}\n${result.stderr}` }],
        isError: result.isError
      };
    }

    if (name === "run_test_suite") {
      const framework = parseFramework(args?.framework);
      if (!framework) {
        return errorResult("Ethbuild Error: 'framework' must be either 'foundry' or 'hardhat'.");
      }

      const matchTestProblem = checkMatchTest(args?.matchTest);
      if (matchTestProblem) {
        return errorResult(matchTestProblem);
      }
      const matchTest = args?.matchTest as string | undefined;

      // Only a literal true turns verbose on. Anything else stays condensed.
      const verbose = args?.verbose === true;

      const commandBase = framework === 'foundry' ? 'forge' : 'npx';
      let commandArgs = framework === 'foundry' ? ['test'] : ['hardhat', 'test'];

      // Apply specific test function filter if passed by the AI
      if (matchTest && framework === 'foundry') {
        commandArgs.push('--match-test', matchTest);
      }

      // Forge only prints call traces for failing tests at -vvv.
      if (verbose && framework === 'foundry') {
        commandArgs.push('-vvv');
      }

      const result = await safeExecuteCommand(
        commandBase,
        commandArgs,
        workingDirectory,
        45000,
        verbose
      );

      // Silently log metrics in the background for team keys
      logBuildTelemetry(framework, 'test', !result.isError);

      return {
        content: [{ type: "text", text: `Test Suite Output:\n${result.stdout}\n${result.stderr}` }],
        isError: result.isError
      };
    }

    if (name === "deploy_contract") {
      // Foundry only for now. Fail clearly if this is not a Foundry project.
      if (!existsSync(join(workingDirectory, 'foundry.toml'))) {
        return errorResult("Ethbuild Error: deploy_contract currently supports Foundry projects only, and no foundry.toml was found in projectPath.");
      }

      const result = await deployContract({
        projectPath: workingDirectory,
        contractName: args?.contractName,
        contractPath: args?.contractPath,
        constructorArgs: args?.constructorArgs,
        port: args?.port
      });

      return {
        content: [{ type: "text", text: result.text }],
        isError: result.isError
      };
    }

    throw new Error(`Tool requested [${name}] was not found inside Ethbuild.`);
  } catch (error: any) {
    return errorResult(`Ethbuild Internal Exception: ${error.message}`);
  }
});

// Connect the server to standard input/output channels
const transport = new StdioServerTransport();
await server.connect(transport);