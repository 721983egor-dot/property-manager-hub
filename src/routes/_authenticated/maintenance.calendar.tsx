import { createFileRoute } from "@tanstack/react-router";

import { MaintenanceTasksPage } from "@/routes/_authenticated/maintenance.tasks";

export const Route = createFileRoute("/_authenticated/maintenance/calendar")({
  head: () => ({
    meta: [
      { title: "Календарь обслуживания — RM OS" },
      {
        name: "description",
        content: "Календарь задач обслуживания домов и вилл.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => <MaintenanceTasksPage defaultView="calendar" />,
});
