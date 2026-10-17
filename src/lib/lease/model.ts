import { z } from "zod";
export const identitySchema = z.object({
  full_name: z.string().max(250).default(""),
  birth_date: z.string().max(10).default(""),
  birth_place: z.string().max(500).default(""),
  series: z.string().max(4).default(""),
  number: z.string().max(6).default(""),
  issued_by: z.string().max(1000).default(""),
  issued_date: z.string().max(10).default(""),
  department_code: z.string().max(7).default(""),
  registration: z.string().max(1000).default(""),
});
export type Identity = z.infer<typeof identitySchema>;
export const blankIdentity = () => identitySchema.parse({});
export const leaseInputSchema = z.object({
  bookingVersion: z.string().min(1),
  templateVersion: z.number().int().positive(),
  requestId: z.string().uuid(),
  bookingId: z.string().uuid(),
  dealId: z.string().uuid().nullable().default(null),
  templateId: z.string().uuid(),
  tenant: identitySchema,
  ownerClientId: z.string().uuid().nullable().default(null),
  owner: identitySchema,
  signerMode: z.enum(["owner", "representative", "company"]),
  representative: z.string().max(1000).default(""),
  authority: z.string().max(1500).default(""),
  company: z
    .object({
      name: z.string().max(300).default(""),
      inn: z.string().max(12).default(""),
      ogrnip: z.string().max(15).default(""),
      address: z.string().max(1000).default(""),
      phone: z.string().max(100).default(""),
    })
    .default({}),
  pets: z.boolean().default(false),
  petKind: z.string().max(100).default(""),
  petCount: z.number().int().min(0).max(20).default(0),
  extra: z.string().max(6000).default(""),
  residents: z.string().max(2000).default(""),
  inventory: z.string().max(10000).default(""),
  includeAct: z.boolean().default(true),
  includeInventory: z.boolean().default(false),
  passportDraftId: z.string().uuid().nullable().default(null),
  verified: z.boolean(),
});
export type LeaseInput = z.infer<typeof leaseInputSchema>;
export type LeaseTemplate = {
  id: string;
  name: string;
  body: string;
  pets_clause: string;
  act_body: string;
  inventory_body: string;
  approved: boolean;
  revision: number;
};
export type LeaseBooking = {
  id: string;
  property_id: string;
  client_id: string;
  start_date: string;
  end_date: string;
  payment_day: number;
  price_type: string;
  price_month: number | null;
  deposit: number | null;
  status: string;
  updated_at: string;
  booking_price_periods: { start_date: string; end_date: string; price_month: number }[];
};
export type LeaseSnapshot = {
  input: LeaseInput;
  template: LeaseTemplate;
  booking: LeaseBooking;
  property: { id: string; address: string; title: string; service_type: string };
  number: string;
  createdOn: string;
};
export const identityLabels: Record<keyof Identity, string> = {
  full_name: "ФИО",
  birth_date: "Дата рождения",
  birth_place: "Место рождения",
  series: "Серия",
  number: "Номер",
  issued_by: "Кем выдан",
  issued_date: "Дата выдачи",
  department_code: "Код подразделения",
  registration: "Адрес регистрации",
};
export function identityMissing(p: Identity) {
  const required: (keyof Identity)[] = [
    "full_name",
    "birth_date",
    "series",
    "number",
    "issued_by",
    "issued_date",
    "department_code",
    "registration",
  ];
  return required.filter((k) => !p[k].trim()).map((k) => identityLabels[k]);
}
export function validateIdentity(p: Identity) {
  if (identityMissing(p).length)
    throw new Error("Проверьте паспорт: " + identityMissing(p).join(", "));
  if (
    !/^\d{4}$/.test(p.series) ||
    !/^\d{6}$/.test(p.number) ||
    !/^\d{3}-?\d{3}$/.test(p.department_code)
  )
    throw new Error("Проверьте серию, номер и код подразделения паспорта");
  for (const d of [p.birth_date, p.issued_date])
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(d) ||
      !Number.isFinite(Date.parse(d)) ||
      new Date(d).toISOString().slice(0, 10) !== d
    )
      throw new Error("Проверьте даты паспорта");
  if (p.birth_date >= p.issued_date) throw new Error("Дата выдачи должна быть позже даты рождения");
}
export const money = (n: number) =>
  new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) +
  " ₽";
