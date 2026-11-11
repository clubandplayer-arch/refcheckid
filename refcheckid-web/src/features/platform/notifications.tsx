"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useSession } from "@/lib/session";
import { platformGet, platformPost, type Notification, type Page } from "./api";
import { Pager } from "./forms";
export function NotificationInbox() {
  const { session } = useSession(),
    client = useQueryClient();
  const [cursors, setCursors] = useState<(string | null)[]>([null]),
    [error, setError] = useState("");
  const query = useQuery({
    queryKey: ["platform", "notifications", session?.user.id, cursors.at(-1)],
    queryFn: () =>
      platformGet<Page<Notification>>(
        `notifications${cursors.at(-1) ? "?cursor=" + encodeURIComponent(cursors.at(-1)!) : ""}`,
      ),
    refetchInterval: 30000,
  });
  return (
    <details className="rounded-lg border p-3">
      <summary className="cursor-pointer font-semibold">
        Comunicazioni sulle designazioni
      </summary>
      {error || query.isError ? (
        <p role="alert">{error || query.error?.message}</p>
      ) : null}
      {query.data?.items.map((notice) => (
        <div className="space-y-1 border-b py-2 text-sm" key={notice.id}>
          <p>{notice.message}</p>
          <p>
            {new Date(notice.createdAt).toLocaleString("it-IT")} ·{" "}
            {notice.readAt ? "Letta" : "Da leggere"}
          </p>
          {!notice.readAt ? (
            <Button
              type="button"
              onClick={async () => {
                try {
                  await platformPost(`notifications/${notice.id}/read`, {});
                  await client.invalidateQueries({
                    queryKey: ["platform", "notifications"],
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
              Segna come letta
            </Button>
          ) : null}
        </div>
      ))}
      {query.data?.items.length === 0 ? <p>Nessuna comunicazione.</p> : null}
      <Pager
        next={query.data?.nextCursor ?? null}
        previous={cursors.length > 1}
        onPrevious={() => setCursors((c) => c.slice(0, -1))}
        onNext={() => setCursors((c) => [...c, query.data?.nextCursor ?? null])}
      />
    </details>
  );
}
