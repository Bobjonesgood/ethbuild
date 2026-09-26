import { exec } from 'child_process';

interface EngineResult {
  stdout: string;
  stderr: string;
  isError: boolean;
}

/**
 * Safe command executor designed for AI-driven MCP environments.
 * Prevents freezes, manages memory buffers, and isolates execution errors.
 */
export async function safeExecuteCommand(
  baseCommand: 'forge' | 'npx', 
  subArguments: string[], 
  workingDirectory: string,
  timeoutMs: number = 45000 // 45-second safety cutoff
): Promise<EngineResult> {

  // Sanitize input arguments to prevent command injection chains
  const safeArgs = subArguments.map(arg => arg.replace(/[;&|`\$]/g, ''));
  const fullCommand = `${baseCommand} ${safeArgs.join(' ')}`;

  return new Promise((resolve) => {
    // Allocate a generous 10MB buffer so massive logs do not crash the process
    const process = exec(
      fullCommand, 
      { 
        cwd: workingDirectory, 
        maxBuffer: 1024 * 1024 * 10,
      }, 
      (error, stdout, stderr) => {
        // Clear the safety timer if the task finishes normally
        clearTimeout(watchdogTimer);

        if (error) {
          resolve({
            stdout: stdout.trim(),
            stderr: stderr.trim() || error.message,
            isError: true
          });
          return;
        }

        resolve({
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          isError: false
        });
      }
    );

    // The Watchdog Timer: Kills the command forcefully if it hangs
    const watchdogTimer = setTimeout(() => {
      process.kill('SIGKILL');
      resolve({
        stdout: "",
        stderr: `TIMEOUT ERROR: Command [${fullCommand}] exceeded the safety limit of ${timeoutMs / 1000}s and was terminated to prevent an IDE lockup.`,
        isError: true
      });
    }, timeoutMs);
  });
}
