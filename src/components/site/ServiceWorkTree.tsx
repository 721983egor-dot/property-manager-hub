/** Visual: work branches converge — all reports go to the owner. */

const BRANCHES = [
  "Территория и сад",
  "Бассейн",
  "Инженерные системы",
  "Клининг",
  "Мелкий ремонт",
] as const;

export function ServiceWorkTree() {
  const n = BRANCHES.length;
  const top = 28;
  const step = 36;
  const joinX = 200;
  const joinY = top + ((n - 1) * step) / 2;

  return (
    <div className="w-full max-w-[460px] justify-self-center lg:justify-self-end">
      <figure
        className="overflow-hidden rounded-2xl border border-site-line bg-gradient-to-br from-site-navy-soft via-white to-[color-mix(in_oklch,var(--site-gold)_12%,white)] px-5 py-6 md:px-6 md:py-8"
        role="img"
        aria-label="Схема: работы по дому сходятся в отчёты собственнику"
      >
        <p className="text-center text-xs font-semibold uppercase tracking-[0.18em] text-site-gold">
          Дерево работ
        </p>

        <svg
          viewBox="0 0 340 220"
          className="mx-auto mt-5 h-auto w-full"
          aria-hidden
        >
          <defs>
            <linearGradient id="flowLine" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="var(--site-navy)" stopOpacity="0.35" />
              <stop offset="100%" stopColor="var(--site-gold)" stopOpacity="0.85" />
            </linearGradient>
          </defs>

          {BRANCHES.map((label, i) => {
            const y = top + i * step;
            const labelWidth = 118;
            return (
              <g key={label}>
                <rect
                  x="8"
                  y={y - 12}
                  width={labelWidth}
                  height="24"
                  rx="6"
                  fill="white"
                  stroke="var(--site-line)"
                />
                <text
                  x={8 + labelWidth / 2}
                  y={y + 4}
                  textAnchor="middle"
                  fill="var(--site-navy)"
                  style={{ fontSize: 10, fontWeight: 600 }}
                >
                  {label}
                </text>
                <path
                  d={`M ${8 + labelWidth + 4} ${y} C 168 ${y}, 178 ${joinY}, ${joinX} ${joinY}`}
                  fill="none"
                  stroke="url(#flowLine)"
                  strokeWidth="1.75"
                />
              </g>
            );
          })}

          {/* Trunk / funnel tip */}
          <circle cx={joinX} cy={joinY} r="5" fill="var(--site-gold)" />
          <path
            d={`M ${joinX + 5} ${joinY} L 268 ${joinY}`}
            fill="none"
            stroke="var(--site-gold)"
            strokeWidth="2.25"
          />

          {/* Owner destination */}
          <rect
            x="268"
            y={joinY - 28}
            width="64"
            height="56"
            rx="10"
            fill="var(--site-navy)"
          />
          <text
            x="300"
            y={joinY - 4}
            textAnchor="middle"
            fill="white"
            style={{ fontSize: 9, fontWeight: 600 }}
          >
            Все
          </text>
          <text
            x="300"
            y={joinY + 10}
            textAnchor="middle"
            fill="var(--site-gold)"
            style={{ fontSize: 9, fontWeight: 700 }}
          >
            отчёты
          </text>
          <text
            x="300"
            y={joinY + 24}
            textAnchor="middle"
            fill="white"
            style={{ fontSize: 8, fontWeight: 500 }}
            opacity="0.85"
          >
            собственнику
          </text>
        </svg>

        <figcaption className="mt-3 text-center text-sm leading-relaxed text-site-muted">
          Работы сходятся в единый поток — вам уходят все отчёты
          по дому и территории.
        </figcaption>
      </figure>
    </div>
  );
}
