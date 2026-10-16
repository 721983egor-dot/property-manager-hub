import { Check, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Quick entry to reviewed result forms; these buttons do not change deal data. */
export function DealBoardActions({
  onWon,
  onLost,
  onDelete,
  canWin = true,
  canLose = true,
}: {
  onWon: () => void;
  onLost: () => void;
  onDelete: () => void;
  canWin?: boolean;
  canLose?: boolean;
}) {
  return (
    <div
      className="mt-3 flex items-center gap-1 border-t border-border/70 pt-2"
      draggable={false}
      onDragStart={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-8 gap-1 px-2 text-xs text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800"
        disabled={!canWin}
        onClick={(e) => {
          e.stopPropagation();
          onWon();
        }}
      >
        <Check className="size-3.5" />
        Успешно
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-8 gap-1 px-2 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
        disabled={!canLose}
        onClick={(e) => {
          e.stopPropagation();
          onLost();
        }}
      >
        <X className="size-3.5" />
        Отказ
      </Button>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="ml-auto size-7 text-muted-foreground hover:text-destructive"
        aria-label="Удалить сделку"
        title="Удалить сделку"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
      >
        <Trash2 className="size-3.5" />
      </Button>
    </div>
  );
}
