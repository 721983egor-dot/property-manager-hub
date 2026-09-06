import { createFileRoute } from "@tanstack/react-router";

import { SITE_EMAIL, SITE_PHONE_DISPLAY, SITE_PHONE_TEL, SITE_REQUISITES } from "@/lib/site";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Политика конфиденциальности — Резиденция & Море" },
      {
        name: "description",
        content:
          "Политика обработки персональных данных агентства «Резиденция & Море».",
      },
      { name: "robots", content: "noindex" },
    ],
    links: [{ rel: "canonical", href: "/privacy" }],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <div className="bg-white font-site py-16">
      <div className="mx-auto max-w-[820px] px-5 md:px-6">
        <h1 className="text-3xl font-bold text-site-navy md:text-4xl">
          Политика конфиденциальности
        </h1>
        <div className="mt-8 flex flex-col gap-6 text-sm leading-relaxed text-site-muted">
          <p>
            Настоящая политика описывает, как {SITE_REQUISITES} (далее — «Мы»)
            обрабатывает персональные данные посетителей сайта.
          </p>
          <section>
            <h2 className="mb-2 text-lg font-semibold text-site-navy">
              1. Какие данные мы собираем
            </h2>
            <p>
              Имя, номер телефона и текст обращения, которые вы указываете в
              формах на сайте, а также адрес электронной почты при переписке.
            </p>
          </section>
          <section>
            <h2 className="mb-2 text-lg font-semibold text-site-navy">
              2. Для чего мы используем данные
            </h2>
            <p>
              Для связи с вами по вашей заявке: подбор объектов аренды,
              консультации по управлению недвижимостью и сопровождение сделок.
              Мы не передаём данные третьим лицам, кроме случаев, предусмотренных
              законодательством РФ.
            </p>
          </section>
          <section>
            <h2 className="mb-2 text-lg font-semibold text-site-navy">
              3. Хранение и защита
            </h2>
            <p>
              Данные хранятся в защищённой базе данных и доступны только
              сотрудникам, обрабатывающим заявки.
            </p>
          </section>
          <section>
            <h2 className="mb-2 text-lg font-semibold text-site-navy">
              4. Ваши права
            </h2>
            <p>
              Вы можете запросить уточнение или удаление своих данных, написав
              нам на {SITE_EMAIL} или позвонив по телефону{" "}
              <a href={SITE_PHONE_TEL} className="text-site-navy underline">
                {SITE_PHONE_DISPLAY}
              </a>
              .
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
