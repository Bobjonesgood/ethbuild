import { execFile } from 'child_process';
import type { ChildProcess } from 'child_process';
import { existsSync } from 'fs';
import { dirname, join } from 'path';

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

interface ResolvedCommand {
  file: string;
  args: string[];
  error?: string;
}

/**
 * Works out exactly which program to launch, with no shell involved.
 *
 * forge is a real executable, so it can be launched directly.
 *
 * npx on Windows is npx.cmd, a batch file. Node refuses to launch .cmd files
 * without a shell (a security fix), so on Windows we run npm's npx-cli.js
 * with node itself. That file sits next to node.exe in a standard install.
 */
function resolveCommand(baseCommand: 'forge' | 'npx', args: string[]): ResolvedCommand {
  if (baseCommand === 'forge') {
    return { file: 'forge', args };
  }

  if (process.platform !== 'win32') {
    return { file: 'npx', args };
  }

  const npxCli = join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npx-cli.js');
  if (!existsSync(npxCli)) {
    return {
      file: '',
      args,
      error: `Ethbuild Error: could not find npx next to node (looked for ${npxCli}). Hardhat commands need a standard Node.js install that includes npm.`
    };
  }

  return { file: process.execPath, args: [npxCli, ...args] };
}

/**
 * Stops a command and everything it started. On Windows, killing only the
 * direct child can leave grandchildren (for example hardhat under npx)
 * running, so taskkill /T ends the whole tree.
 */
function killProcessTree(child: ChildProcess): void {
  if (process.platform === 'win32' && child.pid) {
    execFile('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true }, () => {
      // best effort, nothing to do if it fails
    });
  } else {
    child.kill('SIGKILL');
  }
}

/**
 * Safe command executor designed for AI-driven MCP environments.
 * Prevents freezes, manages memory buffers, and isolates execution errors.
 *
 * No shell is used. The program is launched directly with an argument list,
 * so nothing in an argument can be interpreted as a shell command.
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

  const fullCommand = `${baseCommand} ${subArguments.join(' ')}`;

  const resolved = resolveCommand(baseCommand, subArguments);
  if (resolved.error) {
    return { stdout: '', stderr: resolved.error, isError: true };
  }

  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: EngineResult) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(watchdogTimer);
      resolve(result);
    };

    // Allocate a generous 10MB buffer so massive logs do not crash the process
    const child = execFile(
      resolved.file,
      resolved.args,
      {
        cwd: workingDirectory,
        maxBuffer: 1024 * 1024 * 10,
        windowsHide: true,
      },
      (error, stdout, stderr) => {
        const cleanStdout = (stdout || '').trim();
        const cleanStderr = (stderr || '').trim();

        // Verbose: skip condensing, return full output up to the safety cap.
        if (verbose) {
          finish({
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
          finish({
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
          finish({ stdout: summary, stderr: '', isError: true });
          return;
        }

        // Nothing recognizable: return the raw output, capped at a larger size.
        finish({
          stdout: truncateOutput(cleanStdout, MAX_FAILURE_OUTPUT_CHARS),
          stderr: truncateOutput(cleanStderr || error.message, MAX_FAILURE_OUTPUT_CHARS),
          isError: true
        });
      }
    );

    // The Watchdog Timer: kills the command and its children if it hangs
    const watchdogTimer = setTimeout(() => {
      killProcessTree(child);
      finish({
        stdout: "",
        stderr: `TIMEOUT ERROR: Command [${fullCommand}] exceeded the safety limit of ${timeoutMs / 1000}s and was terminated to prevent an IDE lockup.`,
        isError: true
      });
    }, timeoutMs);
  });
}