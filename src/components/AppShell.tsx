import { Link, useRouterState } from "@tanstack/react-router";
import { Bookmark, Bot, Building2, CalendarDays, Inbox, Megaphone, MessagesSquare, Users } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { fetchThreads } from "@/lib/chat.functions";

import type { ReactNode } from "react";

import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteCartBar } from "@/components/site/SiteCartBar";
import { SiteChatWidget } from "@/components/site/SiteChatWidget";

/** Префиксы внутренних разделов RM OS — всё остальное рендерится как публичный сайт. */
const CRM_PREFIXES = [
  "/objects",
  "/calendar",
  "/crm",
  "/complexes",
  "/selections",
  "/promo",
  "/chats",
  "/assistant",
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isCrm = CRM_PREFIXES.some((p) => pathname.startsWith(p));

  if (!isCrm) {
    return (
      <div className="flex min-h-screen w-full flex-col bg-white text-site-navy">
        <SiteHeader />
        <div className="flex-1">{children}</div>
        <SiteFooter />
        <SiteCartBar />
        <SiteChatWidget />
      </div>
    );
  }

  return <CrmShell>{children}</CrmShell>;
}

function CrmShell({ children }: { children: ReactNode }) {
  const loadThreads = useServerFn(fetchThreads);
  const { data } = useQuery({
    queryKey: ["chat-threads"],
    queryFn: () => loadThreads({ data: undefined }),
    refetchInterval: 15000,
  });
  const unread = (data?.threads ?? []).reduce((sum, t) => sum + t.unread_count, 0);

  return (
    <div className="flex min-h-screen w-full bg-background text-foreground">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-sidebar lg:flex">
        <div className="flex h-16 items-center gap-2 px-6">
          <span className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Building2 className="size-4" />
          </span>
          <span className="text-[15px] font-semibold tracking-tight">RM OS</span>
        </div>
        <nav className="px-3 py-2">
          <Link
            to="/objects"
            className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent data-[status=active]:bg-sidebar-accent data-[status=active]:text-primary"
          >
            <Building2 className="size-4" />
            Объекты
          </Link>
          <Link
            to="/selections"
            className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent data-[status=active]:bg-sidebar-accent data-[status=active]:text-primary"
          >
            <Bookmark className="size-4" />
            Подборки
          </Link>
          <Link
            to="/calendar"
            className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent data-[status=active]:bg-sidebar-accent data-[status=active]:text-primary"
          >
            <CalendarDays className="size-4" />
            Календарь
          </Link>
          <Link
            to="/promo"
            className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent data-[status=active]:bg-sidebar-accent data-[status=active]:text-primary"
          >
            <Megaphone className="size-4" />
            Публикация
          </Link>

          <Link
            to="/chats"
            className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent data-[status=active]:bg-sidebar-accent data-[status=active]:text-primary"
          >
            <MessagesSquare className="size-4" />
            Чаты
            {unread > 0 && (
              <span className="ml-auto rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground">
                {unread}
              </span>
            )}
          </Link>

          <Link
            to="/assistant"
            className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent data-[status=active]:bg-sidebar-accent data-[status=active]:text-primary"
          >
            <Bot className="size-4" />
            Помощник
          </Link>

          <p className="mt-4 px-3 pb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            CRM
          </p>
          <Link
            to="/crm/clients"
            className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent data-[status=active]:bg-sidebar-accent data-[status=active]:text-primary"
          >
            <Users className="size-4" />
            Клиенты
          </Link>
          <Link
            to="/crm/leads"
            className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent data-[status=active]:bg-sidebar-accent data-[status=active]:text-primary"
          >
            <Inbox className="size-4" />
            Заявки
          </Link>
        </nav>

      </aside>
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
