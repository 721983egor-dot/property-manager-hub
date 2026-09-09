import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import logoNavy from "@/assets/site/logo_navy.png";


export const Route = createFileRoute("/auth")({
  ssr: false,
  component: AuthPage,
  head: () => ({
    meta: [
      { title: "Вход в RM OS — Residence More" },
      {
        name: "description",
        content: "Вход для сотрудников Residence More в систему управления арендой RM OS.",
      },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Вход в RM OS" },
      { property: "og:description", content: "Служебный вход в систему управления арендой." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function AuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setLoading(false);
    if (signInError) {
      setError("Не удалось войти. Проверьте почту и пароль.");
      return;
    }
    void navigate({ to: "/objects" });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-sm"
      >
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <img src={logoNavy} alt="Резиденция&Море" className="h-12 w-auto" />
          <span className="text-base font-semibold tracking-tight">RM OS</span>
        </div>

        <h1 className="mb-1 text-xl font-semibold">Вход для сотрудников</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          Раздел доступен только вам и менеджерам.
        </p>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">Электронная почта</Label>
            <Input
              id="email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Пароль</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
        </div>

        {error ? <p className="mt-4 text-sm text-destructive">{error}</p> : null}

        <Button type="submit" className="mt-6 w-full" disabled={loading}>
          {loading ? <Loader2 className="size-4 animate-spin" /> : null}
          Войти
        </Button>
      </form>
    </div>
  );
}
