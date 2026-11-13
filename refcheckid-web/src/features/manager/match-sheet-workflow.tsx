"use client";

import { arrayMove } from "@dnd-kit/sortable";
import Image from "next/image";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
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
import { getCurrentManagerConfig, getCurrentManagerTeam } from "@/lib/manager-team";
import { enrichPlayersWithBackendPhotos, enrichStaffWithBackendStatus, uploadOfficialSubjectPhoto } from "@/lib/manager-photo-backend";
import { getPhotoFeatureFlags } from "@/lib/photo-feature-flags";
import {
  fetchMatchSheets,
  fetchLineupDefaults,
  fetchPlayers,
  fetchStaff,
  queryKeys,
  resetSmokeMatchSheet,
  submitMatchSheet,
  saveMatchSheetDraft,
  fetchMatches,
  selectOperationalMatch,
} from "@/lib/api-client";
import type {
  PlayerLineupRole,
  PlayerListItem,
  StaffListItem,
} from "@/lib/types";

const EMPTY_PLAYERS: readonly PlayerListItem[] = [];
const EMPTY_STAFF: readonly StaffListItem[] = [];
type PhotoErrorState = {
  subjectKind: "athlete" | "staff_member";
  subjectId: string;
  message: string;
};

export function MatchSheetWorkflow() {
  const [step, setStep] = useState(0);
  const [query, setQuery] = useState("");
  const [photoDraft, setPhotoDraft] = useState<{
    id: string;
    previewUrl: string;
    uploading?:boolean;
    zoom: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  const photoUploadLock=useRef(false);
  const [photoChangeReason, setPhotoChangeReason] = useState("");
  const [photoError, setPhotoError] = useState<PhotoErrorState | null>(null);
  const managerTeam = getCurrentManagerTeam();
  const managerClubId = getCurrentManagerConfig().clubId;
  const officialPhotoUploadEnabled =
    getPhotoFeatureFlags().officialBackendUpload;
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const playersQuery = useQuery({
    queryFn: () => fetchPlayers({includePhotos:false}),
    queryKey: [...queryKeys.players, managerTeam],
  });
  const staffQuery = useQuery({
    queryFn: () => fetchStaff({includePhotos:false}),
    queryKey: [...queryKeys.staff, managerTeam],
  });
  const sheetsQuery = useQuery({
    queryFn: async () => {
      const [sheets, matches] = await Promise.all([
        fetchMatchSheets(`?clubId=${encodeURIComponent(managerClubId)}`),
        fetchMatches(`?clubId=${encodeURIComponent(managerClubId)}`),
      ]);
      const match = selectOperationalMatch(matches);
      return match ? sheets.filter((sheet) => sheet.matchId === match.id).map((sheet)=>({...sheet,lineupRules:match.lineupRules})) : [];
    },
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
      if (firstSheet.status !== "draft")
        throw new Error(
          "Distinta già inviata. Usa il ripristino della distinta di prova per crearne una nuova.",
        );
      return submitMatchSheet(firstSheet.id, buildCurrentLineup());
    },
    onSuccess() {
      notify("Distinta inviata", "success");
      void queryClient.invalidateQueries({ queryKey: queryKeys.matchSheets });
    },
    onError(error) {
      notify(error.message, "error");
    },
  });
  const draftMutation = useMutation({
    mutationFn: () => {
      const sheet = sheetsQuery.data?.[0];
      if (!sheet) throw new Error('Nessuna distinta disponibile.');
      return saveMatchSheetDraft(sheet.id, buildCurrentLineup());
    },
    onSuccess() { notify('Bozza distinta salvata', 'success'); void queryClient.invalidateQueries({ queryKey: queryKeys.matchSheets }); },
    onError(error) { notify(error.message, 'error'); },
  });
  const [playersEdited, setPlayersEdited] = useState(false);
  const [staffEdited, setStaffEdited] = useState(false);
  const resetSmokeMutation = useMutation({
    mutationFn: async () => {
      const firstSheet = sheetsQuery.data?.[0];
      if (!firstSheet) throw new Error("Nessuna distinta disponibile.");
      return resetSmokeMatchSheet(firstSheet.id);
    },
    onSuccess() {
      setSelectedPlayers([]); setSelectedStaff([]); setPlayersEdited(false); setStaffEdited(false);
      notify(
        "Partita demo ripristinata: distinte e riconoscimento sono nuovamente disponibili",
        "success",
      );
      void queryClient.invalidateQueries({ queryKey: queryKeys.matchSheets });
    },
    onError(error) {
      notify(error.message, "error");
    },
  });

  const playerPhotosQuery = useQuery({queryKey:[...queryKeys.players,managerTeam,'photos',playersQuery.dataUpdatedAt],queryFn:()=>enrichPlayersWithBackendPhotos(managerTeam,playersQuery.data!),enabled:!!playersQuery.data&&getPhotoFeatureFlags().officialBackendRead,refetchOnWindowFocus:false,refetchInterval:false});
  const staffPhotosQuery = useQuery({queryKey:[...queryKeys.staff,managerTeam,'photos',staffQuery.dataUpdatedAt],queryFn:()=>enrichStaffWithBackendStatus(managerTeam,staffQuery.data!),enabled:!!staffQuery.data&&getPhotoFeatureFlags().officialBackendRead,refetchOnWindowFocus:false,refetchInterval:false});
  const fetchedPlayers = playerPhotosQuery.data ?? playersQuery.data ?? EMPTY_PLAYERS;
  const fetchedStaff = staffPhotosQuery.data ?? staffQuery.data ?? EMPTY_STAFF;
  const matchSheetStatus = sheetsQuery.data?.[0]?.status ?? "draft";
  const isReadOnly = matchSheetStatus !== "draft";
  const submittedSheet = sheetsQuery.data?.[0];
  const defaultsQuery = useQuery({
    queryKey: [...queryKeys.matchSheets, "defaults", managerClubId, submittedSheet?.matchId],
    queryFn: () => fetchLineupDefaults(managerClubId, submittedSheet!.matchId),
    enabled: !!submittedSheet && !isReadOnly && !submittedSheet.players?.length,
    staleTime: 60_000,
  });
  const managerTeamLabel = submittedSheet?.clubName ?? getCurrentManagerConfig().label;
  const players = useMemo(() => {
    if (!isReadOnly && playersEdited) return selectedPlayers.map(player=>{const fresh=fetchedPlayers.find(p=>p.id===player.id);return fresh?.photo&&(fresh.photo.receivedAt??0)>=(player.photo?.receivedAt??0)?{...player,photo:fresh.photo,photoUrl:fresh.photoUrl}:player;});
    const defaultsByRegistration = new Map(
      (defaultsQuery.data?.players ?? []).map((player) => [player.playerRegistrationId, player]),
    );
    const roster = fetchedPlayers.map((player) => {
      const defaults = player.registrationId ? defaultsByRegistration.get(player.registrationId) : undefined;
      // A saved lineup for this match always takes priority over suggestions.
      if (isReadOnly || submittedSheet?.players?.length || !defaults) return player;
      return { ...player, shirtNumber: defaults.shirtNumber,
        role: (defaults.role === "reserve" ? "reserve" : "starter") as PlayerLineupRole,
        isGoalkeeper: defaults.isGoalkeeper, isCaptain: defaults.isCaptain,
        isViceCaptain: defaults.isViceCaptain };
    });
    if (!isReadOnly && !submittedSheet?.players?.length) return roster;
    const lineupByRegistration = new Map(
      (submittedSheet?.players ?? []).map((line) => [
        line.playerRegistrationId,
        line,
      ]),
    );
    return fetchedPlayers
      .map((player) => {
        const line = player.registrationId
          ? lineupByRegistration.get(player.registrationId)
          : undefined;
        return line
          ? {
              ...player,
              selected: true,
              shirtNumber: line.shirtNumber,
              role: (line.role === "reserve"
                ? "reserve"
                : "starter") as PlayerLineupRole,
              isGoalkeeper: line.isGoalkeeper,
              isCaptain: line.isCaptain,
              isViceCaptain: line.isViceCaptain,
              lineupOrder: line.lineupOrder,
            }
          : { ...player, lineupOrder: Number.MAX_SAFE_INTEGER };
      })
      .sort((left, right) => left.lineupOrder - right.lineupOrder)
      .map(({ lineupOrder: _lineupOrder, ...player }) => player);
  }, [defaultsQuery.data, fetchedPlayers, isReadOnly, playersEdited, selectedPlayers, submittedSheet?.players]);
  const staff = useMemo(() => {
    if (!isReadOnly && staffEdited) return selectedStaff.map(member=>{const fresh=fetchedStaff.find(p=>p.id===member.id);return fresh?.photo&&(fresh.photo.receivedAt??0)>=(member.photo?.receivedAt??0)?{...member,photo:fresh.photo,photoUrl:fresh.photoUrl}:member;});
    if (!isReadOnly && !submittedSheet?.staff?.length) return fetchedStaff;
    const submittedRegistrationIds = new Set(
      (submittedSheet?.staff ?? []).map((line) => line.staffRegistrationId),
    );
    return fetchedStaff.map((member) => ({
      ...member,
      selected:
        member.registrationId !== null &&
        submittedRegistrationIds.has(member.registrationId),
    }));
  }, [fetchedStaff, isReadOnly, staffEdited, selectedStaff, submittedSheet?.staff]);
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
  function buildCurrentLineup() {
    return {
        players: calledPlayers
          .filter((player) => player.registrationId)
          .map((player, lineupOrder) => ({
            playerRegistrationId: player.registrationId as string,
            role: player.role,
            shirtNumber: player.shirtNumber,
            lineupOrder,
            isGoalkeeper: player.isGoalkeeper,
            isCaptain: player.isCaptain,
            isViceCaptain: player.isViceCaptain,
          })),
        staff: calledStaff
          .filter((staffMember) => staffMember.registrationId)
          .map((staffMember) => ({
            staffRegistrationId: staffMember.registrationId as string,
            role: staffMember.role,
          })),
    };
  }
  function setPlayerList(
    updater: (current: readonly PlayerListItem[]) => readonly PlayerListItem[],
  ) {
    if (isReadOnly) return;
    setPlayersEdited(true);
    setSelectedPlayers(updater(players));
  }
  function setStaffList(
    updater: (current: readonly StaffListItem[]) => readonly StaffListItem[],
  ) {
    if (isReadOnly) return;
    setStaffEdited(true);
    setSelectedStaff(updater(staff));
  }
  async function updatePlayerPhoto(playerId: string, photoUrl: string) {
    const player = players.find((item) => item.id === playerId);
    const flags = getPhotoFeatureFlags();
    if (flags.officialBackendUpload) {
      if (!player?.registrationId || !player.season) {
        throw new Error(
          "Tesseramento stagionale non disponibile: impossibile caricare la foto ufficiale.",
        );
      }
      const state = await uploadOfficialSubjectPhoto({
        subjectKind: "athlete",
        subjectId: playerId,
        registrationId: player.registrationId,
        clubId: managerClubId,
        federationId: getCurrentManagerConfig().federationId,
        seasonId: player.season,
        dataUrl: photoUrl,
        replacementReason: photoChangeReason,
      });
      setPlayerList((current) =>
        current.map((item) =>
          item.id === playerId
            ? {
                ...item,
                photo: state,
                photoUrl: state.currentPhotoUrl ?? item.photoUrl,
              }
            : item,
        ),
      );
      void queryClient.invalidateQueries({
        queryKey: [...queryKeys.players, managerTeam],
      });
      notify(
        state.status === "pending"
          ? "Foto inviata al backend: richiesta in attesa di approvazione federale"
          : "Foto tesserato aggiornata dal backend",
        "success",
      );
      return;
    }
    throw new Error(
      "Upload foto ufficiale non disponibile: il fallback locale legacy è stato disabilitato dalla Recovery-4.",
    );
  }
  async function updateStaffPhoto(staffId: string, photoUrl: string) {
    const staffMember = staff.find((item) => item.id === staffId);
    const flags = getPhotoFeatureFlags();
    if (flags.officialBackendUpload) {
      if (!staffMember?.registrationId || !staffMember.season) {
        throw new Error(
          "Tesseramento stagionale staff non disponibile: impossibile caricare la foto ufficiale.",
        );
      }
      const state = await uploadOfficialSubjectPhoto({
        subjectKind: "staff_member",
        subjectId: staffId,
        registrationId: staffMember.registrationId,
        clubId: managerClubId,
        federationId: getCurrentManagerConfig().federationId,
        seasonId: staffMember.season,
        dataUrl: photoUrl,
        replacementReason: photoChangeReason,
      });
      setStaffList((current) =>
        current.map((item) =>
          item.id === staffId
            ? {
                ...item,
                photo: state,
                photoUrl: state.currentPhotoUrl ?? item.photoUrl,
              }
            : item,
        ),
      );
      void queryClient.invalidateQueries({
        queryKey: [...queryKeys.staff, managerTeam],
      });
      notify(
        state.status === "pending"
          ? "Foto staff inviata al backend: richiesta in attesa di approvazione federale"
          : "Foto staff aggiornata dal backend",
        "success",
      );
      return;
    }
    throw new Error(
      "Upload foto ufficiale staff non disponibile: il fallback locale legacy è stato disabilitato dalla Recovery-4.",
    );
  }
  function handlePhotoSelected(
    subjectKind: PhotoErrorState["subjectKind"],
    subjectId: string,
    file: File | null,
  ) {
    setPhotoError((current) =>
      current?.subjectKind === subjectKind && current.subjectId === subjectId
        ? null
        : current,
    );
    if (!file) return;
    setPhotoChangeReason("");
    if (!file.type.startsWith("image/")) {
      setPhotoError({
        subjectKind,
        subjectId,
        message: "Carica solo file immagine.",
      });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setPhotoError({
        subjectKind,
        subjectId,
        message: "La foto supera la dimensione massima di 5 MB.",
      });
      return;
    }
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (typeof reader.result === "string") {
        setPhotoDraft({
          id: subjectId,
          offsetX: 0,
          offsetY: 0,
          previewUrl: reader.result,
          zoom: 1,
        });
      }
    });
    reader.readAsDataURL(file);
  }
  async function confirmPhoto(
    subjectKind: PhotoErrorState["subjectKind"],
    subjectId: string,
    applyPhoto: (photoUrl: string) => void | Promise<void>,
  ) {
    if (!photoDraft || photoDraft.id !== subjectId) {
      setPhotoError({
        subjectKind,
        subjectId,
        message: "Conferma una preview prima del salvataggio.",
      });
      return;
    }
    if(photoUploadLock.current)return;
    const person=subjectKind==='athlete'?players.find(p=>p.id===subjectId):staff.find(p=>p.id===subjectId);
    if(!person?.photo||['loading','unavailable'].includes(person.photo.status)){setPhotoError({subjectKind,subjectId,message:'Attendi la verifica della foto.'});return;}
    if(person.photo.approvalId){setPhotoError({subjectKind,subjectId,message:'Richiesta già in attesa.'});return;}
    if(person.photo.requiresReplacementReason&&photoChangeReason.trim().length<20){setPhotoError({subjectKind,subjectId,message:'Inserisci una motivazione di almeno 20 caratteri.'});return;}
    photoUploadLock.current=true;
    setPhotoDraft(current=>current?{...current,uploading:true}:current);
    try {
      await applyPhoto(await cropPhotoDraft(photoDraft));
      setPhotoDraft(null);
      setPhotoError(null);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Upload foto non riuscito.";
      setPhotoError({ subjectKind, subjectId, message });
      notify(message, "error");
      void queryClient.invalidateQueries({queryKey:queryKeys.players});
      void queryClient.invalidateQueries({queryKey:queryKeys.staff});
    }finally{photoUploadLock.current=false;setPhotoDraft(current=>current?.id===subjectId?{...current,uploading:false}:current);}
  }
  function updatePhotoDraftTransform(
    subjectId: string,
    transform: Partial<
      Pick<NonNullable<typeof photoDraft>, "zoom" | "offsetX" | "offsetY">
    >,
  ) {
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
  function selectAllPlayers() {
    setPlayerList((current) =>
      current.map((player) =>
        player.suspended ? player : { ...player, selected: true },
      ),
    );
  }
  function selectAllStaff() {
    setStaffList((current) =>
      current.map((staffMember) => ({ ...staffMember, selected: true })),
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
  function movePlayer(id: string, direction: -1 | 1) {
    if (isReadOnly) return;
    const index = orderedCalledPlayers.findIndex((player) => player.id === id);
    const neighbor = orderedCalledPlayers[index + direction];
    if (!neighbor) return;
    setPlayerList((current) => {
      const from = current.findIndex((player) => player.id === id);
      const to = current.findIndex((player) => player.id === neighbor.id);
      return arrayMove([...current], from, to);
    });
  }

  if (playersQuery.isLoading || staffQuery.isLoading || sheetsQuery.isLoading || defaultsQuery.isLoading)
    return <SkeletonBlock />;
  if (defaultsQuery.isError)
    return <ErrorState message={defaultsQuery.error.message} onRetry={() => void defaultsQuery.refetch()} />;
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
        <p>
          Stato:{" "}
          <span className="font-semibold">
            {getMatchSheetStatusLabel(matchSheetStatus)}
          </span>
        </p>
        {isReadOnly ? (
          <p className="mt-1 text-slate-600">
            Distinta inviata: convocazioni, ordine e staff non sono più
            modificabili. Le foto ufficiali dei tesserati restano aggiornabili;
            per correggere la distinta, avvisa l’arbitro o la segreteria.
          </p>
        ) : null}
        {!isReadOnly && !submittedSheet?.players?.length && defaultsQuery.data?.sourceMatchSheetId ? (
          <p className="mt-3 text-sm text-slate-600">
            Numeri di maglia, ruoli, portieri, capitano e vice capitano precompilati dalla distinta precedente.
            Puoi modificarli per questa gara. Salva la bozza o invia la distinta per conservarli.
          </p>
        ) : null}
        {!isReadOnly ? <Button className="mt-3" type="button" disabled={draftMutation.isPending} onClick={() => draftMutation.mutate()}>Salva distinta in bozza</Button> : null}
        {isSmokeResetAvailable() ? (
          <Button
            className="mt-3"
            disabled={resetSmokeMutation.isPending}
            onClick={() => resetSmokeMutation.mutate()}
            type="button"
          >
            Ripristina partita demo
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
            confirmPhoto("athlete", playerId, (photoUrl) =>
              updatePlayerPhoto(playerId, photoUrl),
            )
          }
          onPhotoSelected={(playerId, file) =>
            handlePhotoSelected("athlete", playerId, file)
          }
          photoDraft={photoDraft}
          onPhotoTransform={updatePhotoDraftTransform}
          photoError={photoError}
          replacementReason={photoChangeReason}
          onReplacementReasonChange={setPhotoChangeReason}
          officialPhotoUploadEnabled={officialPhotoUploadEnabled}
          players={filteredPlayers}
          onSelectAll={selectAllPlayers}
          selectAllDisabled={isReadOnly || !players.some((player) => !player.suspended && !player.selected)}
          selectedCount={calledPlayers.length}
          query={query}
          setQuery={setQuery}
          togglePlayer={togglePlayer}
        />
      ) : null}
      {step === 1 ? (
        <OrderStep
          movePlayer={movePlayer}
          readOnly={isReadOnly}
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
            confirmPhoto("staff_member", staffId, (photoUrl) =>
              updateStaffPhoto(staffId, photoUrl),
            )
          }
          onPhotoSelected={(staffId, file) =>
            handlePhotoSelected("staff_member", staffId, file)
          }
          onPhotoTransform={updatePhotoDraftTransform}
          photoDraft={photoDraft}
          photoError={photoError}
          replacementReason={photoChangeReason}
          onReplacementReasonChange={setPhotoChangeReason}
          officialPhotoUploadEnabled={officialPhotoUploadEnabled}
          staff={staff}
          onSelectAll={selectAllStaff}
          selectAllDisabled={isReadOnly || !staff.some((member) => !member.selected)}
          toggleStaff={toggleStaff}
        />
      ) : null}
      {step === 3 ? (
        <SummaryStep
          isSubmitting={submitMutation.isPending || isReadOnly}
          onInvalidSubmit={(message) => notify(message, "error")}
          onSubmit={() => submitMutation.mutate()}
          players={calledPlayers}
          rules={submittedSheet?.lineupRules}
          staff={calledStaff}
        />
      ) : null}
    </div>
  );
}

