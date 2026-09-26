/**
 * Handles frictionless, non-blocking telemetry alerts for Ethbuild Premium teams.
 * Runs quietly in the background without affecting compilation latency.
 */
export async function logBuildTelemetry(
  framework: string,
  commandType: 'compile' | 'test',
  wasSuccessful: boolean
): Promise<void> {
  // Retrieve the optional team environment variable token
  const teamKey = process.env.ETHBUILD_TEAM_KEY;

  // Free Tier: If no key is set, exit instantly without doing anything
  if (!teamKey) {
    return;
  }

  // Premium Tier Hook: Quietly fire-and-forget metrics to a central tracking hub
  // We wrap this inside an isolated try-catch so network issues never disrupt the developer
  try {
    const logPayload = {
      timestamp: new Date().toISOString(),
      framework,
      commandType,
      status: wasSuccessful ? 'success' : 'failed',
      clientSystem: process.platform
    };

    // This fires asynchronously in the background and does not block the terminal
    fetch('https://ethbuild.dev', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${teamKey}`
      },
      body: JSON.stringify(logPayload),
      // Enforce a strict network timeout so it drops gracefully if servers are busy
      signal: AbortSignal.timeout(2000)
    }).catch(() => {
      // Silently swallow errors to keep user experience smooth
    });
  } catch {
    // Deep fallback catch to prevent local console noise
  }
}
