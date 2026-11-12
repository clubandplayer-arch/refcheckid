"use client";
import {sportCatalog} from "refcheckid-backend/sports";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  platformGet,
  platformPost,
  params,
  type ImportJob,
  type ImportKind,
  type ImportRow,
  type Page,
} from "./api";
import { statusName } from "./workspace";
import { Pager } from "./forms";
const names: Record<ImportKind, string> = {
  clubs: "Società",
  teams: "Squadre",
  players: "Giocatori e tesseramenti",
  staff: "Staff e tesseramenti",
  officials: "Arbitri",
  fixtures: "Calendario gare",
  appointments: "Designazioni (in bozza)",
};
const labels: Record<string, string> = {
  code: "Codice",
  name: "Nome",
  club_code: "Codice società",
  sport: "Disciplina",
  season: "Stagione",
  category: "Categoria",
  first_name: "Nome",
  last_name: "Cognome",
  birth_date: "Data nascita YYYY-MM-DD",
  role: "Ruolo / incarico",
  sports: "Discipline arbitro",
  home_team_code: "Codice squadra casa",
  away_team_code: "Codice squadra ospite",
  scheduled_at: "Data e ora con fuso",
  venue: "Impianto",
  round: "Giornata",
  fixture_code: "Codice gara",
  official_code: "Matricola arbitro",
};
const csvCell = (value: string) =>
  `"${(/^[=+\-@]/.test(value) ? "'" : "") + value.replaceAll('"', '""')}"`;
