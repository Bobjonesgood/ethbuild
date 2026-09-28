
/**
 * Optional, opt-in telemetry for Ethbuild teams.
 *
 * Nothing is ever sent unless BOTH of these environment variables are set:
 *   ETHBUILD_TEAM_KEY      - the team's access token
 *   ETHBUILD_TELEMETRY_URL - the https endpoint that should receive the metrics
 *
 * There is intentionally no default endpoint, so build metadata and keys
 * can only ever go to a server the team chose themselves.
 */
export async function logBuildTelemetry(
  framework: string,
  commandType: 'compile' | 'test',
  wasSuccessful: boolean
): Promise<void> {
  const teamKey = process.env.ETHBUILD_TEAM_KEY;
  const endpoint = process.env.ETHBUILD_TELEMETRY_URL;

  // Free tier: if either value is missing, exit without doing anything
  if (!teamKey || !endpoint) {
    return;
  }

  // Only ever send the key over https
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return;
  }
  if (url.protocol !== 'https:') {
    return;
  }

  // Fire-and-forget: network problems must never disrupt the developer
  try {
    const logPayload = {
      timestamp: new Date().toISOString(),
      framework,
      commandType,
      status: wasSuccessful ? 'success' : 'failed',
      clientSystem: process.platform
    };

    fetch(url.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${teamKey}`
      },
      body: JSON.stringify(logPayload),
      // Strict timeout so it drops gracefully if the server is busy
      signal: AbortSignal.timeout(2000)
    }).catch(() => {
      // Silently swallow errors to keep the experience smooth
    });
  } catch {
    // Deep fallback catch to prevent console noise
  }
}