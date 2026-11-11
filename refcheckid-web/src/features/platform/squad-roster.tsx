"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useSession } from "@/lib/session";
import { platformGet, platformPost, type Page } from "./api";
import { RemoteChoice, Pager } from "./forms";
export function SquadRoster({ endpoint }: { endpoint: string }) {
  const [teamId, setTeamId] = useState(""),
    [cursors, setCursors] = useState<(string | null)[]>([null]),
    [error, setError] = useState("");
  const { session } = useSession(),
    client = useQueryClient();
  const query = useQuery({
    queryKey: ["platform", "squad", teamId, cursors.at(-1), session?.user.id],
    queryFn: () =>
      platformGet<
        Page<{
          id: string;
          name: string;
          kind: string;
          status: string;
          code: string;
        }>
      >(
        `squads/${teamId}${cursors.at(-1) ? "?cursor=" + encodeURIComponent(cursors.at(-1)!) : ""}`,
      ),
    enabled: !!teamId,
  });
  return (
    <section className="space-y-3 rounded-xl border p-3">
      <h3 className="font-semibold">Consulta e aggiorna la rosa</h3>
      <label className="block">
        Squadra della rosa
        <RemoteChoice
          field={{
            key: "rosterTeam",
            label: "Squadra della rosa",
            remote: endpoint,
            onValueChange: (value) => {
              setTeamId(value);
              setCursors([null]);
            },
          }}
        />
      </label>
      {error || query.isError ? (
        <p role="alert">{error || query.error?.message}</p>
      ) : null}
      {query.data?.items.map((row) => (
        <div
          className="flex items-center justify-between gap-2 rounded border p-2 text-sm"
          key={row.id}
        >
          <p>
            {row.name} · {row.code} ·{" "}
            {row.kind === "player" ? "Giocatore" : "Staff"} ·{" "}
            {row.status === "active" ? "Attivo" : "Non convocabile"}
          </p>
          <Button
            type="button"
            onClick={async () => {
              try {
                await platformPost(`squad-members/${row.id}/revoke`, {});
                await client.invalidateQueries({
                  queryKey: ["platform", "squad", teamId],
                });
              } catch (error) {
                setError(
                  error instanceof Error
                    ? error.message
                    : "Operazione non riuscita.",
                );
              }
            }}
          >
            Rimuovi dalla rosa
          </Button>
        </div>
      ))}
      {query.data?.items.length === 0 ? (
        <p>Nessun tesserato assegnato a questa squadra.</p>
      ) : null}
      {query.data ? (
        <Pager
          next={query.data.nextCursor}
          previous={cursors.length > 1}
          onPrevious={() => setCursors((c) => c.slice(0, -1))}
          onNext={() =>
            setCursors((c) => [...c, query.data?.nextCursor ?? null])
          }
        />
      ) : null}
    </section>
  );
}
