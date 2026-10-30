import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMarketingReport } from "@/lib/marketing-report.functions";
const kinds: Record<string, string> = {
  tenant: "Аренда",
  owner: "Собственники",
  service: "Обслуживание",
  general: "Общее",
};
export function MarketingReport() {
  const load = useServerFn(getMarketingReport);
  const { data, isLoading, error } = useQuery({
    queryKey: ["marketing-report", 30],
    queryFn: () => load({ data: { days: 30 } }),
  });
  return (
    <details className="mt-6 rounded-lg border border-border p-4" open>
      <summary className="cursor-pointer font-semibold">
        Источники обращений · последние 30 дней
      </summary>
      <p className="mt-2 text-xs text-muted-foreground">
        Последний значимый переход. Посетители — браузеры, не люди и не визиты Метрики. Клики
        контактов не считаются заявками. Формы и чаты могут принадлежать одному человеку.
      </p>
      {isLoading && <p className="mt-3 text-sm">Загрузка…</p>}
      {error && (
        <p className="mt-3 text-sm text-destructive">
          Аналитика недоступна. Проверьте применение обновления базы.
        </p>
      )}
      {data && (
        <>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  {[
                    "Источник",
                    "Кампания",
                    "Направление",
                    "Посетители",
                    "Просмотры",
                    "Клики контактов",
                    "Заявки",
                    "Новые чаты",
                  ].map((t) => (
                    <th key={t} className="p-2">
                      {t}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr
                    key={JSON.stringify([r.channel, r.campaign, r.kind])}
                    className="border-t border-border"
                  >
                    {[
                      r.channel,
                      r.campaign,
                      kinds[r.kind] || r.kind,
                      r.visitors,
                      r.views,
                      r.contactClicks,
                      r.leads,
                      r.chats,
                    ].map((v, i) => (
                      <td key={i} className="p-2">
                        {v}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!data.rows.length && (
            <p className="mt-3 text-sm text-muted-foreground">
              Событий с рекламной атрибуцией пока нет. Сбор начнётся после обновления рабочего
              сайта.
            </p>
          )}
          {data.unattributedLeads > 0 && (
            <p className="mt-2 text-xs text-muted-foreground">
              Заявок без записанного источника: {data.unattributedLeads}. Исторические источники
              автоматически не восстанавливаются.
            </p>
          )}
          {data.truncated && (
            <p className="mt-2 text-xs text-destructive">
              Большой объём данных: показана неполная выборка, до 10 000 записей каждого типа.
            </p>
          )}
        </>
      )}
    </details>
  );
}
