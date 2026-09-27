/** Decorative square of dense service labels — visual only. */

const LABELS = [
  { text: "Мелкий ремонт", tone: "accent" },
  { text: "Чистка бассейна", tone: "strong" },
  { text: "Оплата КУ", tone: "accent" },
  { text: "Уборка", tone: "soft" },
  { text: "Сад и газон", tone: "mid" },
  { text: "Чистка ливневок", tone: "soft" },
  { text: "Показания счётчиков", tone: "mid" },
  { text: "Клининг", tone: "strong" },
  { text: "Контроль доступа", tone: "soft" },
  { text: "Приёмка объекта", tone: "mid" },
  { text: "Чеки и акты", tone: "soft" },
  { text: "Отчёты", tone: "accent" },
  { text: "Подрядчики", tone: "mid" },
  { text: "Сезонная подготовка", tone: "strong" },
  { text: "Инженерия", tone: "mid" },
  { text: "Кондиционеры", tone: "soft" },
  { text: "Территория", tone: "mid" },
  { text: "Мойка дорожек", tone: "soft" },
  { text: "Химия бассейна", tone: "mid" },
  { text: "Осмотры", tone: "accent" },
  { text: "Химчистка", tone: "soft" },
  { text: "Протечки", tone: "mid" },
  { text: "Зоны отдыха", tone: "soft" },
  { text: "Контроль состояния", tone: "strong" },
  { text: "Подготовка к приезду", tone: "mid" },
  { text: "График работ", tone: "soft" },
  { text: "Согласование смет", tone: "mid" },
  { text: "Фотофиксация", tone: "soft" },
] as const;

type Tone = (typeof LABELS)[number]["tone"];

function toneClass(tone: Tone): string {
  switch (tone) {
    case "accent":
      return "border-site-gold/35 bg-site-gold/15 text-site-navy shadow-[0_0_0_1px_color-mix(in_oklch,var(--site-gold)_20%,transparent)]";
    case "strong":
      return "border-site-navy/15 bg-white text-site-navy";
    case "mid":
      return "border-transparent bg-white/70 text-site-navy/85";
    default:
      return "border-transparent bg-white/40 text-site-muted";
  }
}

export function ServiceLabelsCube() {
  return (
    <div className="w-full max-w-[420px] justify-self-center lg:justify-self-end">
      <div
        className="service-labels-cube relative aspect-square w-full overflow-hidden rounded-2xl border border-site-line bg-gradient-to-br from-site-navy-soft via-white to-[color-mix(in_oklch,var(--site-gold)_14%,white)]"
        role="img"
        aria-label="Услуги обслуживания дома: ремонт, бассейн, клининг, инженерия, отчёты и другое"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_70%_20%,color-mix(in_oklch,var(--site-gold)_16%,transparent),transparent_45%)]"
        />
        <div
          aria-hidden
          className="relative flex h-full flex-wrap content-center items-center justify-center gap-1.5 p-4 sm:gap-2 sm:p-5 md:p-6"
        >
          {LABELS.map((item, i) => (
            <span
              key={item.text}
              className={`service-labels-cube__chip inline-flex max-w-full items-center rounded-md border px-2 py-1 text-[10px] font-semibold leading-none tracking-wide sm:text-[11px] ${toneClass(item.tone)}`}
              style={{ animationDelay: `${(i % 8) * 0.12}s` }}
            >
              {item.text}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
