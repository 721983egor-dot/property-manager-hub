import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  decideMarinaRule,
  getMarinaShowingRules,
} from "@/lib/ai-manager/marina-learning.functions";
import { MARINA_INSTRUCTIONS } from "@/lib/ai-manager/marina-instructions";

const reviewKey = ["marina-showing-rules"];
const date = new Intl.DateTimeFormat("ru-RU", {
  dateStyle: "medium",
  timeZone: "Europe/Moscow",
});

export function MarinaCoreInstructions() {
  return (
    <dl className="mt-2 space-y-2.5">
      {MARINA_INSTRUCTIONS.map(({ title, text }) => (
        <div key={title}>
          <dt className="font-medium">{title}</dt>
          <dd className="text-muted-foreground">{text}</dd>
        </div>
      ))}
    </dl>
  );
}

export function MarinaStaffProfile() {
  return (
    <section className="space-y-4 rounded-lg border p-4 text-sm" aria-labelledby="marina-staff-profile">
      <div>
        <h2 id="marina-staff-profile" className="text-base font-semibold">Марина</h2>
        <p className="text-muted-foreground">ИИ-менеджер по длительной аренде · Черновики</p>
      </div>
      <details open>
        <summary className="cursor-pointer font-medium">Действующие инструкции</summary>
        <MarinaCoreInstructions />
      </details>
      <MarinaShowingLearning />
    </section>
  );
}

export function MarinaShowingLearning() {
  const load = useServerFn(getMarinaShowingRules);
  const save = useServerFn(decideMarinaRule);
  const queryClient = useQueryClient();
  const rules = useQuery({ queryKey: reviewKey, queryFn: () => load(), staleTime: 60_000 });
  const [edits, setEdits] = useState<Record<string, string>>({});
  const decide = useMutation({
    mutationFn: save,
    onSuccess: async (message) => {
      toast.success(message);
      await queryClient.invalidateQueries({ queryKey: reviewKey });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Решение не сохранено"),
  });

  return (
    <section className="space-y-2" aria-label="Обучение Марины по состоявшимся показам">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-medium">Правила по состоявшимся показам</h3>
        <Button
          variant="outline"
          size="sm"
          disabled={rules.isFetching}
          onClick={() => rules.refetch()}
        >
          Обновить
        </Button>
      </div>
      {rules.isPending && <p role="status">Проверяю сделки с показами…</p>}
      {rules.isError && <p role="alert">Не удалось загрузить правила по показам.</p>}
      {rules.data?.rules.length === 0 && (
        <p className="text-muted-foreground">
          Пока нет подходящих показов со связанной перепиской.
        </p>
      )}
      {rules.data?.rules.map((rule) => {
        const approved = rule.status === "approved";
        const text = approved ? rule.text : (edits[rule.key] ?? rule.text);
        const submit = (decision: "approved" | "dismissed" | "revoke") => {
          decide.mutate({
            data: {
              key: rule.key,
              showingId: rule.showingId,
              text: decision === "approved" ? text : rule.text,
              decision,
            },
          });
        };
        return (
          <article key={rule.key} className="space-y-2 rounded-md border p-3">
            <h4 className="font-medium">{rule.title}</h4>
            <p className="text-muted-foreground">
              {approved ? "Действует" : "На подтверждении"} · Совпадений в сделках {rule.dealCount}
            </p>
            {approved || !rules.data?.canDecide ? (
              <p className="whitespace-pre-wrap break-words">{text}</p>
            ) : (
              <Textarea
                aria-label={rule.title}
                value={text}
                maxLength={400}
                onChange={(event) =>
                  setEdits((previous) => ({ ...previous, [rule.key]: event.target.value }))
                }
              />
            )}
            {rule.examples.length > 0 && (
              <ul className="flex flex-wrap gap-x-3 gap-y-1">
                {rule.examples.map((example) => (
                  <li key={example.showing_id}>
                    <Link
                      to="/crm/deals"
                      search={{ deal: example.deal_id, funnel: "deals" }}
                      className="text-primary underline underline-offset-4"
                    >
                      Сделка от {date.format(new Date(example.shown_at))}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {rules.data?.canDecide && (
              <div className="flex flex-wrap gap-2">
                {approved ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={decide.isPending}
                    onClick={() => submit("revoke")}
                  >
                    Отключить правило
                  </Button>
                ) : (
                  <>
                    <Button
                      size="sm"
                      disabled={decide.isPending || text.trim().length < 20}
                      onClick={() => submit("approved")}
                    >
                      Подтвердить правило
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={decide.isPending}
                      onClick={() => submit("dismissed")}
                    >
                      Отклонить
                    </Button>
                  </>
                )}
              </div>
            )}
          </article>
        );
      })}
    </section>
  );
}
