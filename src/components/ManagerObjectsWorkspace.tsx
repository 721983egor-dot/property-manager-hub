import type { ManagerProperty } from "@/lib/manager-property-view";
import type { KeyWorkspace } from "@/lib/property-keys.server";
import { useState, useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";
import { getKeysWorkspace, changePropertyKeys } from "@/lib/property-keys.functions";
import {
  emptyKeyInventory,
  keyReadiness,
  type KeyInventory,
  type KeyBundle,
  type KeyItem,
  type KeyCommand,
} from "@/lib/property-keys-model";
import { formatMoney, roomsLabel, signedUrls } from "@/lib/properties";
import { createSelection } from "@/lib/selections";
import { selectionPublicUrl } from "@/lib/site";
import "./manager-objects.css";
const uid = () => crypto.randomUUID();
const points = ["Входная дверь", "Подъезд", "Ворота", "Калитка", "Баня", "Паркинг", "Второй замок"];
const statusName: Record<string, string> = {
  free: "Свободен",
  soon_free: "Скоро свободен",
  rented: "Сдан",
  booked: "Забронирован",
  archived: "Архив",
};
export function ManagerObjectsWorkspace({ propertyId }: { propertyId?: string }) {
  const load = useServerFn(getKeysWorkspace),
    save = useServerFn(changePropertyKeys),
    cache = useQueryClient();
  const query = useQuery({
    queryKey: ["manager-workspace"],
    queryFn: () => load(),
    refetchOnWindowFocus: true,
  });
  const [tab, setTab] = useState<"catalog" | "keys" | "selection">("catalog"),
    [search, setSearch] = useState(""),
    [type, setType] = useState("all"),
    [mine, setMine] = useState(false),
    [archive, setArchive] = useState(false),
    [selected, setSelected] = useState<string[]>([]);
  const [editing, setEditing] = useState<string | null>(null),
    [draft, setDraft] = useState<KeyInventory>(emptyKeyInventory()),
    [version, setVersion] = useState(0),
    [folded, setFolded] = useState<string[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [customPoint, setCustomPoint] = useState("");
  const [transfer, setTransfer] = useState<string | null>(null),
    [transferIds, setTransferIds] = useState<string[]>([]),
    [recipient, setRecipient] = useState(""),
    [externalName, setExternalName] = useState(""),
    [handed, setHanded] = useState(false),
    [selectionOpen, setSelectionOpen] = useState(false),
    [selectionName, setSelectionName] = useState("Подборка для клиента"),
    [comment, setComment] = useState(""),
    [selectionBusy, setSelectionBusy] = useState(false);
  const info = query.data,
    admin = info?.actor.role === "admin",
    actor = info?.actor,
    properties = info?.properties ?? [],
    people = info?.people ?? [];
  const snapshots = new Map((info?.inventories ?? []).map((r) => [r.property_id, r]));
  const inventory = (id: string) => snapshots.get(id)?.inventory ?? emptyKeyInventory();
  const paths = properties
    .map((p: ManagerProperty) => p.photos?.find((f) => !f.kind || f.kind === "photo")?.path)
    .filter(Boolean) as string[];
  const photos = useQuery({
    queryKey: ["manager-photos", paths.join("|")],
    queryFn: () => signedUrls(paths),
    enabled: !!paths.length,
  });
  const image = (p: ManagerProperty) =>
    photos.data?.[p.photos?.find((f) => !f.kind || f.kind === "photo")?.path ?? ""];
  const label = (p: ManagerProperty) => p.internal_name || p.title || `Объект №${p.ref_id}`;
  const rows = properties
    .filter(
      (p: ManagerProperty) =>
        (archive || p.status !== "archived") &&
        (!propertyId || p.id === propertyId) &&
        (!mine || inventory(p.id).bundles.some((b) => b.holderId === actor?.id)) &&
        (type === "all" ||
          (type === "house" ? ["house", "villa", "townhouse"] : ["apartment", "aparts"]).includes(
            p.type,
          )) &&
        `${label(p)} ${p.complex_name || ""} ${p.address || ""}`
          .toLowerCase()
          .includes(search.toLowerCase()),
    )
    .sort((a, b) => label(a).localeCompare(label(b), "ru"));
  useEffect(() => {
    if (!actor?.id) return;
    try {
      const saved = JSON.parse(sessionStorage.getItem(`manager-selection-${actor.id}`) || "[]");
      if (Array.isArray(saved))
        setSelected(
          saved.filter(
            (id): id is string =>
              typeof id === "string" && (info?.properties ?? []).some((p) => p.id === id),
          ),
        );
    } catch {
      /* An invalid local draft can be replaced safely. */
    }
  }, [actor?.id, info]);
  function toggle(id: string) {
    setSelected((v) => {
      const next = v.includes(id) ? v.filter((x) => x !== id) : [...v, id];
      try {
        sessionStorage.setItem(`manager-selection-${actor?.id}`, JSON.stringify(next));
      } catch {
        /* Selection still works in memory. */
      }
      return next;
    });
  }
  function open(id: string) {
    const inv = inventory(id);
    setEditing(id);
    setDraft(structuredClone(inv));
    setVersion(snapshots.get(id)?.version ?? 0);
    setFolded(inv.bundles.slice(1).map((b) => b.id));
    setError("");
    setCustomPoint("");
  }
  async function execute(command: KeyCommand, close = false) {
    if (!editing) return;
    setError("");
    setBusy(true);
    try {
      const result = await save({ data: { propertyId: editing, expected: version, command } });
      setDraft(structuredClone(result.inventory));
      setVersion(result.version);
      cache.setQueryData(["manager-workspace"], (old: KeyWorkspace | undefined) =>
        old
          ? {
              ...old,
              inventories: [...old.inventories.filter((r) => r.property_id !== editing), result],
            }
          : old,
      );
      setTransfer(null);
      if (close) setEditing(null);
      toast.success("Ключи сохранены");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось сохранить");
      void cache.invalidateQueries({ queryKey: ["manager-workspace"] });
    } finally {
      setBusy(false);
    }
  }
  function patchBundle(id: string, patch: Partial<KeyBundle>) {
    setDraft((v) => ({
      ...v,
      bundles: v.bundles.map((b) => (b.id === id ? { ...b, ...patch } : b)),
    }));
  }
  function patchItem(bid: string, iid: string, patch: Partial<KeyItem>) {
    setDraft((v) => ({
      ...v,
      bundles: v.bundles.map((b) =>
        b.id === bid
          ? { ...b, items: b.items.map((i) => (i.id === iid ? { ...i, ...patch } : i)) }
          : b,
      ),
    }));
  }
  function addBundle(loose: boolean) {
    if (!actor) return;
    setDraft((v) => ({
      ...v,
      bundles: [
        ...v.bundles,
        {
          id: uid(),
          name: loose
            ? "Отдельные ключи"
            : `Связка ${v.bundles.filter((b) => !b.loose).length + 1}`,
          holder: actor.name,
          holderId: actor.id,
          loose,
          items: [],
        },
      ],
    }));
  }
  function holderTags(inv: KeyInventory) {
    const holders = [...new Set(inv.bundles.map((b) => b.holder).filter(Boolean))];
    if (!holders.length) return <small>Не указано у кого ключи</small>;
    return (
      <span className="mw-holder-tags">
        {holders.map((h) => {
          const bs = inv.bundles.filter((b) => b.holder === h),
            own = bs.some((b) => b.holderId === actor?.id),
            sets = bs.filter((b) => !b.loose).length,
            loose = bs.filter((b) => b.loose).reduce((s, b) => s + b.items.length, 0);
          return (
            <span key={h} className={own ? "mw-mine" : ""}>
              {own ? "У меня" : h}
              {sets ? ` · ${sets} связ.` : ""}
              {loose ? ` · ${loose} отд.` : ""}
            </span>
          );
        })}
      </span>
    );
  }
  function keyInfo(id: string) {
    const inv = inventory(id),
      ready = keyReadiness(inv, actor?.id ?? "");
    return (
      <div className="mw-key-info">
        {holderTags(inv)}
        {ready.state !== "none" && (
          <small
            className={
              ready.state === "ready" ? "mw-good" : ready.state === "partial" ? "mw-warning" : ""
            }
          >
            {ready.text}
          </small>
        )}
      </div>
    );
  }
  async function makeSelection() {
    setSelectionBusy(true);
    try {
      const s = await createSelection({
        propertyIds: selected,
        name: selectionName,
        comment,
        saved: true,
      });
      const url = selectionPublicUrl(s.code);
      try {
        await navigator.clipboard.writeText(url);
        toast.success("Ссылка на подборку скопирована");
      } catch {
        window.prompt("Ссылка на подборку", url);
      }
      setSelectionOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось создать подборку");
    } finally {
      setSelectionBusy(false);
    }
  }
  function exportKeys() {
    const lines = [["Объект", "Связка", "Держатель", "Ключ", "Вид", "Метка", "Резерв"]];
    for (const p of properties) {
      const inv = inventory(p.id);
      if (!inv.bundles.length) lines.push([label(p), "", "", "", "", "", ""]);
      for (const b of inv.bundles)
        for (const i of b.items)
          lines.push([
            label(p),
            b.name,
            b.holder,
            i.label,
            i.form,
            i.mark,
            i.reserve ? "Да" : "Нет",
          ]);
    }
    const text =
      "\uFEFF" +
      lines
        .map((r) =>
          r
            .map((c) => '"' + (/^[=+@-]/.test(c) ? "'" + c : c).replaceAll('"', '""') + '"')
            .join(";"),
        )
        .join("\r\n");
    const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "Ключи.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  if (query.isPending) return <p className="p-6">Загрузка объектов и ключей…</p>;
  if (query.error || !info)
    return (
      <div className="p-6" role="alert">
        Не удалось загрузить объекты: {query.error?.message}
        <button onClick={() => void query.refetch()}>Повторить</button>
      </div>
    );
  const property = propertyId ? properties.find((p: ManagerProperty) => p.id === propertyId) : null;
  if (propertyId && !property)
    return (
      <div className="p-6">
        <Link to="/objects">← Объекты</Link>
        <p role="alert">Объект не найден</p>
      </div>
    );
  const persisted = editing ? inventory(editing) : emptyKeyInventory();
  const compositionDirty =
    JSON.stringify({ required: draft.required, bundles: draft.bundles }) !==
    JSON.stringify({ required: persisted.required, bundles: persisted.bundles });
  const activeBundle = draft.bundles.find((b) => b.id === transfer);
  return (
    <div className="manager-workspace">
      <header>
        <div>
          <h1>
            {property
              ? label(property)
              : tab === "keys"
                ? "Ключи"
                : tab === "selection"
                  ? "Рабочая подборка"
                  : "Объекты"}
          </h1>
          <p>
            {property
              ? `${property.address || ""} · ${statusName[property.status] ?? ""}`
              : "Подбор клиенту, подготовка показа и учёт ключей"}
          </p>
        </div>
        <div className="mw-actions">
          {property && <Link to="/objects">← Объекты</Link>}
          <button
            onClick={() => {
              setTab("keys");
              setMine((v) => !v);
            }}
          >
            {mine ? "Все ключи" : "Ключи у меня"}
          </button>
          {admin && <button onClick={exportKeys}>Скачать ключи CSV</button>}
        </div>
      </header>
      {!property && (
        <>
          <nav>
            <button className={tab === "catalog" ? "active" : ""} onClick={() => setTab("catalog")}>
              Каталог объектов
            </button>
            <button
              className={tab === "selection" ? "active" : ""}
              onClick={() => setTab("selection")}
            >
              Подборка · {selected.length}
            </button>
            <button className={tab === "keys" ? "active" : ""} onClick={() => setTab("keys")}>
              Ключи
            </button>
          </nav>
          <div className="mw-filters">
            <input
              aria-label="Поиск объектов"
              placeholder="Внутреннее название, район, адрес"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select aria-label="Тип объекта" value={type} onChange={(e) => setType(e.target.value)}>
              <option value="all">Дома и квартиры</option>
              <option value="house">Дома</option>
              <option value="apartment">Квартиры</option>
            </select>
            <label>
              <input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} />
              Ключи у меня
            </label>
            <label>
              <input
                type="checkbox"
                checked={archive}
                onChange={(e) => setArchive(e.target.checked)}
              />
              Архив
            </label>
            <small>{rows.length} объектов</small>
          </div>
        </>
      )}
      {property ? (
        <div className="mw-property">
          <div>
            {image(property) && (
              <img className="mw-hero" src={image(property)} alt={label(property)} />
            )}
            <h2>Об объекте</h2>
            <p className="mw-description">{property.description}</p>
            <div className="mw-features">
              {property.area && <span>{property.area} м²</span>}
              <span>{roomsLabel(property.rooms)}</span>
              {property.rent_terms && <span>{property.rent_terms}</span>}
            </div>
          </div>
          <div>
            <section>
              <h2>Условия для арендатора</h2>
              <strong className="mw-price">
                {formatMoney(property.price_month)} <small>/ месяц</small>
              </strong>
              {property.seasonal_pricing && property.summer_price_month != null && (
                <p>Лето: {formatMoney(property.summer_price_month)} / месяц</p>
              )}
              <dl>
                <dt>Страховой депозит</dt>
                <dd>{formatMoney(property.deposit)}</dd>
                <dt>Комиссия с арендатора</dt>
                <dd>
                  {property.commission == null
                    ? "Уточнить"
                    : property.commission
                      ? `${property.commission}%`
                      : "Без комиссии"}
                </dd>
                <dt>Коммунальные услуги</dt>
                <dd>
                  {property.utilities_month
                    ? formatMoney(property.utilities_month)
                    : "Уточнить условия"}
                </dd>
                <dt>Доступность</dt>
                <dd>
                  {property.availableFrom ??
                    (property.status === "free" ? "Свободен" : "Уточнить дату заселения")}
                </dd>
              </dl>
            </section>
            <section>
              <h2>Ключи для показа</h2>
              {keyInfo(property.id)}
              <button onClick={() => open(property.id)}>Состав и передача →</button>
            </section>
            <button
              className="mw-primary"
              onClick={() => {
                toggle(property.id);
                toast.success(
                  selected.includes(property.id)
                    ? "Объект убран из подборки"
                    : "Объект добавлен в рабочую подборку",
                );
              }}
            >
              {selected.includes(property.id) ? "Убрать из подборки" : "В подборку"}
            </button>
            {admin && (
              <Link to="/objects/$id/edit" params={{ id: property.id }}>
                Редактировать объект
              </Link>
            )}
          </div>
        </div>
      ) : tab === "catalog" ? (
        <div className="mw-cards">
          {rows.map((p: ManagerProperty) => (
            <article key={p.id}>
              <div className="mw-cover">
                {image(p) ? (
                  <img src={image(p)} alt={label(p)} />
                ) : (
                  <div className="mw-photo-placeholder">Нет фото</div>
                )}
                <input
                  aria-label={`В подборку: ${label(p)}`}
                  type="checkbox"
                  checked={selected.includes(p.id)}
                  onChange={() => toggle(p.id)}
                />
              </div>
              <div className="mw-card-body">
                <span className="mw-status">{statusName[p.status]}</span>
                <Link to="/objects/$id" params={{ id: p.id }}>
                  <h2>{label(p)}</h2>
                </Link>
                <p>{p.complex_name || p.address}</p>
                <p>
                  {p.area ? `${p.area} м² · ` : ""}
                  {roomsLabel(p.rooms)}
                </p>
                <strong className="mw-price">
                  {formatMoney(p.price_month)} <small>/ месяц</small>
                </strong>
                <p>
                  Комиссия с арендатора:{" "}
                  {p.commission == null
                    ? "уточнить"
                    : p.commission
                      ? `${p.commission}%`
                      : "без комиссии"}
                </p>
                {keyInfo(p.id)}
                <div className="mw-card-buttons">
                  <Link to="/objects/$id" params={{ id: p.id }}>
                    Карточка
                  </Link>
                  <button onClick={() => open(p.id)}>Ключи →</button>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="mw-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Внутреннее название</th>
                {tab === "selection" && <th>Аренда / месяц</th>}
                <th>У кого ключи</th>
                <th>У меня для показа</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows
                .filter((p: ManagerProperty) => tab !== "selection" || selected.includes(p.id))
                .map((p: ManagerProperty) => {
                  const inv = inventory(p.id),
                    r = keyReadiness(inv, actor!.id);
                  return (
                    <tr key={p.id}>
                      <td>
                        <Link to="/objects/$id" params={{ id: p.id }}>
                          {label(p)}
                        </Link>
                      </td>
                      {tab === "selection" && <td>{formatMoney(p.price_month)}</td>}
                      <td>{holderTags(inv)}</td>
                      <td
                        className={
                          r.state === "ready"
                            ? "mw-good"
                            : r.state === "partial"
                              ? "mw-warning"
                              : ""
                        }
                      >
                        {r.text}
                      </td>
                      <td>
                        <button
                          aria-label={`Состав ключей: ${label(p)}`}
                          onClick={() => open(p.id)}
                        >
                          {admin ? "Заполнить / состав" : "Состав / передача"} →
                        </button>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
          {tab === "selection" && !selected.length && (
            <p className="mw-empty">Отметьте объекты в каталоге, чтобы собрать подборку.</p>
          )}
        </div>
      )}
      {!property && selected.length > 0 && (
        <div className="mw-selection-bar">
          <strong>Выбрано объектов: {selected.length}</strong>
          <span>Сведения о ключах клиентам не передаются</span>
          <button className="mw-primary" onClick={() => setSelectionOpen(true)}>
            Создать ссылку на подборку
          </button>
        </div>
      )}
      {propertyId && !property && <p role="alert">Объект не найден</p>}
      <Dialog
        open={!!editing}
        onOpenChange={(v) => {
          if (!busy && !v) setEditing(null);
        }}
      >
        <DialogContent className="mw-inventory-dialog">
          <DialogHeader>
            <DialogTitle>
              {properties.find((p: ManagerProperty) => p.id === editing)?.internal_name ||
                properties.find((p: ManagerProperty) => p.id === editing)?.title ||
                "Ключи объекта"}
            </DialogTitle>
            <DialogDescription>Связки, отдельные ключи, резерв и передача</DialogDescription>
          </DialogHeader>
          <div className="mw-inventory-scroll">
            <section className="mw-requirements">
              <h3>Что необходимо для показа</h3>
              <p>Резерв не участвует в проверке готовности.</p>
              <div>
                {[
                  ...new Set([
                    ...points,
                    ...draft.required,
                    ...draft.bundles.flatMap((b) => b.items.map((i) => i.label)).filter(Boolean),
                  ]),
                ].map((p) => (
                  <label key={p}>
                    <input
                      disabled={!admin || busy}
                      type="checkbox"
                      checked={draft.required.includes(p)}
                      onChange={(e) =>
                        setDraft((v) => ({
                          ...v,
                          required: e.target.checked
                            ? [...v.required, p]
                            : v.required.filter((x) => x !== p),
                        }))
                      }
                    />
                    {p}
                  </label>
                ))}
              </div>
              {admin && (
                <div className="mw-custom-point">
                  <input
                    aria-label="Другой проход"
                    placeholder="Другой проход"
                    value={customPoint}
                    onChange={(e) => setCustomPoint(e.target.value)}
                  />
                  <button
                    disabled={!customPoint.trim() || busy}
                    onClick={() => {
                      setDraft((v) => ({
                        ...v,
                        required: [...new Set([...v.required, customPoint.trim()])],
                      }));
                      setCustomPoint("");
                    }}
                  >
                    Добавить
                  </button>
                </div>
              )}
            </section>
            <div className="mw-bundle-title">
              <h3>Связки и отдельные ключи</h3>
              {admin && (
                <div>
                  <button disabled={busy} onClick={() => addBundle(false)}>
                    + Связка
                  </button>
                  <button disabled={busy} onClick={() => addBundle(true)}>
                    + Отдельный ключ
                  </button>
                </div>
              )}
            </div>
            {!draft.bundles.length && (
              <p className="mw-empty">
                Состав ещё не заполнен.
                {admin ? " Добавьте связку или отдельный ключ." : " Его заполняет администратор."}
              </p>
            )}
            {draft.bundles.map((b, bi) => {
              const pending = draft.transfers.some(
                  (t) => t.bundleId === b.id && t.status === "pending",
                ),
                disabled = !admin || busy || pending;
              return (
                <section className="mw-bundle" key={b.id}>
                  <div className="mw-bundle-head">
                    <label>
                      Название
                      <input
                        disabled={disabled}
                        aria-label={`Название связки ${bi + 1}`}
                        value={b.name}
                        onChange={(e) => patchBundle(b.id, { name: e.target.value })}
                      />
                    </label>
                    <label>
                      У кого
                      <input
                        list="mw-staff"
                        disabled={disabled}
                        aria-label={`Держатель связки ${bi + 1}`}
                        value={b.holder}
                        onChange={(e) => {
                          const matching = people.filter((p) => p.name === e.target.value);
                          patchBundle(b.id, {
                            holder: e.target.value,
                            holderId: matching.length === 1 ? matching[0]!.id : null,
                          });
                        }}
                      />
                    </label>
                    <small>
                      {b.loose ? "Отдельно" : "Связка"} · {b.items.length} предм.
                    </small>
                    <button
                      onClick={() =>
                        setFolded((v) =>
                          v.includes(b.id) ? v.filter((x) => x !== b.id) : [...v, b.id],
                        )
                      }
                    >
                      {folded.includes(b.id) ? "Развернуть" : "Свернуть"}
                    </button>
                    {admin && !pending && (
                      <button
                        disabled={busy}
                        aria-label={`Удалить связку ${bi + 1}`}
                        onClick={() =>
                          setDraft((v) => ({
                            ...v,
                            bundles: v.bundles.filter((x) => x.id !== b.id),
                          }))
                        }
                      >
                        ×
                      </button>
                    )}
                  </div>
                  {!folded.includes(b.id) && (
                    <>
                      <div className="mw-key-head">
                        <span>Назначение</span>
                        <span>Вид</span>
                        <span>Метка / цвет</span>
                        <span>Резерв</span>
                        <span></span>
                      </div>
                      {b.items.map((i, ii) => (
                        <div className="mw-key-row" key={i.id}>
                          <input
                            list="mw-points"
                            disabled={disabled}
                            aria-label={`Назначение ${bi + 1}.${ii + 1}`}
                            value={i.label}
                            onChange={(e) => patchItem(b.id, i.id, { label: e.target.value })}
                          />
                          <select
                            disabled={disabled}
                            aria-label={`Вид ${bi + 1}.${ii + 1}`}
                            value={i.form}
                            onChange={(e) =>
                              patchItem(b.id, i.id, { form: e.target.value as KeyItem["form"] })
                            }
                          >
                            {["Ключ", "Магнит", "Пульт", "Брелок", "Карта"].map((v) => (
                              <option key={v}>{v}</option>
                            ))}
                          </select>
                          <input
                            disabled={disabled}
                            aria-label={`Метка ${bi + 1}.${ii + 1}`}
                            value={i.mark}
                            placeholder="Большой, синий…"
                            onChange={(e) => patchItem(b.id, i.id, { mark: e.target.value })}
                          />
                          <input
                            disabled={disabled}
                            aria-label={`Резерв ${bi + 1}.${ii + 1}`}
                            type="checkbox"
                            checked={i.reserve}
                            onChange={(e) => patchItem(b.id, i.id, { reserve: e.target.checked })}
                          />
                          <div className="mw-key-tools">
                            {admin && !pending && (
                              <>
                                <button
                                  disabled={busy}
                                  title="Ещё один такой ключ"
                                  onClick={() =>
                                    patchBundle(b.id, { items: [...b.items, { ...i, id: uid() }] })
                                  }
                                >
                                  +1
                                </button>
                                <button
                                  disabled={busy}
                                  aria-label={`Удалить ключ ${bi + 1}.${ii + 1}`}
                                  onClick={() =>
                                    patchBundle(b.id, {
                                      items: b.items.filter((k) => k.id !== i.id),
                                    })
                                  }
                                >
                                  ×
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      ))}
                      <div className="mw-bundle-footer">
                        {admin && (
                          <button
                            disabled={disabled}
                            onClick={() =>
                              patchBundle(b.id, {
                                items: [
                                  ...b.items,
                                  { id: uid(), label: "", form: "Ключ", mark: "", reserve: false },
                                ],
                              })
                            }
                          >
                            + Ключ
                          </button>
                        )}
                        <small>
                          {pending
                            ? "Ожидает получения"
                            : b.holderId
                              ? keyReadiness(draft, b.holderId).text
                              : "Внешний держатель"}
                        </small>
                        <button
                          disabled={
                            busy ||
                            pending ||
                            compositionDirty ||
                            b.holderId !== actor?.id ||
                            !b.items.length
                          }
                          onClick={() => {
                            setTransfer(b.id);
                            setTransferIds(b.items.map((i) => i.id));
                            setRecipient("");
                            setExternalName("");
                            setHanded(false);
                            setError("");
                          }}
                        >
                          Передать…
                        </button>
                      </div>
                    </>
                  )}
                </section>
              );
            })}
            <datalist id="mw-staff">
              {people.map((p) => (
                <option key={p.id} value={p.name} />
              ))}
            </datalist>
            <datalist id="mw-points">
              {points.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
            {draft.transfers
              .filter((t) => t.status === "pending")
              .map((t) => (
                <div className="mw-pending" key={t.id}>
                  <div>
                    <b>
                      {t.from} → {t.to}
                    </b>
                    <p>{t.itemIds.length} предм. · ожидает получения</p>
                  </div>
                  {t.toId === actor?.id && (
                    <button
                      disabled={busy}
                      className="mw-primary"
                      onClick={() => execute({ kind: "receive", transferId: t.id })}
                    >
                      Подтвердить получение
                    </button>
                  )}
                  {t.fromId === actor?.id && (
                    <button
                      disabled={busy}
                      onClick={() => execute({ kind: "cancel", transferId: t.id })}
                    >
                      Отменить передачу
                    </button>
                  )}
                </div>
              ))}
            <details className="mw-history">
              <summary>История ключей · {draft.history.length} событий</summary>
              {draft.history
                .slice()
                .reverse()
                .map((h, i) => (
                  <p key={i}>
                    {new Date(h.at).toLocaleString("ru-RU")} · {h.text}
                  </p>
                ))}
            </details>
          </div>
          {error && (
            <p className="mw-error" role="alert">
              {error}
            </p>
          )}
          <div className="mw-dialog-footer">
            <small>
              {admin
                ? compositionDirty
                  ? "Сначала сохраните состав, затем передавайте ключи"
                  : "Изменения сохраняются в общей базе"
                : "Можно передавать свои ключи и подтверждать получение"}
            </small>
            <button disabled={busy} onClick={() => setEditing(null)}>
              Закрыть
            </button>
            {admin && (
              <button
                disabled={busy}
                className="mw-primary"
                onClick={() =>
                  execute(
                    { kind: "composition", required: draft.required, bundles: draft.bundles },
                    true,
                  )
                }
              >
                Сохранить состав
              </button>
            )}
          </div>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!transfer}
        onOpenChange={(v) => {
          if (!busy && !v) setTransfer(null);
        }}
      >
        <DialogContent className="mw-transfer-dialog">
          <DialogHeader>
            <DialogTitle>Передать ключи</DialogTitle>
            <DialogDescription>
              {activeBundle?.name}. Сначала сохраните изменённый состав связки.
            </DialogDescription>
          </DialogHeader>
          <label>
            Получатель
            <select
              aria-label="Получатель"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
            >
              <option value="">Выберите получателя</option>
              {people
                .filter((p) => p.id !== actor?.id)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              <option value="external">Клининг / другой человек</option>
            </select>
          </label>
          {recipient === "external" && (
            <input
              placeholder="Имя получателя"
              aria-label="Имя внешнего получателя"
              value={externalName}
              onChange={(e) => setExternalName(e.target.value)}
            />
          )}
          <div className="mw-transfer-items">
            {activeBundle?.items.map((i) => (
              <label key={i.id}>
                <input
                  type="checkbox"
                  checked={transferIds.includes(i.id)}
                  onChange={(e) =>
                    setTransferIds((v) =>
                      e.target.checked ? [...v, i.id] : v.filter((x) => x !== i.id),
                    )
                  }
                />
                <span>
                  {i.label}
                  <small>
                    {i.form} · {i.mark}
                    {i.reserve ? " · резерв" : ""}
                  </small>
                </span>
              </label>
            ))}
          </div>
          {recipient === "external" ? (
            <label>
              <input
                type="checkbox"
                checked={handed}
                onChange={(e) => setHanded(e.target.checked)}
              />
              Подтверждаю личное вручение ключей
            </label>
          ) : (
            <p>Сотрудник подтвердит получение. До этого ключи остаются у прежнего держателя.</p>
          )}
          {error && (
            <p role="alert" className="mw-error">
              {error}
            </p>
          )}
          <button
            disabled={
              busy ||
              !transferIds.length ||
              !recipient ||
              (recipient === "external" && (!externalName.trim() || !handed))
            }
            className="mw-primary"
            onClick={() =>
              execute({
                kind: "transfer",
                bundleId: transfer!,
                itemIds: transferIds,
                recipient:
                  recipient === "external"
                    ? externalName
                    : (people.find((p) => p.id === recipient)?.name ?? ""),
                recipientId: recipient === "external" ? null : recipient,
                handed,
              })
            }
          >
            Передать
          </button>
        </DialogContent>
      </Dialog>
      <Dialog open={selectionOpen} onOpenChange={setSelectionOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Подборка для клиента</DialogTitle>
            <DialogDescription>
              Выбрано объектов: {selected.length}. Ключи и внутренние сведения в ссылку не входят.
            </DialogDescription>
          </DialogHeader>
          <input
            aria-label="Название подборки"
            value={selectionName}
            onChange={(e) => setSelectionName(e.target.value)}
          />
          <textarea
            aria-label="Комментарий клиенту"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Комментарий для клиента"
          />
          <button
            className="mw-primary"
            disabled={selectionBusy || !selected.length}
            onClick={makeSelection}
          >
            Создать и скопировать ссылку
          </button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
