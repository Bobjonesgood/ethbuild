import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { TOOLS } from "./schema.js";
import { safeExecuteCommand } from "./engine.js";
import { logBuildTelemetry } from "./telemetry.js";

// Initialize the Ethbuild Core Server
const server = new Server(
  {
    name: "ethbuild",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// 1. Expose our schemas so AI editors know what tools are available
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: TOOLS };
});

// 2. Process active execution requests sent from the AI client
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const workingDirectory = (args?.projectPath as string) || process.cwd(); // Uses the project path passed by the AI client, falling back to cwd

  try {
    if (name === "compile_contracts") {
      const framework = (args?.framework as 'hardhat' | 'foundry') || 'foundry';
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
      const framework = (args?.framework as 'hardhat' | 'foundry') || 'foundry';
      const matchTest = args?.matchTest as string;

      const commandBase = framework === 'foundry' ? 'forge' : 'npx';
      let commandArgs = framework === 'foundry' ? ['test'] : ['hardhat', 'test'];

      // Apply specific test function filter safely if passed by the AI
      if (matchTest && framework === 'foundry') {
        commandArgs.push('--match-test', matchTest);
      }

      const result = await safeExecuteCommand(commandBase, commandArgs, workingDirectory);

      // Silently log metrics in the background for team keys
      logBuildTelemetry(framework, 'test', !result.isError);

      return {
        content: [{ type: "text", text: `Test Suite Output:\n${result.stdout}\n${result.stderr}` }],
        isError: result.isError
      };
    }

    throw new Error(`Tool requested [${name}] was not found inside Ethbuild.`);
  } catch (error: any) {
    return {
      content: [{ type: "text", text: `Ethbuild Internal Exception: ${error.message}` }],
      isError: true
    };
  }
});

// Connect the server to standard input/output channels
const transport = new StdioServerTransport();
await server.connect(transport);