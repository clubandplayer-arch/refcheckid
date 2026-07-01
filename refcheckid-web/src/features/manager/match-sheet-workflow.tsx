"use client";

import { DndContext, type DragEndEvent } from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import Image from "next/image";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { EmptyState, ErrorState, SkeletonBlock } from "@/components/ui/state";
import { useToast } from "@/components/ui/toast";
import {
  getMatchSheetSubmitError,
  validateMatchSheet,
} from "@/lib/match-sheet-validation";
import {
  fetchMatchSheets,
  fetchPlayers,
  fetchStaff,
  queryKeys,
  submitMatchSheet,
} from "@/lib/api-client";
import type { PlayerListItem, StaffListItem } from "@/lib/types";

const EMPTY_PLAYERS: readonly PlayerListItem[] = [];
const EMPTY_STAFF: readonly StaffListItem[] = [];

export function MatchSheetWorkflow() {
  const [step, setStep] = useState(0);
  const [query, setQuery] = useState("");
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const playersQuery = useQuery({
    queryFn: fetchPlayers,
    queryKey: queryKeys.players,
  });
  const staffQuery = useQuery({
    queryFn: fetchStaff,
    queryKey: queryKeys.staff,
  });
  const sheetsQuery = useQuery({
    queryFn: () => fetchMatchSheets(),
    queryKey: queryKeys.matchSheets,
  });
  const [selectedPlayers, setSelectedPlayers] = useState<
    readonly PlayerListItem[]
  >([]);
  const [selectedStaff, setSelectedStaff] = useState<readonly StaffListItem[]>(
    [],
  );
  const submitMutation = useMutation({
    mutationFn: () => {
      const firstSheet = sheetsQuery.data?.[0];
      if (!firstSheet) throw new Error("Nessuna distinta disponibile.");
      return submitMatchSheet(firstSheet.id);
    },
    onSuccess() {
      notify("Distinta inviata", "success");
      void queryClient.invalidateQueries({ queryKey: queryKeys.matchSheets });
    },
    onError(error) {
      notify(error.message, "error");
    },
  });

  const fetchedPlayers = playersQuery.data ?? EMPTY_PLAYERS;
  const fetchedStaff = staffQuery.data ?? EMPTY_STAFF;
  const players = useMemo(
    () => (selectedPlayers.length > 0 ? selectedPlayers : fetchedPlayers),
    [fetchedPlayers, selectedPlayers],
  );
  const staff = useMemo(
    () => (selectedStaff.length > 0 ? selectedStaff : fetchedStaff),
    [fetchedStaff, selectedStaff],
  );
  const filteredPlayers = useMemo(
    () =>
      players
        .filter((player) =>
          `${player.lastName} ${player.firstName}`
            .toLowerCase()
            .includes(query.toLowerCase()),
        )
        .sort((a, b) => a.lastName.localeCompare(b.lastName)),
    [players, query],
  );
  const calledPlayers = players.filter((player) => player.selected);
  const calledStaff = staff.filter((staffMember) => staffMember.selected);

  function setPlayerList(
    updater: (current: readonly PlayerListItem[]) => readonly PlayerListItem[],
  ) {
    setSelectedPlayers(updater(players));
  }
  function setStaffList(
    updater: (current: readonly StaffListItem[]) => readonly StaffListItem[],
  ) {
    setSelectedStaff(updater(staff));
  }
  function togglePlayer(playerId: string) {
    setPlayerList((current) =>
      current.map((player) =>
        player.id === playerId
          ? { ...player, selected: !player.selected }
          : player,
      ),
    );
  }
  function toggleStaff(staffId: string) {
    setStaffList((current) =>
      current.map((staffMember) =>
        staffMember.id === staffId
          ? { ...staffMember, selected: !staffMember.selected }
          : staffMember,
      ),
    );
  }
  function updateShirtNumber(playerId: string, shirtNumber: number | null) {
    setPlayerList((current) =>
      current.map((player) =>
        player.id === playerId ? { ...player, shirtNumber } : player,
      ),
    );
  }
  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = players.findIndex((player) => player.id === active.id);
    const newIndex = players.findIndex((player) => player.id === over.id);
    setSelectedPlayers((current) =>
      arrayMove([...(current.length ? current : players)], oldIndex, newIndex),
    );
  }

  if (playersQuery.isLoading || staffQuery.isLoading || sheetsQuery.isLoading)
    return <SkeletonBlock />;
  if (playersQuery.isError)
    return (
      <ErrorState
        message={playersQuery.error.message}
        onRetry={() => void playersQuery.refetch()}
      />
    );
  if (staffQuery.isError)
    return (
      <ErrorState
        message={staffQuery.error.message}
        onRetry={() => void staffQuery.refetch()}
      />
    );
  if (sheetsQuery.isError)
    return (
      <ErrorState
        message={sheetsQuery.error.message}
        onRetry={() => void sheetsQuery.refetch()}
      />
    );

  return (
    <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
      <aside className="space-y-2">
        {["Compilazione", "Ordine", "Staff", "Riepilogo"].map(
          (label, index) => (
            <button
              className={`w-full rounded-lg px-3 py-2 text-left text-sm ${step === index ? "bg-primary text-white" : "bg-muted"}`}
              key={label}
              onClick={() => setStep(index)}
              type="button"
            >
              {index + 1}. {label}
            </button>
          ),
        )}
      </aside>
      {step === 0 ? (
        <PlayersStep
          players={filteredPlayers}
          query={query}
          setQuery={setQuery}
          togglePlayer={togglePlayer}
        />
      ) : null}
      {step === 1 ? (
        <OrderStep
          onDragEnd={handleDragEnd}
          players={calledPlayers}
          updateShirtNumber={updateShirtNumber}
        />
      ) : null}
      {step === 2 ? (
        <StaffStep staff={staff} toggleStaff={toggleStaff} />
      ) : null}
      {step === 3 ? (
        <SummaryStep
          isSubmitting={submitMutation.isPending}
          onInvalidSubmit={(message) => notify(message, "error")}
          onSubmit={() => submitMutation.mutate()}
          players={calledPlayers}
          staff={calledStaff}
        />
      ) : null}
    </div>
  );
}

