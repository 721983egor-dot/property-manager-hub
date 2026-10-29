import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  GripVertical,
  ArrowUp,
  ArrowDown,
  Plus,
  Share2,
  Send,
  Trash2,
  Heart,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";
import {
  getManagerCatalog,
  getWorkingSelections,
  saveWorkingSelectionFn,
} from "@/lib/working-selections.functions";
import {
  outcomeLabels,
  reorderSelection,
  type WorkingSelection,
  type WorkingSelectionItem,
} from "@/lib/working-selections-model";
import { formatMoney, roomsLabel, signedUrls, yandexMapsUrl } from "@/lib/properties";
import { selectionPublicUrl } from "@/lib/site";
import "./manager-office.css";
export const workingSelectionQueryKey = ["working-selections"];
export function useManagerCatalog() {
  const load = useServerFn(getManagerCatalog);
  return useQuery({ queryKey: ["manager-catalog"], queryFn: () => load() });
}
export function useWorkingSelections() {
  const load = useServerFn(getWorkingSelections);
  return useQuery({ queryKey: workingSelectionQueryKey, queryFn: () => load() });
}
export function useManagerPhotos(
  properties: { photos?: { path: string; kind?: string }[] }[],
  all = false,
) {
  const paths = properties.flatMap(
    (p) =>
      p.photos
        ?.filter((f) => !f.kind || f.kind === "photo")
        .slice(0, all ? 100 : 1)
        .map((f) => f.path) ?? [],
  );
  return useQuery({
    queryKey: ["manager-office-photos", paths.join("|")],
    queryFn: () => signedUrls(paths),
    enabled: paths.length > 0,
  });
}
const message = (e: unknown) => (e instanceof Error ? e.message : "Не удалось сохранить");
export function WorkingSelectionsList() {
  const query = useWorkingSelections();
  return (
    <div className="office-workspace">
      <header>
        <div>
          <h1>Подборки</h1>
          <p>Объекты для показа, связь со сделкой и впечатления клиента</p>
        </div>
        <Link className="of-primary of-button" to="/objects">
          <Plus size={16} />
          Собрать подборку
        </Link>
      </header>
      <OfficeTabs active="selections" />
      {query.isPending ? (
        <p>Загрузка…</p>
      ) : query.error ? (
        <p role="alert">
          {query.error.message}
          <button onClick={() => void query.refetch()}>Повторить</button>
        </p>
      ) : !query.data?.selections.length ? (
        <section className="of-panel of-empty">
          Пока нет подборок. Отметьте объекты в каталоге и нажмите «Подготовить подборку».
        </section>
      ) : (
        <div className="of-selection-list">
          {query.data.selections.map((s) => (
            <Link
              className="of-panel of-selection-summary"
              key={s.id}
              to="/selections/$id"
              params={{ id: s.id }}
            >
              <div>
                <h2>{s.name}</h2>
                <p>
                  {s.items.length} объектов
                  {s.showingDate ? " · " + s.showingDate.split("-").reverse().join(".") : ""}
                  {s.dealId
                    ? " · " +
                      (query.data.deals.find((d) => d.id === s.dealId)?.title ?? "Сделка CRM")
                    : ""}
                </p>
              </div>
              <span>
                <Heart size={14} /> {s.items.filter((i) => i.outcome === "liked").length}{" "}
                понравилось →
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
export function OfficeTabs({ active }: { active: "objects" | "selections" }) {
  return (
    <nav className="of-tabs">
      <Link className={active === "objects" ? "active" : ""} to="/objects">
        Объекты
      </Link>
      <Link className={active === "selections" ? "active" : ""} to="/selections">
        Подборки
      </Link>
      <Link to="/calendar">Календарь</Link>
    </nav>
  );
}
export function WorkingSelectionPage({ id }: { id: string }) {
  const query = useWorkingSelections(),
    catalog = useManagerCatalog();
  if (query.isPending || catalog.isPending) return <p className="p-6">Загрузка подборки…</p>;
  if (query.error || catalog.error)
    return (
      <p className="p-6" role="alert">
        {query.error?.message || catalog.error?.message}
      </p>
    );
  if (!query.data || !catalog.data) return null;
  const initial = query.data.selections.find((s) => s.id === id);
  if (id !== "new" && !initial)
    return (
      <div className="office-workspace">
        <Link to="/selections">← Подборки</Link>
        <p>Подборка не найдена или удалена.</p>
      </div>
    );
  return (
    <SelectionEditor key={id} initial={initial} workspace={catalog.data} deals={query.data.deals} />
  );
}
function SelectionEditor({
  initial,
  workspace,
  deals,
}: {
  initial?: WorkingSelection | undefined;
  workspace: NonNullable<ReturnType<typeof useManagerCatalog>["data"]>;
  deals: { id: string; title: string; stage: string }[];
}) {
  const navigate = useNavigate(),
    cache = useQueryClient(),
    saveFn = useServerFn(saveWorkingSelectionFn);
  const [id] = useState(() => initial?.id ?? crypto.randomUUID());
  const [version, setVersion] = useState(initial?.version ?? 0),
    [name, setName] = useState(initial?.name ?? "Подборка объектов"),
    [publicComment, setPublicComment] = useState(initial?.publicComment ?? ""),
    [dealId, setDealId] = useState(initial?.dealId ?? ""),
    [date, setDate] = useState(initial?.showingDate ?? ""),
    [items, setItems] = useState<WorkingSelectionItem[]>(
      () =>
        initial?.items ??
        (() => {
          try {
            const ids = JSON.parse(sessionStorage.getItem("office-selection-draft") || "[]");
            return (Array.isArray(ids) ? ids : [])
              .filter(
                (x: unknown) =>
                  typeof x === "string" && workspace.properties.some((p) => p.id === x),
              )
              .map((propertyId: string) => ({
                propertyId,
                outcome: "pending",
                note: "",
                feedback: "",
              }));
          } catch {
            return [];
          }
        })(),
    );
  const [mode, setMode] = useState<"plan" | "results">("plan"),
    [busy, setBusy] = useState(false),
    [addOpen, setAddOpen] = useState(false),
    [addSearch, setAddSearch] = useState(""),
    [share, setShare] = useState<"staff" | "client" | null>(null),
    [code, setCode] = useState(initial?.code ?? ""),
    [error, setError] = useState("");
  const data = {
    id,
    expected: version,
    name,
    publicComment,
    dealId: dealId || null,
    showingDate: date,
    items,
  };
  const value = JSON.stringify({ ...data, expected: 0 });
  const [baseline, setBaseline] = useState(initial ? value : "");
  const dirty = value !== baseline;
  useEffect(() => {
    const leave = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", leave);
    return () => window.removeEventListener("beforeunload", leave);
  }, [dirty]);
  const photos = useManagerPhotos(workspace.properties);
  const property = (id: string) => workspace.properties.find((p) => p.id === id);
  const label = (id: string) => {
    const p = property(id);
    return p?.internal_name || p?.title || "Объект удалён";
  };
  const image = (id: string) =>
    photos.data?.[property(id)?.photos?.find((f) => !f.kind || f.kind === "photo")?.path ?? ""];
  const patch = (id: string, patch: Partial<WorkingSelectionItem>) =>
    setItems((current) => current.map((i) => (i.propertyId === id ? { ...i, ...patch } : i)));
  async function save() {
    if (busy) return false;
    setBusy(true);
    setError("");
    try {
      const result = await saveFn({ data });
      setVersion(result.version);
      setCode(result.code);
      setBaseline(value);
      await cache.invalidateQueries({ queryKey: workingSelectionQueryKey });
      return result;
    } catch (e) {
      setError(message(e));
      toast.error(message(e));
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function shareSelection(kind: "staff" | "client") {
    if (dirty || !code) {
      const result = await save();
      if (!result) return;
    }
    setShare(kind);
  }
  const shareUrl =
    share === "client"
      ? selectionPublicUrl(code)
      : typeof window !== "undefined"
        ? `${window.location.origin}/selections/${id}`
        : "";
  async function copy() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.success("Ссылка скопирована");
    } catch {
      toast.error("Скопируйте ссылку из поля ниже");
    }
  }
  const dragging = useRef<{
    source: string;
    target: string | null;
    after: boolean;
    pointer: number;
    startY: number;
    startX: number;
    active: boolean;
  } | null>(null);
  const clearDrag = () => {
    dragging.current = null;
    document
      .querySelectorAll(".of-dragging,.of-drop-before,.of-drop-after")
      .forEach((el) => el.classList.remove("of-dragging", "of-drop-before", "of-drop-after"));
  };
  useEffect(() => () => clearDrag(), []);
  const move = (id: string, direction: number) =>
    setItems((current) => {
      const index = current.findIndex((i) => i.propertyId === id),
        target = current[index + direction];
      return target ? reorderSelection(current, id, target.propertyId, direction > 0) : current;
    });
  const unlisted = items.filter((i) => !property(i.propertyId)?.published);
  return (
    <div className="office-workspace">
      <Link className="of-back" to="/selections">
        ← Все подборки
      </Link>
      <header>
        <div>
          <h1>{name || "Подборка объектов"}</h1>
          <p>Подготовка к показам и обратная связь по каждому объекту</p>
        </div>
        <div className="of-actions">
          <button onClick={() => void shareSelection("staff")} disabled={busy || !items.length}>
            <Share2 size={15} />
            Поделиться с сотрудниками
          </button>
          <button
            onClick={() => void shareSelection("client")}
            disabled={busy || !items.length || !!unlisted.length}
          >
            <Send size={15} />
            Отправить клиенту
          </button>
        </div>
      </header>
      <section className="of-panel of-edit-meta">
        <label>
          Название подборки
          <input value={name} maxLength={160} onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          Сделка CRM
          <select value={dealId} onChange={(e) => setDealId(e.target.value)}>
            <option value="">Без привязки к сделке</option>
            {deals.map((d) => (
              <option value={d.id} key={d.id}>
                {d.title} · {d.stage}
              </option>
            ))}
          </select>
        </label>
        {dealId && workspace.actor.role === "admin" && (
          <Link
            to="/crm/deals"
            search={{ deal: dealId, funnel: undefined }}
            className="of-deal-link"
          >
            Открыть сделку ↗
          </Link>
        )}
        <label>
          Дата показов
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="of-public-comment">
          Комментарий для клиента
          <textarea
            rows={2}
            value={publicComment}
            maxLength={3000}
            onChange={(e) => setPublicComment(e.target.value)}
            placeholder="Будет виден в подборке на сайте"
          />
        </label>
      </section>
      <div className="of-metrics">
        <div>
          <b>{items.length}</b>
          <span>объектов</span>
        </div>
        <div>
          <b>{items.filter((i) => i.outcome !== "pending").length}</b>
          <span>показано</span>
        </div>
        <div>
          <b>{items.filter((i) => i.outcome === "liked").length}</b>
          <span>понравилось</span>
        </div>
      </div>
      <div className="of-toolbar">
        <nav className="of-segment">
          <button className={mode === "plan" ? "active" : ""} onClick={() => setMode("plan")}>
            Перед показом
          </button>
          <button className={mode === "results" ? "active" : ""} onClick={() => setMode("results")}>
            Итоги показа
          </button>
        </nav>
        <button onClick={() => setAddOpen(true)}>
          <Plus size={15} />
          Добавить объекты
        </button>
      </div>
      {unlisted.length > 0 && (
        <p className="of-notice">
          Для клиентской ссылки все объекты должны быть опубликованы на сайте. Сейчас не
          опубликованы: {unlisted.map((i) => label(i.propertyId)).join(", ")}.
        </p>
      )}
      {mode === "results" && (
        <p className="of-subtle">
          Сохранённые результаты видны в связанной сделке. Этап сделки автоматически не меняется.
        </p>
      )}
      <section
        className="of-showing-list"
        onPointerMove={(e) => {
          const d = dragging.current;
          if (!d || d.pointer !== e.pointerId) return;
          if (!d.active && Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < 5) return;
          d.active = true;
          document
            .querySelector(`[data-working-property="${d.source}"]`)
            ?.classList.add("of-dragging");
          document
            .querySelectorAll(".of-drop-before,.of-drop-after")
            .forEach((el) => el.classList.remove("of-drop-before", "of-drop-after"));
          const row = document
            .elementFromPoint(e.clientX, e.clientY)
            ?.closest<HTMLElement>("[data-working-property]");
          d.target = null;
          if (row && row.dataset["workingProperty"] !== d.source) {
            d.target = row.dataset["workingProperty"]!;
            const rect = row.getBoundingClientRect();
            d.after = e.clientY > rect.top + rect.height / 2;
            row.classList.add(d.after ? "of-drop-after" : "of-drop-before");
          }
          if (e.clientY > innerHeight - 65) window.scrollBy(0, 14);
          else if (e.clientY < 65) window.scrollBy(0, -14);
        }}
        onPointerUp={() => {
          const d = dragging.current;
          if (d?.active && d.target)
            setItems((current) => reorderSelection(current, d.source, d.target!, d.after));
          clearDrag();
        }}
        onPointerCancel={clearDrag}
      >
        {items.map((item, index) => {
          const p = property(item.propertyId);
          return (
            <article
              className="of-showing-row"
              key={item.propertyId}
              data-working-property={item.propertyId}
            >
              <div className="of-order">
                <small>{String(index + 1).padStart(2, "0")}</small>
                <button
                  className="of-drag"
                  aria-label={`Перетащить ${label(item.propertyId)}`}
                  title="Перетащите для изменения порядка"
                  onPointerDown={(e) => {
                    if (e.button !== 0) return;
                    e.preventDefault();
                    e.currentTarget.setPointerCapture(e.pointerId);
                    dragging.current = {
                      source: item.propertyId,
                      target: null,
                      after: false,
                      pointer: e.pointerId,
                      startY: e.clientY,
                      startX: e.clientX,
                      active: false,
                    };
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") clearDrag();
                    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                      e.preventDefault();
                      move(item.propertyId, e.key === "ArrowUp" ? -1 : 1);
                    }
                  }}
                >
                  <GripVertical size={18} />
                </button>
                <div className="of-arrows">
                  <button
                    disabled={!index}
                    onClick={() => move(item.propertyId, -1)}
                    aria-label={`Поднять ${label(item.propertyId)}`}
                  >
                    <ArrowUp size={12} />
                  </button>
                  <button
                    disabled={index === items.length - 1}
                    onClick={() => move(item.propertyId, 1)}
                    aria-label={`Опустить ${label(item.propertyId)}`}
                  >
                    <ArrowDown size={12} />
                  </button>
                </div>
              </div>
              <div className="of-object">
                <div className="of-object-top">
                  {image(item.propertyId) ? (
                    <img
                      src={image(item.propertyId)}
                      alt={label(item.propertyId)}
                      draggable={false}
                    />
                  ) : (
                    <div className="of-no-photo">Нет фото</div>
                  )}
                  <div>
                    <Link
                      to="/objects/$id"
                      params={{ id: item.propertyId }}
                      className="of-object-name"
                    >
                      {label(item.propertyId)}
                    </Link>
                    <p>
                      {p?.area ? `${p.area} м² · ` : ""}
                      {p ? roomsLabel(p.rooms) : ""}
                      {p?.floor ? ` · ${p.floor} этаж` : ""}
                    </p>
                    {p?.address && (
                      <a
                        className="of-address"
                        href={yandexMapsUrl(p.address)}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {p.address} ↗
                      </a>
                    )}
                    <strong className="of-object-price">
                      {formatMoney(p?.price_month)} / месяц
                    </strong>
                    {p?.seasonal_pricing && p.summer_price_month != null && (
                      <small>Летом {formatMoney(p.summer_price_month)} / месяц</small>
                    )}
                  </div>
                </div>
                {mode === "plan" ? (
                  <>
                    <p className="of-internal-note">
                      {workspace.notes.find((n) => n.property_id === item.propertyId)?.note}
                    </p>
                    <label className="of-note-label">
                      Заметка к этому показу
                      <textarea
                        value={item.note}
                        maxLength={3000}
                        rows={2}
                        placeholder="Что уточнить на показе"
                        onChange={(e) => patch(item.propertyId, { note: e.target.value })}
                      />
                    </label>
                  </>
                ) : (
                  <label className="of-note-label">
                    Комментарий к результату
                    <textarea
                      value={item.feedback}
                      maxLength={3000}
                      rows={2}
                      placeholder="Что понравилось, что не подошло"
                      onChange={(e) => patch(item.propertyId, { feedback: e.target.value })}
                    />
                  </label>
                )}
              </div>
              <div className="of-outcome">
                {mode === "results" ? (
                  <>
                    <small>Реакция клиента</small>
                    {(["liked", "thinking", "rejected"] as const).map((outcome) => (
                      <button
                        className={item.outcome === outcome ? "active " + outcome : ""}
                        aria-pressed={item.outcome === outcome}
                        onClick={() =>
                          patch(item.propertyId, {
                            outcome: item.outcome === outcome ? "shown" : outcome,
                          })
                        }
                        key={outcome}
                      >
                        {outcomeLabels[outcome]}
                      </button>
                    ))}
                    <button
                      className="of-text"
                      onClick={() =>
                        patch(item.propertyId, {
                          outcome: item.outcome === "pending" ? "shown" : "pending",
                        })
                      }
                    >
                      {item.outcome === "pending" ? "Отметить «Показан»" : "Сбросить результат"}
                    </button>
                  </>
                ) : (
                  <span className={"of-result " + item.outcome}>{outcomeLabels[item.outcome]}</span>
                )}
                <button
                  className="of-remove"
                  aria-label={`Убрать ${label(item.propertyId)}`}
                  onClick={() => {
                    if (
                      (item.note || item.feedback || item.outcome !== "pending") &&
                      !window.confirm(
                        "Убрать объект вместе с его заметкой и результатом из этой подборки?",
                      )
                    )
                      return;
                    setItems((current) => current.filter((i) => i.propertyId !== item.propertyId));
                  }}
                >
                  <Trash2 size={13} />
                  Убрать из подборки
                </button>
              </div>
            </article>
          );
        })}
        {!items.length && <div className="of-empty">Добавьте объекты из каталога.</div>}
      </section>
      <p className="of-subtle of-center">
        Перетаскивайте объекты за ⠿ слева. Клиент увидит тот же порядок. Внутренние заметки и
        результаты на сайте не показываются.
      </p>
      <div className="of-savebar">
        <span>
          {error ? (
            <span role="alert" className="of-error">
              {error}
            </span>
          ) : dirty ? (
            "Есть несохранённые изменения"
          ) : (
            "Все изменения сохранены"
          )}
        </span>
        <button
          className="of-primary"
          disabled={busy || !items.length || (!dirty && !!code)}
          onClick={async () => {
            const result = await save();
            if (result) {
              toast.success("Подборка сохранена");
              if (!initial) void navigate({ to: "/selections/$id", params: { id }, replace: true });
            }
          }}
        >
          {busy ? "Сохраняем…" : "Сохранить подборку"}
        </button>
      </div>
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Добавить объекты</DialogTitle>
            <DialogDescription>Выбранные объекты добавятся в конец подборки.</DialogDescription>
          </DialogHeader>
          <input
            className="of-dialog-input"
            placeholder="Название или адрес"
            value={addSearch}
            onChange={(e) => setAddSearch(e.target.value)}
          />
          <div className="of-add-list">
            {workspace.properties
              .filter(
                (p) =>
                  p.status !== "archived" &&
                  !items.some((i) => i.propertyId === p.id) &&
                  `${p.internal_name} ${p.title} ${p.address}`
                    .toLowerCase()
                    .includes(addSearch.toLowerCase()),
              )
              .map((p) => (
                <button
                  key={p.id}
                  onClick={() =>
                    setItems((v) => [
                      ...v,
                      { propertyId: p.id, outcome: "pending", note: "", feedback: "" },
                    ])
                  }
                  disabled={items.length >= 100}
                >
                  <span>
                    {label(p.id)}
                    <small>{formatMoney(p.price_month)} / месяц</small>
                  </span>
                  <Plus size={15} />
                </button>
              ))}
          </div>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!share}
        onOpenChange={(v) => {
          if (!v) {
            setShare(null);
            if (!initial && code)
              void navigate({ to: "/selections/$id", params: { id }, replace: true });
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {share === "staff" ? "Поделиться с сотрудниками" : "Отправить клиенту"}
            </DialogTitle>
            <DialogDescription>
              {share === "staff"
                ? "Сотруднику потребуется войти в RM OS. Он увидит рабочие заметки, сделку и результаты."
                : "Клиент увидит ту же подборку на сайте: фотографии, характеристики и условия аренды."}
            </DialogDescription>
          </DialogHeader>
          <input
            className="of-dialog-input"
            value={shareUrl}
            readOnly
            aria-label="Ссылка на подборку"
            onFocus={(e) => e.target.select()}
          />
          <button className="of-share-copy" onClick={() => void copy()}>
            Скопировать ссылку
          </button>
          <a href={shareUrl} target="_blank" rel="noopener noreferrer">
            {share === "staff" ? "Открыть рабочую подборку" : "Посмотреть глазами клиента"} ↗
          </a>
          <p className="text-xs text-muted-foreground">
            Ссылка сохранится после изменения подборки. Сообщение автоматически не отправляется.
          </p>
        </DialogContent>
      </Dialog>
    </div>
  );
}
export function DealWorkingSelections({ dealId }: { dealId: string }) {
  const q = useWorkingSelections();
  const catalog = useManagerCatalog();
  if (q.error) return <p role="alert">Не удалось загрузить подборки сделки: {q.error.message}</p>;
  const selections = q.data?.selections.filter((s) => s.dealId === dealId) ?? [];
  if (!selections.length) return null;
  return (
    <section className="mt-5 space-y-3">
      <h3 className="font-semibold">Подборки и итоги показов</h3>
      {selections.map((s) => (
        <div key={s.id} className="rounded-lg border p-4">
          <Link to="/selections/$id" params={{ id: s.id }} className="font-medium text-primary">
            {s.name} ↗
          </Link>
          {s.items.map((i) => (
            <div key={i.propertyId} className="mt-2 text-xs">
              <b>
                {catalog.data?.properties.find((p) => p.id === i.propertyId)?.internal_name ||
                  catalog.data?.properties.find((p) => p.id === i.propertyId)?.title ||
                  "Объект"}{" "}
                — {outcomeLabels[i.outcome]}
              </b>
              {i.feedback && (
                <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{i.feedback}</p>
              )}
            </div>
          ))}
        </div>
      ))}
    </section>
  );
}
