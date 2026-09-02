import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/rent")({
  component: RentLayout,
});

function RentLayout() {
  return <Outlet />;
}
