import { createFileRoute } from "@tanstack/react-router";
import { WorkingSelectionsList } from "@/components/WorkingSelections";
export const Route = createFileRoute("/_authenticated/selections/")({
  head: () => ({ meta: [{ title: "Подборки — RM OS" }] }),
  component: WorkingSelectionsList,
});