function download(filename: string, text: string) {
  const url = URL.createObjectURL(
    new Blob(["\uFEFF" + text], { type: "text/csv;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
export function ImportPanel({
  scope,
  competitions,
  competitionId,
  allowedKinds = Object.keys(names) as ImportKind[],
}: {
  scope: { organizationId: string; unitId: string };
  competitions: { id: string; name: string }[];
  competitionId: string;
  allowedKinds?: readonly ImportKind[];
}) {
  const [kind, setKind] = useState<ImportKind>(allowedKinds[0] ?? "clubs"),
    [comp, setComp] = useState(competitionId),
    [file, setFile] = useState<File | null>(null),
    [uploadId, setUploadId] = useState(""),
    [job, setJob] = useState<ImportJob | null>(null),
    [busy, setBusy] = useState(false),
    [auto, setAuto] = useState(false),
    [error, setError] = useState("");
  const [mapping, setMapping] = useState<Record<string, string>>({}),
    [mappingInfo, setMappingInfo] = useState<{
      headers: string[];
      required: string[];
    } | null>(null),
    [cursors, setCursors] = useState<(string | null)[]>([null]),
    [historyCursors, setHistoryCursors] = useState<(string | null)[]>([null]);
  const models = useQuery({
    queryKey: ["platform", "import-models"],
    queryFn: () => platformGet<Record<ImportKind, string[]>>("import-models"),
  });
  const history = useQuery({
    queryKey: [
      "platform",
      "import-history",
      scope,
      job?.status,
      historyCursors.at(-1),
    ],
    queryFn: () =>
      platformGet<Page<ImportJob>>(
        `entities/imports?${params({ ...scope, cursor: historyCursors.at(-1) })}`,
      ),
  });
  const rows = useQuery({
    queryKey: [
      "platform",
      "import-rows",
      job?.id,
      job?.validated,
      job?.processed,
      cursors.at(-1),
    ],
    queryFn: () =>
      platformGet<Page<ImportRow>>(
        `imports/${job!.id}/rows?${params({ cursor: cursors.at(-1) })}`,
      ),
    enabled: !!job && job.validated > 0,
  });
  useEffect(() => {
    if (!auto || !job || !["validating", "running"].includes(job.status))
      return;
    const timer = setTimeout(() => {
      void platformPost<ImportJob>(`imports/${job.id}/advance`, {
        action: "advance",
      })
        .then(setJob)
        .catch((error) => {
          setAuto(false);
          setError(
            error instanceof Error
              ? error.message
              : "Elaborazione interrotta. Puoi riprendere.",
          );
        });
    }, 300);
    return () => clearTimeout(timer);
  }, [auto, job]);
  async function prepare() {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      let id = uploadId;
      if (!id) {
        const bytes = await file.arrayBuffer();
        const digest = await crypto.subtle.digest("SHA-256", bytes);
        const sha256 = [...new Uint8Array(digest)]
          .map((v) => v.toString(16).padStart(2, "0"))
          .join("");
        const upload = await platformPost<{
          id: string;
          url: string;
          method: string;
          local: boolean;
        }>("imports/upload", {
          ...scope,
          competitionId: comp || undefined,
          kind,
          filename: file.name,
          size: file.size,
          sha256,
        });
        id = upload.id;
        setUploadId(id);
        if (!upload.local) {
          const response = await fetch(upload.url, {
            method: upload.method,
            headers: { "content-type": "application/octet-stream" },
            body: file,
          });
          if (!response.ok)
            throw new Error(
              "Caricamento del file non riuscito. Riprova scegliendo nuovamente il file.",
            );
        } else {
          const contentBase64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result).split(",")[1]);
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });
          const result = await platformPost<
            | ImportJob
            | { mappingRequired: true; headers: string[]; required: string[] }
          >("imports/prepare", { uploadId: id, contentBase64, mapping });
          if ("mappingRequired" in result) {
            setMappingInfo(result);
            return;
          }
          setJob(result);
          setAuto(true);
          return;
        }
      }
      const result = await platformPost<
        | ImportJob
        | { mappingRequired: true; headers: string[]; required: string[] }
      >("imports/prepare", { uploadId: id, mapping });
      if ("mappingRequired" in result) {
        setMappingInfo(result);
        return;
      }
      setMappingInfo(null);
      setJob(result);
      setAuto(true);
    } catch (error) {
      setAuto(false);
      setError(
        error instanceof Error ? error.message : "Importazione non riuscita.",
      );
    } finally {
      setBusy(false);
    }
  }
  const columns = models.data?.[kind] ?? [];
  const optionalColumns =
    kind === "clubs"
      ? ["existing_club_id", "fiscal_code"]
      : ["players", "staff"].includes(kind)
        ? ["team_code", "status", "existing_person_id"]
        : kind === "fixtures"
          ? ["duration_minutes"]
          : [];
  return (
    <Card className="space-y-4">
      <h2 className="text-xl font-bold">Importazione guidata</h2>
      <p className="text-sm">
        CSV UTF-8 o Excel XLSX, un foglio, massimo 5 MB e 10.000 righe.
        L’anteprima non modifica le anagrafiche. Conferma solo dopo la
        validazione.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label>
          Tipo di dati
          <select
            className="block w-full rounded-lg border p-2"
            value={kind}
            onChange={(e) => {
              setKind(e.target.value as ImportKind);
              setJob(null);
              setUploadId("");
              setMappingInfo(null);
              setMapping({});
            }}
          >
            {Object.entries(names)
              .filter(([kind]) => allowedKinds.includes(kind as ImportKind))
              .map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
          </select>
        </label>
        {["fixtures", "appointments"].includes(kind) ? (
          <label>
            Campionato
            <select
              className="block w-full rounded-lg border p-2"
              value={comp}
              onChange={(e) => {
                setComp(e.target.value);
                setUploadId("");
              }}
            >
              <option value="">Seleziona…</option>
              {competitions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>
      <Button
        type="button"
        disabled={!columns.length}
        onClick={() =>
          download(
            `modello-${kind}.csv`,
            [...columns, ...optionalColumns].map(csvCell).join(";") + "\r\n",
          )
        }
      >
        Scarica modello CSV
      </Button>
      <p className="text-xs text-slate-600">
        Campi obbligatori:{" "}
        {columns.map((key) => labels[key] ?? key).join(" · ")}. Campi
        facoltativi: {optionalColumns.join(", ") || "nessuno"}. team_code
        assegna direttamente alla rosa; status accetta active, suspended, ended.
        existing_club_id / existing_person_id si usano solo per collegare dati
        storici già presenti, senza cambiare i loro identificativi. Discipline:
        usa i codici del catalogo qui sotto. Incarichi arbitrali: principal,
        assistant, table. Date gara: ad esempio 2026-12-01T15:00:00+01:00.
      </p>
      <details className="rounded border p-3 text-sm"><summary>Catalogo discipline e codici per importazione ({sportCatalog.length})</summary><ul className="mt-2 space-y-1">{sportCatalog.map(sport=><li key={sport.id}>{sport.name}: <code>{sport.id}</code></li>)}</ul></details>
      <label className="block">
        Seleziona file
        <input
          className="block w-full rounded-lg border p-2"
          type="file"
          accept=".csv,.xlsx"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setUploadId("");
            setJob(null);
            setMappingInfo(null);
            setMapping({});
            setAuto(false);
            setError("");
          }}
        />
      </label>
      {mappingInfo ? (
        <fieldset className="space-y-2 rounded-lg border p-3">
          <legend>Associa le colonne del tuo file</legend>
          {mappingInfo.required.map((key) => (
            <label className="block text-sm" key={key}>
              {labels[key] ?? key}
              <select
                className="block w-full rounded-lg border p-2"
                value={
                  mapping[key] ?? (mappingInfo.headers.includes(key) ? key : "")
                }
                onChange={(e) =>
                  setMapping((value) => ({ ...value, [key]: e.target.value }))
                }
              >
                <option value="">Seleziona colonna…</option>
                {mappingInfo.headers.map((header) => (
                  <option key={header} value={header}>
                    {header}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </fieldset>
      ) : null}
      <Button
        type="button"
        disabled={
          busy ||
          !file ||
          file.size > 5 * 1024 * 1024 ||
          (["fixtures", "appointments"].includes(kind) && !comp)
        }
        onClick={() => void prepare()}
      >
        {busy
          ? "Preparazione…"
          : mappingInfo
            ? "Valida mappatura"
            : "Carica e prepara anteprima"}
      </Button>
      {error ? (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-700">
          {error}
        </p>
      ) : null}
      {job ? (
        <section className="space-y-3 rounded-lg border p-3">
          <h3 className="font-bold">{job.filename}</h3>
          <p role="status">
            {statusName(job.status)} · Righe: {job.total} · Validate:{" "}
            {job.validated} · Errori: {job.errors} · Applicate: {job.processed}
          </p>
          <p className="text-xs">
            Elaborazione a blocchi: puoi interrompere la schermata e riprendere
            dall’ultimo blocco salvato. I blocchi già applicati restano indicati
            nel rapporto.
          </p>
          {["validating", "running"].includes(job.status) ? (
            <Button type="button" onClick={() => setAuto(!auto)}>
              {auto ? "Pausa elaborazione" : "Riprendi elaborazione"}
            </Button>
          ) : null}
          {job.status === "preview" ? (
            <Button
              type="button"
              disabled={job.errors > 0 || busy}
              onClick={async () => {
                setBusy(true);
                try {
                  setJob(
                    await platformPost<ImportJob>(`imports/${job.id}/advance`, {
                      action: "commit",
                    }),
                  );
                  setAuto(true);
                } catch (e) {
                  setError(
                    e instanceof Error ? e.message : "Conferma non riuscita.",
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              Conferma importazione
            </Button>
          ) : null}
          {!job.processed &&
          job.status !== "completed" &&
          job.status !== "cancelled" ? (
            <Button
              type="button"
              onClick={() => {
                setAuto(false);
                void platformPost<ImportJob>(`imports/${job.id}/advance`, {
                  action: "cancel",
                })
                  .then(setJob)
                  .catch((e) => setError(e.message));
              }}
            >
              Annulla prima dell’applicazione
            </Button>
          ) : null}
          {job.errors > 0 ? (
            <Button
              type="button"
              onClick={async () => {
                let cursor: string | null = null;
                const lines = ["riga;errori"];
                do {
                  const page: Page<ImportRow> = await platformGet<
                    Page<ImportRow>
                  >(`imports/${job.id}/rows?${params({ cursor })}`);
                  for (const row of page.items)
                    if (row.errors.length)
                      lines.push(
                        `${row.number};${csvCell(row.errors.join(" | "))}`,
                      );
                  cursor = page.nextCursor;
                } while (cursor);
                download(`errori-${job.filename}.csv`, lines.join("\r\n"));
              }}
            >
              Scarica rapporto errori
            </Button>
          ) : null}
          {rows.data?.items.map((row) => (
            <div className="rounded border p-2 text-sm" key={row.id}>
              <strong>Riga {row.number}</strong> ·{" "}
              {row.data.code ?? row.data.fixture_code} ·{" "}
              {row.data.name ??
                [row.data.first_name, row.data.last_name]
                  .filter(Boolean)
                  .join(" ")}{" "}
              ·{" "}
              {row.errors.length
                ? row.errors.join(" · ")
                : row.state === "committed"
                  ? "Applicata"
                  : "Valida"}
            </div>
          ))}
          <Pager
            next={rows.data?.nextCursor ?? null}
            previous={cursors.length > 1}
            onPrevious={() => setCursors((s) => s.slice(0, -1))}
            onNext={() =>
              setCursors((s) => [...s, rows.data?.nextCursor ?? null])
            }
          />
        </section>
      ) : null}
      <Pager
        next={history.data?.nextCursor ?? null}
        previous={historyCursors.length > 1}
        onPrevious={() => setHistoryCursors((c) => c.slice(0, -1))}
        onNext={() =>
          setHistoryCursors((c) => [...c, history.data?.nextCursor ?? null])
        }
      />
      <h3 className="font-bold">Importazioni recenti della struttura</h3>
      {history.data?.items.map((item) => (
        <button
          className="block w-full rounded-lg border p-3 text-left text-sm"
          key={item.id}
          onClick={() => {
            setJob(item);
            setAuto(false);
            setCursors([null]);
          }}
        >
          {item.filename} · {statusName(item.status)} · {item.processed}/
          {item.total}
        </button>
      ))}
    </Card>
  );
}
