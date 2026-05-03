/**
 * Pixel lane — single headline only (matches game canvas `#06060f`).
 * No welcome/guest copy here by design.
 */
export function FunkyNamePixelBanner() {
  return (
    <div className="relative w-full overflow-hidden border-b-4 border-black/50 bg-[#06060f] py-10 sm:py-12">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.12]"
        aria-hidden
        style={{
          backgroundImage: `
            linear-gradient(90deg, rgba(78,205,196,0.35) 1px, transparent 1px),
            linear-gradient(rgba(255,107,157,0.25) 1px, transparent 1px)
          `,
          backgroundSize: "16px 16px",
        }}
      />
      <p
        className="relative px-4 text-center text-[9px] leading-relaxed tracking-[0.18em] text-amber-100 sm:text-[11px]"
        style={{ fontFamily: '"Press Start 2P", monospace' }}
      >
        GIVE YOUR FUNKY NAME, MATE!
      </p>
    </div>
  );
}
