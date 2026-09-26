import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/maintenance/")({
  beforeLoad: () => {
    throw redirect({ to: "/maintenance/objects" });
  },
});
