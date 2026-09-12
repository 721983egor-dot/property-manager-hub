import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  chatSourceToDealSource,
  createDealFromThread,
  type ChatThread,
} from "@/lib/chat.functions";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  thread: ChatThread;
  onCreated?: (dealId: string) => void;
};

/** Создание сделки из чата: источник уже заполнен, имя/телефон и комментарий — вручную. */
export function CreateDealFromChatDialog({ open, onOpenChange, thread, onCreated }: Props) {
  const createDeal = useServerFn(createDealFromThread);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [comment, setComment] = useState("");
  const [budget, setBudget] = useState("");

  useEffect(() => {
    if (!open) return;
    setName(thread.name.trim());
    setPhone(thread.phone.trim());
    setComment("");
    setBudget("");
  }, [open, thread.id, thread.name, thread.phone]);

  const mutation = useMutation({
    mutationFn: () =>
      createDeal({
        data: {
          threadId: thread.id,
          name: name.trim(),
          phone: phone.trim(),
          comment: comment.trim(),
          budget: budget.trim() === "" ? null : Number(budget),
          propertyId: thread.property_id,
        },
      }),
    onSuccess: (result) => {
      toast.success("Сделка создана");
      onOpenChange(false);
      onCreated?.(result.dealId);
    },
    onError: (e: Error) => toast.error(e.message || "Не удалось создать сделку"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Создать сделку</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Источник</Label>
            <Input value={chatSourceToDealSource(thread.source)} disabled />
          </div>
          {thread.property_title ? (
            <div className="space-y-1.5">
              <Label>Объект</Label>
              <Input value={thread.property_title} disabled />
            </div>
          ) : null}
          <div className="space-y-1.5">
            <Label htmlFor="chat-deal-name">Имя</Label>
            <Input
              id="chat-deal-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Как зовут клиента"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="chat-deal-phone">Телефон</Label>
            <Input
              id="chat-deal-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+7…"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="chat-deal-budget">Бюджет (необязательно)</Label>
            <Input
              id="chat-deal-budget"
              inputMode="numeric"
              value={budget}
              onChange={(e) => setBudget(e.target.value.replace(/[^\d]/g, ""))}
              placeholder="₽ в месяц"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="chat-deal-comment">Комментарий</Label>
            <Textarea
              id="chat-deal-comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={4}
              placeholder="Что нужно клиенту, сроки, пожелания…"
            />
            <p className="text-xs text-muted-foreground">
              Переписка из чата добавится в сделку автоматически.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button
            disabled={mutation.isPending || !name.trim() || !phone.trim()}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? "Создаём…" : "Создать сделку"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
