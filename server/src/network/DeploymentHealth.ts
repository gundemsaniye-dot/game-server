// Public revision only: allows deployment verification without exposing config,
// player data, credentials, or changing the authoritative simulation cadence.
export function deploymentHealth(commit: string | undefined) {
  return { status: 'ok', commit: commit && /^[a-f0-9]{40}$/i.test(commit) ? commit : null };
}
