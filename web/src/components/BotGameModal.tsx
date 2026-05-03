import { useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { cn } from "@/lib/utils";
import { pixelUi } from "@/lib/pixelUi";
import { MENU_DEFAULT_BOARD_SIZE } from "@/pixi/mainMenu/MainMenuScene";

const BotGameSchema = z.object({
  board_size: z
    .number()
    .min(5, "Min 5")
    .max(10, "Max 10"),
  num_bots: z
    .number()
    .min(1, "Min 1 bot")
    .max(3, "Max 3 bots"),
});

export type BotGameFormValues = z.infer<typeof BotGameSchema>;

interface BotGameModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (values: BotGameFormValues) => Promise<void>;
  defaultBoardSize?: number;
}

export function BotGameModal({
  open,
  onClose,
  onSubmit,
  defaultBoardSize = MENU_DEFAULT_BOARD_SIZE,
}: BotGameModalProps) {
  const form = useForm<BotGameFormValues>({
    resolver: zodResolver(BotGameSchema),
    defaultValues: {
      board_size: MENU_DEFAULT_BOARD_SIZE,
      num_bots: 1,
    },
  });

  useEffect(() => {
    if (!open) return;
    form.reset({
      board_size: Math.min(10, Math.max(5, Math.round(defaultBoardSize))),
      num_bots: 1,
    });
  }, [open, defaultBoardSize, form]);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent
        overlayClassName={pixelUi.overlayHeavy}
        className={cn(pixelUi.dialogContent, pixelUi.dialogFont, "max-w-md")}
      >
        <DialogHeader>
          <DialogTitle className={pixelUi.title}>Bot game</DialogTitle>
          <DialogDescription className={pixelUi.description}>
            Pick grid size and how many AI opponents (you + bots).
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-5"
          onSubmit={form.handleSubmit(async (values) => {
            await onSubmit(values);
          })}
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="bot_board_size" className={pixelUi.label}>
              Board size (5–10)
            </Label>
            <Input
              id="bot_board_size"
              type="number"
              min={5}
              max={10}
              className={pixelUi.input}
              {...form.register("board_size", { valueAsNumber: true })}
            />
            {form.formState.errors.board_size ? (
              <p className="text-[8px] uppercase tracking-wide text-red-400">
                {form.formState.errors.board_size.message}
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="num_bots" className={pixelUi.label}>
              Bots (1–3)
            </Label>
            <Input
              id="num_bots"
              type="number"
              min={1}
              max={3}
              className={pixelUi.input}
              {...form.register("num_bots", { valueAsNumber: true })}
            />
            {form.formState.errors.num_bots ? (
              <p className="text-[8px] uppercase tracking-wide text-red-400">
                {form.formState.errors.num_bots.message}
              </p>
            ) : null}
            <p className={cn(pixelUi.description, "!text-[7px]")}>
              Total players = you plus this many AI.
            </p>
          </div>

          <DialogFooter className={pixelUi.footer}>
            <Button
              type="button"
              variant="outline"
              className={pixelUi.btnOutline}
              onClick={() => onClose()}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={form.formState.isSubmitting}
              className={pixelUi.btnPrimary}
            >
              {form.formState.isSubmitting ? "Starting…" : "Start"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