function PlayersStep({
  replacementReason,
  onReplacementReasonChange,
  onSelectAll,
  selectAllDisabled,
  selectedCount,
  onConfirmPhoto,
  onPhotoSelected,
  onPhotoTransform,
  photoDraft,
  photoError,
  officialPhotoUploadEnabled,
  players,
  query,
  setQuery,
  togglePlayer,
}: Readonly<{
  replacementReason: string;
  onReplacementReasonChange: (value: string) => void;
  onSelectAll: () => void;
  selectAllDisabled: boolean;
  selectedCount: number;
  onConfirmPhoto: (id: string) => void;
  onPhotoSelected: (id: string, file: File | null) => void;
  onPhotoTransform: (
    id: string,
    transform: Partial<{ zoom: number; offsetX: number; offsetY: number }>,
  ) => void;
  photoDraft: {
    id: string;
    previewUrl: string;
    uploading?:boolean;
    zoom: number;
    offsetX: number;
    offsetY: number;
  } | null;
  photoError: PhotoErrorState | null;
  officialPhotoUploadEnabled: boolean;
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
      <PhotoApprovalNotice />
      <Input
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Cerca giocatore"
        value={query}
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" onClick={onSelectAll} disabled={selectAllDisabled}>
          Seleziona tutti
        </Button>
        <p className="text-sm text-slate-500" aria-live="polite">
          {selectedCount} giocatori convocati
        </p>
      </div>
      <p className="text-xs text-slate-500">
        Seleziona tutti i giocatori della rosa non squalificati, anche se è attiva una ricerca.
        Puoi poi deselezionare i singoli giocatori da escludere.
      </p>
      <div className="divide-y rounded-xl border">
        {players.length === 0 ? (
          <EmptyState message={query?"Nessun giocatore trovato.":"Nessun giocatore disponibile per questa squadra. La federazione deve importare i tesseramenti e assegnarli alla rosa."} />
        ) : null}
        {players.map((player) => {
          const statusTone = getPlayerStatusTone(player);
          const uploadUnavailableReason =
            getOfficialPhotoUploadUnavailableReason(
              officialPhotoUploadEnabled,
              player.registrationId,
              player.season,
              "atleta",
            );
          return (
            <div
              className={`grid gap-3 p-4 md:grid-cols-[96px_minmax(0,1fr)_minmax(220px,340px)_32px] md:items-start ${
                statusTone === "warning"
                  ? "bg-yellow-50"
                  : statusTone === "suspended"
                    ? "bg-red-50 opacity-80"
                    : ""
              }`}
              key={player.id}
            >
              <SubjectPhotoThumbnail
                alt={`Foto ${player.lastName} ${player.firstName}`}
                photo={player.photo}
                photoUrl={player.photoUrl}
              />
              <div className="min-w-0 space-y-1">
                <p className="break-words text-base font-semibold leading-tight text-slate-900">
                  {player.lastName} {player.firstName}
                </p>
                <p className="text-xs leading-relaxed text-slate-500">
                  {player.warning ? "Diffida" : "Nessuna diffida"} ·{" "}
                  {player.suspended ? "Squalificato" : "Disponibile"}
                </p>
                <BackendPhotoStatus photo={player.photo} />
              </div>
              <div className="min-w-0 space-y-2">
                <PhotoComparison
                  currentPhotoUrl={
                    player.photo?.currentPhotoUrl ?? player.photoUrl
                  }
                  proposedPhotoUrl={player.photo?.proposedPhotoUrl ?? null}
                />
                <PhotoCaptureControls
                  replacementReason={replacementReason}
                  photo={player.photo}
                  onReplacementReasonChange={onReplacementReasonChange}
                  currentPhotoUrl={
                    player.photo?.currentPhotoUrl ?? player.photoUrl
                  }
                  onConfirm={() => onConfirmPhoto(player.id)}
                  onPhotoSelected={(file) => onPhotoSelected(player.id, file)}
                  onPhotoTransform={(transform) =>
                    onPhotoTransform(player.id, transform)
                  }
                  photoDraft={photoDraft?.id === player.id ? photoDraft : null}
                  photoError={
                    photoError?.subjectKind === "athlete" &&
                    photoError.subjectId === player.id
                      ? photoError.message
                      : null
                  }
                  subjectLabel={`${player.lastName} ${player.firstName}`}
                  uploadUnavailableReason={uploadUnavailableReason}
                />
              </div>
              <label className="flex items-center gap-2 text-sm md:justify-end">
                <span className="md:sr-only">Convoca</span>
                <input
                  aria-label={`Convoca ${player.lastName} ${player.firstName}`}
                  checked={player.selected}
                  disabled={player.suspended}
                  onChange={() => togglePlayer(player.id)}
                  type="checkbox"
                />
              </label>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function SubjectPhotoThumbnail({
  alt,
  photo,
  photoUrl,
}: Readonly<{
  alt: string;
  photo: PlayerListItem["photo"] | StaffListItem["photo"];
  photoUrl: string | null;
}>) {
  const displayPhotoUrl =
    photo?.proposedPhotoUrl ?? photo?.currentPhotoUrl ?? photoUrl;
  const [imageLoaded,setImageLoaded]=useState(false),[imageError,setImageError]=useState(false);
  useEffect(()=>{setImageLoaded(false);setImageError(false);},[displayPhotoUrl]);
  const isPending =
    photo?.status === "pending" && photo?.proposedPhotoUrl !== null;
  return (
    <div className="flex items-start gap-3 md:block">
      {displayPhotoUrl ? (
        <div className="relative h-24 w-20 shrink-0 overflow-hidden rounded-lg border bg-white shadow-sm">
          <Image
                unoptimized
            alt={alt}
            className="h-full w-full object-cover"
            height={96}
            src={displayPhotoUrl}
            onLoad={()=>setImageLoaded(true)}
            onError={()=>setImageError(true)}
            width={80}
          />
          {!imageLoaded?<span className="absolute inset-0 flex items-center justify-center bg-muted p-2 text-center text-xs">{imageError?"Foto non disponibile":"Caricamento foto…"}</span>:null}
          {isPending ? (
            <span className="absolute inset-x-1 bottom-1 rounded bg-red-600/95 px-1 py-0.5 text-center text-[9px] font-bold leading-tight text-white shadow">
              Da approvare
            </span>
          ) : null}
        </div>
      ) : (
        <div className="flex h-24 w-20 shrink-0 items-center justify-center rounded-lg border bg-muted text-xs">
          Foto
        </div>
      )}
    </div>
  );
}

function BackendPhotoStatus({
  photo,
}: Readonly<{ photo: PlayerListItem["photo"] | StaffListItem["photo"] }>) {
  const status = photo?.status ?? "loading";
  const label = {
    loading:"Caricamento foto…",
    unavailable:"Foto non disponibile",
    active: "Active",
    missing: "Missing",
    pending: "Pending Approval",
    rejected: "Rejected",
    suspended: "Suspended",
  }[status];
  const tone = {
    loading:"bg-slate-100 text-slate-700",
    unavailable:"bg-amber-100 text-amber-800",
    active: "bg-green-100 text-green-800",
    missing: "bg-slate-100 text-slate-700",
    pending: "bg-amber-100 text-amber-800",
    rejected: "bg-red-100 text-red-800",
    suspended: "bg-orange-100 text-orange-800",
  }[status];
  return (
    <span
      className={`inline-flex w-fit rounded-full px-2 py-1 text-[11px] font-semibold ${tone}`}
    >
      {label}
    </span>
  );
}

function PhotoComparison({
  currentPhotoUrl,
  proposedPhotoUrl,
}: Readonly<{
  currentPhotoUrl: string | null;
  proposedPhotoUrl: string | null;
}>) {
  if (!proposedPhotoUrl) return null;
  return (
    <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-[11px] font-semibold text-amber-900">
      <span>Foto ufficiale corrente</span>
      {currentPhotoUrl ? (
        <Image
                unoptimized
          alt="Foto ufficiale corrente"
          className="h-12 w-9 rounded border object-cover"
          height={48}
          src={currentPhotoUrl}
          width={36}
        />
      ) : (
        <span>Missing</span>
      )}
      <span>↓</span>
      <Image
                unoptimized
        alt="Nuova foto proposta"
        className="h-12 w-9 rounded border object-cover"
        height={48}
        src={proposedPhotoUrl}
        width={36}
      />
      <span>Nuova foto proposta</span>
    </div>
  );
}

function PhotoApprovalNotice() {
  return (
    <div className="grid gap-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm leading-relaxed text-amber-800 md:grid-cols-[minmax(0,1fr)_180px] md:items-center">
      <div>
        <p className="font-semibold">Nota foto tesserati</p>
        <p>
          Smartphone consigliato: inquadra tutto il volto. Da desktop puoi
          caricare un file immagine. La dirigenza carica solo la foto per il
          riconoscimento; i dati del tesserato sono gestiti dalla federazione.
          È consentito un cambio foto ordinario per anno solare. Dal secondo
          cambio serve una richiesta specifica e motivata alla federazione:
          un semplice taglio di capelli non è sufficiente. La crescita dei
          più giovani può giustificare un aggiornamento. La foto attuale
          resta valida fino all’approvazione della nuova proposta.
        </p>
      </div>
      <PhotoExampleIllustration />
    </div>
  );
}

function PhotoExampleIllustration() {
  return (
    <figure className="rounded-lg border border-amber-300 bg-white/80 p-2 text-center text-[11px] font-semibold text-amber-900 shadow-sm">
      <svg
        aria-label="Esempio foto tesserato corretta"
        className="mx-auto h-32 w-24"
        role="img"
        viewBox="0 0 120 160"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect
          fill="#f8fafc"
          height="158"
          rx="10"
          stroke="#cbd5e1"
          strokeWidth="2"
          width="118"
          x="1"
          y="1"
        />
        <path d="M30 142c4-27 56-27 60 0" fill="#2563eb" />
        <path d="M40 142c2-18 38-18 40 0" fill="#1e40af" opacity="0.6" />
        <circle cx="60" cy="62" fill="#f2c7a5" r="29" />
        <path d="M34 55c4-25 47-33 58-6-12-8-31-9-53 0z" fill="#7c2d12" />
        <circle cx="49" cy="64" fill="#0f172a" r="2.4" />
        <circle cx="71" cy="64" fill="#0f172a" r="2.4" />
        <path
          d="M54 78c4 3 8 3 12 0"
          fill="none"
          stroke="#9a3412"
          strokeLinecap="round"
          strokeWidth="2"
        />
        <path
          d="M26 26h18M26 26v18M94 26H76M94 26v18M26 118v-18M26 118h18M94 118h-18M94 118v-18"
          fill="none"
          stroke="#16a34a"
          strokeLinecap="round"
          strokeWidth="4"
        />
        <circle cx="92" cy="134" fill="#16a34a" r="12" />
        <path
          d="m86 134 4 4 8-9"
          fill="none"
          stroke="#fff"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="3"
        />
      </svg>
      <figcaption>Esempio: volto centrato, frontale e ben visibile</figcaption>
    </figure>
  );
}

function PhotoCaptureControls({
  replacementReason,
  photo,
  onReplacementReasonChange,
  currentPhotoUrl,
  onConfirm,
  onPhotoSelected,
  onPhotoTransform,
  photoDraft,
  photoError,
  subjectLabel,
  uploadUnavailableReason,
}: Readonly<{
  replacementReason: string;
  onReplacementReasonChange: (value: string) => void;
  photo:PlayerListItem["photo"];
  currentPhotoUrl: string | null;
  onConfirm: () => void;
  onPhotoSelected: (file: File | null) => void;
  onPhotoTransform: (
    transform: Partial<{ zoom: number; offsetX: number; offsetY: number }>,
  ) => void;
  photoDraft: {
    id: string;
    previewUrl: string;
    uploading?:boolean;
    zoom: number;
    offsetX: number;
    offsetY: number;
  } | null;
  photoError: string | null;
  subjectLabel: string;
  uploadUnavailableReason: string | null;
}>) {
  const policyUnavailable=!photo||['loading','unavailable'].includes(photo.status);
  const unavailable=uploadUnavailableReason||(photo?.approvalId?'Richiesta già in attesa.':policyUnavailable?photo?.status==='unavailable'?'Foto non disponibile. Aggiorna la pagina.':'Verifica foto in corso.':null);
  const reasonRequired=photo?.requiresReplacementReason??false;
  return (
    <div className="w-full space-y-2 text-xs md:max-w-[340px]">
      <p className="font-semibold text-slate-600">
        {currentPhotoUrl ? "Modifica foto" : "Aggiungi foto"}
      </p>
      <label
        className={`block rounded-lg border border-dashed bg-white p-2 text-center transition ${
          unavailable
            ? "cursor-not-allowed opacity-60"
            : "hover:border-primary"
        }`}
      >
        <span>Scatta/carica foto</span>
        <input
          accept="image/*"
          aria-label={`${currentPhotoUrl ? "Modifica" : "Aggiungi"} foto ${subjectLabel}`}
          capture="environment"
          className="sr-only"
          disabled={Boolean(unavailable)||!!photoDraft?.uploading}
          onChange={(event) => onPhotoSelected(event.target.files?.[0] ?? null)}
          type="file"
        />
      </label>
      {unavailable ? (
        <p className="rounded-md bg-amber-50 p-2 text-amber-800">
          {unavailable}
        </p>
      ) : null}
      {photoDraft ? (
        <div className="space-y-2 rounded-lg bg-muted p-2">
          <div className="relative mx-auto flex aspect-[3/4] h-36 items-center justify-center overflow-hidden rounded-lg bg-white shadow-sm">
            <Image
                unoptimized
              alt={`Preview foto ${subjectLabel}`}
              className="h-full w-full object-contain"
              height={144}
              src={photoDraft.previewUrl}
              style={{
                transform: `translate(${photoDraft.offsetX}px, ${photoDraft.offsetY}px) scale(${photoDraft.zoom})`,
              }}
              width={108}
            />
            <div className="pointer-events-none absolute inset-1 rounded-md border-2 border-white/80 shadow-[0_0_0_999px_rgba(15,23,42,0.14)]" />
          </div>
          <label className="block text-[11px] text-slate-600">
            Zoom / riduci foto
            <input
              aria-label="Zoom foto"
              className="w-full"
              max={3}
              min={0.4}
              onChange={(event) =>
                onPhotoTransform({ zoom: Number(event.target.value) })
              }
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
              onChange={(event) =>
                onPhotoTransform({ offsetX: Number(event.target.value) })
              }
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
              onChange={(event) =>
                onPhotoTransform({ offsetY: Number(event.target.value) })
              }
              type="range"
              value={photoDraft.offsetY}
            />
          </label>
          {reasonRequired?<label className="block space-y-1">
            <span>Motivazione obbligatoria</span>
            <textarea className="block w-full rounded-lg border p-2" maxLength={2000}
              value={replacementReason} onChange={(event) => onReplacementReasonChange(event.target.value)}
              required minLength={20} placeholder="Motivo del cambio aggiuntivo (almeno 20 caratteri)" />
          </label>:null}
          <Button
            className="w-full py-1 text-xs"
            disabled={Boolean(unavailable)||!!photoDraft?.uploading||(reasonRequired&&replacementReason.trim().length<20)}
            onClick={onConfirm}
            type="button"
          >
            {photoDraft.uploading?"Invio…":"Invia richiesta"}
          </Button>
        </div>
      ) : null}
      {photoError ? <p className="text-red-600">{photoError}</p> : null}
    </div>
  );
}

function getOfficialPhotoUploadUnavailableReason(
  officialPhotoUploadEnabled: boolean,
  registrationId: string | null,
  season: string | null,
  subjectLabel: "atleta" | "staff",
): string | null {
  if (!officialPhotoUploadEnabled) return null;
  if (registrationId && season) return null;
  return subjectLabel === "atleta"
    ? "Upload ufficiale non disponibile: manca il tesseramento stagionale atleta."
    : "Upload ufficiale non disponibile: manca il tesseramento stagionale staff.";
}

function OrderStep({ players, movePlayer, readOnly, toggleCaptain, toggleGoalkeeper, togglePlayer,
  toggleViceCaptain, updatePlayerRole, updateShirtNumber,
}: Readonly<{
  players: readonly PlayerListItem[];
  movePlayer: (id: string, direction: -1 | 1) => void;
  readOnly: boolean;
  toggleCaptain: (id: string) => void;
  toggleGoalkeeper: (id: string) => void;
  togglePlayer: (id: string) => void;
  toggleViceCaptain: (id: string) => void;
  updatePlayerRole: (id: string, value: PlayerLineupRole) => void;
  updateShirtNumber: (id: string, value: number | null) => void;
}>) {
  return (
    <Card className="min-w-0 space-y-4">
      <div>
        <h2 className="text-xl font-bold">Ordine distinta</h2>
        <p className="text-sm text-slate-500">
          Usa “Sposta su” e “Sposta giù” per cambiare l’ordine dei giocatori.
          Per ogni giocatore scegli il numero di maglia, il ruolo e gli incarichi.
        </p>
      </div>
      {players.length === 0 ? <EmptyState message="Nessun convocato." /> : (
        <ol className="min-w-0 space-y-3" aria-label="Giocatori in ordine di distinta">
          {players.map((player, index) => {
            const name = `${player.lastName} ${player.firstName}`;
            const disabled = readOnly || !player.selected || player.suspended;
            const statusTone = getPlayerStatusTone(player);
            return (
              <li key={player.id} aria-label={name} className={`min-w-0 rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition-shadow hover:shadow-md sm:p-4 ${statusTone === "warning" ? "border-yellow-400 bg-yellow-50" : statusTone === "suspended" ? "border-red-400 bg-red-50" : ""}`}>
                <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,18rem)] lg:items-center">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600">{index + 1}</span>
                  {player.photoUrl ? <Image unoptimized alt={`Foto ${name}`} className="h-14 w-10 shrink-0 rounded-md border bg-white object-cover" height={56} width={40} src={player.photoUrl} /> : null}
                  <h3 className="min-w-0 break-words font-semibold">{name}</h3>
                </div>
                <fieldset disabled={disabled} className="min-w-0">
                  <legend className="sr-only">Dati di {name}</legend>
                  <div className="grid min-w-0 grid-cols-[6rem_minmax(0,1fr)] gap-2 sm:max-w-xs">
                    <label className="block min-w-0 space-y-1 text-xs font-medium text-slate-600">
                      <span>Numero maglia</span>
                      <Input className="h-11 w-full min-w-0 rounded-xl border-slate-200 bg-slate-50 text-center text-base font-semibold text-slate-900 disabled:opacity-70" min={0} inputMode="numeric" type="number" value={player.shirtNumber ?? ""} placeholder="N°"
                        onChange={(event) => updateShirtNumber(player.id, Number.isFinite(event.target.valueAsNumber) ? event.target.valueAsNumber : null)} />
                    </label>
                    <label className="block min-w-0 space-y-1 text-xs font-medium text-slate-600">
                      <span>Ruolo</span>
                      <select className="h-11 w-full min-w-0 rounded-xl border border-slate-200 bg-slate-50 px-2 py-2 text-base font-medium text-slate-900 disabled:opacity-70" value={player.role}
                        onChange={(event) => updatePlayerRole(player.id, event.target.value as PlayerLineupRole)}>
                        {lineupRoleOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                      </select>
                    </label>
                  </div>
                </fieldset>
                </div>
                <fieldset disabled={disabled} className="mt-2 min-w-0">
                  <legend className="sr-only">Incarichi di {name}</legend>
                  <div className="flex flex-wrap gap-x-3 gap-y-0 text-sm text-slate-700">
                    <label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={player.isGoalkeeper} onChange={() => toggleGoalkeeper(player.id)} />Portiere</label>
                    <label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={player.isCaptain} onChange={() => toggleCaptain(player.id)} />Capitano</label>
                    <label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={player.isViceCaptain} onChange={() => toggleViceCaptain(player.id)} />Vice capitano</label>
                  </div>
                </fieldset>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-slate-100 pt-2">
                <div className="flex flex-wrap gap-1.5">
                  <button className="inline-flex min-h-11 items-center justify-center gap-1 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400" type="button" disabled={readOnly || index === 0} aria-label={`Sposta su ${name}`} onClick={() => movePlayer(player.id, -1)}>↑ Sposta su</button>
                  <button className="inline-flex min-h-11 items-center justify-center gap-1 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400" type="button" disabled={readOnly || index === players.length - 1} aria-label={`Sposta giù ${name}`} onClick={() => movePlayer(player.id, 1)}>↓ Sposta giù</button>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-sm">
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusTone === "warning" ? "bg-yellow-100 text-yellow-800" : statusTone === "suspended" ? "bg-red-100 text-red-800" : "bg-green-100 text-green-800"}`}>{getPlayerStatusLabel(player)}</span>
                  <label className="flex min-h-11 items-center gap-2"><input aria-label={`Convoca ${name}`} type="checkbox" checked={player.selected} disabled={readOnly || player.suspended} onChange={() => togglePlayer(player.id)} />Convocato</label>
                </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}

function StaffStep({
  replacementReason,
  onReplacementReasonChange,
  onSelectAll,
  selectAllDisabled,
  onConfirmPhoto,
  onPhotoSelected,
  onPhotoTransform,
  photoDraft,
  photoError,
  officialPhotoUploadEnabled,
  staff,
  toggleStaff,
}: Readonly<{
  replacementReason: string;
  onReplacementReasonChange: (value: string) => void;
  onSelectAll: () => void;
  selectAllDisabled: boolean;
  onConfirmPhoto: (id: string) => void;
  onPhotoSelected: (id: string, file: File | null) => void;
  onPhotoTransform: (
    id: string,
    transform: Partial<{ zoom: number; offsetX: number; offsetY: number }>,
  ) => void;
  photoDraft: {
    id: string;
    previewUrl: string;
    uploading?:boolean;
    zoom: number;
    offsetX: number;
    offsetY: number;
  } | null;
  photoError: PhotoErrorState | null;
  officialPhotoUploadEnabled: boolean;
  staff: readonly StaffListItem[];
  toggleStaff: (id: string) => void;
}>) {
  return (
    <Card className="space-y-4">
      <h2 className="text-xl font-bold">Staff</h2>
      <PhotoApprovalNotice />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" onClick={onSelectAll} disabled={selectAllDisabled}>
          Seleziona tutti
        </Button>
        <p className="text-sm text-slate-500" aria-live="polite">
          {staff.filter((member) => member.selected).length} membri dello staff selezionati
        </p>
      </div>
      {staff.length === 0 ? (
        <EmptyState message="Nessuno staff disponibile." />
      ) : null}
      <div className="divide-y rounded-xl border">
        {staff.map((staffMember) => {
          const uploadUnavailableReason =
            getOfficialPhotoUploadUnavailableReason(
              officialPhotoUploadEnabled,
              staffMember.registrationId,
              staffMember.season,
              "staff",
            );
          return (
            <div
              className="grid gap-3 p-4 md:grid-cols-[96px_minmax(0,1fr)_minmax(220px,340px)_32px] md:items-start"
              key={staffMember.id}
            >
              <SubjectPhotoThumbnail
                alt={`Foto ${staffMember.fullName}`}
                photo={staffMember.photo}
                photoUrl={staffMember.photoUrl}
              />
              <div className="min-w-0 space-y-1">
                <p className="break-words text-base font-semibold leading-tight text-slate-900">
                  {staffMember.fullName}
                </p>
                <p className="text-xs leading-relaxed text-slate-500">
                  {staffMember.role}
                </p>
                <BackendPhotoStatus photo={staffMember.photo} />
              </div>
              <div className="min-w-0 space-y-2">
                <PhotoComparison
                  currentPhotoUrl={
                    staffMember.photo?.currentPhotoUrl ?? staffMember.photoUrl
                  }
                  proposedPhotoUrl={staffMember.photo?.proposedPhotoUrl ?? null}
                />
                <PhotoCaptureControls
                  replacementReason={replacementReason}
                  photo={staffMember.photo}
                  onReplacementReasonChange={onReplacementReasonChange}
                  currentPhotoUrl={
                    staffMember.photo?.currentPhotoUrl ?? staffMember.photoUrl
                  }
                  onConfirm={() => onConfirmPhoto(staffMember.id)}
                  onPhotoSelected={(file) =>
                    onPhotoSelected(staffMember.id, file)
                  }
                  onPhotoTransform={(transform) =>
                    onPhotoTransform(staffMember.id, transform)
                  }
                  photoDraft={
                    photoDraft?.id === staffMember.id ? photoDraft : null
                  }
                  photoError={
                    photoError?.subjectKind === "staff_member" &&
                    photoError.subjectId === staffMember.id
                      ? photoError.message
                      : null
                  }
                  subjectLabel={staffMember.fullName}
                  uploadUnavailableReason={uploadUnavailableReason}
                />
              </div>
              <label className="flex items-center gap-2 text-sm md:justify-end">
                <span className="md:sr-only">Seleziona</span>
                <input
                  aria-label={`Seleziona ${staffMember.fullName}`}
                  checked={staffMember.selected}
                  onChange={() => toggleStaff(staffMember.id)}
                  type="checkbox"
                />
              </label>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function SummaryStep({
  players,
  staff,
  isSubmitting,
  rules,
  onSubmit,
  onInvalidSubmit,
}: Readonly<{
  rules?: {starters:number;goalkeeperRequired?:boolean;benchLimit?:number;staffLimit?:number};
  players: readonly PlayerListItem[];
  staff: readonly StaffListItem[];
  isSubmitting: boolean;
  onSubmit: () => void;
  onInvalidSubmit: (message: string) => void;
}>) {
  const validation = validateMatchSheet(players, staff, rules);
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
        <li>Giocatori in panchina: {validation.benchPlayers}/20</li>
        <li>Staff in panchina: {staff.length}/5</li>
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
  return (
    {
      draft: "Bozza — da completare e inviare",
      locked: "Bloccata dall’arbitro — riconoscimento in corso",
      submitted: "Inviata — in attesa dell’arbitro",
    }[status] ?? status
  );
}

function isSmokeResetAvailable(): boolean {
  return (
    process.env.NODE_ENV !== "production" ||
    process.env.NEXT_PUBLIC_REFCHECKID_SMOKE_RESET === "true"
  );
}

async function cropPhotoDraft(photoDraft: {
  previewUrl: string;
    uploading?:boolean;
  zoom: number;
  offsetX: number;
  offsetY: number;
}): Promise<string> {
  const image = await loadImage(photoDraft.previewUrl);
  const canvas = document.createElement("canvas");
  const widthSize = 300;
  const heightSize = 400;
  canvas.width = widthSize;
  canvas.height = heightSize;
  const context = canvas.getContext("2d");
  if (!context) return photoDraft.previewUrl;
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, widthSize, heightSize);
  const scale =
    Math.min(widthSize / image.width, heightSize / image.height) *
    photoDraft.zoom;
  const width = image.width * scale;
  const height = image.height * scale;
  const x = (widthSize - width) / 2 + photoDraft.offsetX * (widthSize / 96);
  const y = (heightSize - height) / 2 + photoDraft.offsetY * (heightSize / 96);
  context.drawImage(image, x, y, width, height);
  return canvas.toDataURL("image/jpeg", 0.9);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new window.Image();
    image.onload = () => resolve(image);
    image.onerror = () =>
      reject(new Error("Impossibile preparare il ritaglio foto."));
    image.src = src;
  });
}
