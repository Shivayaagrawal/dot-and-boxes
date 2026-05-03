/**
 * Suspense fallback — fills the viewport until `GameContainer` mounts.
 * Use the same background as the Pixi loading scene (`LOADING_SCENE_BACKGROUND_COLOR`).
 */
export function PixiLoaderPersistent() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-[#8eb8d8] px-6 text-center">
      <span
        className="text-[10px] text-slate-900/90 sm:text-xs"
        style={{ fontFamily: '"Press Start 2P", monospace' }}
      >
        LOADING…
      </span>
      <span className="font-mono text-xs text-slate-500">
        Preparing game canvas
      </span>
    </div>
  );
}
