import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Bot } from "lucide-react";
import { getEmployeeHandbooks } from "@/lib/ai-manager/functions";
import { MarinaCoreInstructions, MarinaShowingLearning } from "@/components/MarinaShowingLearning";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const dateTime = new Intl.DateTimeFormat("ru-RU", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Europe/Moscow",
});

export function AiStaffCards() {
  const load = useServerFn(getEmployeeHandbooks);
  const employees = useQuery({
    queryKey: ["ai-employee-handbooks"],
    queryFn: () => load(),
    refetchInterval: 30_000,
  });

  return (
    <section aria-labelledby="ai-staff" className="space-y-3 border-t pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="ai-staff" className="text-lg font-semibold">
          ИИ-сотрудники
        </h2>
        <Link
          to="/system/ai-manager"
          className="text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          Настроить инструкции и запустить тесты
        </Link>
      </div>
      {employees.isPending && (
        <p role="status" className="text-sm text-muted-foreground">
          Загружаю профили…
        </p>
      )}
      {employees.isError && (
        <p role="alert" className="text-sm text-destructive">
          Профили ИИ-сотрудников недоступны.
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        {employees.data?.map((employee) => (
          <Card key={employee.id}>
            <CardHeader className="flex flex-row items-center gap-3 space-y-0">
              <Bot aria-hidden className="size-6 shrink-0 text-primary" />
              <div>
                <CardTitle className="text-base">{employee.name}</CardTitle>
                <p className="text-sm text-muted-foreground">{employee.position}</p>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div>
                <h3 className="font-medium">{employee.status}</h3>
                <p className="text-muted-foreground">{employee.scope}</p>
                {employee.lastReviewAt && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Последний разбор рабочего чата ·{" "}
                    {dateTime.format(new Date(employee.lastReviewAt))}
                  </p>
                )}
              </div>
              <div>
                <h3 className="font-medium">Навыки и проверки</h3>
                <ul className="mt-1 space-y-2">
                  {employee.skills.map((skill) => (
                    <li key={skill.id} className="rounded-md bg-muted px-2.5 py-2">
                      <p>{skill.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {skill.approvedAt
                          ? "Правило действует"
                          : skill.lastRunAt
                            ? "Ожидает подтверждения"
                            : "Ещё не проверен"}
                        {skill.lastRunAt
                          ? ` · проверка ${dateTime.format(new Date(skill.lastRunAt))}`
                          : ""}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
              <details open={employee.id === "marina" || undefined}>
                <summary className="cursor-pointer font-medium">Действующие инструкции</summary>
                {employee.id === "marina" && <MarinaCoreInstructions />}
                <h4 className="mt-3 font-medium">Памятка администратора</h4>
                <p className="mt-2 whitespace-pre-wrap break-words">
                  {employee.playbook.instructions}
                </p>
                <p className="mt-2 whitespace-pre-wrap break-words">{employee.playbook.answers}</p>
                {employee.skills
                  .filter((skill) => skill.approvedAt)
                  .map((skill) => (
                    <p key={skill.id} className="mt-2 border-l-2 pl-2">
                      {skill.rule}
                    </p>
                  ))}
              </details>
              {employee.id === "marina" && <MarinaShowingLearning />}
              <details>
                <summary className="cursor-pointer font-medium">Обязанности и полномочия</summary>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  {[...employee.duties, ...employee.access, ...employee.approval].map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </details>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
