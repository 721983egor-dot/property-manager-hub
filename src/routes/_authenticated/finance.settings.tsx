import { createFileRoute } from "@tanstack/react-router";

import { AdminOnly } from "@/components/AdminOnly";
import { FinanceClassificationsSettings } from "@/components/FinanceClassificationsSettings";
import { FinanceArticlesSettings } from "@/components/FinanceArticlesSettings";
import { FinanceAccountsSettings } from "@/components/FinanceAccountsSettings";
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

export function FinanceSettingsPage() {
  return (
    <div className="finance-ui finance-settings-page">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Настройки финансов</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Свои статьи прихода и расхода, группы для отчётов, порядок мышкой.
        </p>
      </header>
      <FinanceTabs active="settings" />
      <FinanceAccountsSettings />
      <section className="fa-panel mt-6">
        <h2>Статьи и категории</h2>
        <FinanceArticlesSettings />
      </section>
      <FinanceClassificationsSettings />
      <FinanceClassificationsSettings objects />
    </div>
  );
}
