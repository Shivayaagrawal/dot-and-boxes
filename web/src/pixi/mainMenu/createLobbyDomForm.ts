import { clampBoardApi } from "@/lib/lobbyCreateForm";

export interface LobbyCreateDomForm {
  root: HTMLDivElement;
  getValues: () => {
    name: string;
    player_limit: number;
    board_size: number;
    /** Lobbies are always public — kept for API shape. */
    is_private: false;
  };
  reset: (defaultBoardSize: number) => void;
  setError: (msg: string) => void;
  setLobbyCreatePending: (pending: boolean) => void;
  focusName: () => void;
}

function applyInputStyle(el: HTMLInputElement): void {
  el.style.boxSizing = "border-box";
  el.style.height = "40px";
  el.style.width = "100%";
  el.style.minWidth = "0";
  el.style.border = "4px solid #3f3428";
  el.style.background = "#1a1410";
  el.style.color = "#fffbeb";
  el.style.padding = "8px 10px";
  el.style.fontFamily = 'inherit';
  el.style.fontSize = "11px";
  el.style.lineHeight = "1.25";
  el.style.borderRadius = "0";
  el.style.outline = "none";
  el.style.imageRendering = "pixelated";
  el.addEventListener("focus", () => {
    el.style.borderColor = "#d97706";
  });
  el.addEventListener("blur", () => {
    el.style.borderColor = "#3f3428";
  });
}

function applyPixelButton(
  el: HTMLButtonElement,
  variant: "neutral" | "primary",
): void {
  el.type = "button";
  el.style.boxSizing = "border-box";
  el.style.flex = "1";
  el.style.minWidth = "120px";
  el.style.height = "44px";
  el.style.padding = "0 12px";
  el.style.fontFamily = 'inherit';
  el.style.fontSize = "10px";
  el.style.lineHeight = "1.2";
  el.style.cursor = "pointer";
  el.style.borderRadius = "0";
  el.style.borderStyle = "solid";
  el.style.borderWidth = "4px";
  el.style.textTransform = "uppercase";
  el.style.letterSpacing = "0.06em";
  el.style.imageRendering = "pixelated";
  if (variant === "neutral") {
    el.style.borderColor = "#0f0c09";
    el.style.background = "#4a3728";
    el.style.color = "#c4b5a0";
    el.style.boxShadow = "4px 4px 0 #1a120e";
  } else {
    el.style.borderColor = "#0f291d";
    el.style.background = "#2d6a4f";
    el.style.color = "#b7e4c7";
    el.style.boxShadow = "4px 4px 0 #1b4332";
  }
}

/**
 * Single HTML card for create-lobby (must stay HTML-only so it layers correctly above Pixi canvas).
 */
