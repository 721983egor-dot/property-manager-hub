import {
  attributionSchema,
  attributionChannel,
  type MarketingAttribution,
} from "@/lib/marketing-attribution";
export function MarketingAttributionDetails({
  value: raw,
}: {
  value?: MarketingAttribution | null | undefined;
}) {
  const parsed = attributionSchema.safeParse(raw);
  if (!parsed.success)
    return <span className="text-xs text-muted-foreground">Источник не записан</span>;
  const value = parsed.data;
  const fields = (t: MarketingAttribution["last_touch"]) => [
    ["Источник", t.utm_source],
    ["Канал", t.utm_medium],
    ["Кампания", t.utm_campaign],
    ["Объявление", t.utm_content],
    ["Фраза", t.utm_term],
    ["yclid", t.yclid],
    ["Страница входа", t.landing_page],
    ["Переход с", t.referrer],
    ["Дата", t.at],
  ];
  return (
    <details className="max-w-[340px] text-xs">
      <summary className="cursor-pointer font-medium">
        {attributionChannel(value)}
        {value.last_touch.utm_campaign ? ` · ${value.last_touch.utm_campaign}` : ""}
      </summary>
      <div className="mt-2 space-y-2 break-all">
        <p>
          Направление:{" "}
          {
            {
              tenant: "Арендатор",
              owner: "Собственник",
              service: "Обслуживание",
              general: "Общее",
            }[value.kind]
          }
        </p>
        {(
          [
            ["Первый переход", value.first_touch],
            ["Последний значимый переход", value.last_touch],
          ] as const
        ).map(([title, touch]) => (
          <div key={title}>
            <strong>{title}</strong>
            {fields(touch)
              .filter(([, v]) => v)
              .map(([label, v]) => (
                <p key={label}>
                  {label}: {v}
                </p>
              ))}
          </div>
        ))}
        <p>Страница обращения: {value.page}</p>
        <p>Метрика ClientID: {value.metrika_client_id || "не получен"}</p>
      </div>
    </details>
  );
}
