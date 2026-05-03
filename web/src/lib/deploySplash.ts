/**
 * Persists across React Strict Mode remounts so the deploy splash does not restart.
 */
let deploySplashComplete = false;

export function isDeploySplashComplete(): boolean {
  return deploySplashComplete;
}

export function markDeploySplashComplete(): void {
  deploySplashComplete = true;
}
