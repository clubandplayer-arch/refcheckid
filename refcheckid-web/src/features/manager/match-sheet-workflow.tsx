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
  getPlayerStatusLabel,
  getPlayerStatusTone,
  lineupRoleOptions,
  validateMatchSheet,
} from "@/lib/match-sheet-validation";
import { saveSubmittedMatchSheetSnapshot } from "@/lib/submitted-match-sheet";
import {
  fetchMatchSheets,
  fetchPlayers,
  fetchStaff,
  queryKeys,
  submitMatchSheet,
} from "@/lib/api-client";
import type {
  PlayerLineupRole,
  PlayerListItem,
  StaffListItem,
} from "@/lib/types";

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
      saveSubmittedMatchSheetSnapshot({
        players: calledPlayers,
        staff: calledStaff,
      });
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
        player.id === playerId && !player.suspended
          ? {
              ...player,
              isCaptain: player.selected ? false : player.isCaptain,
              isViceCaptain: player.selected ? false : player.isViceCaptain,
              selected: !player.selected,
            }
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
  function updatePlayerRole(playerId: string, role: PlayerLineupRole) {
    setPlayerList((current) =>
      current.map((player) =>
        player.id === playerId ? { ...player, role } : player,
      ),
    );
  }
  function toggleCaptain(playerId: string) {
    setPlayerList((current) =>
      current.map((player) => {
        if (player.id !== playerId) return { ...player, isCaptain: false };
        const nextCaptain = !player.isCaptain;
        return {
          ...player,
          isCaptain: nextCaptain,
          isViceCaptain: nextCaptain ? false : player.isViceCaptain,
        };
      }),
    );
  }
  function toggleViceCaptain(playerId: string) {
    setPlayerList((current) =>
      current.map((player) => {
        if (player.id !== playerId) return { ...player, isViceCaptain: false };
        const nextViceCaptain = !player.isViceCaptain;
        return {
          ...player,
          isCaptain: nextViceCaptain ? false : player.isCaptain,
          isViceCaptain: nextViceCaptain,
        };
      }),
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
          players={players}
          toggleCaptain={toggleCaptain}
          togglePlayer={togglePlayer}
          toggleViceCaptain={toggleViceCaptain}
          updatePlayerRole={updatePlayerRole}
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
        {players.map((player) => {
          const statusTone = getPlayerStatusTone(player);
          return (
          <label
            className={`flex items-center gap-3 p-3 ${
              statusTone === "warning"
                ? "bg-yellow-50"
                : statusTone === "suspended"
                  ? "bg-red-50 opacity-80"
                  : ""
            }`}
            key={player.id}
          >
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
              aria-label={`Convoca ${player.lastName} ${player.firstName}`}
              checked={player.selected}
              disabled={player.suspended}
              onChange={() => togglePlayer(player.id)}
              type="checkbox"
            />
          </label>
          );
        })}
      </div>
    </Card>
  );
}

function OrderStep({
  players,
  onDragEnd,
  toggleCaptain,
  togglePlayer,
  toggleViceCaptain,
  updatePlayerRole,
  updateShirtNumber,
}: Readonly<{
  players: readonly PlayerListItem[];
  onDragEnd: (event: DragEndEvent) => void;
  toggleCaptain: (id: string) => void;
  togglePlayer: (id: string) => void;
  toggleViceCaptain: (id: string) => void;
  updatePlayerRole: (id: string, value: PlayerLineupRole) => void;
  updateShirtNumber: (id: string, value: number | null) => void;
}>) {
  return (
    <Card className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">Ordine distinta</h2>
          <p className="text-sm text-slate-500">
            Drag & drop, numero maglia, ruolo e incarichi.
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
            <div className="overflow-x-auto rounded-xl border">
              <div className="grid min-w-[960px] grid-cols-[72px_2fr_140px_160px_240px_140px_90px] border-b bg-muted/60 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <span>Ordine</span>
                <span>Giocatore</span>
                <span>Numero maglia</span>
                <span>Ruolo</span>
                <span>Incarichi</span>
                <span>Stato</span>
                <span>Azione</span>
              </div>
              {players.map((player) => (
                <SortablePlayerRow
                  key={player.id}
                  player={player}
                  toggleCaptain={toggleCaptain}
                  togglePlayer={togglePlayer}
                  toggleViceCaptain={toggleViceCaptain}
                  updatePlayerRole={updatePlayerRole}
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
  toggleCaptain,
  togglePlayer,
  toggleViceCaptain,
  updatePlayerRole,
  updateShirtNumber,
}: Readonly<{
  player: PlayerListItem;
  toggleCaptain: (id: string) => void;
  togglePlayer: (id: string) => void;
  toggleViceCaptain: (id: string) => void;
  updatePlayerRole: (id: string, value: PlayerLineupRole) => void;
  updateShirtNumber: (id: string, value: number | null) => void;
}>) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: player.id });
  const statusTone = getPlayerStatusTone(player);
  const disabled = !player.selected || player.suspended;
  return (
    <div
      className={`grid min-w-[960px] grid-cols-[72px_2fr_140px_160px_240px_140px_90px] items-center gap-3 border-b px-3 py-3 text-sm last:border-b-0 ${
        statusTone === "warning"
          ? "border-l-4 border-l-yellow-400 bg-yellow-50"
          : statusTone === "suspended"
            ? "border-l-4 border-l-red-500 bg-red-50 opacity-80"
            : ""
      }`}
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
      <div className="flex items-center gap-3">
        {player.photoUrl ? (
          <Image
            alt={`Foto ${player.lastName} ${player.firstName}`}
            className="rounded-full bg-muted object-cover"
            height={36}
            src={player.photoUrl}
            width={36}
          />
        ) : null}
        <span className="font-medium">
          {player.lastName} {player.firstName}
        </span>
      </div>
      <Input
        disabled={disabled}
        min={1}
        onChange={(event) =>
          updateShirtNumber(player.id, event.target.valueAsNumber || null)
        }
        placeholder="N°"
        type="number"
        value={player.shirtNumber ?? ""}
      />
      <select
        className="rounded-lg border px-3 py-2 text-sm"
        disabled={disabled}
        onChange={(event) =>
          updatePlayerRole(player.id, event.target.value as PlayerLineupRole)
        }
        value={player.role}
      >
        {lineupRoleOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <div className="flex flex-wrap gap-4">
        <label className="flex items-center gap-2">
          <input
            checked={player.isCaptain}
            disabled={disabled}
            onChange={() => toggleCaptain(player.id)}
            type="checkbox"
          />
          Capitano
        </label>
        <label className="flex items-center gap-2">
          <input
            checked={player.isViceCaptain}
            disabled={disabled}
            onChange={() => toggleViceCaptain(player.id)}
            type="checkbox"
          />
          Vice capitano
        </label>
      </div>
      <span
        className={`w-fit rounded-full px-3 py-1 text-xs font-semibold ${
          statusTone === "warning"
            ? "bg-yellow-100 text-yellow-800"
            : statusTone === "suspended"
              ? "bg-red-100 text-red-800"
              : "bg-green-100 text-green-800"
        }`}
      >
        {getPlayerStatusLabel(player)}
      </span>
      <input
        aria-label={`Convoca ${player.lastName} ${player.firstName}`}
        checked={player.selected}
        disabled={player.suspended}
        onChange={() => togglePlayer(player.id)}
        type="checkbox"
      />
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
        <li>Portieri: {validation.goalkeepers}</li>
        <li>Titolari: {validation.starters}</li>
        <li>Capitani: {validation.captains}</li>
        <li>Vice capitani: {validation.viceCaptains}</li>
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
