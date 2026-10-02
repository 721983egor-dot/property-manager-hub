import { createServerFn } from "@tanstack/react-start";

import { requireUser } from "@/lib/auth-user-middleware";
import { countN11UnreadChats } from "@/lib/n11-chat.server";

/** Сводка непрочитанных чатов с сайта H11 для блока апарт-отеля. */
export const fetchN11ChatStats = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .handler(async () => countN11UnreadChats());
