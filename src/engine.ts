import { exec } from 'child_process';

interface EngineResult {
  stdout: string;
  stderr: string;
  isError: boolean;
}

// Successful output is trimmed past this size to keep token usage predictable.
const MAX_OUTPUT_CHARS = 4000;

// Fallback cap for failures when no known error pattern is found.
const MAX_FAILURE_OUTPUT_CHARS = 8000;

// Safety cap used when the caller asks for verbose output (full traces).
// Still bounded so one huge trace cannot flood the agent's context.
const MAX_VERBOSE_OUTPUT_CHARS = 30000;

// Never list more than this many failures or compiler errors.
const MAX_ITEMS_SHOWN = 10;

/**
 * Trims a large string down to a token-friendly size, keeping the
 * beginning and end and noting how much was cut from the middle.
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
 * Pulls the useful part out of a failed build or test run.
 * Keeps failing test lines and compiler error blocks verbatim and drops
 * everything else (traces, repeated summaries, warnings).
 * Returns null if nothing recognizable is found, so the caller can fall
 * back to the raw output.
 */
function extractFailureSummary(combined: string): string | null {
  const lines = combined.split(/\r?\n/);

  // Failing tests look like: [FAIL: reason] testName() (gas: 123)
  // Forge prints each one twice, so dedupe them.
  const failLines: string[] = [];
  const seen = new Set<string>();
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^\[FAIL/.test(trimmed) && !seen.has(trimmed)) {
      seen.add(trimmed);
      failLines.push(trimmed);
    }
  }

  // Compiler errors look like: Error (1234): message
  // followed by location lines until a blank line.
  const compileErrors: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*Error(\s*\(\d+\))?:/.test(lines[i])) {
      const block: string[] = [lines[i].trimEnd()];
      let j = i + 1;
      while (j < lines.length && lines[j].trim() !== '' && block.length < 12) {
        block.push(lines[j].trimEnd());
        j++;
      }
      compileErrors.push(block.join('\n'));
      i = j;
    }
  }

  if (failLines.length === 0 && compileErrors.length === 0) {
    return null;
  }

  const parts: string[] = [];

  if (compileErrors.length > 0) {
    parts.push(`Compiler errors (${compileErrors.length}):`);
    parts.push(...compileErrors.slice(0, MAX_ITEMS_SHOWN));
    if (compileErrors.length > MAX_ITEMS_SHOWN) {
      parts.push(`... and ${compileErrors.length - MAX_ITEMS_SHOWN} more compiler errors not shown`);
    }
  }

  if (failLines.length > 0) {
    parts.push(`Failing tests (${failLines.length}):`);
    parts.push(...failLines.slice(0, MAX_ITEMS_SHOWN));
    if (failLines.length > MAX_ITEMS_SHOWN) {
      parts.push(`... and ${failLines.length - MAX_ITEMS_SHOWN} more failing tests not shown`);
    }
  }

  parts.push(`[Condensed failure summary. Full output was ${combined.length} characters.]`);
  return parts.join('\n');
}

/**
 * Safe command executor designed for AI-driven MCP environments.
 * Prevents freezes, manages memory buffers, and isolates execution errors.
 *
 * When verbose is true, output is not condensed. It is only capped at a
 * large safety limit so full traces can reach the agent.
 */
export async function safeExecuteCommand(
  baseCommand: 'forge' | 'npx',
  subArguments: string[],
  workingDirectory: string,
  timeoutMs: number = 45000, // 45-second safety cutoff
  verbose: boolean = false
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

        const cleanStdout = stdout.trim();
        const cleanStderr = stderr.trim();

        // Verbose: skip condensing, return full output up to the safety cap.
        if (verbose) {
          resolve({
            stdout: truncateOutput(cleanStdout, MAX_VERBOSE_OUTPUT_CHARS),
            stderr: truncateOutput(
              cleanStderr || (error ? error.message : ''),
              MAX_VERBOSE_OUTPUT_CHARS
            ),
            isError: !!error
          });
          return;
        }

        // Success: trim long output to save tokens.
        if (!error) {
          resolve({
            stdout: truncateOutput(cleanStdout),
            stderr: truncateOutput(cleanStderr),
            isError: false
          });
          return;
        }

        // Failure: try to condense to just the errors and failing test names.
        const combined = [cleanStdout, cleanStderr].filter(Boolean).join('\n');
        const summary = extractFailureSummary(combined);

        if (summary) {
          resolve({ stdout: summary, stderr: '', isError: true });
          return;
        }

        // Nothing recognizable: return the raw output, capped at a larger size.
        resolve({
          stdout: truncateOutput(cleanStdout, MAX_FAILURE_OUTPUT_CHARS),
          stderr: truncateOutput(cleanStderr || error.message, MAX_FAILURE_OUTPUT_CHARS),
          isError: true
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