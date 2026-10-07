import { createFileRoute } from "@tanstack/react-router";
import { AdminOnly } from "@/components/AdminOnly";
import { FinanceCalendarPage } from "@/components/FinanceCalendarPage";

export const Route = createFileRoute("/_authenticated/finance/calendar")({
  head: () => ({
    links: [
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=PT+Sans:wght@400;700&display=swap",
      },
    ],
    meta: [
      { title: "Финансы — платёжный календарь — RM OS" },
      {
        name: "description",
        content: "Платёжный календарь: приходы, расходы и прогноз остатка по дням.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => (
    <AdminOnly>
      <FinanceCalendarPage />
    </AdminOnly>
  ),
});
