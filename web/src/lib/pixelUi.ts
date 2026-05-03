import { cn } from "@/lib/utils";

/**
 * Tailwind fragments for retro pixel UI on the play route (dialogs, forms, lists).
 * Matches Pixi main menu / Grid chrome (Press Start 2P, chunky borders).
 */
export const pixelUi = {
  dialogContent: cn(
    "gap-4 rounded-none border-4 border-[#5c4033] bg-[#0f0b14] p-5 text-[9px] leading-relaxed text-amber-100 shadow-[8px_8px_0_0_rgba(0,0,0,0.5)] sm:text-[10px]",
    "[&_[data-slot=dialog-close]]:top-3 [&_[data-slot=dialog-close]]:right-3 [&_[data-slot=dialog-close]]:rounded-none",
    "[&_[data-slot=dialog-close]]:border-4 [&_[data-slot=dialog-close]]:border-[#5c4033] [&_[data-slot=dialog-close]]:bg-[#2a2018]",
    "[&_[data-slot=dialog-close]]:p-1.5 [&_[data-slot=dialog-close]]:opacity-100 [&_[data-slot=dialog-close]]:text-amber-200 hover:[&_[data-slot=dialog-close]]:bg-[#3d3028]",
  ),
  dialogFont: "font-['Press_Start_2P']",
  overlayHeavy: "bg-black/65 backdrop-blur-[1px]",
  title:
    "text-[11px] font-normal uppercase tracking-[0.06em] text-amber-50 leading-snug",
  description: "text-[8px] leading-snug text-amber-200/80",
  label: "text-[8px] uppercase tracking-wide text-amber-400/95",
  input: cn(
    "h-10 rounded-none border-4 border-[#3f3428] bg-[#1a1410] px-2 py-2 text-[9px] text-amber-50",
    "placeholder:text-amber-700/80 focus-visible:border-amber-600 focus-visible:ring-0",
  ),
  footer:
    "gap-2 border-t-4 border-[#2a2018] pt-4 mt-1 sm:flex-row sm:justify-end",
  btnPrimary: cn(
    "rounded-none border-4 border-[#143620] bg-[#2d6a4f] px-4 py-2 text-[8px] uppercase tracking-wide text-[#e8fff2]",
    "shadow-[3px_3px_0_0_rgba(0,0,0,0.45)] hover:bg-[#347a57]",
  ),
  btnSecondary: cn(
    "rounded-none border-4 border-stone-600 bg-stone-800 px-4 py-2 text-[8px] uppercase tracking-wide text-stone-200",
    "shadow-[3px_3px_0_0_rgba(0,0,0,0.45)] hover:bg-stone-700",
  ),
  btnOutline: cn(
    "rounded-none border-4 border-amber-900/50 bg-transparent px-4 py-2 text-[8px] uppercase tracking-wide text-amber-200",
    "shadow-[2px_2px_0_0_rgba(0,0,0,0.35)] hover:bg-amber-950/35",
  ),
  btnDestructive: cn(
    "rounded-none border-4 border-[#5c1c1c] bg-[#7f1d1d] px-3 py-1.5 text-[8px] uppercase tracking-wide text-amber-50",
    "shadow-[3px_3px_0_0_rgba(0,0,0,0.45)] hover:bg-[#991b1b]",
  ),
  listRow: cn(
    "flex flex-wrap items-center justify-between gap-2 border-4 border-[#3f3428] bg-[#1a1410] px-2 py-2 text-[8px] text-amber-100",
    "leading-snug shadow-[2px_2px_0_0_rgba(0,0,0,0.25)]",
  ),
  panelInset:
    "rounded-none border-4 border-[#3f3428] bg-[#120e18] p-3 text-[8px] text-amber-100/95",
} as const;
