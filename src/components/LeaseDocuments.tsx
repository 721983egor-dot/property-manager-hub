import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, Upload, Download, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { useAccess } from "@/hooks/useAccess";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { leaseRequest, downloadLease } from "@/lib/lease/client";
import {
  blankIdentity,
  identityLabels,
  identityMissing,
  renderLease,
  money,
  ruDate,
  type Identity,
  type LeaseInput,
  type LeaseTemplate,
  type LeaseSnapshot,
} from "@/lib/lease/model";
import "./lease-documents.css";
type ClientChoice = { id: string; full_name: string; party_kind?: string };
type BookingChoice = {
  id: string;
  start_date: string;
  end_date: string;
  client_id: string;
  clients: { full_name: string } | null;
};
type DocumentChoice = {
  id: string;
  version: number;
  created_at: string;
  status: string;
  files: Record<string, boolean>;
};
type Scope = {
  bookingId?: string | undefined;
  dealId?: string | undefined;
  propertyId?: string | undefined;
  clientId?: string;
};
export function IdentityFields({
  value,
  onChange,
}: {
  value: Identity;
  onChange: (v: Identity) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(identityMissing(value).length > 0);
  if (!expanded)
    return (
      <div className="lease-identity-summary">
        <div>
          <b>{value.full_name}</b>
          <p className="lease-note">
            Паспорт: •••• ••{value.number.slice(-4)} · Регистрация:{" "}
            {value.registration ? "заполнена" : "не заполнена"}
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => setExpanded(true)}>
          Проверить / изменить
        </Button>
      </div>
    );
  return (
    <div className="space-y-3">
      {!identityMissing(value).length && (
        <Button size="sm" variant="ghost" onClick={() => setExpanded(false)}>
          Свернуть паспортные данные
        </Button>
      )}
      <div className="lease-fields">
        {Object.entries(identityLabels).map(([key, label]) => (
          <label
            key={key}
            className={
              ["registration", "issued_by", "birth_place"].includes(key) ? "lease-wide" : ""
            }
          >
            <span>{label}</span>
            <Input
              aria-label={label}
              type={key.endsWith("_date") ? "date" : "text"}
              value={value[key as keyof Identity]}
              autoComplete="off"
              onChange={(e) => onChange({ ...value, [key]: e.target.value })}
            />
          </label>
        ))}
      </div>
      <label className="lease-upload">
        <Upload size={15} />
        {busy ? "Распознавание…" : "Загрузить страницу паспорта (JPG, PNG)"}
        <input
          type="file"
          hidden
          accept="image/jpeg,image/png,image/webp"
          disabled={busy}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            setBusy(true);
            try {
              const f = new FormData();
              f.set("action", "passport");
              f.set("file", file);
              const r = await leaseRequest(f);
              const recognized = Object.fromEntries(
                Object.entries(r.identity).filter(([, v]) => typeof v === "string" && v.trim()),
              );
              onChange({ ...value, ...recognized });
              toast.info("Распознано. Проверьте и дополните поля перед сохранением");
            } catch (e) {
              toast.error((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        />
      </label>
      <p className="lease-note">
        Распознавание на сервере РМ ОС. Фото удаляется после обработки; сохраняются проверенные
        поля. Оставшиеся поля: {identityMissing(value).join(", ") || "заполнены"}.
      </p>
    </div>
  );
}
export function ClientIdentityButton({ clientId }: { clientId: string }) {
  const { isAdmin } = useAccess();
  const [open, setOpen] = useState(false),
    [value, setValue] = useState(blankIdentity()),
    [busy, setBusy] = useState(false),
    [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let alive = true;
    setLoaded(false);
    setValue(blankIdentity());
    if (open && isAdmin)
      leaseRequest({ action: "identity", clientId })
        .then((v) => {
          if (alive) {
            setValue(v);
            setLoaded(true);
          }
        })
        .catch((e) => {
          if (alive) toast.error(e.message);
        });
    return () => {
      alive = false;
    };
  }, [open, clientId, isAdmin]);
  if (!isAdmin) return null;
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <FileText className="mr-2 h-4 w-4" />
        Паспортные данные
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Паспортные данные клиента</DialogTitle>
            <DialogDescription>
              Закрытый раздел администратора. Эти данные подставляются в договоры.
            </DialogDescription>
          </DialogHeader>
          <IdentityFields value={value} onChange={setValue} />
          <Button
            disabled={busy || !loaded}
            onClick={async () => {
              setBusy(true);
              try {
                await leaseRequest({ action: "saveIdentity", clientId, identity: value });
                toast.success("Данные клиента сохранены");
                setOpen(false);
              } catch (e) {
                toast.error((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Сохранить проверенные данные
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
export function LeaseDocumentsButton(scope: Scope) {
  const { isAdmin } = useAccess();
  const [open, setOpen] = useState(false);
  if (!isAdmin) return null;
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <FileText className="mr-2 h-4 w-4" />
        Договор аренды
      </Button>
      {open && <LeaseWorkspace {...scope} open={open} onOpenChange={setOpen} />}
    </>
  );
}
function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <label>
      <span>{label}</span>
      <Input
        aria-label={label}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
export function LeaseWorkspace({
  open,
  onOpenChange,
  ...scope
}: Scope & { open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const [bookingId, setBookingId] = useState(scope.bookingId || ""),
    [tab, setTab] = useState("form"),
    [busy, setBusy] = useState(false),
    [input, setInput] = useState<LeaseInput | null>(null),
    [templateEdit, setTemplateEdit] = useState<LeaseTemplate | null>(null);
  const initialized = useRef("");
  const ownerRequest = useRef(0);
  const context = useQuery({
    queryKey: ["lease-context", scope, bookingId],
    queryFn: () =>
      leaseRequest({ action: "context", ...scope, ...(bookingId ? { bookingId } : {}) }),
    enabled: open,
  });
  const c = context.data;
  const template = c?.templates?.find((t: LeaseTemplate) => t.id === input?.templateId) as
    LeaseTemplate | undefined;
  useEffect(() => {
    if (!c?.booking || initialized.current === c.booking.id) return;
    initialized.current = c.booking.id;
    ownerRequest.current++;
    const saved = c.draft || {};
    setInput({
      bookingId: c.booking.id,
      templateId: c.templates[0]?.id || "",
      templateVersion: c.templates[0]?.revision || 1,
      dealId: c.deal?.id || scope.dealId || null,
      tenant: {
        ...blankIdentity(),
        ...c.tenant,
        full_name:
          c.tenant.full_name ||
          c.clients.find((p: { id: string }) => p.id === c.clientId)?.full_name ||
          "",
      },
      ownerClientId: null,
      owner: blankIdentity(),
      signerMode: c.property.service_type === "management" ? "company" : "owner",
      company: c.profile || { name: "", inn: "", ogrnip: "", address: "", phone: "" },
      representative: "",
      authority: "",
      pets: false,
      petKind: "",
      petCount: 1,
      extra: "",
      residents: "",
      inventory: "",
      includeAct: true,
      includeInventory: false,
      passportDraftId: null,
      ...saved,
      bookingVersion: c.booking.updated_at,
      verified: false,
      requestId: crypto.randomUUID(),
    });
  }, [c, scope.dealId]);
  const patch = (p: Partial<LeaseInput>) =>
    setInput((v) => (v ? { ...v, ...p, verified: false } : v));
  const perform = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  let preview = "";
  try {
    if (input && template && c?.booking && c?.property)
      preview = renderLease({
        input,
        template,
        booking: c.booking,
        property: { ...c.property, title: c.property.internal_name || c.property.title },
        createdOn: new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Moscow" }),
        number: "ПРЕДПРОСМОТР",
      } as LeaseSnapshot)
        .map((s) => s.text)
        .join("\n\n────────────\n\n");
  } catch (e) {
    preview = (e as Error).message;
  }
  const selectTemplate = (id: string) => {
    const t = c.templates.find((t: LeaseTemplate) => t.id === id);
    patch({ templateId: id, templateVersion: t.revision });
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="lease-dialog">
        <DialogHeader>
          <DialogTitle>Подготовить договор</DialogTitle>
          <DialogDescription>
            {c?.property
              ? (c.property.internal_name || c.property.title) +
                " · " +
                (c.booking
                  ? ruDate(c.booking.start_date) + " — " + ruDate(c.booking.end_date)
                  : "Выберите бронь")
              : "Договор, акт передачи и опись имущества"}
          </DialogDescription>
        </DialogHeader>
        <div className="lease-tabs">
          {[
            ["form", "Условия и данные"],
            ["documents", "Документы и версии"],
            ["template", "Шаблон договора"],
          ].map(([id, label]) => (
            <button className={tab === id ? "active" : ""} key={id} onClick={() => setTab(id!)}>
              {label}
            </button>
          ))}
        </div>
        {context.isPending ? (
          <p>Загрузка данных…</p>
        ) : context.isError ? (
          <p className="text-destructive">{context.error.message}</p>
        ) : (
          <>
            <label className="lease-booking-select">
              <span>Бронь объекта</span>
              <select
                value={bookingId || c.booking?.id || ""}
                onChange={(e) => {
                  initialized.current = "";
                  setBookingId(e.target.value);
                  setInput(null);
                }}
              >
                <option value="">Выберите бронь</option>
                {c.bookings.map((b: BookingChoice) => (
                  <option key={b.id} value={b.id}>
                    {ruDate(b.start_date)} — {ruDate(b.end_date)} ·{" "}
                    {b.clients?.full_name || "Клиент"}
                  </option>
                ))}
              </select>
            </label>
            {!c.booking && (
              <div className="lease-panel">
                <b>Сначала оформите бронь</b>
                <p className="lease-note">
                  Укажите клиента, сроки и стоимость через «Оформить аренду» в сделке или создайте
                  бронь в календаре объекта. Затем выберите её здесь — условия и финансовый график
                  будут связаны с договором.
                </p>
              </div>
            )}
            {tab === "form" && input && (
              <div className="lease-columns">
                <div>
                  <section className="lease-panel">
                    <h3>01 · Стороны договора</h3>
                    <h4>Арендатор</h4>
                    <IdentityFields value={input.tenant} onChange={(tenant) => patch({ tenant })} />
                    <hr />
                    <div className="lease-fields">
                      <label>
                        <span>Кто подписывает</span>
                        <select
                          value={input.signerMode}
                          onChange={(e) =>
                            patch({ signerMode: e.target.value as LeaseInput["signerMode"] })
                          }
                        >
                          <option value="company">От моего ИП</option>
                          <option value="representative">По доверенности собственника</option>
                          {c.property.service_type !== "management" && (
                            <option value="owner">Сам собственник</option>
                          )}
                        </select>
                      </label>
                      <label>
                        <span>Шаблон договора</span>
                        <select
                          value={input.templateId}
                          onChange={(e) => selectTemplate(e.target.value)}
                        >
                          {c.templates.map((t: LeaseTemplate) => (
                            <option key={t.id} value={t.id}>
                              {t.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <p className="lease-note">
                      Тип объекта:{" "}
                      {c.property.service_type === "management"
                        ? "Под управлением"
                        : "Только комиссия"}
                      . Подписанта можно изменить для этого договора.
                    </p>
                    {input.signerMode !== "company" && (
                      <>
                        <label className="block">
                          <Label>Собственник</Label>
                          <select
                            value={input.ownerClientId || ""}
                            onChange={async (e) => {
                              const id = e.target.value;
                              const sequence = ++ownerRequest.current;
                              patch({ ownerClientId: id || null, owner: blankIdentity() });
                              if (id)
                                try {
                                  const owner = await leaseRequest({
                                    action: "identity",
                                    clientId: id,
                                  });
                                  if (sequence !== ownerRequest.current) return;
                                  patch({
                                    owner: {
                                      ...owner,
                                      full_name:
                                        owner.full_name ||
                                        c.clients.find((p: ClientChoice) => p.id === id)
                                          ?.full_name ||
                                        "",
                                    },
                                  });
                                } catch (e) {
                                  toast.error((e as Error).message);
                                }
                            }}
                          >
                            <option value="">Выберите клиента-собственника</option>
                            {c.clients
                              .filter((p: ClientChoice) => p.id !== c.clientId)
                              .map((p: ClientChoice) => (
                                <option key={p.id} value={p.id}>
                                  {p.full_name}
                                </option>
                              ))}
                          </select>
                        </label>
                        <h4>Данные собственника</h4>
                        <IdentityFields
                          value={input.owner}
                          onChange={(owner) => patch({ owner })}
                        />
                      </>
                    )}
                    {input.signerMode === "representative" && (
                      <div className="lease-fields">
                        <Field
                          label="ФИО и данные представителя"
                          value={input.representative}
                          onChange={(representative) => patch({ representative })}
                        />
                        <Field
                          label="Доверенность: номер, дата, кем выдана"
                          value={input.authority}
                          onChange={(authority) => patch({ authority })}
                        />
                      </div>
                    )}
                    {input.signerMode === "company" && (
                      <>
                        <h4>Реквизиты ИП</h4>
                        <div className="lease-fields">
                          {[
                            ["name", "Полное наименование ИП"],
                            ["inn", "ИНН"],
                            ["ogrnip", "ОГРНИП"],
                            ["address", "Адрес ИП"],
                            ["phone", "Телефон"],
                          ].map(([key, label]) => (
                            <Field
                              key={key}
                              label={label!}
                              value={input.company[key as keyof LeaseInput["company"]]}
                              onChange={(v) => patch({ company: { ...input.company, [key!]: v } })}
                            />
                          ))}
                          <Field
                            label="Основание предоставления объекта"
                            value={input.authority}
                            onChange={(authority) => patch({ authority })}
                          />
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="mt-3"
                          disabled={busy}
                          onClick={() =>
                            perform(async () => {
                              await leaseRequest({ action: "saveProfile", profile: input.company });
                              toast.success("Реквизиты ИП сохранены для следующих договоров");
                            })
                          }
                        >
                          Запомнить реквизиты ИП
                        </Button>
                      </>
                    )}
                  </section>
                  <section className="lease-panel">
                    <h3>02 · Условия аренды</h3>
                    <div className="lease-summary">
                      <div>
                        <small>Срок</small>
                        <b>
                          {ruDate(c.booking.start_date)} — {ruDate(c.booking.end_date)}
                        </b>
                      </div>
                      <div>
                        <small>Аренда</small>
                        <b>
                          {c.booking.price_type === "periodic"
                            ? "По сезонным периодам"
                            : money(c.booking.price_month || 0) + " / мес."}
                        </b>
                      </div>
                      <div>
                        <small>Обеспечительный платёж</small>
                        <b>{money(c.booking.deposit || 0)}</b>
                      </div>
                      <div>
                        <small>День оплаты</small>
                        <b>{c.booking.payment_day} число</b>
                      </div>
                    </div>
                    {c.booking.price_type === "periodic" &&
                      c.booking.booking_price_periods.map(
                        (
                          p: { start_date: string; end_date: string; price_month: number },
                          i: number,
                        ) => (
                          <p key={i} className="lease-note">
                            {ruDate(p.start_date)} — {ruDate(p.end_date)}: {money(p.price_month)} /
                            мес.
                          </p>
                        ),
                      )}
                    <p className="lease-note">
                      Данные из брони. Для изменения стоимости или сроков отредактируйте бронь и
                      заново откройте форму договора.
                    </p>
                    <Field
                      label="Проживающие"
                      value={input.residents}
                      onChange={(residents) => patch({ residents })}
                    />
                  </section>
                  <section className="lease-panel">
                    <h3>03 · Дополнительные условия</h3>
                    <label className="lease-choice">
                      <input
                        type="checkbox"
                        checked={input.pets}
                        onChange={(e) => patch({ pets: e.target.checked })}
                      />
                      Проживание с животными
                    </label>
                    {input.pets && (
                      <div className="lease-pets lease-fields">
                        <Field
                          label="Животное"
                          value={input.petKind}
                          onChange={(petKind) => patch({ petKind })}
                        />
                        <Field
                          label="Количество"
                          type="number"
                          value={String(input.petCount)}
                          onChange={(v) => patch({ petCount: Number(v) })}
                        />
                        <p className="lease-note lease-wide">
                          Добавится пункт из выбранного шаблона. Текст виден в предпросмотре.
                        </p>
                      </div>
                    )}
                    <Label>Особые договорённости</Label>
                    <Textarea
                      value={input.extra}
                      onChange={(e) => patch({ extra: e.target.value })}
                      rows={3}
                    />
                  </section>
                </div>
                <div>
                  <section className="lease-panel">
                    <h3>
                      Предпросмотр ·{" "}
                      {template?.approved ? "утверждённый шаблон" : "черновик шаблона"}
                    </h3>
                    {!template?.approved && (
                      <p className="lease-warning">
                        Замените демонстрационный текст своим шаблоном во вкладке «Шаблон договора».
                        Пока документы формируются с пометкой «Черновик».
                      </p>
                    )}
                    <div className="lease-paper">{preview}</div>
                  </section>
                  <section className="lease-panel">
                    <h3>Комплект документов</h3>
                    <p className="lease-choice">
                      <CheckCircle2 size={15} />
                      Договор аренды
                    </p>
                    <label className="lease-choice">
                      <input
                        type="checkbox"
                        checked={input.includeAct}
                        onChange={(e) => patch({ includeAct: e.target.checked })}
                      />
                      Акт приёма-передачи
                    </label>
                    <label className="lease-choice">
                      <input
                        type="checkbox"
                        checked={input.includeInventory}
                        onChange={(e) => patch({ includeInventory: e.target.checked })}
                      />
                      Опись имущества
                    </label>
                    {input.includeInventory && (
                      <Textarea
                        aria-label="Опись имущества"
                        value={input.inventory}
                        onChange={(e) => patch({ inventory: e.target.value })}
                        placeholder="Мебель, техника, количество и состояние"
                      />
                    )}
                    <p className="lease-note">
                      PDF для подписания и Word для редактирования. Оба файла сохраняются в
                      выбранной брони.
                    </p>
                  </section>
                  <section className="lease-panel">
                    <h3>Связанные записи</h3>
                    <p>Объект: {c.property.internal_name || c.property.title}</p>
                    <p>Сделка: {c.deal?.title || "Не связана"}</p>
                    <p className="lease-note">
                      Создание документа сохраняет данные сторон; график платежей и статус сделки не
                      изменяются.
                    </p>
                  </section>
                </div>
                <div className="lease-footer">
                  <label className="lease-choice">
                    <input
                      type="checkbox"
                      checked={input.verified}
                      onChange={(e) => setInput({ ...input, verified: e.target.checked })}
                    />
                    Паспортные данные, подписант и условия проверены
                  </label>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={() =>
                        perform(async () => {
                          await leaseRequest({ action: "saveDraft", input });
                          toast.success("Черновик сохранён в брони");
                        })
                      }
                    >
                      Сохранить черновик
                    </Button>
                    <Button
                      disabled={busy || !input.verified}
                      onClick={() =>
                        perform(async () => {
                          const r = await leaseRequest({
                            action: "generate",
                            input: { ...input, templateVersion: template?.revision },
                          });
                          toast.success(
                            r.status === "draft"
                              ? "PDF и Word сохранены как черновик"
                              : "Договор сформирован и сохранён в брони",
                          );
                          setInput({ ...input, requestId: crypto.randomUUID(), verified: false });
                          await context.refetch();
                          await qc.invalidateQueries({ queryKey: ["deals"] });
                          setTab("documents");
                        })
                      }
                    >
                      {busy ? "Формирование…" : "Сформировать PDF и Word"}
                    </Button>
                  </div>
                </div>
              </div>
            )}
            {tab === "documents" && (
              <section className="lease-panel">
                <h3>Документы брони</h3>
                {!c.documents.length && (
                  <p className="lease-note">
                    Договоры ещё не формировались. Перейдите во вкладку «Условия и данные».
                  </p>
                )}
                {c.documents.map((d: DocumentChoice) => (
                  <div key={d.id} className="lease-version">
                    <div>
                      <b>Договор · версия {d.version}</b>
                      <p className="lease-note">
                        {new Date(d.created_at).toLocaleString("ru-RU")} ·{" "}
                        {
                          (
                            {
                              draft: "Черновик",
                              prepared: "Подготовлен",
                              signed: "Подписан",
                              building: "Формируется",
                              failed: "Ошибка формирования",
                            } as Record<string, string>
                          )[d.status]
                        }
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {["pdf", "docx", ...(d.files["signed"] ? ["signed"] : [])]
                        .filter((f) => d.files[f])
                        .map((f) => (
                          <Button
                            key={f}
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              perform(async () => {
                                await downloadLease(d.id, f);
                              })
                            }
                          >
                            <Download className="mr-1 h-3 w-3" />
                            {f === "signed" ? "Подписанный PDF" : f.toUpperCase()}
                          </Button>
                        ))}
                      {d.status === "prepared" && (
                        <label className="lease-upload">
                          Загрузить подписанный PDF
                          <input
                            type="file"
                            hidden
                            accept="application/pdf"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              e.target.value = "";
                              if (file)
                                perform(async () => {
                                  const form = new FormData();
                                  form.set("action", "signed");
                                  form.set("id", d.id);
                                  form.set("file", file);
                                  await leaseRequest(form);
                                  await context.refetch();
                                  toast.success("Подписанный экземпляр сохранён");
                                });
                            }}
                          />
                        </label>
                      )}
                    </div>
                  </div>
                ))}
              </section>
            )}
            {tab === "template" && (
              <section className="lease-panel">
                <h3>Шаблон договора и приложений</h3>
                <p className="lease-note">
                  Вставьте ваш согласованный текст и замените переменные полями вида{" "}
                  {"{{tenant_passport}}"}. Существующие документы сохраняют прежний текст.
                </p>
                {!templateEdit ? (
                  <>
                    <select
                      aria-label="Шаблон для редактирования"
                      value=""
                      onChange={(e) =>
                        setTemplateEdit(
                          c.templates.find((t: LeaseTemplate) => t.id === e.target.value) || null,
                        )
                      }
                    >
                      <option value="">Выберите шаблон</option>
                      {c.templates.map((t: LeaseTemplate) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </>
                ) : (
                  <div className="space-y-4">
                    <Field
                      label="Название шаблона"
                      value={templateEdit.name}
                      onChange={(name) => setTemplateEdit({ ...templateEdit, name })}
                    />
                    <label className="lease-upload">
                      <Upload size={15} />
                      Импортировать текст из Word (.docx)
                      <input
                        type="file"
                        hidden
                        accept=".docx"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          e.target.value = "";
                          if (f)
                            perform(async () => {
                              const form = new FormData();
                              form.set("action", "templateFile");
                              form.set("file", f);
                              const r = await leaseRequest(form);
                              setTemplateEdit({ ...templateEdit, body: r.text, approved: false });
                              toast.info(
                                "Текст импортирован. Расставьте поля подстановки и проверьте шаблон",
                              );
                            });
                        }}
                      />
                    </label>
                    {[
                      ["body", "Текст договора"],
                      ["pets_clause", "Пункт о животных"],
                      ["act_body", "Акт передачи"],
                      ["inventory_body", "Опись имущества"],
                    ].map(([key, label]) => (
                      <label key={key} className="block">
                        <Label>{label}</Label>
                        <Textarea
                          rows={key === "body" ? 14 : 4}
                          value={templateEdit[key as "body"]}
                          onChange={(e) =>
                            setTemplateEdit({
                              ...templateEdit,
                              [key!]: e.target.value,
                              approved: false,
                            })
                          }
                        />
                      </label>
                    ))}
                    <p className="lease-note">
                      Поля:{" "}
                      {
                        "{{number}}, {{date}}, {{landlord}}, {{tenant_name}}, {{tenant_passport}}, {{owner_passport}}, {{address}}, {{property}}, {{start}}, {{end}}, {{rent}}, {{deposit}}, {{payment_day}}, {{residents}}, {{pets}}, {{pet_kind}}, {{pet_count}}, {{extra}}, {{inventory}}, {{representative}}, {{authority}}, {{company_name}}, {{company_inn}}, {{company_ogrnip}}, {{company_address}}, {{company_phone}}"
                      }
                      .
                    </p>
                    <label className="lease-choice">
                      <input
                        type="checkbox"
                        checked={templateEdit.approved}
                        onChange={(e) =>
                          setTemplateEdit({ ...templateEdit, approved: e.target.checked })
                        }
                      />
                      Текст проверен и готов к использованию
                    </label>
                    <Button
                      disabled={busy}
                      onClick={() =>
                        perform(async () => {
                          await leaseRequest({ action: "saveTemplate", template: templateEdit });
                          await context.refetch();
                          setTemplateEdit(null);
                          toast.success("Шаблон сохранён. Готовые версии договоров не изменены");
                        })
                      }
                    >
                      Сохранить шаблон
                    </Button>
                  </div>
                )}
              </section>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
