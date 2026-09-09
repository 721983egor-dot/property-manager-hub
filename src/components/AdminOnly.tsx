import { useEffect, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";

import { useAccess } from "@/hooks/useAccess";

/** Показывает содержимое только администратору, менеджера уводит на список объектов. */
export function AdminOnly({ children }: { children: ReactNode }) {
  const { isAdmin, loading } = useAccess();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !isAdmin) void navigate({ to: "/objects", replace: true });
  }, [loading, isAdmin, navigate]);

  if (loading || !isAdmin) {
    return (
      <div className="grid place-items-center p-10">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  return <>{children}</>;
}