export function buildLobbyCreateDomForm(options: {
  onCancel: () => void;
  onSubmit: () => void;
}): LobbyCreateDomForm {
  const root = document.createElement("div");
  root.style.boxSizing = "border-box";
  /** Explicit width — DOMContainer / canvas stacking otherwise collapses to ~0 and breaks layout. */
  root.style.width = "400px";
  root.style.maxWidth = "92vw";
  root.style.margin = "0";
  root.style.padding = "20px 22px 18px";
  root.style.display = "flex";
  root.style.flexDirection = "column";
  root.style.gap = "14px";
  root.style.background = "#0f0b14";
  root.style.border = "4px solid #5c4033";
  root.style.borderRadius = "8px";
  root.style.fontFamily = '"Press Start 2P", ui-monospace, monospace';
  root.style.fontSize = "10px";
  root.style.lineHeight = "1.35";
  root.style.color = "#fef3c7";
  root.style.imageRendering = "pixelated";
  root.style.pointerEvents = "auto";
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-label", "Create a lobby");

  const stopBubble = (e: Event): void => {
    e.stopPropagation();
  };
  root.addEventListener("pointerdown", stopBubble);
  root.addEventListener("click", stopBubble);

  const title = document.createElement("div");
  title.textContent = "CREATE A LOBBY";
  title.style.textAlign = "center";
  title.style.fontSize = "12px";
  title.style.lineHeight = "1.3";
  title.style.color = "#fff1c8";
  title.style.letterSpacing = "0.04em";
  title.style.textTransform = "uppercase";
  root.appendChild(title);

  const err = document.createElement("div");
  err.style.boxSizing = "border-box";
  err.style.width = "100%";
  err.style.minHeight = "18px";
  err.style.color = "#f87171";
  err.style.fontSize = "9px";
  err.style.lineHeight = "1.35";
  err.style.textTransform = "uppercase";
  err.style.letterSpacing = "0.03em";
  err.style.whiteSpace = "normal";
  err.style.overflowWrap = "anywhere";
  err.style.wordBreak = "normal";
  root.appendChild(err);

  const labelStyle = (el: HTMLSpanElement): void => {
    el.style.display = "block";
    el.style.marginBottom = "6px";
    el.style.textTransform = "uppercase";
    el.style.letterSpacing = "0.06em";
    el.style.color = "rgba(251, 191, 36, 0.95)";
    el.style.fontSize = "9px";
    el.style.lineHeight = "1.3";
    el.style.whiteSpace = "nowrap";
  };

  const fieldCol = (
    labelText: string,
    input: HTMLInputElement,
  ): HTMLDivElement => {
    const wrap = document.createElement("div");
    wrap.style.display = "flex";
    wrap.style.flexDirection = "column";
    wrap.style.alignItems = "stretch";
    wrap.style.minWidth = "0";
    wrap.style.flex = "1";
    const lab = document.createElement("span");
    lab.textContent = labelText;
    labelStyle(lab);
    wrap.appendChild(lab);
    wrap.appendChild(input);
    return wrap;
  };

  const nameIn = document.createElement("input");
  nameIn.type = "text";
  nameIn.placeholder = "MY ROOM";
  nameIn.autocomplete = "off";
  applyInputStyle(nameIn);

  const limIn = document.createElement("input");
  limIn.type = "number";
  limIn.min = "2";
  limIn.max = "10";
  limIn.value = "4";
  applyInputStyle(limIn);

  const boardIn = document.createElement("input");
  boardIn.type = "number";
  boardIn.min = "5";
  boardIn.max = "10";
  boardIn.value = "10";
  applyInputStyle(boardIn);

  root.appendChild(fieldCol("Lobby name", nameIn));

  const rowNum = document.createElement("div");
  rowNum.style.display = "flex";
  rowNum.style.flexDirection = "row";
  rowNum.style.gap = "14px";
  rowNum.style.alignItems = "stretch";
  rowNum.style.width = "100%";
  rowNum.style.minWidth = "0";
  rowNum.appendChild(fieldCol("Players", limIn));
  rowNum.appendChild(fieldCol("Grid size", boardIn));
  root.appendChild(rowNum);

  const hint = document.createElement("p");
  hint.style.margin = "0";
  hint.style.fontSize = "8px";
  hint.style.lineHeight = "1.4";
  hint.style.color = "rgba(253, 230, 138, 0.8)";
  hint.style.textTransform = "none";
  hint.style.letterSpacing = "0";
  hint.textContent = "Grid is 5×5 … 10×10.";
  root.appendChild(hint);

  const btnRow = document.createElement("div");
  btnRow.style.display = "flex";
  btnRow.style.flexDirection = "row";
  btnRow.style.gap = "12px";
  btnRow.style.marginTop = "4px";
  btnRow.style.width = "100%";

  const cancelBtn = document.createElement("button");
  cancelBtn.textContent = "CANCEL";
  applyPixelButton(cancelBtn, "neutral");
  cancelBtn.addEventListener("click", () => options.onCancel());

  const submitBtn = document.createElement("button");
  submitBtn.textContent = "CREATE";
  applyPixelButton(submitBtn, "primary");
  submitBtn.addEventListener("click", () => options.onSubmit());

  btnRow.appendChild(cancelBtn);
  btnRow.appendChild(submitBtn);
  root.appendChild(btnRow);

  let pending = false;

  const applyPendingUi = (): void => {
    cancelBtn.disabled = pending;
    submitBtn.disabled = pending;
    cancelBtn.style.opacity = pending ? "0.55" : "1";
    submitBtn.style.opacity = pending ? "0.55" : "1";
    cancelBtn.style.pointerEvents = pending ? "none" : "auto";
    submitBtn.style.pointerEvents = pending ? "none" : "auto";
    submitBtn.textContent = pending ? "WAIT…" : "CREATE";
  };

  return {
    root,
    getValues: () => ({
      name: nameIn.value,
      player_limit: Number(limIn.value),
      board_size: Number(boardIn.value),
      is_private: false as const,
    }),
    reset: (defaultBoardSize: number) => {
      nameIn.value = "";
      limIn.value = "4";
      boardIn.value = String(clampBoardApi(defaultBoardSize));
      err.textContent = "";
      pending = false;
      applyPendingUi();
    },
    setError: (msg: string) => {
      err.textContent = msg;
    },
    setLobbyCreatePending: (p: boolean) => {
      pending = p;
      applyPendingUi();
    },
    focusName: () => {
      nameIn.focus();
    },
  };
}
