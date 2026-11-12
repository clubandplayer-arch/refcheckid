"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { platformGet, type Page, type GameEvent } from "./api";
import { Pager } from "./forms";
import { useSession } from "@/lib/session";
export function EventArchive({ fixtureId }: { fixtureId: string }) {
  const [open, setOpen] = useState(false),
    [cursors, setCursors] = useState<(string | null)[]>([null]),
    { session } = useSession();
  const query = useQuery({
    queryKey: [
      "platform",
      "event-archive",
      fixtureId,
      cursors.at(-1),
      session?.user.id,
    ],
    queryFn: () =>
      platformGet<
        Page<{
          id: string;
          revision: number;
          period: number;
          state: string;
          homeScore: number;
          awayScore: number;
          recordedAt: string;
          events: GameEvent[];
        }>
      >(
        `games/${fixtureId}/history${cursors.at(-1) ? "?cursor=" + encodeURIComponent(cursors.at(-1)!) : ""}`,
      ),
    enabled: open,
    refetchInterval: open ? 10000 : false,
  });
  return (
    <details
      className="rounded border p-3"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="cursor-pointer font-semibold">
        Archivio versioni degli eventi
      </summary>
      <p className="text-sm">
        Le versioni precedenti sono conservate. Le note del referto non fanno
        parte di questo archivio.
      </p>
      {query.isError ? <p role="alert">{query.error.message}</p> : null}
      {query.data?.items.map((row) => (
        <div className="border-b p-2 text-sm" key={row.id}>
          <p>
            Versione {row.revision} · Periodo {row.period} · {row.homeScore} –{" "}
            {row.awayScore} ·{" "}
            {row.state === "provisional" ? "Provvisoria" : "Confermata"}
          </p>
          <p>
            {new Date(row.recordedAt).toLocaleString("it-IT")} ·{" "}
            {row.events.length} eventi
          </p>
        </div>
      ))}
      <Pager
        next={query.data?.nextCursor ?? null}
        previous={cursors.length > 1}
        onPrevious={() => setCursors((c) => c.slice(0, -1))}
        onNext={() => setCursors((c) => [...c, query.data?.nextCursor ?? null])}
      />
    </details>
  );
}
