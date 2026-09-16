import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { ensureStaffUser, startStaffSessionKeeper } from "@/integrations/supabase/staff-session";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    startStaffSessionKeeper();
    const user = await ensureStaffUser();
    if (!user) throw redirect({ to: "/auth" });
    return { user };
  },
  component: () => <Outlet />,
});
