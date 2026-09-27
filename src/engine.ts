import { exec } from 'child_process';

interface EngineResult {
  stdout: string;
  stderr: string;
  isError: boolean;
}

// Maximum characters of stdout/stderr to send back to the AI client.
// Keeps token usage predictable even when a build or test run produces
// a huge amount of output.
const MAX_OUTPUT_CHARS = 4000;

/**
 * Trims a large string down to a token-friendly size, keeping the
 * beginning and end (where the useful summary/error info usually lives)
 * and noting how much was cut from the middle.
 */
function truncateOutput(text: string, maxChars: number = MAX_OUTPUT_CHARS): string {
  if (text.length <= maxChars) {
    return text;
  }

  const headChars = Math.floor(maxChars * 0.6);
  const tailChars = maxChars - headChars;
  const head = text.slice(0, headChars);
  const tail = text.slice(text.length - tailChars);
  const cutCharCount = text.length - headChars - tailChars;

  return `${head}\n\n[... ${cutCharCount} characters truncated to save tokens ...]\n\n${tail}`;
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

        const isError = !!error;

        // Only truncate on success. Failures keep full output since the
        // AI needs every detail to actually diagnose and fix the problem.
        const finalStdout = isError ? stdout.trim() : truncateOutput(stdout.trim());
        const finalStderr = isError ? (stderr.trim() || error!.message) : truncateOutput(stderr.trim());

        resolve({
          stdout: finalStdout,
          stderr: finalStderr,
          isError
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