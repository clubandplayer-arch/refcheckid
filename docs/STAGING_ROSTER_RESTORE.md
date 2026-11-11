# Ripristino dei nominativi e delle foto del collaudo

Operazione limitata al progetto Supabase staging `mzctnlenvrtjuavzbusa`.
Nessuna build o deploy esegue questa operazione automaticamente. Le immagini
non sono nel repository; il manifest contiene soltanto abbinamenti, hash e
dimensioni verificati sui due archivi forniti dall'utente.

## Risultato previsto

- Atletico Aurora: 18 giocatori e Mister, Dirigente, Massaggiatore.
- Sporting Litorale: 18 giocatori e gli stessi tre ruoli staff.
- Ripristino dei nomi dimostrativi del vecchio frontend sugli UUID tecnici
  esistenti, con abbinamenti espliciti per persona/tesseramento nel manifest.
  Non viene dichiarato recuperato un collegamento storico a identità reali.
- Tecnico → Mister; Preparatore → Massaggiatore; Dirigente conserva il ruolo.
  I due Assistenti tecnici restano nello storico come inattivi, con tesseramento
  terminato. Nessuna cancellazione di persone, tesseramenti, foto o approvazioni.
- `Bernanrdi.jpg` ospite è esplicitamente associato a Massimo Bernardi.
- 42 nuove versioni fotografiche **pending**, con verifica di originale e
  normalizzato. Le vecchie foto ufficiali restano tali fino all'approvazione umana.

La procedura non modifica distinte già inviate o snapshot attivi. Se un Assistente
da ritirare è selezionato in bozza, si ferma; non modifica la convocazione al suo
posto. Conserva una copia privata del database prima delle modifiche. In caso
di errore può lasciare le proposte già completate; il rilancio le verifica e le
riutilizza senza duplicarle. I file senza riferimento dopo rollback non vengono
cancellati automaticamente.

## Preparazione nel Codespace

Usare il worktree separato già creato per il trasferimento, non cambiare branch
del backend locale attualmente in esecuzione. Aggiornare quel worktree a `main`
dopo il merge della PR e installare le dipendenze con pnpm 9 e Node 24.
Conservare il suo `.env` privato, già usato per il trasferimento: DATABASE_URL,
SUPABASE_URL, SUPABASE_SERVER_KEY, SUPABASE_DB_CA_CERT e REFCHECKID_DATA_ENV=staging.
Il CLI genera soltanto per il proprio processo un AUTH_SECRET effimero se manca;
non lo salva e non modifica il segreto Vercel.

Caricare i due ZIP originali dal computer in `/workspaces/foto-casa.zip` e
`/workspaces/foto-ospite.zip`, fuori da tutti i checkout Git. Poi, dalla radice
del worktree aggiornato:

```bash
python3 refcheckid-backend/scripts/prepare-roster-photos.py \
  /workspaces/refcheckid-photo-input \
  /workspaces/foto-casa.zip /workspaces/foto-ospite.zip

pnpm -C refcheckid-backend staging:roster /workspaces/refcheckid-photo-input
```

L'estrazione verifica i due archivi, i 42 nomi, le dimensioni e gli SHA-256 prima
di scrivere file. Non sovrascrive immagini diverse. Il piano locale non richiede
connessioni remote e non modifica il database.

## Applicazione allo staging

```bash
pnpm -C refcheckid-backend staging:roster /workspaces/refcheckid-photo-input --apply
```

Il comando salva un file `before-roster-*.json` nella directory privata degli
input. Non pubblicarlo: contiene lo stato applicativo, inclusi i profili.
Richiede un dirigente attivo per club e un operatore federazione attivo. Registra
che le modifiche e i caricamenti sono stati eseguiti da CLI operatore per conto
dei dirigenti; non esegue approvazioni fotografiche.

Le modifiche anagrafiche sono in una transazione. Le immagini vengono caricate
per persona, con nuove chiavi immutabili. Il comando confronta gli hash dei file
scaricati e verifica gli originali/normalizzati anche quando riutilizza una
proposta precedente. Il messaggio finale deve indicare 36 giocatori, 6 staff e
42 proposte verificate. Senza quel messaggio non dichiarare completato il batch.

## Verifica umana

Accedere come dirigente casa/ospite: verificare nomi, tre staff e foto proposte.
Accedere come federazione per controllare ogni abbinamento e approvare tramite
il normale flusso. Non eseguire demo:init, reset o nuove approvazioni di massa
per aggirare la revisione delle identità.