function PlayersStep({
  players,
  query,
  setQuery,
  togglePlayer,
}: Readonly<{
  players: readonly PlayerListItem[];
  query: string;
  setQuery: (value: string) => void;
  togglePlayer: (id: string) => void;
}>) {
  return (
    <Card className="space-y-4">
      <div>
        <h2 className="text-xl font-bold">Compilazione distinta</h2>
        <p className="text-sm text-slate-500">
          Ricerca giocatori, controlla foto, diffide, squalifiche e
          convocazione.
        </p>
      </div>
      <Input
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Cerca giocatore"
        value={query}
      />
      <div className="divide-y rounded-xl border">
        {players.length === 0 ? (
          <EmptyState message="Nessun giocatore trovato." />
        ) : null}
        {players.map((player) => (
          <label className="flex items-center gap-3 p-3" key={player.id}>
            {player.photoUrl ? (
              <Image
                alt={`Foto ${player.lastName} ${player.firstName}`}
                className="rounded-full bg-muted object-cover"
                height={40}
                src={player.photoUrl}
                width={40}
              />
            ) : (
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-xs">
                Foto
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="font-medium">
                {player.lastName} {player.firstName}
              </p>
              <p className="text-xs text-slate-500">
                {player.warning ? "Diffida" : "Nessuna diffida"} ·{" "}
                {player.suspended ? "Squalificato" : "Disponibile"}
              </p>
            </div>
            <input
              checked={player.selected}
              disabled={player.suspended}
              onChange={() => togglePlayer(player.id)}
              type="checkbox"
            />
          </label>
        ))}
      </div>
    </Card>
  );
}

function OrderStep({
  players,
  onDragEnd,
  updateShirtNumber,
}: Readonly<{
  players: readonly PlayerListItem[];
  onDragEnd: (event: DragEndEvent) => void;
  updateShirtNumber: (id: string, value: number | null) => void;
}>) {
  return (
    <Card className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">Ordine distinta</h2>
          <p className="text-sm text-slate-500">
            Drag & drop, numero maglia, portiere, capitano, vice capitano e
            riserve.
          </p>
        </div>
      </div>
      {players.length === 0 ? (
        <EmptyState message="Nessun convocato." />
      ) : (
        <DndContext onDragEnd={onDragEnd}>
          <SortableContext
            items={players.map((player) => player.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-2">
              {players.map((player) => (
                <SortablePlayerRow
                  key={player.id}
                  player={player}
                  updateShirtNumber={updateShirtNumber}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </Card>
  );
}

function SortablePlayerRow({
  player,
  updateShirtNumber,
}: Readonly<{
  player: PlayerListItem;
  updateShirtNumber: (id: string, value: number | null) => void;
}>) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: player.id });
  return (
    <div
      className="grid gap-2 rounded-xl border p-3 md:grid-cols-[48px_1fr_120px_160px]"
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <button
        aria-label={`Sposta ${player.lastName} ${player.firstName}`}
        className="rounded-lg bg-muted px-3 py-2 text-sm font-semibold"
        type="button"
        {...attributes}
        {...listeners}
      >
        ↕
      </button>
      <span className="self-center font-medium">
        {player.lastName} {player.firstName}
      </span>
      <Input
        min={1}
        onChange={(event) =>
          updateShirtNumber(player.id, event.target.valueAsNumber || null)
        }
        placeholder="N°"
        type="number"
        value={player.shirtNumber ?? ""}
      />
      <span className="rounded-lg bg-muted px-3 py-2 text-sm">
        {player.role}
      </span>
    </div>
  );
}

function StaffStep({
  staff,
  toggleStaff,
}: Readonly<{
  staff: readonly StaffListItem[];
  toggleStaff: (id: string) => void;
}>) {
  return (
    <Card className="space-y-4">
      <h2 className="text-xl font-bold">Staff</h2>
      {staff.length === 0 ? (
        <EmptyState message="Nessuno staff disponibile." />
      ) : null}
      {staff.map((staffMember) => (
        <label
          className="flex items-center justify-between rounded-xl border p-3"
          key={staffMember.id}
        >
          <span>
            <strong>{staffMember.fullName}</strong> · {staffMember.role}
          </span>
          <input
            checked={staffMember.selected}
            onChange={() => toggleStaff(staffMember.id)}
            type="checkbox"
          />
        </label>
      ))}
    </Card>
  );
}

function SummaryStep({
  players,
  staff,
  isSubmitting,
  onSubmit,
  onInvalidSubmit,
}: Readonly<{
  players: readonly PlayerListItem[];
  staff: readonly StaffListItem[];
  isSubmitting: boolean;
  onSubmit: () => void;
  onInvalidSubmit: (message: string) => void;
}>) {
  const validation = validateMatchSheet(players, staff);
  function handleSubmit() {
    const submitError = getMatchSheetSubmitError(validation);
    if (submitError) {
      onInvalidSubmit(submitError);
      return;
    }
    onSubmit();
  }
  return (
    <Card className="space-y-4">
      <h2 className="text-xl font-bold">Riepilogo e controlli finali</h2>
      <ul className="space-y-2 text-sm">
        <li>Giocatori convocati: {players.length}</li>
        <li>Staff selezionato: {staff.length}</li>
        <li>Numeri maglia mancanti: {validation.missingNumbers}</li>
        <li>
          Numeri maglia duplicati:{" "}
          {validation.duplicateShirtNumbers.length > 0
            ? validation.duplicateShirtNumbers.join(", ")
            : "nessuno"}
        </li>
        <li>Giocatori non validi: {validation.invalidPlayers}</li>
      </ul>
      {validation.isValid ? (
        <p className="rounded-lg bg-green-100 p-3 text-sm text-green-900">
          Controlli superati.
        </p>
      ) : (
        <div className="rounded-lg bg-yellow-100 p-3 text-sm text-yellow-900">
          <p className="font-semibold">Controlli non superati.</p>
          <ul className="mt-2 list-disc pl-5">
            {validation.errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </div>
      )}
      <Button
        disabled={!validation.isValid || isSubmitting}
        onClick={handleSubmit}
        type="button"
      >
        {isSubmitting ? "Invio..." : "Invia distinta"}
      </Button>
    </Card>
  );
}
