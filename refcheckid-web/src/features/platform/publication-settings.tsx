"use client";
import { useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { platformGet, platformPost, type Competition, type Page } from "./api";
import { ActionForm, Pager } from "./forms";
import { Card } from "@/components/ui/card";
import { useSession } from "@/lib/session";
interface Policy {
  revision: number;
  consent: boolean;
  consentEvents: boolean;
  consentNames: boolean;
  mode: "private" | "public";
  includeLive: boolean;
  includeEvents: boolean;
  includeNames: boolean;
}
export function PublicationSettings({
  competitionId,
  admin = false,
}: {
  competitionId: string;
  admin?: boolean;
}) {
  const { session } = useSession(),
    client = useQueryClient(),
    [message, setMessage] = useState("");
  const query = useQuery({
    queryKey: ["platform", "publication", competitionId, session?.user.id],
    queryFn: () =>
      platformGet<Policy>(`competitions/${competitionId}/publication`),
    enabled: !!competitionId,
  });
  if (!competitionId) return <p>Seleziona un campionato.</p>;
  if (query.isError) return <p role="alert">{query.error.message}</p>;
  if (!query.data) return <p>Caricamento impostazioni…</p>;
  const policy = query.data;
  return (
    <Card className="space-y-4">
      <h2 className="text-xl font-bold">Pubblicazione dei risultati</h2>
      <p>
        Stato:{" "}
        <strong>
          {policy.mode === "public" && policy.consent
            ? "Pubblico"
            : "Riservato"}
        </strong>
        . Il referto, le note e i documenti non vengono mai inclusi.
      </p>
      <p className="text-sm">
        L’ente autorizza i dati condivisibili; l’amministrazione della
        piattaforma decide se attivare il portale. I nominativi sono esclusi
        finché non vengono autorizzati espressamente.
      </p>
      <ActionForm
        key={`${competitionId}:${policy.revision}:${admin}`}
        title={
          admin
            ? "Attiva o sospendi la distribuzione"
            : "Autorizzazione dell’ente sportivo"
        }
        button={admin ? "Salva distribuzione" : "Salva autorizzazione"}
        fields={
          admin
            ? [
                {
                  key: "mode",
                  label: "Visibilità",
                  value: policy.mode,
                  options: [
                    { id: "private", name: "Riservato" },
                    { id: "public", name: "Portale pubblico" },
                  ],
                },
                {
                  key: "includeLive",
                  label: "Includi aggiornamenti provvisori durante il gioco",
                  type: "checkbox",
                  optional: true,
                  checked: policy.includeLive,
                },
                {
                  key: "includeEvents",
                  label: "Includi eventi",
                  type: "checkbox",
                  optional: true,
                  checked: policy.includeEvents,
                },
                {
                  key: "includeNames",
                  label: "Includi nomi dei giocatori",
                  type: "checkbox",
                  optional: true,
                  checked: policy.includeNames,
                },
              ]
            : [
                {
                  key: "consent",
                  label:
                    "Autorizzo la pubblicazione dei risultati di questo campionato",
                  type: "checkbox",
                  optional: true,
                  checked: policy.consent,
                },
                {
                  key: "consentEvents",
                  label: "Autorizzo la pubblicazione degli eventi",
                  type: "checkbox",
                  optional: true,
                  checked: policy.consentEvents,
                },
                {
                  key: "consentNames",
                  label:
                    "Autorizzo la pubblicazione dei nominativi, avendo verificato i presupposti e le tutele dei minori",
                  type: "checkbox",
                  optional: true,
                  checked: policy.consentNames,
                },
              ]
        }
        onSubmit={async (data) => {
          await platformPost(
            `competitions/${competitionId}/publication${admin ? "" : "/consent"}`,
            { ...data, revision: policy.revision },
          );
          setMessage("Impostazioni salvate.");
          await client.invalidateQueries({
            queryKey: ["platform", "publication", competitionId],
          });
        }}
      />
      {message ? <p role="status">{message}</p> : null}
      <Link href="/results" className="text-blue-700 underline">
        Apri portale risultati
      </Link>
    </Card>
  );
}
export function PublicationAdmin() {
  const [cursors, setCursors] = useState<(string | null)[]>([null]),
    [selected, setSelected] = useState(""),
    { session } = useSession();
  const query = useQuery({
    queryKey: [
      "platform",
      "publication-catalog",
      session?.user.id,
      cursors.at(-1),
    ],
    queryFn: () =>
      platformGet<Page<Competition>>(
        `publication/catalog${cursors.at(-1) ? "?cursor=" + encodeURIComponent(cursors.at(-1)!) : ""}`,
      ),
  });
  const id = selected || query.data?.items[0]?.id || "";
  return (
    <main className="mx-auto max-w-4xl space-y-4 p-5">
      <h1 className="text-3xl font-bold">Distribuzione dei dati sportivi</h1>
      <p>
        Accesso riservato all’amministrazione della piattaforma. Nessuna
        distribuzione a partner esterni è attivata.
      </p>
      {query.isError ? <p role="alert">{query.error.message}</p> : null}
      <label>
        Campionato da gestire
        <select
          aria-label="Campionato da gestire"
          className="block w-full rounded border p-3"
          value={id}
          onChange={(e) => setSelected(e.target.value)}
        >
          {query.data?.items.map((row) => (
            <option key={row.id} value={row.id}>
              {row.name} · {row.season}
            </option>
          ))}
        </select>
      </label>
      <Pager
        next={query.data?.nextCursor ?? null}
        previous={cursors.length > 1}
        onPrevious={() => {
          setCursors((c) => c.slice(0, -1));
          setSelected("");
        }}
        onNext={() => {
          setCursors((c) => [...c, query.data?.nextCursor ?? null]);
          setSelected("");
        }}
      />
      <PublicationSettings competitionId={id} admin />
    </main>
  );
}
