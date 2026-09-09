import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { getMyAccess } from "@/lib/staff.functions";

/** Роль текущего сотрудника: администратор видит всё, менеджер — ограниченный набор. */
export function useAccess() {
  const load = useServerFn(getMyAccess);
  const query = useQuery({
    queryKey: ["my-access"],
    queryFn: () => load(undefined as never),
    staleTime: 5 * 60 * 1000,
  });
  const role = query.data?.role;
  return {
    role,
    profile: query.data?.profile ?? null,
    isAdmin: role === "admin",
    isManager: role === "manager",
    loading: query.isLoading,
  };
}
