import { createFileRoute } from "@tanstack/react-router";
import { WorkingSelectionPage } from "@/components/WorkingSelections";
export const Route = createFileRoute("/_authenticated/selections/$id")({
  head: () => ({ meta: [{ title: "Рабочая подборка — RM OS" }] }),
  component: SelectionRoute,
});
function SelectionRoute() {
  const { id } = Route.useParams();
  return <WorkingSelectionPage id={id} />;
}
