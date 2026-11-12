"use client";
import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import Image from "next/image";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { platformGet, platformPost } from "@/features/platform/api";
import { useSession } from "@/lib/session";
import { Button } from "@/components/ui/button";
export interface IdentityProfile {
  kind: "organization" | "club" | "referee";
  federationId?: string | null;
  subjectId: string;
  revision: number;
  displayName: string;
  description: string;
  website: string;
  primaryColor: string;
  accentColor: string;
  imageUrl: string | null;
  canEdit: boolean;
  imageSource: string;
}
export const contextKey = ["identity-profiles", "context"];
export function useIdentityProfiles() {
  const { session } = useSession();
  return useQuery({
    queryKey: [...contextKey, session?.user.id],
    queryFn: () =>
      platformGet<{ items: IdentityProfile[] }>("profiles/context"),
    enabled: !!session,
    staleTime: 60000,
    refetchInterval: 300000,
    retry: false,
  });
}
// Only validated hex colors become CSS values; text contrast follows the chosen color.
function hsl(hex: string) {
  const values = hex
      .slice(1)
      .match(/../g)!
      .map((v) => parseInt(v, 16) / 255),
    [r, g, b] = values,
    max = Math.max(...values),
    min = Math.min(...values),
    d = max - min,
    l = (max + min) / 2;
  let h = 0;
  if (d)
    h =
      max === r
        ? ((g - b) / d) % 6
        : max === g
          ? (b - r) / d + 2
          : (r - g) / d + 4;
  return `${(h * 60 + 360) % 360} ${d ? (100 * d) / (1 - Math.abs(2 * l - 1)) : 0}% ${100 * l}%`;
}
export function IdentityHeader() {
  const query = useIdentityProfiles(),
    { session } = useSession();
  const [chosenOrganization, setChosenOrganization] = useState("");
  useEffect(() => {
    const change = (event: Event) =>
      setChosenOrganization((event as CustomEvent<string>).detail);
    window.addEventListener("refcheckid:organization", change);
    return () => window.removeEventListener("refcheckid:organization", change);
  }, []);
  const own = query.data?.items.find(
    (row) =>
      row.kind === (session?.user.role === "referee" ? "referee" : "club"),
  );
  const organization =
    query.data?.items.find(
      (row) =>
        row.kind === "organization" &&
        row.subjectId === (chosenOrganization || own?.federationId),
    ) ?? query.data?.items.find((row) => row.kind === "organization");
  useEffect(() => {
    if (!organization) return;
    const root = document.documentElement;
    root.style.setProperty("--primary", hsl(organization.primaryColor));
    root.style.setProperty("--muted", hsl(organization.accentColor));
    return () => {
      root.style.removeProperty("--primary");
      root.style.removeProperty("--muted");
    };
  }, [organization]);
  return (
    <div className="flex min-w-0 items-center gap-2">
      {own?.imageUrl ? (
        <Image
          unoptimized
          width={40}
          height={40}
          className="h-10 w-10 rounded object-contain"
          src={own.imageUrl}
          alt={own.displayName}
        />
      ) : null}
      {organization?.imageUrl ? (
        <Image
          unoptimized
          width={40}
          height={40}
          className="h-10 w-10 object-contain"
          src={organization.imageUrl}
          alt={organization.displayName}
        />
      ) : null}
      <span className="max-w-48 truncate sm:max-w-none">
        {organization?.displayName ?? session?.user.displayName}
      </span>
    </div>
  );
}
export function ProfileBadge({
  kind,
  id,
}: {
  kind: IdentityProfile["kind"];
  id: string;
}) {
  const { session } = useSession();
  const query = useQuery({
    queryKey: ["identity-profile", kind, id, session?.user.id],
    queryFn: () => platformGet<IdentityProfile>(`profiles/${kind}/${id}`),
    enabled: !!id && !!session,
    retry: false,
    staleTime: 300000,
    refetchInterval: false,
  });
  return query.data?.imageUrl ? (
    <Image
      unoptimized
      width={48}
      height={48}
      className="inline-block h-12 w-12 rounded object-contain"
      src={query.data.imageUrl}
      alt={query.data.displayName}
    />
  ) : null;
}
export function ProfileEditor({
  initialKind,
  initialId,
}: {
  initialKind?: string;
  initialId?: string;
}) {
  const context = useIdentityProfiles(),
    [target, setTarget] = useState(""),
    [saved, setSaved] = useState(false);
  const value =
    target ||
    (initialKind && initialId
      ? `${initialKind}/${initialId}`
      : (context.data?.items
          .filter((p) => p.canEdit)
          .map((p) => `${p.kind}/${p.subjectId}`)[0] ?? ""));
  const { session } = useSession();
  const query = useQuery({
    queryKey: ["identity-profile", value, session?.user.id],
    queryFn: () => platformGet<IdentityProfile>(`profiles/${value}`),
    enabled: !!value,
    retry: false,
    refetchInterval: false,
  });
  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold">Profili e identità visiva</h1>
      <p>
        I dati anagrafici e il tesseramento restano gestiti dalla federazione.
        Qui puoi aggiornare la presentazione e le immagini del profilo.
      </p>
      <label className="block">
        Profilo
        <select
          aria-label="Profilo"
          className="mt-1 block w-full rounded border p-2"
          value={value}
          onChange={(event) => {
            setSaved(false);
            setTarget(event.target.value);
          }}
        >
          {initialKind &&
          initialId &&
          !context.data?.items.some(
            (p) => `${p.kind}/${p.subjectId}` === value,
          ) ? (
            <option value={value}>Profilo selezionato</option>
          ) : null}
          {context.data?.items.map((p) => (
            <option
              key={`${p.kind}/${p.subjectId}`}
              value={`${p.kind}/${p.subjectId}`}
            >
              {p.displayName} ·{" "}
              {p.kind === "club"
                ? "Club"
                : p.kind === "referee"
                  ? "Arbitro"
                  : "Ente"}
            </option>
          ))}
        </select>
      </label>
      {query.isLoading ? (
        <p>Caricamento profilo…</p>
      ) : query.isError ? (
        <p role="alert">{query.error.message}</p>
      ) : query.data ? (
        <ProfileForm
          key={`${value}:${query.data.revision}`}
          profile={query.data}
          target={value}
          onSaved={() => setSaved(true)}
        />
      ) : (
        <p>
          Nessun profilo disponibile: serve un ambito assegnato al tuo account.
        </p>
      )}
      {saved ? <p role="status">Profilo salvato.</p> : null}
      <Button
        type="button"
        onClick={() => {
          setSaved(false);
          void query.refetch();
        }}
      >
        Ricarica profilo
      </Button>
      <Link
        className="ml-3 text-primary underline"
        href={
          session?.user.role === "federation"
            ? "/federation"
            : session?.user.role === "referee"
              ? "/referee"
              : session?.user.role === "admin"
                ? "/admin/publication"
                : "/manager"
        }
      >
        Torna alla tua area
      </Link>
    </div>
  );
}
function ProfileForm({
  profile,
  target,
  onSaved,
}: {
  profile: IdentityProfile;
  target: string;
  onSaved: () => void;
}) {
  const client = useQueryClient(),
    [image, setImage] = useState<string>(),
    [removeImage, setRemove] = useState(false),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const lockedLogo =
    profile.kind === "club" &&
    profile.imageSource === "federation" &&
    !!profile.imageUrl;
  async function select(file?: File) {
    setNotice("");
    if (!file) return;
    if (
      !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
      file.size > 10000000
    ) {
      setNotice("Scegli PNG, JPEG o WebP entro 10 MB.");
      return;
    }
    try {
      const bitmap = await createImageBitmap(file);
      const canvas = document.createElement("canvas");
      const ratio = Math.min(1, 640 / Math.max(bitmap.width, bitmap.height));
      canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
      canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error();
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      setImage(canvas.toDataURL("image/webp", 0.85));
      setRemove(false);
    } catch {
      setNotice("Impossibile leggere questa immagine.");
    }
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setNotice("");
    const data = Object.fromEntries(new FormData(event.currentTarget));
    try {
      await platformPost(`profiles/${target}`, {
        ...data,
        revision: profile.revision,
        ...(image ? { imageBase64: image } : {}),
        removeImage,
      });
      onSaved();
      await Promise.all([
        client.invalidateQueries({ queryKey: ["identity-profile"] }),
        client.invalidateQueries({ queryKey: contextKey }),
      ]);
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Salvataggio non riuscito.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      onSubmit={(event) => void save(event)}
      className="space-y-4 rounded-xl border p-5"
    >
      <fieldset
        disabled={!profile.canEdit || busy}
        className="min-w-0 space-y-4"
      >
        <legend className="font-semibold">
          {profile.kind === "referee"
            ? "Foto personale e presentazione"
            : "Logo e presentazione"}
        </legend>
        {(image || profile.imageUrl) && !removeImage ? (
          <Image
            unoptimized
            width={128}
            height={128}
            className="h-32 w-32 rounded border object-contain"
            src={image ?? profile.imageUrl!}
            alt="Anteprima profilo"
          />
        ) : null}
        <label className="block">
          {profile.kind === "referee" ? "Foto personale" : "Logo"}
          <input
            className="mt-2 block w-full max-w-full"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(e) => void select(e.target.files?.[0])}
          />
        </label>
        {lockedLogo ? (
          <p>
            Il logo è stato inserito dalla federazione: un dirigente non può
            sostituirlo.
          </p>
        ) : null}
        <label className="block">
          <input
            type="checkbox"
            checked={removeImage}
            onChange={(e) => {
              setRemove(e.target.checked);
              setImage(undefined);
            }}
          />{" "}
          Rimuovi immagine
        </label>
        <label className="block">
          Nome visualizzato
          <input
            className="block w-full rounded border p-2"
            name="displayName"
            defaultValue={profile.displayName}
            maxLength={120}
          />
        </label>
        <label className="block">
          Presentazione
          <textarea
            className="block w-full rounded border p-2"
            name="description"
            defaultValue={profile.description}
            maxLength={1000}
          />
        </label>
        <label className="block">
          Sito web
          <input
            className="block w-full rounded border p-2"
            type="url"
            name="website"
            placeholder="https://…"
            defaultValue={profile.website}
          />
        </label>
        {profile.kind === "organization" ? (
          <div className="flex flex-wrap gap-5">
            <label>
              Colore principale
              <input
                className="block"
                type="color"
                name="primaryColor"
                defaultValue={profile.primaryColor}
              />
            </label>
            <label>
              Colore sfondi
              <input
                className="block"
                type="color"
                name="accentColor"
                defaultValue={profile.accentColor}
              />
            </label>
            <p className="w-full text-sm">
              Scegli un colore principale scuro e sfondi chiari per mantenere
              leggibili i testi. Le schermate degli affiliati useranno questi
              colori.
            </p>
          </div>
        ) : null}
        <Button type="submit">{busy ? "Salvataggio…" : "Salva profilo"}</Button>
      </fieldset>
      {!profile.canEdit ? (
        <p>
          Profilo in sola lettura: può modificarlo un amministratore dell’ente
          competente.
        </p>
      ) : null}
      {notice ? <p role="status">{notice}</p> : null}
      {profile.kind === "referee" ? (
        <p className="text-sm">
          Questa foto presenta il tuo profilo. Non sostituisce le foto ufficiali
          dei tesserati o le relative approvazioni. Non viene pubblicata nel
          portale risultati.
        </p>
      ) : null}
    </form>
  );
}
export function DeploymentReadiness() {
  const { session } = useSession();
  const query = useQuery({
    queryKey: ["deployment-readiness", session?.user.id],
    queryFn: () =>
      platformGet<{
        commit: string;
        environment: string;
        resultArchiveIndex: boolean | null;
        platformAdminConfigured: boolean;
        publishedCompetitions: number;
      }>("readiness"),
    enabled: !!session && ["federation", "admin"].includes(session.user.role),
    retry: false,
    refetchInterval: false,
  });
  if (!["federation", "admin"].includes(session?.user.role ?? "")) return null;
  return (
    <section className="mt-8 space-y-3 rounded-xl border p-5">
      <h2 className="text-xl font-bold">Verifica configurazione del sito</h2>
      <Button type="button" onClick={() => void query.refetch()}>
        Aggiorna verifica
      </Button>
      {query.isError ? (
        <p role="alert">{query.error.message}</p>
      ) : query.data ? (
        <>
          <p>
            Versione: {query.data.commit.slice(0, 7)} · Dati:{" "}
            {query.data.environment}
          </p>
          <p>
            Indice archivio eventi:{" "}
            {query.data.resultArchiveIndex === null
              ? "non verificabile in ambiente locale"
              : query.data.resultArchiveIndex
                ? "presente"
                : "mancante: applicare la migrazione 202611120001_result_archive_index.sql"}
          </p>
          <p>
            Amministratore pubblicazione:{" "}
            {query.data.platformAdminConfigured
              ? "configurato"
              : "non configurato: creare il profilo amministratore centrale"}
          </p>
          <p>
            Competizioni pubblicate: {query.data.publishedCompetitions}. Zero è
            corretto se non hai ancora autorizzato la pubblicazione.
          </p>
        </>
      ) : (
        <p>Verifica in corso…</p>
      )}
    </section>
  );
}
