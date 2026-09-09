import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Plus, Trash2, UserRound } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAccess } from "@/hooks/useAccess";
import { uploadPhotos } from "@/lib/photo-upload";
import { signedUrls } from "@/lib/properties";
import {
  createStaff,
  deleteStaff,
  listStaff,
  saveStaffProfile,
  setStaffPassword,
  setStaffRole,
  type StaffMember,
  type StaffRole,
} from "@/lib/staff.functions";

export const Route = createFileRoute("/_authenticated/system/staff")({
  head: () => ({
    meta: [
      { title: "Сотрудники — RM OS" },
      {
        name: "description",
        content: "Сотрудники Residence More: карточки, телефоны и права доступа в RM OS.",
      },
      { property: "og:title", content: "Сотрудники — RM OS" },
      { property: "og:description", content: "Управление доступом сотрудников в RM OS." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: StaffPage,
});

const ROLE_LABEL: Record<StaffRole, string> = {
  admin: "Администратор",
  manager: "Менеджер",
};

function StaffPage() {
  const { isAdmin, profile, loading } = useAccess();
  const load = useServerFn(listStaff);
  const [editing, setEditing] = useState<StaffMember | null>(null);
  const [creating, setCreating] = useState(false);

  const staffQuery = useQuery({
    queryKey: ["staff"],
    queryFn: () => load(undefined as never),
    enabled: isAdmin,
  });

  const staff = useMemo<StaffMember[]>(() => {
    if (isAdmin) return staffQuery.data?.staff ?? [];
    return profile ? [profile] : [];
  }, [isAdmin, staffQuery.data, profile]);

  const photoUrls = usePhotoUrls(staff.map((s) => s.photo_path));

  if (loading) {
    return (
      <div className="grid place-items-center p-10">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold sm:text-2xl">Сотрудники</h1>
          <p className="text-sm text-muted-foreground">
            {isAdmin
              ? "Карточки сотрудников и права доступа: администратор видит всё, менеджер — объекты, подборки и календарь."
              : "Ваша карточка сотрудника."}
          </p>
        </div>
        {isAdmin ? (
          <Button onClick={() => setCreating(true)}>
            <Plus className="mr-1.5 size-4" />
            Добавить сотрудника
          </Button>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {staff.map((member) => (
          <Card key={member.id}>
            <CardHeader className="flex flex-row items-center gap-3 space-y-0">
              <div className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-full bg-muted">
                {photoUrls[member.photo_path] ? (
                  <img
                    src={photoUrls[member.photo_path]}
                    alt={member.full_name || member.email}
                    className="size-full object-cover"
                  />
                ) : (
                  <UserRound className="size-6 text-muted-foreground" />
                )}
              </div>
              <div className="min-w-0">
                <CardTitle className="truncate text-base">
                  {member.full_name || "Без имени"}
                </CardTitle>
                <p className="truncate text-xs text-muted-foreground">{member.email}</p>
                <p className="text-xs font-medium text-primary">{ROLE_LABEL[member.role]}</p>
              </div>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <p>
                <span className="text-muted-foreground">Телефон: </span>
                {member.phone || "—"}
              </p>
              <p>
                <span className="text-muted-foreground">Дата рождения: </span>
                {member.birth_date ? formatDate(member.birth_date) : "—"}
              </p>
              <div className="flex gap-2 pt-2">
                <Button variant="outline" size="sm" onClick={() => setEditing(member)}>
                  Изменить
                </Button>
                {isAdmin ? <DeleteStaffButton member={member} /> : null}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <StaffDialog
        open={Boolean(editing)}
        member={editing}
        canManage={isAdmin}
        onOpenChange={(open) => !open && setEditing(null)}
      />
      <CreateStaffDialog open={creating} onOpenChange={setCreating} />
    </div>
  );
}

function formatDate(value: string) {
  const [y, m, d] = value.split("-");
  return `${d}.${m}.${y}`;
}

function usePhotoUrls(paths: string[]) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const key = paths.filter(Boolean).sort().join(",");
  useEffect(() => {
    const list = key ? key.split(",") : [];
    if (!list.length) {
      setUrls({});
      return;
    }
    void signedUrls(list).then(setUrls).catch(() => setUrls({}));
  }, [key]);
  return urls;
}

function DeleteStaffButton({ member }: { member: StaffMember }) {
  const queryClient = useQueryClient();
  const remove = useServerFn(deleteStaff);
  const mutation = useMutation({
    mutationFn: () => remove({ data: { id: member.id } }),
    onSuccess: () => {
      toast.success("Сотрудник удалён");
      void queryClient.invalidateQueries({ queryKey: ["staff"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={mutation.isPending}
      onClick={() => {
        if (!confirm(`Удалить сотрудника «${member.full_name || member.email}»?`)) return;
        mutation.mutate();
      }}
    >
      <Trash2 className="mr-1.5 size-4" />
      Удалить
    </Button>
  );
}

function PhotoField({
  path,
  onChange,
}: {
  path: string;
  onChange: (path: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const urls = usePhotoUrls([path]);

  return (
    <div className="flex items-center gap-3">
      <div className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-full bg-muted">
        {urls[path] ? (
          <img src={urls[path]} alt="Фото сотрудника" className="size-full object-cover" />
        ) : (
          <UserRound className="size-6 text-muted-foreground" />
        )}
      </div>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          {busy ? "Загрузка..." : "Загрузить фото"}
        </Button>
        {path ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange("")}>
            Убрать
          </Button>
        ) : null}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={async (e) => {
          const files = e.target.files;
          if (!files?.length) return;
          setBusy(true);
          const { uploaded, failures } = await uploadPhotos(files);
          setBusy(false);
          e.target.value = "";
          if (uploaded[0]) onChange(uploaded[0].path);
          if (failures[0]) toast.error(`${failures[0].name}: ${failures[0].reason}`);
        }}
      />
    </div>
  );
}

function StaffDialog({
  open,
  member,
  canManage,
  onOpenChange,
}: {
  open: boolean;
  member: StaffMember | null;
  canManage: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const save = useServerFn(saveStaffProfile);
  const changeRole = useServerFn(setStaffRole);
  const changePassword = useServerFn(setStaffPassword);

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [photoPath, setPhotoPath] = useState("");
  const [role, setRole] = useState<StaffRole>("manager");
  const [password, setPassword] = useState("");

  useEffect(() => {
    if (!open || !member) return;
    setFullName(member.full_name);
    setPhone(member.phone);
    setBirthDate(member.birth_date ?? "");
    setPhotoPath(member.photo_path);
    setRole(member.role);
    setPassword("");
  }, [open, member]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!member) return;
      await save({
        data: {
          id: member.id,
          full_name: fullName,
          phone,
          birth_date: birthDate || null,
          photo_path: photoPath,
        },
      });
      if (canManage && role !== member.role) await changeRole({ data: { id: member.id, role } });
      if (canManage && password) await changePassword({ data: { id: member.id, password } });
    },
    onSuccess: () => {
      toast.success("Карточка сохранена");
      void queryClient.invalidateQueries({ queryKey: ["staff"] });
      void queryClient.invalidateQueries({ queryKey: ["my-access"] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Карточка сотрудника</DialogTitle>
          <DialogDescription>{member?.email}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <PhotoField path={photoPath} onChange={setPhotoPath} />
          <div>
            <Label>ФИО</Label>
            <Input
              className="mt-1.5"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Иванов Иван Иванович"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>Телефон</Label>
              <Input
                className="mt-1.5"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+7 900 000-00-00"
              />
            </div>
            <div>
              <Label>Дата рождения</Label>
              <Input
                type="date"
                className="mt-1.5"
                value={birthDate}
                onChange={(e) => setBirthDate(e.target.value)}
              />
            </div>
          </div>
          {canManage ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Доступ</Label>
                <Select value={role} onValueChange={(v) => setRole(v as StaffRole)}>
                  <SelectTrigger className="mt-1.5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Администратор</SelectItem>
                    <SelectItem value="manager">Менеджер</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Новый пароль</Label>
                <Input
                  className="mt-1.5"
                  type="text"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Оставьте пустым"
                />
              </div>
            </div>
          ) : null}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? "Сохранение..." : "Сохранить"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CreateStaffDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const create = useServerFn(createStaff);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [photoPath, setPhotoPath] = useState("");
  const [role, setRole] = useState<StaffRole>("manager");

  useEffect(() => {
    if (open) return;
    setEmail("");
    setPassword("");
    setFullName("");
    setPhone("");
    setBirthDate("");
    setPhotoPath("");
    setRole("manager");
  }, [open]);

  const mutation = useMutation({
    mutationFn: () =>
      create({
        data: {
          email,
          password,
          role,
          full_name: fullName,
          phone,
          birth_date: birthDate || null,
          photo_path: photoPath,
        },
      }),
    onSuccess: () => {
      toast.success("Сотрудник добавлен");
      void queryClient.invalidateQueries({ queryKey: ["staff"] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Новый сотрудник</DialogTitle>
          <DialogDescription>
            Сотрудник войдёт в RM OS по этой почте и паролю. Пароль он сможет сменить у вас.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <PhotoField path={photoPath} onChange={setPhotoPath} />
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>Почта для входа</Label>
              <Input
                className="mt-1.5"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="manager@residence-more.ru"
              />
            </div>
            <div>
              <Label>Пароль</Label>
              <Input
                className="mt-1.5"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="минимум 8 символов"
              />
            </div>
          </div>
          <div>
            <Label>ФИО</Label>
            <Input
              className="mt-1.5"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>Телефон</Label>
              <Input className="mt-1.5" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div>
              <Label>Дата рождения</Label>
              <Input
                type="date"
                className="mt-1.5"
                value={birthDate}
                onChange={(e) => setBirthDate(e.target.value)}
              />
            </div>
          </div>
          <div>
            <Label>Доступ</Label>
            <Select value={role} onValueChange={(v) => setRole(v as StaffRole)}>
              <SelectTrigger className="mt-1.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="manager">Менеджер</SelectItem>
                <SelectItem value="admin">Администратор</SelectItem>
              </SelectContent>
            </Select>
            <p className="mt-1.5 text-xs text-muted-foreground">
              Менеджер видит объекты, подборки, календарь и клиентов, может добавлять брони, но не
              редактирует и не удаляет данные.
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? "Создание..." : "Добавить"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
