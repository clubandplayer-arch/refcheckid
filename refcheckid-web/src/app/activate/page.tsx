"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ActionForm } from "@/features/platform/forms";
import { platformPost } from "@/features/platform/api";
export default function ActivatePage() {
  const [token, setToken] = useState(""),
    [done, setDone] = useState<{
      login: string;
      code: string;
      message: string;
    } | null>(null);
  const initialized = useRef(false);
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    setToken(window.location.hash.slice(1));
    window.history.replaceState(null, "", "/activate");
  }, []);
  return (
    <main className="mx-auto max-w-lg space-y-4 p-6">
      <h1 className="text-2xl font-bold">Attiva il tuo accesso a RefCheckID</h1>
      <p>
        Il link personale abilita l’accesso alla struttura che ti ha invitato.
        Scegli una password di almeno 12 caratteri. Se hai già un account con
        questa email, usa la password di quell’account.
      </p>
      {done ? (
        <div className="space-y-3 rounded-lg bg-emerald-50 p-4">
          <p>{done.message}</p>
          <p>
            Identificativo: <strong>{done.login}</strong>
          </p>
          <p>
            Codice personale: <strong>{done.code}</strong>
          </p>
          <Link className="text-blue-700 underline" href="/">
            Vai all’accesso
          </Link>
        </div>
      ) : (
        <ActionForm
          title="Scegli la password"
          button="Attiva account"
          disabled={!token}
          fields={[
            { key: "password", label: "Password", type: "password" },
            { key: "confirmation", label: "Ripeti password", type: "password" },
          ]}
          onSubmit={async (data) => {
            if (data.password !== data.confirmation)
              throw new Error("Le password non coincidono.");
            if (String(data.password).length < 12)
              throw new Error("Servono almeno 12 caratteri.");
            setDone(
              await platformPost("activate", {
                token,
                password: data.password,
              }),
            );
          }}
        />
      )}
      {!token && !done ? (
        <p role="alert">
          Apri il link completo consegnato dal tuo responsabile. Non condividere
          il codice d’invito.
        </p>
      ) : null}
    </main>
  );
}
