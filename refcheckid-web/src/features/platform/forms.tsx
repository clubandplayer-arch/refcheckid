"use client";
import { useCallback, useEffect, useState } from "react";
import { platformGet, params } from "./api";
import { Button } from "@/components/ui/button";
export interface Field {
  onValueChange?: (value: string) => void;
  remote?: string;
  valueKey?: string;
  key: string;
  label: string;
  type?:
    "text" | "email" | "number" | "datetime-local" | "password" | "checkbox";
  optional?: boolean;
  options?: readonly { id: string; name: string }[];
  value?: string;
}
export function ActionForm({
  title,
  fields,
  onSubmit,
  button = "Salva",
  disabled = false,
}: {
  title: string;
  fields: readonly Field[];
  onSubmit: (data: Record<string, unknown>) => Promise<unknown>;
  button?: string;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [revision, setRevision] = useState(0);
  return (
    <form
      className="space-y-3 rounded-xl border p-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const data: Record<string, unknown> = Object.fromEntries(
          new FormData(form),
        );
        for (const field of fields) {
          if (field.type === "datetime-local" && data[field.key])
            data[field.key] = new Date(String(data[field.key])).toISOString();
          if (field.type === "checkbox")
            data[field.key] = Object.hasOwn(data, field.key);
        }
        setBusy(true);
        setError("");
        try {
          await onSubmit(data);
          form.reset();
          setRevision((value) => value + 1);
        } catch (error) {
          setError(
            error instanceof Error ? error.message : "Operazione non riuscita.",
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <h3 className="font-semibold">{title}</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        {fields.map((field) => (
          <label
            key={`${field.key}:${revision}`}
            className="block space-y-1 text-sm"
          >
            <span>
              {field.label}
              {field.optional ? " (facoltativo)" : ""}
            </span>
            {field.remote ? (
              <RemoteChoice field={field} />
            ) : field.options ? (
              <select
                className="w-full rounded-lg border p-2"
                name={field.key}
                required={!field.optional}
                defaultValue={field.value ?? ""}
              >
                <option value="">Seleziona…</option>
                {field.options.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            ) : (
              <input
                className="w-full rounded-lg border p-2"
                name={field.key}
                type={field.type ?? "text"}
                maxLength={field.type === "password" ? 128 : 2000}
                required={!field.optional}
                defaultValue={field.value ?? ""}
              />
            )}
          </label>
        ))}
      </div>
      {error ? (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={busy || disabled}>
        {busy ? "Salvataggio…" : button}
      </Button>
    </form>
  );
}
export function Pager({
  next,
  onNext,
  onPrevious,
  previous,
}: {
  next: string | null;
  onNext: () => void;
  onPrevious: () => void;
  previous: boolean;
}) {
  return (
    <div className="flex gap-2">
      <Button type="button" disabled={!previous} onClick={onPrevious}>
        Precedente
      </Button>
      <Button type="button" disabled={!next} onClick={onNext}>
        Successiva
      </Button>
    </div>
  );
}
export const roleNames: Record<string, string> = {
  org_admin: "Amministratore ente",
  registrar: "Tesseramenti e anagrafiche",
  competition_manager: "Responsabile campionati",
  designator: "Designatore arbitrale",
  photo_reviewer: "Revisore foto",
  viewer: "Consultazione",
  referee: "Arbitro",
  club_manager: "Dirigente società",
};
export const sports = [
  { id: "football", name: "Calcio" },
  { id: "basketball", name: "Pallacanestro" },
  { id: "volleyball", name: "Pallavolo" },
];

export function RemoteChoice({ field }: { field: Field }) {
  const [search, setSearch] = useState(""),
    [rows, setRows] = useState<{ id: string; name: string }[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [chosen, setChosen] = useState({ id: "", name: "" }),
    [error, setError] = useState("");
  const load = useCallback(
    async (
      after: string | null,
      append: boolean,
      active: () => boolean = () => true,
    ) => {
      try {
        const page = await platformGet<{
          items: Record<string, unknown>[];
          nextCursor: string | null;
        }>(`${field.remote}&${params({ search, cursor: after })}`);
        if (!active()) return;
        const options = page.items.map((row) => ({
          id: String(row[field.valueKey ?? "id"]),
          name: String(
            row.name ??
              row.officialName ??
              (row.externalCode
                ? `${row.externalCode} · ${row.homeName ?? ""} – ${row.awayName ?? ""}`
                : `${row.firstName ?? ""} ${row.lastName ?? ""} · ${row.code ?? ""} ${row.season ?? ""}`),
          ),
        }));
        setRows((previous) => (append ? [...previous, ...options] : options));
        setCursor(page.nextCursor);
        setError("");
      } catch (error) {
        if (active())
          setError(
            error instanceof Error ? error.message : "Elenco non disponibile.",
          );
      }
    },
    [field.remote, field.valueKey, search],
  );
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      void load(null, false, () => active);
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [load]);
  useEffect(() => {
    setChosen({ id: "", name: "" });
  }, [field.remote]);
  return (
    <span className="block space-y-1">
      <input
        aria-label={`Cerca ${field.label.toLowerCase()}`}
        className="w-full rounded border p-2"
        placeholder="Cerca per nome o codice…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <select
        className="w-full rounded border p-2"
        name={field.key}
        required={!field.optional}
        value={chosen.id}
        onChange={(e) => {
          setChosen(
            rows.find((r) => r.id === e.target.value) ?? { id: "", name: "" },
          );
          field.onValueChange?.(e.target.value);
        }}
      >
        <option value="">Seleziona…</option>
        {chosen.id && !rows.some((r) => r.id === chosen.id) ? (
          <option value={chosen.id}>{chosen.name}</option>
        ) : null}
        {rows.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name}
          </option>
        ))}
      </select>
      {cursor ? (
        <button
          className="text-blue-700 underline"
          type="button"
          onClick={() => void load(cursor, true)}
        >
          Carica altri risultati
        </button>
      ) : null}
      {error ? (
        <span role="alert" className="text-red-700">
          {error}
        </span>
      ) : null}
    </span>
  );
}
