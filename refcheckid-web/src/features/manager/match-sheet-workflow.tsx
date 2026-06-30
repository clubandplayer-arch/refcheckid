"use client";

import { DndContext, type DragEndEvent } from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  players as initialPlayers,
  staff as initialStaff,
} from "@/lib/mock-data";
import type { PlayerListItem, StaffListItem } from "@/lib/types";

export function MatchSheetWorkflow() {
  const [step, setStep] = useState(0);
  const [query, setQuery] = useState("");
  const [players, setPlayers] =
    useState<readonly PlayerListItem[]>(initialPlayers);
  const [staff, setStaff] = useState<readonly StaffListItem[]>(initialStaff);
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
  const selectedPlayers = players.filter((player) => player.selected);
  const selectedStaff = staff.filter((staffMember) => staffMember.selected);

  function togglePlayer(playerId: string) {
    setPlayers((current) =>
      current.map((player) =>
        player.id === playerId
          ? { ...player, selected: !player.selected }
          : player,
      ),
    );
  }

  function toggleStaff(staffId: string) {
    setStaff((current) =>
      current.map((staffMember) =>
        staffMember.id === staffId
          ? { ...staffMember, selected: !staffMember.selected }
          : staffMember,
      ),
    );
  }

  function updateShirtNumber(playerId: string, shirtNumber: number | null) {
    setPlayers((current) =>
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
    setPlayers((current) => arrayMove([...current], oldIndex, newIndex));
  }

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
          players={selectedPlayers}
          updateShirtNumber={updateShirtNumber}
        />
      ) : null}
      {step === 2 ? (
        <StaffStep staff={staff} toggleStaff={toggleStaff} />
      ) : null}
      {step === 3 ? (
        <SummaryStep players={selectedPlayers} staff={selectedStaff} />
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
          <p className="p-4 text-sm text-slate-500">
            Nessun giocatore trovato.
          </p>
        ) : null}
        {players.map((player) => (
          <label className="flex items-center gap-3 p-3" key={player.id}>
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-xs">
              Foto
            </div>
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
        <Button type="button">Ripristina distinta precedente</Button>
      </div>
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
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      className="grid gap-2 rounded-xl border p-3 md:grid-cols-[48px_1fr_120px_160px]"
      ref={setNodeRef}
      style={style}
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
}: Readonly<{
  players: readonly PlayerListItem[];
  staff: readonly StaffListItem[];
}>) {
  const missingNumbers = players.filter(
    (player) => player.shirtNumber === null,
  ).length;
  return (
    <Card className="space-y-4">
      <h2 className="text-xl font-bold">Riepilogo e controlli finali</h2>
      <ul className="space-y-2 text-sm">
        <li>Giocatori convocati: {players.length}</li>
        <li>Staff selezionato: {staff.length}</li>
        <li>Numeri maglia mancanti: {missingNumbers}</li>
      </ul>
      {missingNumbers > 0 ? (
        <p className="rounded-lg bg-yellow-100 p-3 text-sm text-yellow-900">
          Completa i numeri maglia prima dell’invio.
        </p>
      ) : (
        <p className="rounded-lg bg-green-100 p-3 text-sm text-green-900">
          Controlli superati.
        </p>
      )}
      <Button disabled={missingNumbers > 0} type="button">
        Invia distinta
      </Button>
    </Card>
  );
}
