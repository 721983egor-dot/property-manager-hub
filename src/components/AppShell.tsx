import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Building2,
  CalendarDays,
  ChevronDown,
  Inbox,
  LogOut,
  Megaphone,
  MessagesSquare,
  Menu,
  Send,
  Settings,

  Sparkles,
  Users,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { fetchThreads } from "@/lib/chat.functions";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { CrmNotifications } from "@/components/CrmNotifications";
import logoNavy from "@/assets/site/logo_navy.png";

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
  "/system",
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isCrm = CRM_PREFIXES.some((p) => pathname.startsWith(p));

  if (pathname === "/auth") return <>{children}</>;

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

const NAV_LINK_CLASS =
  "flex items-center gap-2.5 rounded-md px-3 py-2.5 text-sm font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent data-[status=active]:bg-sidebar-accent data-[status=active]:text-primary";

function CrmNav({ unread, onNavigate }: { unread: number; onNavigate?: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [settingsOpen, setSettingsOpen] = useState(pathname.startsWith("/system"));

  return (
    <nav className="px-3 py-2">
      <Link to="/objects" onClick={onNavigate} className={NAV_LINK_CLASS}>
        <Building2 className="size-4 shrink-0" />
        Объекты
      </Link>
      <Link to="/calendar" onClick={onNavigate} className={NAV_LINK_CLASS}>
        <CalendarDays className="size-4 shrink-0" />
        Календарь
      </Link>
      <Link to="/promo" onClick={onNavigate} className={NAV_LINK_CLASS}>
        <Megaphone className="size-4 shrink-0" />
        Публикация
      </Link>
      <Link to="/chats" onClick={onNavigate} className={NAV_LINK_CLASS}>
        <MessagesSquare className="size-4 shrink-0" />
        Чаты
        {unread > 0 && (
          <span className="ml-auto rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground">
            {unread}
          </span>
        )}
      </Link>
      <Link
        to="/assistant"
        onClick={onNavigate}
        className={`${NAV_LINK_CLASS} ai-glow-ring my-1 rounded-md`}
      >
        <Sparkles className="ai-glow size-4 shrink-0" />
        Ассистент
      </Link>

      <p className="mt-4 px-3 pb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        CRM
      </p>
      <Link to="/crm/clients" onClick={onNavigate} className={NAV_LINK_CLASS}>
        <Users className="size-4 shrink-0" />
        Клиенты
      </Link>
      <Link to="/crm/leads" onClick={onNavigate} className={NAV_LINK_CLASS}>
        <Inbox className="size-4 shrink-0" />
        Заявки
      </Link>

      <button
        type="button"
        onClick={() => setSettingsOpen((v) => !v)}
        className={`${NAV_LINK_CLASS} mt-4 w-full`}
        aria-expanded={settingsOpen}
      >
        <Settings className="size-4 shrink-0" />
        Настройки
        <ChevronDown
          className={`ml-auto size-4 transition-transform ${settingsOpen ? "rotate-180" : ""}`}
        />
      </button>
      {settingsOpen && (
        <div className="ml-3 border-l border-border pl-2">
          <Link to="/system/update" onClick={onNavigate} className={NAV_LINK_CLASS}>
            <Settings className="size-4 shrink-0" />
            Обновление системы
          </Link>
          <Link to="/system/telegram" onClick={onNavigate} className={NAV_LINK_CLASS}>
            <Send className="size-4 shrink-0" />
            Ассистент в Telegram
          </Link>
        </div>
      )}
    </nav>
  );
}


function SignOutButton() {
  return (
    <button
      type="button"
      onClick={() => {
        void supabase.auth.signOut().then(() => {
          window.location.href = "/auth";
        });
      }}
      className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent"
    >
      <LogOut className="size-4" />
      Выйти
    </button>
  );
}

function CrmShell({ children }: { children: ReactNode }) {
  const loadThreads = useServerFn(fetchThreads);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [menuOpen, setMenuOpen] = useState(false);
  const { data } = useQuery({
    queryKey: ["chat-threads"],
    queryFn: () => loadThreads({ data: undefined }),
    refetchInterval: 15000,
  });
  const unread = (data?.threads ?? []).reduce((sum, t) => sum + t.unread_count, 0);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  return (
    <div className="flex min-h-screen w-full bg-background text-foreground">
      <CrmNotifications />
      <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-sidebar lg:flex">
        <div className="flex h-16 items-center gap-2.5 px-5">
          <img src={logoNavy} alt="Резиденция&Море" className="h-7 w-auto shrink-0" />
        </div>
        <CrmNav unread={unread} />
        <div className="mt-auto p-3">
          <SignOutButton />
        </div>
      </aside>

      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="left" className="w-[17rem] bg-sidebar p-0 lg:hidden">
          <SheetTitle className="flex h-14 items-center gap-2.5 px-5 text-[15px] font-semibold">
            <img src={logoNavy} alt="Резиденция&Море" className="h-6 w-auto shrink-0" />
          </SheetTitle>

          <div className="flex h-[calc(100%-3.5rem)] flex-col overflow-y-auto">
            <CrmNav unread={unread} onNavigate={() => setMenuOpen(false)} />
            <div className="mt-auto p-3">
              <SignOutButton />
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-border bg-background/95 px-4 backdrop-blur lg:hidden">
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="Меню"
            className="grid size-9 shrink-0 place-items-center rounded-md border border-border"
          >
            <Menu className="size-5" />
          </button>
          <img src={logoNavy} alt="Резиденция&Море" className="h-6 w-auto shrink-0" />

          {unread > 0 && (
            <Link
              to="/chats"
              className="ml-auto flex items-center gap-1.5 rounded-full bg-primary px-2.5 py-1 text-[12px] font-semibold text-primary-foreground"
            >
              <MessagesSquare className="size-3.5" />
              {unread}
            </Link>
          )}
        </header>
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
