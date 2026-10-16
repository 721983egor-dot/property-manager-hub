import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { closeDealLost, fetchLossReasons } from "@/lib/crm-results";
import { moscowDay } from "@/lib/crm-results-model";
import type { Deal } from "@/lib/deals";
export function DealLostDialog({
  open,
  onOpenChange,
  deal,
  onClosed,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  deal: Deal;
  onClosed?: () => void;
}) {
  const qc = useQueryClient();
  const [reason, setReason] = useState("");
  const [comment, setComment] = useState("");
  const [date, setDate] = useState(moscowDay(new Date().toISOString()));
  const { data = [], error } = useQuery({
    queryKey: ["deal-loss-reasons", deal.pipeline],
    queryFn: () => fetchLossReasons(deal.pipeline),
    enabled: open,
  });
  useEffect(() => {
    if (open) {
      setReason(deal.loss_reason_id ?? "");
      setComment(deal.loss_comment ?? "");
      setDate(moscowDay(new Date().toISOString()));
    }
  }, [open, deal.id, deal.loss_reason_id, deal.loss_comment]);
  const save = useMutation({
    mutationFn: () => closeDealLost(deal.id, reason, comment, date),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["deals"] });
      qc.invalidateQueries({ queryKey: ["deal-history", deal.id] });
      toast.success("Сделка закрыта с указанием причины");
      onOpenChange(false);
      onClosed?.();
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Причина провала сделки</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">{deal.title}</p>
        <Label>Причина</Label>
        <Select value={reason} onValueChange={setReason}>
          <SelectTrigger>
            <SelectValue placeholder="Выберите причину" />
          </SelectTrigger>
          <SelectContent>
            {data
              .filter((r) => !r.archived)
              .map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.name}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
        {error && <p className="text-sm text-destructive">{error.message}</p>}
        {!error && !data.some((r) => !r.archived) && (
          <p className="text-sm text-muted-foreground">Добавьте причины в настройках CRM.</p>
        )}
        <Label>Дата закрытия</Label>
        <Input
          type="date"
          value={date}
          max={moscowDay(new Date().toISOString())}
          onChange={(e) => setDate(e.target.value)}
        />
        <Label>Комментарий</Label>
        <Textarea value={comment} onChange={(e) => setComment(e.target.value)} maxLength={3000} />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button
            variant="destructive"
            disabled={!reason || !date || save.isPending}
            onClick={() => save.mutate()}
          >
            Закрыть сделку
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
