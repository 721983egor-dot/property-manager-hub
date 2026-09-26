import { createFileRoute, redirect } from "@tanstack/react-router";

/** Календарь объединён с задачами — как в CRM. */
export const Route = createFileRoute("/_authenticated/maintenance/calendar")({
  beforeLoad: () => {
    throw redirect({ to: "/maintenance/tasks" });
  },
});
