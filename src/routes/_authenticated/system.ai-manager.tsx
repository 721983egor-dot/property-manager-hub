import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AdminOnly } from "@/components/AdminOnly";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  approveEmployeeSkill,
  getAiEmployeeProfiles,
  getAlexanderPlaybook,
  getManagerPlaybook,
  saveAlexanderPlaybook,
  saveManagerPlaybook,
  testEmployeeOpenAI,
  testEmployeeScenario,
} from "@/lib/ai-manager/functions";
import { DEFAULT_PLAYBOOK } from "@/lib/ai-manager/model";
import { DEFAULT_SUPPORT_PLAYBOOK, employeeScenarios } from "@/lib/ai-manager/employee-tests";

export const Route = createFileRoute("/_authenticated/system/ai-manager")({
  head: () => ({ meta: [{ title: "ИИ-сотрудники — РМ ОС" }] }),
  component: () => (
    <AdminOnly>
      <ManagerSettings />
    </AdminOnly>
  ),
});
function ManagerSettings() {
  const loadProfiles = useServerFn(getAiEmployeeProfiles);
  const profiles = useQuery({ queryKey: ["ai-employee-profiles"], queryFn: () => loadProfiles() });
  return (
    <main className="mx-auto max-w-6xl space-y-8 p-4 sm:p-8">
      <header>
        <p className="mb-2 text-xs text-muted-foreground">Настройки · Только администратор</p>
        <h1 className="text-2xl font-semibold">ИИ-сотрудники</h1>
      </header>
      {profiles.isPending && <p className="text-sm text-muted-foreground">Загружаю профили…</p>}
      {profiles.isError && (
        <p role="alert" className="text-sm text-destructive">
          Не удалось загрузить профили. {profiles.error.message}
        </p>
      )}
      {profiles.data && (
        <div className="grid gap-4 lg:grid-cols-2">
          {profiles.data.map((profile) => (
            <article key={profile.id} className="space-y-5 rounded-xl border bg-card p-5 sm:p-6">
              <header className="space-y-2 border-b pb-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-xl font-semibold">{profile.name}</h2>
                  <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                    {profile.status}
                  </span>
                </div>
                <p className="font-medium">{profile.position}</p>
                <p className="text-sm text-muted-foreground">{profile.scope}</p>
              </header>
              {[
                { title: "Обязанности", items: profile.duties },
                { title: profile.accessTitle, items: profile.access },
                { title: "Требуется подтверждение", items: profile.approval },
                { title: "Данные для работы", items: profile.inputData },
              ].map(({ title, items }) => (
                <section key={title} className="space-y-2 text-sm">
                  <h3 className="font-medium">{title}</h3>
                  <ul className="list-disc space-y-1.5 pl-5 text-muted-foreground">
                    {items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </section>
              ))}
            </article>
          ))}
        </div>
      )}
      <EmployeeTests />
      <EmployeePlaybook employee="marina" />
      <EmployeePlaybook employee="alexander" />
    </main>
  );
}

function EmployeePlaybook({ employee }: { employee: "marina" | "alexander" }) {
  const queryClient = useQueryClient();
  const marina = employee === "marina";
  const load = useServerFn(marina ? getManagerPlaybook : getAlexanderPlaybook);
  const save = useServerFn(marina ? saveManagerPlaybook : saveAlexanderPlaybook);
  const query = useQuery({
    queryKey: [marina ? "rental-ai-playbook" : "support-ai-playbook"],
    queryFn: () => load(),
  });
  const [value, setValue] = useState(marina ? DEFAULT_PLAYBOOK : DEFAULT_SUPPORT_PLAYBOOK);
  const [dirty, setDirty] = useState(false);
  const [revision, setRevision] = useState("initial");
  useEffect(() => {
    if (query.data && !dirty) {
      setValue(query.data.value);
      setRevision(query.data.revision);
    }
  }, [query.data, dirty]);
  const mutation = useMutation({
    mutationFn: () => save({ data: { value, revision } }),
    onSuccess: (message) => {
      toast.success(message);
      setDirty(false);
      void query.refetch();
      void queryClient.invalidateQueries({ queryKey: ["ai-employee-handbooks"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <section className="space-y-6 border-t pt-6" aria-labelledby={`${employee}-playbook`}>
      <h2 id={`${employee}-playbook`} className="text-lg font-semibold">
        {marina ? "Памятка Марины" : "Памятка Александра"}
      </h2>
      {marina && (
        <section className="space-y-3 rounded-xl border p-5">
          <h3 className="font-medium">Правила площадок</h3>
          <p className="text-sm text-muted-foreground">
            Для Авито и Циан правила внешних переходов пока не подтверждены. ИИ продолжает общение
            на площадке, не предлагает обход фильтров и не рассылает внешние ссылки. Если клиент сам
            оставил контакт, он попадёт в разбор для проверки менеджером. Отказ переходить
            сохраняется.
          </p>
          <p className="text-sm text-muted-foreground">
            Гарантировать отсутствие блокировок нельзя. Массовые сообщения и обязательный перевод
            каждого клиента не включены.
          </p>
        </section>
      )}
      {query.isPending && <p className="text-sm">Загружаю памятку…</p>}
      {query.error && (
        <div role="alert" className="rounded-lg bg-muted p-4 text-sm">
          Памятка не загружена: {query.error.message}. Ниже можно подготовить текст; он пока не
          сохранён на сервере.
        </div>
      )}
      <label className="block space-y-2 font-medium">
        Как вести диалог
        <Textarea
          rows={7}
          value={value.instructions}
          onChange={(e) => {
            setDirty(true);
            setValue((v) => ({ ...v, instructions: e.target.value }));
          }}
        />
      </label>
      <label className="block space-y-2 font-medium">
        Памятка по сложным вопросам
        <Textarea
          rows={10}
          value={value.answers}
          onChange={(e) => {
            setDirty(true);
            setValue((v) => ({ ...v, answers: e.target.value }));
          }}
        />
      </label>
      <p className="text-sm text-muted-foreground">
        В памятке хранятся общие правила. Личные данные, коды доступа и реквизиты для входа сюда не
        добавляйте.
      </p>
      <Button
        disabled={!query.data || !dirty || mutation.isPending}
        onClick={() => mutation.mutate()}
      >
        {mutation.isPending ? "Сохраняю…" : "Сохранить памятку"}
      </Button>
    </section>
  );
}

function EmployeeTests() {
  const queryClient = useQueryClient();
  const probe = useServerFn(testEmployeeOpenAI);
  const run = useServerFn(testEmployeeScenario);
  const approve = useServerFn(approveEmployeeSkill);
  const connection = useMutation({ mutationFn: () => probe() });
  const scenario = useMutation({
    mutationFn: (key: keyof typeof employeeScenarios) => run({ data: { scenario: key } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["ai-employee-handbooks"] }),
  });
  const approval = useMutation({
    mutationFn: (data: { scenario: keyof typeof employeeScenarios; runId: string }) =>
      approve({ data }),
    onSuccess: async (message) => {
      toast.success(message);
      await queryClient.invalidateQueries({ queryKey: ["ai-employee-handbooks"] });
    },
    onError: (error) => toast.error(error.message),
  });
  return (
    <section className="space-y-4 rounded-xl border bg-card p-5" aria-labelledby="employee-tests">
      <h2 id="employee-tests" className="text-lg font-semibold">
        OpenAI и учебные сценарии
      </h2>
      <Button variant="outline" disabled={connection.isPending} onClick={() => connection.mutate()}>
        {connection.isPending ? "Проверяю…" : "Проверить OpenAI с сервера"}
      </Button>
      {connection.data && (
        <p role="status" className="text-sm">
          {connection.data.message}
        </p>
      )}
      {connection.error && (
        <p role="alert" className="text-sm text-destructive">
          {connection.error.message}
        </p>
      )}
      <p className="text-sm text-muted-foreground">
        Используются вымышленные ситуации и сохранённые памятки. Клиенты не получат сообщения.
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {(Object.keys(employeeScenarios) as (keyof typeof employeeScenarios)[]).map((key) => {
          const sample = employeeScenarios[key];
          return (
            <Button
              key={key}
              variant="outline"
              className="h-auto justify-start whitespace-normal text-left"
              disabled={scenario.isPending}
              onClick={() => {
                approval.reset();
                scenario.mutate(key);
              }}
            >
              {sample.employee} · {sample.title}
            </Button>
          );
        })}
      </div>
      {scenario.isPending && (
        <p role="status" className="text-sm">
          Готовлю тестовый ответ…
        </p>
      )}
      {scenario.error && (
        <p role="alert" className="text-sm text-destructive">
          {scenario.error.message}
        </p>
      )}
      {scenario.data && (
        <div className="space-y-2 rounded-lg bg-muted p-4 text-sm">
          <p className="font-medium">{employeeScenarios[scenario.variables].title}</p>
          <p className="whitespace-pre-wrap">{scenario.data.draft}</p>
          <p className="text-muted-foreground">Критерий проверки. {scenario.data.expected}</p>
          <p>{scenario.data.rule}</p>
          <Button
            size="sm"
            variant="outline"
            disabled={approval.isPending || approval.isSuccess}
            onClick={() =>
              approval.mutate({ scenario: scenario.variables, runId: scenario.data.runId })
            }
          >
            {approval.isSuccess ? "Правило действует" : "Подтвердить правило после проверки"}
          </Button>
        </div>
      )}
    </section>
  );
}
