/** CSS mock of owner personal cabinet on a tablet — checklist + calendar. */

const DONE = [
  { title: "Чистка бассейна", date: "12 сен" },
  { title: "Показания счётчиков", date: "10 сен" },
  { title: "Клининг дома", date: "8 сен" },
];

const PLANNED = [
  { title: "Обработка территории", date: "28 сен" },
  { title: "Проверка инженерии", date: "2 окт" },
];

const CAL_DAYS = [
  { d: 22, tone: "muted" },
  { d: 23, tone: "muted" },
  { d: 24, tone: "muted" },
  { d: 25, tone: "done" },
  { d: 26, tone: "muted" },
  { d: 27, tone: "muted" },
  { d: 28, tone: "planned" },
  { d: 29, tone: "muted" },
  { d: 30, tone: "muted" },
  { d: 1, tone: "muted" },
  { d: 2, tone: "planned" },
  { d: 3, tone: "muted" },
  { d: 4, tone: "muted" },
  { d: 5, tone: "muted" },
] as const;

function dayClass(tone: (typeof CAL_DAYS)[number]["tone"]) {
  if (tone === "done") {
    return "bg-site-gold/25 text-site-navy ring-1 ring-site-gold/50";
  }
  if (tone === "planned") {
    return "bg-site-navy text-white";
  }
  return "bg-white/70 text-site-navy/55";
}

export function OwnerCabinetMock() {
  return (
    <div className="w-full max-w-[420px] justify-self-center lg:justify-self-end">
      <p className="mb-4 text-center text-xs font-semibold uppercase tracking-[0.18em] text-site-gold">
        Личный кабинет для собственника
      </p>

      {/* Tablet frame */}
      <div
        className="relative mx-auto rounded-[1.75rem] border-[10px] border-site-navy bg-site-navy p-1.5 shadow-[0_24px_60px_-28px_rgba(15,28,46,0.55)]"
        aria-hidden={false}
        role="img"
        aria-label="Макет личного кабинета собственника: чеклист работ и календарь"
      >
        {/* Camera notch */}
        <div className="absolute left-1/2 top-2 z-10 h-1.5 w-10 -translate-x-1/2 rounded-full bg-white/25" />

        <div className="overflow-hidden rounded-[1.15rem] bg-site-navy-soft">
          {/* App chrome */}
          <div className="flex items-center justify-between border-b border-site-line/60 bg-site-navy px-4 py-3 text-white">
            <div>
              <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-site-gold">
                Резиденция&Море
              </p>
              <p className="mt-0.5 text-sm font-semibold leading-tight">
                Кабинет собственника
              </p>
            </div>
            <div className="rounded-md bg-white/10 px-2 py-1 text-[10px] font-medium text-white/85">
              Сентябрь
            </div>
          </div>

          <div className="grid gap-3 p-3 sm:grid-cols-[1.15fr_0.95fr] sm:gap-3 sm:p-3.5">
            {/* Checklist */}
            <div className="rounded-xl border border-site-line/80 bg-white p-3 shadow-sm">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-site-navy/55">
                Работы
              </p>
              <ul className="mt-2.5 space-y-2">
                {DONE.map((item) => (
                  <li key={item.title} className="flex items-start gap-2">
                    <span className="mt-0.5 inline-flex size-4 shrink-0 items-center justify-center rounded-full bg-site-gold/20 text-[10px] font-bold text-site-gold">
                      ✓
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[12px] font-medium leading-snug text-site-navy">
                        {item.title}
                      </span>
                      <span className="text-[10px] text-site-muted">
                        Выполнено · {item.date}
                      </span>
                    </span>
                  </li>
                ))}
                {PLANNED.map((item) => (
                  <li key={item.title} className="flex items-start gap-2">
                    <span className="mt-0.5 inline-flex size-4 shrink-0 items-center justify-center rounded-full border border-site-navy/25 bg-site-navy-soft text-[9px] text-site-navy/60">
                      ○
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[12px] font-medium leading-snug text-site-navy">
                        {item.title}
                      </span>
                      <span className="text-[10px] text-site-muted">
                        Запланировано · {item.date}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Mini calendar */}
            <div className="rounded-xl border border-site-line/80 bg-white p-3 shadow-sm">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-site-navy/55">
                Календарь
              </p>
              <div className="mt-2 grid grid-cols-7 gap-1 text-center text-[8px] font-medium uppercase tracking-wide text-site-muted">
                {["пн", "вт", "ср", "чт", "пт", "сб", "вс"].map((w) => (
                  <span key={w}>{w}</span>
                ))}
              </div>
              <div className="mt-1.5 grid grid-cols-7 gap-1">
                {CAL_DAYS.map((cell, i) => (
                  <span
                    key={`${cell.d}-${i}`}
                    className={`flex aspect-square items-center justify-center rounded-md text-[10px] font-semibold tabular-nums ${dayClass(cell.tone)}`}
                  >
                    {cell.d}
                  </span>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-site-muted">
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-2 rounded-sm bg-site-gold/40 ring-1 ring-site-gold/50" />
                  Выполнено
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-2 rounded-sm bg-site-navy" />
                  План
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
