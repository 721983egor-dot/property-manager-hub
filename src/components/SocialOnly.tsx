import { useEffect, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";

import { useAccess } from "@/hooks/useAccess";

/** Раздел «Соцсети» — только пользователи с ролью social_owner. */
export function SocialOnly({ children }: { children: ReactNode }) {
  const { isSocialOwner, loading } = useAccess();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !isSocialOwner) void navigate({ to: "/objects", replace: true });
  }, [loading, isSocialOwner, navigate]);

  if (loading || !isSocialOwner) {
    return (
      <div className="grid place-items-center p-10">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  return <>{children}</>;
}
