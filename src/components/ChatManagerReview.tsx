import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { reviewManagerChat, confirmManagerReview } from "@/lib/ai-manager/functions";

export function ChatManagerReview({
  threadId,
  onDraft,
}: {
  threadId: string;
  onDraft: (text: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState("");
  const [draft, setDraft] = useState("");
  const queryClient = useQueryClient();
  const review = useServerFn(reviewManagerChat),
    confirm = useServerFn(confirmManagerReview);
  const analysis = useMutation({
    mutationFn: () => review({ data: { threadId } }),
    onSuccess: (r) => {
      setDraft(r.analysis.reply);
      setStage("");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const apply = useMutation({
    mutationFn: () => confirm({ data: { reviewId: analysis.data!.id, stageId: stage || null } }),
    onSuccess: (message) => {
      toast.success(message);
      void queryClient.invalidateQueries({ queryKey: ["deals"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const r = analysis.data;
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Sparkles className="size-4" />
        ИИ-менеджер
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90dvh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Помощник по переписке</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Готовит ответ и данные для CRM. Отправку и изменения подтверждаете вы.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              disabled={analysis.isPending || apply.isPending}
              onClick={() => {
                apply.reset();
                analysis.mutate();
              }}
            >
              {analysis.isPending
                ? "Разбираю переписку…"
                : r
                  ? "Повторить разбор"
                  : "Разобрать переписку"}
            </Button>
            <Link to="/system/ai-manager" className="text-sm text-primary">
              Памятка и правила
            </Link>
          </div>
          {analysis.error && (
            <p role="alert" className="text-sm text-destructive">
              {analysis.error.message}
            </p>
          )}
          {r && !analysis.isPending && (
            <div className="space-y-4">
              <p className="rounded-lg bg-muted p-3 text-sm">{r.notice}</p>
              {r.analysis.needsHuman && (
                <p className="text-sm font-medium">Нужно участие менеджера: {r.analysis.reason}</p>
              )}
              <label className="block space-y-2 text-sm font-medium">
                Черновик ответа
                <Textarea rows={5} value={draft} onChange={(e) => setDraft(e.target.value)} />
              </label>
              <Button
                variant="outline"
                onClick={() => {
                  onDraft(draft);
                  setOpen(false);
                  toast.success("Черновик перенесён в поле ответа. Проверьте перед отправкой.");
                }}
              >
                Вставить в ответ
              </Button>
              <div className="border-t pt-4">
                <h3 className="mb-2 font-medium">Что добавить в сделку</h3>
                <p className="mb-3 text-xs text-muted-foreground">
                  Сохранится отдельной заметкой. Поля клиента и условия сделки не перезаписываются.
                </p>
                {r.analysis.facts.length === 0 && (
                  <p className="text-sm text-muted-foreground">Клиент пока не сообщил пожелания.</p>
                )}
                {r.analysis.facts.map((f, i) => (
                  <div className="mb-2 rounded-lg border p-3 text-sm" key={i}>
                    <strong>{f.label}:</strong> {f.value}
                    <p className="mt-1 text-xs text-muted-foreground">Клиент: «{f.quote}»</p>
                  </div>
                ))}
                <pre className="mt-3 whitespace-pre-wrap rounded-lg bg-muted p-3 font-sans text-sm">
                  {r.note}
                </pre>
                {r.dealId ? (
                  <>
                    <label className="mt-3 block space-y-2 text-sm">
                      Этап сделки после проверки
                      <select
                        className="block w-full rounded-md border bg-background p-2"
                        value={stage}
                        onChange={(e) => setStage(e.target.value)}
                        disabled={apply.isSuccess}
                      >
                        <option value="">Оставить текущий этап</option>
                        {r.stages.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Выбирайте этап по фактическому результату. Просмотр требует проверки времени и
                      ключей. Бронь и закрытие оформляются отдельно.
                    </p>
                    <Button
                      className="mt-3"
                      disabled={apply.isPending || apply.isSuccess}
                      onClick={() => apply.mutate()}
                    >
                      {apply.isSuccess
                        ? "Записано в CRM"
                        : apply.isPending
                          ? "Сохраняю…"
                          : "Подтвердить запись в CRM"}
                    </Button>
                  </>
                ) : (
                  <p className="mt-3 text-sm">
                    Сначала создайте или привяжите сделку кнопкой в чате, затем повторите разбор.
                    Это сохранит переписку в нужной карточке.
                  </p>
                )}
                {apply.error && (
                  <p role="alert" className="mt-2 text-sm text-destructive">
                    {apply.error.message}
                  </p>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
