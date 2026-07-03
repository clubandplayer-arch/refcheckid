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
import { managerTeamConfig, getCurrentManagerTeam } from "@/lib/manager-team";
import { saveManagerSubjectPhoto } from "@/lib/manager-photo-store";
import { clearSubmittedMatchSheetSnapshot, saveSubmittedMatchSheetSnapshot } from "@/lib/submitted-match-sheet";
import {
  fetchMatchSheets,
  fetchPlayers,
  fetchStaff,
  queryKeys,
  resetSmokeMatchSheet,
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
  const [photoDraft, setPhotoDraft] = useState<{ id: string; previewUrl: string; zoom: number; offsetX: number; offsetY: number } | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const managerTeam = getCurrentManagerTeam();
  const managerTeamLabel = managerTeamConfig[managerTeam].label;
  const managerClubId = managerTeamConfig[managerTeam].clubId;
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const playersQuery = useQuery({
    queryFn: fetchPlayers,
    queryKey: [...queryKeys.players, managerTeam],
  });
  const staffQuery = useQuery({
    queryFn: fetchStaff,
    queryKey: [...queryKeys.staff, managerTeam],
  });
  const sheetsQuery = useQuery({
    queryFn: () => fetchMatchSheets(`?clubId=${encodeURIComponent(managerClubId)}`),
    queryKey: [...queryKeys.matchSheets, managerClubId],
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
      if (firstSheet.status !== "draft") throw new Error("Distinta già inviata. Usa il ripristino della distinta di prova per crearne una nuova.");
      saveSubmittedMatchSheetSnapshot({
        players: calledPlayers,
        staff: calledStaff,
        team: managerTeam,
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
  const resetSmokeMutation = useMutation({
    mutationFn: async () => {
      const firstSheet = sheetsQuery.data?.[0];
      if (!firstSheet) throw new Error("Nessuna distinta disponibile.");
      clearSubmittedMatchSheetSnapshot(managerTeam);
      setSelectedPlayers([]);
      setSelectedStaff([]);
      return resetSmokeMatchSheet(firstSheet.id);
    },
    onSuccess() {
      notify("Distinta di prova ripristinata", "success");
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
  const orderedCalledPlayers = players.filter((player) => player.selected);
  const calledStaff = staff.filter((staffMember) => staffMember.selected);
  const matchSheetStatus = sheetsQuery.data?.[0]?.status ?? "draft";
  const isReadOnly = matchSheetStatus !== "draft";

  function setPlayerList(
    updater: (current: readonly PlayerListItem[]) => readonly PlayerListItem[],
  ) {
    if (isReadOnly) return;
    setSelectedPlayers(updater(players));
  }
  function setStaffList(
    updater: (current: readonly StaffListItem[]) => readonly StaffListItem[],
  ) {
    if (isReadOnly) return;
    setSelectedStaff(updater(staff));
  }
  function updatePlayerPhoto(playerId: string, photoUrl: string) {
    saveManagerSubjectPhoto(managerTeam, playerId, photoUrl);
    setPlayerList((current) =>
      current.map((player) =>
        player.id === playerId ? { ...player, photoUrl } : player,
      ),
    );
  }
  function updateStaffPhoto(staffId: string, photoUrl: string) {
    saveManagerSubjectPhoto(managerTeam, staffId, photoUrl);
    setStaffList((current) =>
      current.map((staffMember) =>
        staffMember.id === staffId ? { ...staffMember, photoUrl } : staffMember,
      ),
    );
  }
  function handlePhotoSelected(subjectId: string, file: File | null) {
    if (isReadOnly) return;
    setPhotoError(null);
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setPhotoError("Carica solo file immagine.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setPhotoError("La foto supera la dimensione massima di 5 MB.");
      return;
    }
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (typeof reader.result === "string") {
        setPhotoDraft({ id: subjectId, offsetX: 0, offsetY: 0, previewUrl: reader.result, zoom: 1 });
      }
    });
    reader.readAsDataURL(file);
  }
  async function confirmPhoto(subjectId: string, applyPhoto: (photoUrl: string) => void) {
    if (!photoDraft || photoDraft.id !== subjectId) {
      setPhotoError("Conferma una preview prima del salvataggio.");
      return;
    }
    applyPhoto(await cropPhotoDraft(photoDraft));
    setPhotoDraft(null);
    setPhotoError(null);
  }
  function updatePhotoDraftTransform(subjectId: string, transform: Partial<Pick<NonNullable<typeof photoDraft>, "zoom" | "offsetX" | "offsetY">>) {
    setPhotoDraft((current) =>
      current?.id === subjectId ? { ...current, ...transform } : current,
    );
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
  function toggleGoalkeeper(playerId: string) {
    setPlayerList((current) =>
      current.map((player) =>
        player.id === playerId
          ? { ...player, isGoalkeeper: !player.isGoalkeeper }
          : player,
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
      <div className="lg:col-span-2 rounded-xl border bg-muted/40 p-4 text-sm">
        <p className="font-semibold">Distinta {managerTeamLabel}</p>
        <p>Stato: <span className="font-semibold">{getMatchSheetStatusLabel(matchSheetStatus)}</span></p>
        {isReadOnly ? (
          <p className="mt-1 text-slate-600">Distinta inviata: non puoi più modificarla. Se serve correggere qualcosa, avvisa l’arbitro o la segreteria.</p>
        ) : null}
        {isSmokeResetAvailable() ? (
          <Button
            className="mt-3"
            disabled={resetSmokeMutation.isPending}
            onClick={() => resetSmokeMutation.mutate()}
            type="button"
          >
            Ripristina distinta di prova
          </Button>
        ) : null}
      </div>
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
          onConfirmPhoto={(playerId) =>
            confirmPhoto(playerId, (photoUrl) => updatePlayerPhoto(playerId, photoUrl))
          }
          onPhotoSelected={handlePhotoSelected}
          photoDraft={photoDraft}
          onPhotoTransform={updatePhotoDraftTransform}
          photoError={photoError}
          players={filteredPlayers}
          query={query}
          setQuery={setQuery}
          togglePlayer={togglePlayer}
        />
      ) : null}
      {step === 1 ? (
        <OrderStep
          onDragEnd={handleDragEnd}
          players={orderedCalledPlayers}
          toggleCaptain={toggleCaptain}
          toggleGoalkeeper={toggleGoalkeeper}
          togglePlayer={togglePlayer}
          toggleViceCaptain={toggleViceCaptain}
          updatePlayerRole={updatePlayerRole}
          updateShirtNumber={updateShirtNumber}
        />
      ) : null}
      {step === 2 ? (
        <StaffStep
          onConfirmPhoto={(staffId) =>
            confirmPhoto(staffId, (photoUrl) => updateStaffPhoto(staffId, photoUrl))
          }
          onPhotoSelected={handlePhotoSelected}
          onPhotoTransform={updatePhotoDraftTransform}
          photoDraft={photoDraft}
          photoError={photoError}
          staff={staff}
          toggleStaff={toggleStaff}
        />
      ) : null}
      {step === 3 ? (
        <SummaryStep
          isSubmitting={submitMutation.isPending || isReadOnly}
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
  onConfirmPhoto,
  onPhotoSelected,
  onPhotoTransform,
  photoDraft,
  photoError,
  players,
  query,
  setQuery,
  togglePlayer,
}: Readonly<{
  onConfirmPhoto: (id: string) => void;
  onPhotoSelected: (id: string, file: File | null) => void;
  onPhotoTransform: (id: string, transform: Partial<{ zoom: number; offsetX: number; offsetY: number }>) => void;
  photoDraft: { id: string; previewUrl: string; zoom: number; offsetX: number; offsetY: number } | null;
  photoError: string | null;
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
                {!player.photoUrl ? " · Foto mancante" : ""}
              </p>
            </div>
            <PhotoCaptureControls
              currentPhotoUrl={player.photoUrl}
              onConfirm={() => onConfirmPhoto(player.id)}
              onPhotoSelected={(file) => onPhotoSelected(player.id, file)}
              onPhotoTransform={(transform) => onPhotoTransform(player.id, transform)}
              photoDraft={photoDraft?.id === player.id ? photoDraft : null}
              photoError={photoError}
              subjectLabel={`${player.lastName} ${player.firstName}`}
            />
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

function PhotoCaptureControls({
  currentPhotoUrl,
  onConfirm,
  onPhotoSelected,
  onPhotoTransform,
  photoDraft,
  photoError,
  subjectLabel,
}: Readonly<{
  currentPhotoUrl: string | null;
  onConfirm: () => void;
  onPhotoSelected: (file: File | null) => void;
  onPhotoTransform: (transform: Partial<{ zoom: number; offsetX: number; offsetY: number }>) => void;
  photoDraft: { id: string; previewUrl: string; zoom: number; offsetX: number; offsetY: number } | null;
  photoError: string | null;
  subjectLabel: string;
}>) {
  return (
    <div className="min-w-[180px] space-y-2 text-xs">
      <p className="font-semibold text-slate-600">
        {currentPhotoUrl ? "Modifica foto" : "Aggiungi foto"}
      </p>
      <label className="block rounded-lg border border-dashed p-2 text-center">
        <span>Scatta/carica foto</span>
        <input
          accept="image/*"
          aria-label={`${currentPhotoUrl ? "Modifica" : "Aggiungi"} foto ${subjectLabel}`}
          capture="environment"
          className="sr-only"
          onChange={(event) => onPhotoSelected(event.target.files?.[0] ?? null)}
          type="file"
        />
      </label>
      <p className="text-[11px] text-slate-500">
        Smartphone consigliato: usa la fotocamera e centra il volto nell’ovale.
        Da desktop puoi caricare un file immagine.
      </p>
      {photoDraft ? (
        <div className="space-y-2 rounded-lg bg-muted p-2">
          <div className="relative mx-auto flex h-24 w-24 items-center justify-center overflow-hidden rounded-lg bg-white">
            <Image
              alt={`Preview foto ${subjectLabel}`}
              className="h-full w-full object-contain"
              height={96}
              src={photoDraft.previewUrl}
              style={{ transform: `translate(${photoDraft.offsetX}px, ${photoDraft.offsetY}px) scale(${photoDraft.zoom})` }}
              width={96}
            />
            <div className="pointer-events-none absolute inset-3 rounded-[50%] border-2 border-white/80 shadow-[0_0_0_999px_rgba(15,23,42,0.20)]" />
          </div>
          <label className="block text-[11px] text-slate-600">
            Zoom / riduci foto
            <input
              aria-label="Zoom foto"
              className="w-full"
              max={3}
              min={0.4}
              onChange={(event) => onPhotoTransform({ zoom: Number(event.target.value) })}
              step={0.05}
              type="range"
              value={photoDraft.zoom}
            />
          </label>
          <label className="block text-[11px] text-slate-600">
            Sposta orizzontale
            <input
              aria-label="Sposta foto orizzontale"
              className="w-full"
              max={24}
              min={-24}
              onChange={(event) => onPhotoTransform({ offsetX: Number(event.target.value) })}
              type="range"
              value={photoDraft.offsetX}
            />
          </label>
          <label className="block text-[11px] text-slate-600">
            Sposta verticale
            <input
              aria-label="Sposta foto verticale"
              className="w-full"
              max={24}
              min={-24}
              onChange={(event) => onPhotoTransform({ offsetY: Number(event.target.value) })}
              type="range"
              value={photoDraft.offsetY}
            />
          </label>
          <Button className="w-full py-1 text-xs" onClick={onConfirm} type="button">
            Conferma caricamento
          </Button>
        </div>
      ) : null}
      {photoError ? <p className="text-red-600">{photoError}</p> : null}
    </div>
  );
}

function OrderStep({
  players,
  onDragEnd,
  toggleCaptain,
  toggleGoalkeeper,
  togglePlayer,
  toggleViceCaptain,
  updatePlayerRole,
  updateShirtNumber,
}: Readonly<{
  players: readonly PlayerListItem[];
  onDragEnd: (event: DragEndEvent) => void;
  toggleCaptain: (id: string) => void;
  toggleGoalkeeper: (id: string) => void;
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
              <div className="grid min-w-[1120px] grid-cols-[72px_minmax(260px,2fr)_140px_160px_360px_140px_90px] border-b bg-muted/60 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
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
                  toggleGoalkeeper={toggleGoalkeeper}
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
  toggleGoalkeeper,
  togglePlayer,
  toggleViceCaptain,
  updatePlayerRole,
  updateShirtNumber,
}: Readonly<{
  player: PlayerListItem;
  toggleCaptain: (id: string) => void;
  toggleGoalkeeper: (id: string) => void;
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
      className={`grid min-w-[1120px] grid-cols-[72px_minmax(260px,2fr)_140px_160px_360px_140px_90px] items-center gap-3 border-b px-3 py-3 text-sm last:border-b-0 ${
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
      <div className="flex min-w-0 items-center gap-3">
        {player.photoUrl ? (
          <Image
            alt={`Foto ${player.lastName} ${player.firstName}`}
            className="rounded-full bg-muted object-cover"
            height={36}
            src={player.photoUrl}
            width={36}
          />
        ) : null}
        <span className="whitespace-normal break-words font-medium leading-tight">
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
            checked={player.isGoalkeeper}
            disabled={disabled}
            onChange={() => toggleGoalkeeper(player.id)}
            type="checkbox"
          />
          Portiere
        </label>
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
  onConfirmPhoto,
  onPhotoSelected,
  onPhotoTransform,
  photoDraft,
  photoError,
  staff,
  toggleStaff,
}: Readonly<{
  onConfirmPhoto: (id: string) => void;
  onPhotoSelected: (id: string, file: File | null) => void;
  onPhotoTransform: (id: string, transform: Partial<{ zoom: number; offsetX: number; offsetY: number }>) => void;
  photoDraft: { id: string; previewUrl: string; zoom: number; offsetX: number; offsetY: number } | null;
  photoError: string | null;
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
        <div
          className="flex items-center justify-between gap-3 rounded-xl border p-3"
          key={staffMember.id}
        >
          <label className="flex flex-1 items-center gap-3">
            <input
              checked={staffMember.selected}
              onChange={() => toggleStaff(staffMember.id)}
              type="checkbox"
            />
            <span>
              <strong>{staffMember.fullName}</strong> · {staffMember.role}
              {!staffMember.photoUrl ? (
                <span className="block text-xs font-semibold text-red-600">
                  Foto mancante
                </span>
              ) : null}
            </span>
          </label>
          <PhotoCaptureControls
            currentPhotoUrl={staffMember.photoUrl}
            onConfirm={() => onConfirmPhoto(staffMember.id)}
            onPhotoSelected={(file) => onPhotoSelected(staffMember.id, file)}
            onPhotoTransform={(transform) => onPhotoTransform(staffMember.id, transform)}
            photoDraft={photoDraft?.id === staffMember.id ? photoDraft : null}
            photoError={photoError}
            subjectLabel={staffMember.fullName}
          />
        </div>
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
        <li>
          Numeri maglia mancanti: {validation.missingNumbers}
          {validation.missingShirtNumberPlayers.length > 0
            ? ` (${validation.missingShirtNumberPlayers.join(", ")})`
            : ""}
        </li>
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
        {isSubmitting ? "Distinta già inviata" : "Invia distinta"}
      </Button>
    </Card>
  );
}


function getMatchSheetStatusLabel(status: string): string {
  return {
    draft: "Bozza — da completare e inviare",
    locked: "Bloccata dall’arbitro — riconoscimento in corso",
    submitted: "Inviata — in attesa dell’arbitro",
  }[status] ?? status;
}

function isSmokeResetAvailable(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_REFCHECKID_SMOKE_RESET === "true";
}

async function cropPhotoDraft(photoDraft: { previewUrl: string; zoom: number; offsetX: number; offsetY: number }): Promise<string> {
  const image = await loadImage(photoDraft.previewUrl);
  const canvas = document.createElement("canvas");
  const size = 256;
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) return photoDraft.previewUrl;
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, size, size);
  const scale = Math.max(size / image.width, size / image.height) * photoDraft.zoom;
  const width = image.width * scale;
  const height = image.height * scale;
  const x = (size - width) / 2 + photoDraft.offsetX * (size / 96);
  const y = (size - height) / 2 + photoDraft.offsetY * (size / 96);
  context.save();
  context.beginPath();
  context.ellipse(size / 2, size / 2, size * 0.34, size * 0.43, 0, 0, Math.PI * 2);
  context.clip();
  context.drawImage(image, x, y, width, height);
  context.restore();
  return canvas.toDataURL("image/jpeg", 0.9);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new window.Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Impossibile preparare il ritaglio foto."));
    image.src = src;
  });
}
