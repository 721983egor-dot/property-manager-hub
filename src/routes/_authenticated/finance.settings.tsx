import { createFileRoute } from "@tanstack/react-router";

import { AdminOnly } from "@/components/AdminOnly";
import { FinanceArticlesSettings } from "@/components/FinanceArticlesSettings";
import { FinanceTabs } from "@/components/FinanceTabs";

export const Route = createFileRoute("/_authenticated/finance/settings")({
  head: () => ({
    meta: [
      { title: "Финансы — настройки статей — RM OS" },
      {
        name: "description",
        content: "Статьи прихода и расхода и категории для отчётов.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => (
    <AdminOnly>
      <FinanceSettingsPage />
    </AdminOnly>
  ),
});

function FinanceSettingsPage() {
  return (
    <div className="mx-auto max-w-[1100px] px-4 py-6 sm:px-6 sm:py-8 lg:px-10">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Настройки финансов</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Свои статьи прихода и расхода, группы для отчётов, порядок мышкой.
        </p>
      </header>
      <FinanceTabs active="settings" />
      <FinanceArticlesSettings />
    </div>
  );
}
