"use client";
import {
  capabilities,
  type Capability,
} from "refcheckid-backend/platform-types";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ErrorState, SkeletonBlock } from "@/components/ui/state";
import { useSession } from "@/lib/session";
import {
  platformGet,
  platformPost,
  params,
  type Page,
  type Organization,
  type Unit,
  type Membership,
  type Competition,
  type Appointment,
  type Fixture,
  type GameSummary,
  type GameEvent,
} from "./api";
import {
  ActionForm,
  Pager,
  RemoteChoice,
  roleNames,
  sports,
  type Field,
} from "./forms";
import { SquadRoster } from "./squad-roster";
import Link from "next/link";
import {PublicationSettings} from "./publication-settings";
import { ImportPanel } from "./import-panel";
interface Context {
  organizations: Organization[];
  memberships: Membership[];
  legacyFederations: { id: string; name: string }[];
  roles: string[];
}
interface Club {
  id: string;
  clubId: string;
  name: string;
}
interface FixtureView extends Fixture {
  homeName: string;
  awayName: string;
  summary: GameSummary | null;
}
const tabs = [
  "Struttura",
  "Operatori e inviti",
  "Società e squadre",
  "Tesserati",
  "Campionati",
  "Arbitri",
  "Calendario",
  "Designazioni",
  "Deleghe",
  "Importazioni",
  "Risultati",
  "Pubblicazione",
] as const;
export function OrganizationWorkspace() {
  const { session } = useSession();
  const client = useQueryClient();
  const [organizationId, setOrganizationId] = useState(""),
    [unitId, setUnitId] = useState(""),
    [competitionId, setCompetitionId] = useState(""),
    [tab, setTab] = useState<(typeof tabs)[number]>("Struttura");
  const [notice, setNotice] = useState(""),
    [error, setError] = useState(""),
    [invite, setInvite] = useState<{
      code: string;
      activationPath: string;
      expiresAt: string;
    } | null>(null);
  const [recipient, setRecipient] = useState("");
  const [competitionSearch, setCompetitionSearch] = useState(""),
    [competitionCursor, setCompetitionCursor] = useState<string | null>(null);
  const [cursors, setCursors] = useState<(string | null)[]>([null]);
  const cursor = cursors.at(-1) ?? undefined;
  const context = useQuery({
    queryKey: ["platform", "context", session?.user.id],
    queryFn: () => platformGet<Context>("context"),
  });
  const organization =
    context.data?.organizations.find((o) => o.id === organizationId) ??
    context.data?.organizations[0];
  const orgId = organization?.id ?? "";
  const units = useQuery({
    queryKey: ["platform", "units", orgId, session?.user.id],
    queryFn: () =>
      platformGet<Unit[]>(`units?${params({ organizationId: orgId })}`),
    enabled: !!orgId,
  });
  const currentUnit =
    units.data?.find((u) => u.id === unitId) ?? units.data?.[0];
  const scope = { organizationId: orgId, unitId: currentUnit?.id ?? "" };
  const enabled = !!scope.organizationId && !!scope.unitId;
  const competitions = useQuery({
    queryKey: [
      "platform",
      "competitions",
      scope,
      competitionSearch,
      competitionCursor,
      session?.user.id,
    ],
    queryFn: () =>
      platformGet<Page<Competition>>(
        `competitions?${params({ ...scope, search: competitionSearch, cursor: competitionCursor })}`,
      ),
    enabled,
  });
  const competitionDetail = useQuery({
    queryKey: [
      "platform",
      "competition-detail",
      competitionId,
      session?.user.id,
    ],
    queryFn: () => platformGet<Competition>(`competitions/${competitionId}`),
    enabled: !!competitionId,
  });
  const selectedCompetition =
    competitionDetail.data ??
    competitions.data?.items.find((c) => c.id === competitionId) ??
    competitions.data?.items[0];
  const compId = selectedCompetition?.id ?? "";
  const ownCompetition = selectedCompetition?.organizationId === orgId;
  const memberships =
    context.data?.memberships.filter((m) => m.organizationId === orgId) ?? [];
  const ancestors = new Set<string>();
  let ancestor = currentUnit;
  while (ancestor && !ancestors.has(ancestor.id)) {
    ancestors.add(ancestor.id);
    ancestor = units.data?.find((unit) => unit.id === ancestor!.parentId);
  }
  const currentMemberships = memberships.filter(
    (m) =>
      m.unitId === scope.unitId || (m.descendants && ancestors.has(m.unitId)),
  );
  const can = (action: Capability) =>
    session?.user.role === "admin" ||
    currentMemberships.some((m) => capabilities[m.role].includes(action));
  const rootAdmin = can("structure");
  const visibleTabs = tabs.filter(
    (name) =>
      name === "Struttura" ||
      name === "Calendario" ||
      name === "Risultati" ||
      (name === "Operatori e inviti" && (rootAdmin || can("designate"))) ||
      (["Società e squadre", "Tesserati", "Arbitri"].includes(name) &&
        can("people")) ||
      (name === "Campionati" && (can("competitions") || can("designate"))) ||
      (name === "Designazioni" && can("designate")) ||
      (["Deleghe","Pubblicazione"].includes(name) && rootAdmin) ||
      (name === "Importazioni" &&
        (can("people") || can("competitions") || can("designate"))),
  );
  const offeredTabs = visibleTabs.filter(
    (name) =>
      organization?.kind !== "refereeing" ||
      !["Società e squadre", "Tesserati", "Deleghe", "Pubblicazione"].includes(name),
  );
  const importKinds: import("./api").ImportKind[] =
    organization?.kind === "refereeing"
      ? [
          ...(can("people") ? (["officials"] as const) : []),
          ...(can("designate") ? (["appointments"] as const) : []),
        ]
      : [
          ...(can("people")
            ? (["clubs", "teams", "players", "staff", "officials"] as const)
            : []),
          ...(can("competitions") ? (["fixtures"] as const) : []),
          ...(can("designate") ? (["appointments"] as const) : []),
        ];
  const fixtures = useQuery({
    queryKey: ["platform", "fixtures", compId, cursor, session?.user.id],
    queryFn: () =>
      platformGet<Page<FixtureView>>(
        `fixtures?${params({ competitionId: compId, cursor })}`,
      ),
    enabled:
      !!compId && ["Calendario", "Designazioni", "Risultati"].includes(tab),
    refetchInterval: tab === "Risultati" ? 10000 : false,
  });
  const appointments = useQuery({
    queryKey: ["platform", "appointments", compId, cursor, session?.user.id],
    queryFn: () =>
      platformGet<Page<Appointment & { officialName: string }>>(
        `appointments?${params({ ...scope, competitionId: compId, cursor })}`,
      ),
    enabled: !!compId && tab === "Designazioni",
  });
  const legacyClubs = useQuery({
    queryKey: ["platform", "legacy-clubs", scope],
    queryFn: () =>
      platformGet<{ id: string; name: string }[]>(
        `legacy-clubs?${params(scope)}`,
      ),
    enabled:
      enabled &&
      rootAdmin &&
      tab === "Società e squadre" &&
      currentUnit?.id === organization?.rootUnitId,
  });
  useEffect(() => {
    setCursors([null]);
    setError("");
    setNotice("");
  }, [orgId, currentUnit?.id, tab]);
  useEffect(() => {
    setTab("Struttura");
    setCompetitionId("");
    setCompetitionSearch("");
    setCompetitionCursor(null);
    setRecipient("");
    setInvite(null);
  }, [orgId, currentUnit?.id]);
  const remote = (kind: string) => `entities/${kind}?${params(scope)}`;
  async function change(path: string, data: Record<string, unknown> = {}) {
    setError("");
    try {
      const result = await platformPost<unknown>(path, { ...scope, ...data });
      setNotice("Operazione completata.");
      await client.invalidateQueries({ queryKey: ["platform"] });
      return result;
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Operazione non riuscita.",
      );
      throw error;
    }
  }
  const run = (path: string, data: Record<string, unknown> = {}) => {
    void change(path, data).catch(() => undefined);
  };
  if (context.isLoading) return <SkeletonBlock />;
  if (context.isError)
    return (
      <ErrorState
        message={context.error.message}
        onRetry={() => void context.refetch()}
      />
    );
  const selectCompetition = (
    <label className="block space-y-1 text-sm">
      <span>Campionato</span>
      <input
        className="block w-full rounded-lg border p-2"
        aria-label="Cerca campionato"
        placeholder="Cerca per nome…"
        value={competitionSearch}
        onChange={(e) => {
          setCompetitionSearch(e.target.value);
          setCompetitionCursor(null);
        }}
      />
      <select
        className="w-full rounded-lg border p-2"
        value={compId}
        onChange={(event) => {
          setCompetitionId(event.target.value);
          setCursors([null]);
        }}
      >
        {selectedCompetition &&
        !competitions.data?.items.some(
          (c) => c.id === selectedCompetition.id,
        ) ? (
          <option value={selectedCompetition.id}>
            {selectedCompetition.name} · {selectedCompetition.season}
          </option>
        ) : null}
        {competitions.data?.items.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name} · {c.season} · {c.group || c.category}
          </option>
        ))}
      </select>
      {competitions.data?.nextCursor ? (
        <button
          type="button"
          className="text-blue-700 underline"
          onClick={() => setCompetitionCursor(competitions.data!.nextCursor)}
        >
          Carica altri campionati
        </button>
      ) : null}
      {!compId ? (
        <p>
          Crea un campionato o chiedi una delega alla struttura responsabile.
        </p>
      ) : null}
    </label>
  );
  const unitLabel = (unit: Unit) => {
    const names = [unit.name];
    let parent = unit.parentId;
    const seen = new Set([unit.id]);
    while (parent && !seen.has(parent)) {
      seen.add(parent);
      const ancestor = units.data?.find((value) => value.id === parent);
      if (!ancestor) break;
      names.unshift(ancestor.name);
      parent = ancestor.parentId;
    }
    return names.join(" / ");
  };
  const nameField: Field = { key: "name", label: "Nome" };
  const compOptions = [
    ...new Map(
      [
        ...(competitions.data?.items ?? []),
        ...(selectedCompetition ? [selectedCompetition] : []),
      ].map((c) => [c.id, c]),
    ).values(),
  ].map((c) => ({ id: c.id, name: `${c.name} · ${c.season}` }));
  return (
    <div className="space-y-4">
      <Card className="space-y-3">
        <h2 className="text-xl font-bold">Gestione ente</h2>
        <p className="text-sm text-slate-600">
          Seleziona la struttura su cui lavorare. Campionati e dati disponibili
          dipendono dalle tue competenze.
        </p>
        {organization ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <label>
              Ente
              <select
                className="block w-full rounded-lg border p-2"
                aria-label="Ente"
                value={orgId}
                onChange={(e) => {
                  setOrganizationId(e.target.value);
                  setUnitId("");
                  setInvite(null);
                }}
              >
                {context.data?.organizations.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Struttura
              <select
                className="block w-full rounded-lg border p-2"
                aria-label="Struttura"
                value={scope.unitId}
                onChange={(e) => setUnitId(e.target.value)}
              >
                {units.data?.map((u) => (
                  <option key={u.id} value={u.id}>
                    {unitLabel(u)}
                    {u.territory ? ` · ${u.territory}` : ""}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : (
          <p>Configura il tuo primo ente oppure accetta un invito.</p>
        )}
        {units.isError ? <p role="alert">{units.error.message}</p> : null}
      </Card>
      {(!organization || tab === "Struttura") &&
      (session?.user.role === "admin" ||
        (context.data?.legacyFederations.length ?? 0) > 0) ? (
        <ActionForm
          title="Configura un ente"
          button="Crea ente"
          fields={[
            nameField,
            {
              key: "kind",
              label: "Tipo",
              options: [
                { id: "sports", name: "Ente sportivo / lega" },
                { id: "refereeing", name: "Organizzazione arbitrale" },
              ],
            },
            {
              key: "federationId",
              label:
                "Collega una federazione già presente (solo ente sportivo)",
              optional: true,
              options: context.data?.legacyFederations,
            },
          ]}
          onSubmit={(data) => change("organizations", data)}
        />
      ) : null}
      {enabled ? (
        <>
          <div className="flex flex-wrap gap-2">
            {offeredTabs.map((name) => (
              <button
                key={name}
                className={`rounded-lg px-3 py-2 text-sm ${tab === name ? "bg-primary text-white" : "bg-muted"}`}
                onClick={() => setTab(name)}
              >
                {name}
              </button>
            ))}
          </div>
          {notice ? (
            <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm">
              {notice}
            </p>
          ) : null}
          {error ? (
            <p
              role="alert"
              className="rounded-lg bg-red-50 p-3 text-sm text-red-700"
            >
              {error}
            </p>
          ) : null}
          {tab === "Struttura" ? (
            <Card className="space-y-4">
              <h3 className="font-bold">
                {organization?.name} / {currentUnit?.name}
              </h3>
              <ul className="space-y-2">
                {units.data?.map((u) => (
                  <li key={u.id}>
                    {u.name} · {u.kind}
                    {u.parentId ? " · sottostruttura" : ""} {u.territory}
                  </li>
                ))}
              </ul>
              {rootAdmin ? (
                <ActionForm
                  title="Aggiungi comitato, delegazione o sezione"
                  fields={[
                    nameField,
                    {
                      key: "kind",
                      label: "Livello",
                      options: [
                        "regional",
                        "provincial",
                        "section",
                        "sector",
                        "district",
                        "other",
                      ].map((id, index) => ({
                        id,
                        name: [
                          "Regionale",
                          "Provinciale",
                          "Sezione",
                          "Settore",
                          "Distretto",
                          "Altro",
                        ][index],
                      })),
                    },
                    { key: "territory", label: "Territorio", optional: true },
                  ]}
                  onSubmit={(data) =>
                    change("units", { ...data, parentId: scope.unitId })
                  }
                />
              ) : null}
            </Card>
          ) : null}
          {tab === "Operatori e inviti" ? (
            <Card className="space-y-4">
              <ActionForm
                title="Invita un operatore o un arbitro"
                button="Genera invito personale"
                fields={[
                  { key: "displayName", label: "Nome e cognome" },
                  {
                    key: "email",
                    label:
                      "Email federale (senza email verrà usato il codice personale)",
                    type: "email",
                    optional: true,
                  },
                  {
                    key: "descendants",
                    label: "Includi sottostrutture (per i ruoli gestionali)",
                    type: "checkbox",
                    optional: true,
                  },
                  {
                    key: "role",
                    label: "Ruolo",
                    options: Object.entries(roleNames)
                      .filter(([role]) => rootAdmin || role === "referee")
                      .map(([id, name]) => ({ id, name })),
                  },
                  {
                    key: "officialId",
                    label: "Arbitro (obbligatorio per invito arbitro)",
                    optional: true,
                    remote: remote("officials"),
                  },
                  {
                    key: "clubId",
                    label: "Società (obbligatoria per dirigente)",
                    optional: true,
                    remote: remote("clubs"),
                    valueKey: "clubId",
                  },
                ]}
                onSubmit={async (data) => {
                  const result = (await change("invitations", data)) as {
                    code: string;
                    activationPath: string;
                    expiresAt: string;
                  };
                  setInvite(result);
                }}
              />
              {invite ? (
                <div className="rounded-lg border border-amber-300 bg-amber-50 p-3">
                  <p className="font-bold">
                    Invito generato: consegna personalmente questo link al
                    destinatario.
                  </p>
                  <p>
                    Codice di accesso: <strong>{invite.code}</strong>
                  </p>
                  <a
                    className="break-all text-blue-700 underline"
                    href={invite.activationPath}
                  >{`${window.location.origin}${invite.activationPath}`}</a>
                  <p>
                    Scade: {new Date(invite.expiresAt).toLocaleString("it-IT")}.
                    Il link è mostrato solo ora; non è stata inviata un’email.
                  </p>
                </div>
              ) : null}
              {rootAdmin ? (
                <Records
                  title="Operatori attivi"
                  endpoint={`entities/memberships?${params(scope)}`}
                  fields={["displayName", "role", "active"]}
                  actions={(row) => (
                    <Button
                      type="button"
                      disabled={!row.active}
                      onClick={() => run(`memberships/${row.id}/revoke`)}
                    >
                      Revoca accesso
                    </Button>
                  )}
                />
              ) : null}
              <Records
                title="Inviti"
                endpoint={`entities/invitations?${params(scope)}${rootAdmin ? "" : "&role=referee"}`}
                fields={["displayName", "email", "code", "status"]}
                actions={(row) => (
                  <Button
                    type="button"
                    disabled={
                      !["pending", "reserved"].includes(String(row.status))
                    }
                    onClick={() => run(`invitations/${row.id}/revoke`)}
                  >
                    Revoca invito
                  </Button>
                )}
              />
            </Card>
          ) : null}
          {tab === "Società e squadre" ? (
            <Card className="space-y-4">
              <ActionForm
                title="Società: anagrafica stabile fra le stagioni"
                fields={[
                  { key: "code", label: "Codice società" },
                  nameField,
                  {
                    key: "existingClubId",
                    label: "Collega società già presente",
                    optional: true,
                    options: legacyClubs.data ?? [],
                  },
                ]}
                onSubmit={(data) => change("clubs", data)}
              />
              <Records
                title="Società"
                endpoint={`entities/clubs?${params(scope)}`}
                fields={["externalCode", "name"]}
              />
              <ActionForm
                title="Aggiungi squadra stagionale"
                fields={[
                  { key: "code", label: "Codice squadra" },
                  nameField,
                  {
                    key: "clubId",
                    label: "Società",
                    remote: remote("clubs"),
                    valueKey: "clubId",
                  },
                  { key: "sport", label: "Disciplina", options: sports },
                  { key: "season", label: "Stagione", value: "2026/2027" },
                  { key: "category", label: "Categoria" },
                ]}
                onSubmit={(data) => change("teams", data)}
              />
              <Records
                title="Squadre"
                endpoint={`entities/teams?${params(scope)}`}
                fields={["code", "name", "season", "category"]}
              />
            </Card>
          ) : null}
          {tab === "Tesserati" ? (
            <Card className="space-y-4">
              <p className="text-sm">
                Importa giocatori e staff da Importazioni, poi assegna i
                tesseramenti alle rose. Un tesserato può essere abilitato a più
                squadre della stessa società e stagione.
              </p>
              <ActionForm
                title="Assegna un tesserato a una rosa"
                fields={[
                  {
                    key: "personRecordId",
                    label: "Tesserato e stagione",
                    remote: remote("people"),
                  },
                  { key: "teamId", label: "Squadra", remote: remote("teams") },
                ]}
                button="Assegna alla squadra"
                onSubmit={(data) => change("squad-members", data)}
              />
              <SquadRoster
                key={`${orgId}:${scope.unitId}`}
                endpoint={remote("teams")}
              />
              <Records
                title="Tesserati della struttura"
                endpoint={`entities/people?${params(scope)}`}
                fields={[
                  "code",
                  "firstName",
                  "lastName",
                  "kind",
                  "season",
                  "status",
                ]}
                actions={(row) => (
                  <Button
                    type="button"
                    onClick={() =>
                      run(`people/${row.id}/status`, {
                        status:
                          row.status === "active" ? "suspended" : "active",
                      })
                    }
                  >
                    {row.status === "active"
                      ? "Sospendi tesseramento"
                      : "Riattiva tesseramento"}
                  </Button>
                )}
              />
            </Card>
          ) : null}
          {tab === "Campionati" ? (
            <Card className="space-y-4">
              {organization?.kind === "sports" && can("competitions") ? (
                <ActionForm
                  title="Crea campionato e girone"
                  fields={[
                    nameField,
                    { key: "sport", label: "Disciplina", options: sports },
                    { key: "season", label: "Stagione", value: "2026/2027" },
                    { key: "category", label: "Categoria" },
                    { key: "group", label: "Girone", optional: true },
                    {
                      key: "periods",
                      label: "Numero periodi (vuoto: regole standard)",
                      type: "number",
                      optional: true,
                    },
                    {
                      key: "minutesPerPeriod",
                      label: "Minuti per periodo (vuoto: regole standard)",
                      type: "number",
                      optional: true,
                    },
                    {
                      key: "starters",
                      label: "Titolari (vuoto: regole standard)",
                      type: "number",
                      optional: true,
                    },
                  ]}
                  onSubmit={(data) => change("competitions", data)}
                />
              ) : null}
              {selectCompetition}
              {compId ? (
                <Records
                  title="Squadre iscritte al campionato"
                  endpoint={`competitions/${compId}/entries?choices=1`}
                  fields={["code", "name", "season"]}
                />
              ) : null}
              {selectedCompetition ? (
                <p className="text-sm">
                  Regole: {selectedCompetition.rules.periods} periodi ·{" "}
                  {selectedCompetition.rules.minutesPerPeriod} minuti ·{" "}
                  {selectedCompetition.rules.starters} titolari. Versione{" "}
                  {selectedCompetition.rules.version}.
                </p>
              ) : null}
              {organization?.kind === "sports" && can("competitions") ? (
                <ActionForm
                  title="Iscrivi una squadra al campionato"
                  fields={[
                    {
                      key: "teamId",
                      label: "Squadra",
                      remote: `competitions/${compId}/eligible-teams?choices=1`,
                    },
                  ]}
                  disabled={!compId}
                  onSubmit={(data) =>
                    change("entries", { ...data, competitionId: compId })
                  }
                />
              ) : null}
            </Card>
          ) : null}
          {tab === "Arbitri" ? (
            <Card className="space-y-4">
              <ActionForm
                title="Censisci arbitro / ufficiale"
                fields={[
                  { key: "code", label: "Matricola arbitro" },
                  { key: "firstName", label: "Nome" },
                  { key: "lastName", label: "Cognome" },
                  { key: "sports", label: "Disciplina", options: sports },
                ]}
                onSubmit={(data) => change("officials", data)}
              />
              <Records
                title="Arbitri della struttura"
                endpoint={`entities/officials?${params(scope)}`}
                fields={["code", "firstName", "lastName", "sports", "active"]}
                actions={(row) => (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      onClick={() =>
                        run(`officials/${row.id}/status`, {
                          active: !row.active,
                        })
                      }
                    >
                      {row.active ? "Sospendi arbitro" : "Riattiva anagrafica"}
                    </Button>
                    {row.actorId ? (
                      <Button
                        type="button"
                        onClick={async () => {
                          if (
                            window.confirm(
                              "Confermi di avere verificato l’identità dell’arbitro prima di rigenerare il suo accesso?",
                            )
                          ) {
                            try {
                              setInvite(
                                (await change(
                                  `officials/${row.id}/recover`,
                                )) as {
                                  code: string;
                                  activationPath: string;
                                  expiresAt: string;
                                },
                              );
                              setTab("Operatori e inviti");
                            } catch {
                              /* Error already shown by change. */
                            }
                          }
                        }}
                      >
                        Recupera accesso dopo verifica identità
                      </Button>
                    ) : null}
                  </div>
                )}
              />
            </Card>
          ) : null}
          {tab === "Calendario" || tab === "Risultati" ? (
            <Card className="space-y-4">
              {selectCompetition}
              {tab === "Risultati" ? (
                <p className="text-sm">
                  Aggiornamento ogni 10 secondi quando sei connesso. Il
                  risultato confermato dall’arbitro è distinto dal referto e
                  dall’omologazione.
                </p>
              ) : null}
              {fixtures.isError ? (
                <ErrorState message={fixtures.error.message} />
              ) : null}
              {fixtures.data?.items.map((f) => (
                <div className="space-y-2 rounded-xl border p-3" key={f.id}>
                  <p className="font-semibold">
                    {f.externalCode} · {f.homeName} – {f.awayName}
                  </p>
                  <p className="text-sm">
                    {new Date(f.scheduledAt).toLocaleString("it-IT")} ·{" "}
                    {f.venue} · Giornata {f.round}
                    {f.cancelled ? " · Annullata" : ""}
                  </p>
                  {f.summary ? (
                    <p>
                      {f.summary.homeScore} – {f.summary.awayScore} ·{" "}
                      {f.summary.homologatedAt
                        ? "Omologato"
                        : statusName(f.summary.state)}{" "}
                      · Periodo {f.summary.period}
                      <br />
                      <span className="text-xs">
                        Ultimo aggiornamento:{" "}
                        {new Date(f.summary.confirmedAt).toLocaleString(
                          "it-IT",
                        )}
                      </span>
                    </p>
                  ) : (
                    <p className="text-sm">Nessun risultato comunicato.</p>
                  )}
                  {tab === "Risultati" &&
                  ownCompetition &&
                  f.summary?.state === "final_confirmed" &&
                  !f.summary.homologatedAt ? (
                    <Button
                      type="button"
                      onClick={() => run(`games/${f.id}/homologate`)}
                    >
                      Omologa risultato (richiede referto inviato)
                    </Button>
                  ) : null}
                  {tab==='Risultati'&&can('reports')&&ownCompetition?<Link className="block text-blue-700 underline" href={`/federation/reports?fixtureId=${f.id}`}>Apri referto riservato</Link>:null}
                  {tab === "Risultati" && f.summary ? (
                    <GameDetails fixtureId={f.id} />
                  ) : null}
                  {tab === "Calendario" &&
                  ownCompetition &&
                  can("competitions") ? (
                    <details>
                      <summary>Variazione calendario</summary>
                      <ActionForm
                        title="Richiede una nuova conferma degli arbitri"
                        fields={[
                          {
                            key: "scheduledAt",
                            label: "Nuova data e ora",
                            type: "datetime-local",
                            optional: true,
                          },
                          {
                            key: "venue",
                            label: "Nuovo impianto",
                            optional: true,
                          },
                          { key: "reason", label: "Motivazione" },
                        ]}
                        button="Comunica variazione"
                        onSubmit={(data) =>
                          change(`fixtures/${f.id}/change`, {
                            ...data,
                            revision: f.revision,
                          })
                        }
                      />
                      <Button
                        type="button"
                        onClick={() =>
                          run(`fixtures/${f.id}/change`, {
                            revision: f.revision,
                            cancelled: true,
                            reason:
                              "Annullamento della gara disposto dal responsabile del campionato",
                          })
                        }
                      >
                        Annulla gara e revoca designazioni
                      </Button>
                    </details>
                  ) : null}
                </div>
              ))}
              {tab === "Calendario" && ownCompetition && can("competitions") ? (
                <ActionForm
                  title="Aggiungi gara"
                  fields={[
                    { key: "code", label: "Codice gara" },
                    {
                      key: "homeTeamId",
                      label: "Squadra casa",
                      remote: `competitions/${compId}/entries?choices=1`,
                      valueKey: "teamId",
                    },
                    {
                      key: "awayTeamId",
                      label: "Squadra ospite",
                      remote: `competitions/${compId}/entries?choices=1`,
                      valueKey: "teamId",
                    },
                    { key: "round", label: "Giornata" },
                    {
                      key: "scheduledAt",
                      label: "Data e ora",
                      type: "datetime-local",
                    },
                    { key: "venue", label: "Impianto" },
                    {
                      key: "durationMinutes",
                      label: "Durata complessiva prevista (minuti)",
                      type: "number",
                      value: "120",
                    },
                  ]}
                  onSubmit={(data) =>
                    change("fixtures", { ...data, competitionId: compId })
                  }
                />
              ) : null}
              <Pager
                next={fixtures.data?.nextCursor ?? null}
                previous={cursors.length > 1}
                onPrevious={() => setCursors((c) => c.slice(0, -1))}
                onNext={() =>
                  setCursors((c) => [...c, fixtures.data?.nextCursor ?? null])
                }
              />
            </Card>
          ) : null}
          {tab === "Designazioni" ? (
            <Card className="space-y-4">
              {selectCompetition}
              <ActionForm
                title="Prepara una designazione"
                fields={[
                  {
                    key: "fixtureId",
                    label: "Gara",
                    remote: `fixtures?${params({ competitionId: compId })}`,
                  },
                  {
                    key: "officialId",
                    label: "Arbitro della tua struttura",
                    remote: remote("officials"),
                  },
                  {
                    key: "role",
                    label: "Incarico",
                    options: [
                      { id: "principal", name: "Arbitro principale" },
                      { id: "assistant", name: "Assistente" },
                      { id: "table", name: "Ufficiale al tavolo" },
                    ],
                  },
                  { key: "notes", label: "Note", optional: true },
                ]}
                onSubmit={(data) => change("appointments", data)}
              />
              {appointments.isError ? (
                <p role="alert">{appointments.error.message}</p>
              ) : null}
              {appointments.data?.items.map((a) => (
                <div
                  className="flex flex-wrap items-center gap-3 rounded-lg border p-3"
                  key={a.id}
                >
                  <p>
                    {a.officialName} · {statusName(a.role)} ·{" "}
                    {statusName(a.status)}
                  </p>
                  {a.status === "draft" ? (
                    <Button
                      type="button"
                      onClick={() =>
                        run(`appointments/${a.id}/change`, { action: "send" })
                      }
                    >
                      Invia designazione
                    </Button>
                  ) : null}
                  {["draft", "invited", "accepted"].includes(a.status) ? (
                    <Button
                      type="button"
                      onClick={() =>
                        run(`appointments/${a.id}/change`, {
                          action: "revoke",
                          notes: "Revoca disposta dal designatore",
                        })
                      }
                    >
                      Revoca
                    </Button>
                  ) : null}
                </div>
              ))}
              <Pager
                next={appointments.data?.nextCursor ?? null}
                previous={cursors.length > 1}
                onPrevious={() => setCursors((c) => c.slice(0, -1))}
                onNext={() =>
                  setCursors((c) => [
                    ...c,
                    appointments.data?.nextCursor ?? null,
                  ])
                }
              />
            </Card>
          ) : null}
          {tab === "Deleghe" ? (
            <Card className="space-y-4">
              {selectCompetition}
              <label className="block">
                Ente arbitrale destinatario
                <RemoteChoice
                  field={{
                    key: "recipientOrganizationId",
                    label: "Ente arbitrale destinatario",
                    remote: `directory?${params(scope)}`,
                    onValueChange: setRecipient,
                  }}
                />
              </label>
              <ActionForm
                title="Delega lettura e designazioni"
                fields={[
                  {
                    key: "recipientUnitId",
                    label: "Sezione / struttura destinataria",
                    ...(recipient
                      ? {
                          remote: `directory/${recipient}/units?${params(scope)}`,
                        }
                      : { options: [] }),
                  },
                  {
                    key: "expiresAt",
                    label: "Scadenza della delega",
                    type: "datetime-local",
                  },
                ]}
                button="Concedi delega"
                disabled={!ownCompetition || !recipient}
                onSubmit={(data) =>
                  change("delegations", {
                    ...data,
                    competitionId: compId,
                    recipientOrganizationId: recipient,
                    designate: true,
                  })
                }
              />
              <Records
                title="Deleghe concesse"
                endpoint={`entities/delegations?${params(scope)}`}
                fields={[
                  "competitionName",
                  "recipientName",
                  "expiresAt",
                  "active",
                ]}
                actions={(row) => (
                  <Button
                    type="button"
                    disabled={!row.active}
                    onClick={() => run(`delegations/${row.id}/revoke`)}
                  >
                    Revoca delega
                  </Button>
                )}
              />
            </Card>
          ) : null}
          {tab==='Pubblicazione'?<>{selectCompetition}<PublicationSettings competitionId={compId}/></>:null}
          {tab === "Importazioni" ? (
            <ImportPanel
              key={`${orgId}:${scope.unitId}`}
              scope={scope}
              competitions={compOptions}
              competitionId={compId}
              allowedKinds={importKinds}
            />
          ) : null}
        </>
      ) : null}
    </div>
  );
}
export function statusName(value: string) {
  return (
    (
      {
        validating: "Validazione in corso",
        preview: "Anteprima da confermare",
        running: "Applicazione in corso",
        completed: "Completata",
        cancelled: "Annullata",
        pending: "In attesa",
        reserved: "Attivazione in corso",
        active: "Attivo",
        inactive: "Non attivo",
        suspended: "Sospeso",
        ended: "Cessato",
        player: "Giocatore",
        staff: "Staff",
        draft: "Bozza",
        invited: "In attesa di risposta",
        accepted: "Accettata",
        declined: "Indisponibilità comunicata",
        revoked: "Revocata",
        principal: "Arbitro principale",
        assistant: "Assistente",
        table: "Ufficiale al tavolo",
        provisional: "Provvisorio",
        period_confirmed: "Periodo confermato dall’arbitro",
        final_confirmed: "Fine gara confermata dall’arbitro",
      } as Record<string, string>
    )[value] ??
    roleNames[value] ??
    value
  );
}
function Records({
  title,
  endpoint,
  fields,
  actions,
}: {
  title: string;
  endpoint: string;
  fields: string[];
  actions?: (row: Record<string, unknown>) => React.ReactNode;
}) {
  const { session } = useSession();
  const [cursors, setCursors] = useState<(string | null)[]>([null]),
    [search, setSearch] = useState("");
  useEffect(() => {
    setCursors([null]);
    setSearch("");
  }, [endpoint]);
  const query = useQuery({
    queryKey: [
      "platform",
      "records",
      endpoint,
      cursors.at(-1),
      search,
      session?.user.id,
    ],
    queryFn: () =>
      platformGet<Page<Record<string, unknown>>>(
        `${endpoint}&${params({ cursor: cursors.at(-1), search })}`,
      ),
  });
  return (
    <section className="space-y-2">
      <h3 className="font-semibold">{title}</h3>
      <input
        className="w-full rounded-lg border p-2 text-sm"
        aria-label={`Cerca in ${title}`}
        placeholder="Cerca per nome o codice…"
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setCursors([null]);
        }}
      />
      {query.isError ? (
        <p role="alert" className="text-red-700">
          {query.error.message}
        </p>
      ) : null}
      {query.data?.items.map((row) => (
        <div
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 text-sm"
          key={String(row.id)}
        >
          <p>
            {fields
              .map((field) =>
                typeof row[field] === "boolean"
                  ? row[field]
                    ? "Attivo"
                    : "Disattivato"
                  : Array.isArray(row[field])
                    ? (row[field] as string[]).join(", ")
                    : statusName(String(row[field] ?? "—")),
              )
              .join(" · ")}
          </p>
          {actions?.(row)}
        </div>
      ))}
      {query.data && !query.data.items.length ? (
        <p className="text-sm text-slate-500">Nessun elemento presente.</p>
      ) : null}
      <Pager
        next={query.data?.nextCursor ?? null}
        previous={cursors.length > 1}
        onPrevious={() => setCursors((value) => value.slice(0, -1))}
        onNext={() =>
          setCursors((value) => [...value, query.data?.nextCursor ?? null])
        }
      />
    </section>
  );
}

function GameDetails({ fixtureId }: { fixtureId: string }) {
  const [open, setOpen] = useState(false);
  const { session } = useSession();
  const query = useQuery({
    queryKey: ["platform", "result-details", fixtureId, session?.user.id],
    queryFn: () =>
      platformGet<{
        events: GameEvent[];
        players: { registrationId: string; name: string }[];
        home: { id: string; name: string };
        away: { id: string; name: string };
        reportStatus: string | null;
      }>(`games/${fixtureId}`),
    enabled: open,
    refetchInterval: open ? 10000 : false,
  });
  const names: Record<string, string> = {
    goal: "Gol",
    own_goal: "Autorete",
    yellow: "Ammonizione",
    red: "Espulsione",
    substitution: "Sostituzione",
    points: "Punti",
    set: "Set",
  };
  return (
    <details onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary className="cursor-pointer text-blue-700">
        Eventi e stato del referto
      </summary>
      {query.isError ? <p role="alert">{query.error.message}</p> : null}
      {query.data ? (
        <div className="space-y-2 p-2">
          <p>
            Referto:{" "}
            {query.data.reportStatus === "submitted"
              ? "Inviato"
              : "Da inviare"}
          </p>
          {query.data.events.length === 0 ? (
            <p>Nessun evento registrato.</p>
          ) : null}
          {query.data.events.map((event) => (
            <p className="text-sm" key={event.id}>
              Periodo {event.period} · {event.minute}′ · {names[event.type]} ·{" "}
              {query.data!.players.find(
                (player) => player.registrationId === event.registrationId,
              )?.name ??
                (event.clubId === query.data!.home.id
                  ? query.data!.home.name
                  : query.data!.away.name)}
              {event.type === "points" ? ` · ${event.points} punti` : ""}
              {event.incomingRegistrationId
                ? ` → ${query.data!.players.find((player) => player.registrationId === event.incomingRegistrationId)?.name ?? "Entrante"}`
                : ""}
            </p>
          ))}
        </div>
      ) : null}
    </details>
  );
}