export const ruDate = (d: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(d) ? d.split("-").reverse().join(".") : d;
export function passportText(p: Identity) {
  return `${p.full_name}, дата рождения ${ruDate(p.birth_date)}${p.birth_place ? ", место рождения " + p.birth_place : ""}, паспорт ${p.series} ${p.number}, выдан ${p.issued_by} ${ruDate(p.issued_date)}, код подразделения ${p.department_code}, регистрация: ${p.registration}`;
}
export const defaultBody = `ДОГОВОР АРЕНДЫ № {{number}}
Дата: {{date}}

ПРОЕКТ ШАБЛОНА. Перед использованием вставьте ваш согласованный текст в настройках шаблона.

Сторона, предоставляющая помещение: {{landlord}}
Арендатор: {{tenant_passport}}

Объект: {{address}} ({{property}}).
Срок: с {{start}} по {{end}}.
Стоимость аренды: {{rent}}.
Обеспечительный платёж: {{deposit}}.
День оплаты: {{payment_day}}.
Проживающие: {{residents}}.

{{pets}}
{{extra}}

Подписи сторон: __________________ / __________________`;
export const defaultTemplate = {
  name: "Долгосрочная аренда · настройте свой текст",
  body: defaultBody,
  pets_clause:
    "Разрешённые животные: {{pet_kind}}, количество: {{pet_count}}. [Вставьте согласованные условия содержания, уборки и ответственности.]",
  act_body:
    "АКТ ПРИЁМА-ПЕРЕДАЧИ к договору № {{number}}\nОбъект: {{address}}\nСтороны: {{landlord}} / {{tenant_name}}\nДата передачи: __________\nСостояние, показания счётчиков и ключи: __________________\nПодписи: __________________ / __________________",
  inventory_body:
    "ОПИСЬ ИМУЩЕСТВА к договору № {{number}}\nОбъект: {{address}}\n{{inventory}}\nПодписи: __________________ / __________________",
  approved: false,
};
export function renderLease(s: LeaseSnapshot) {
  const i = s.input,
    b = s.booking;
  const values: Record<string, string> = {
    number: s.number,
    date: ruDate(s.createdOn),
    tenant_name: i.tenant.full_name,
    tenant_passport: passportText(i.tenant),
    owner_passport: passportText(i.owner),
    representative: i.representative,
    authority: i.authority,
    company_name: i.company.name,
    company_inn: i.company.inn,
    company_ogrnip: i.company.ogrnip,
    company_address: i.company.address,
    company_phone: i.company.phone,
    address: s.property.address,
    property: s.property.title,
    start: ruDate(b.start_date),
    end: ruDate(b.end_date),
    rent:
      b.price_type === "periodic"
        ? b.booking_price_periods
            .map(
              (p) =>
                `${ruDate(p.start_date)} — ${ruDate(p.end_date)}: ${money(p.price_month)} / месяц`,
            )
            .join("; ")
        : money(Number(b.price_month)) + " / месяц",
    deposit: money(Number(b.deposit ?? 0)),
    payment_day: String(b.payment_day),
    residents: i.residents || "Не указаны",
    pet_kind: i.petKind,
    pet_count: String(i.petCount),
    extra: i.extra,
    inventory: i.inventory,
  };
  values["landlord"] =
    i.signerMode === "company"
      ? `${i.company.name}, ИНН ${i.company.inn}, ОГРНИП ${i.company.ogrnip}, адрес: ${i.company.address}. Основание: ${i.authority}`
      : i.signerMode === "representative"
        ? `${passportText(i.owner)}, представитель ${i.representative}, основание: ${i.authority}`
        : passportText(i.owner);
  const fill = (text: string) =>
    text.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (_, key: string) => {
      if (!(key in values)) throw new Error("Неизвестное поле шаблона: " + key);
      return values[key]!;
    });
  values["pets"] = i.pets ? fill(s.template.pets_clause) : "";
  const prefix = s.template.approved ? "" : "ЧЕРНОВИК — ШАБЛОН НЕ УТВЕРЖДЁН\n\n";
  const sections = [{ title: "Договор аренды", text: prefix + fill(s.template.body) }];
  if (i.includeAct)
    sections.push({ title: "Акт приёма-передачи", text: prefix + fill(s.template.act_body) });
  if (i.includeInventory)
    sections.push({ title: "Опись имущества", text: prefix + fill(s.template.inventory_body) });
  return sections;
}
export function validateLease(s: LeaseSnapshot) {
  const i = s.input;
  if (s.property.service_type === "management" && i.signerMode === "owner")
    throw new Error("Для объекта под управлением выберите ИП или представителя по доверенности");
  if (!i.verified) throw new Error("Проверьте паспортные данные и условия перед формированием");
  validateIdentity(i.tenant);
  if (i.ownerClientId === s.booking.client_id)
    throw new Error("Арендатор и собственник должны быть разными клиентами");
  if (i.signerMode !== "company") {
    if (!i.ownerClientId) throw new Error("Выберите собственника");
    validateIdentity(i.owner);
  }
  if (i.signerMode === "representative" && (!i.representative.trim() || !i.authority.trim()))
    throw new Error("Укажите представителя и основание полномочий");
  if (
    i.signerMode === "company" &&
    (!i.company.name.trim() ||
      !/^\d{12}$/.test(i.company.inn) ||
      !/^\d{15}$/.test(i.company.ogrnip) ||
      !i.company.address.trim() ||
      !i.authority.trim())
  )
    throw new Error("Заполните реквизиты ИП и основание предоставления объекта");
  if (i.pets && (!i.petKind.trim() || i.petCount < 1 || !s.template.pets_clause.trim()))
    throw new Error("Заполните животное, количество и пункт шаблона");
  if (i.includeInventory && !i.inventory.trim()) throw new Error("Заполните опись имущества");
  if (!s.property.address.trim() || s.booking.status === "cancelled")
    throw new Error("Проверьте адрес и действующую бронь");
  if (s.booking.price_type === "periodic" && !s.booking.booking_price_periods.length)
    throw new Error("Заполните сезонные цены в брони");
  if (s.booking.price_type !== "periodic" && !(Number(s.booking.price_month) > 0))
    throw new Error("Заполните стоимость в брони");
  renderLease(s);
}
