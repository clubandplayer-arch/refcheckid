# Verifica locale del gestionale enti

11 novembre 2026. Branch: `codex/organization-platform-audit`. Integrata la
baseline `main` `2685da9`, inclusa la policy riconoscimento/cambio foto.

## Esiti

- Backend: 188 test, inclusi i flussi completi per basket e pallavolo.
- Web: 103 test, inclusi isolamento delle cache fra utenti, ripristino bozza
  offline, retry della stessa operazione e conflitti di revisione.
- Typecheck backend e web: superato. La build Next verifica anche i tipi.
- Lint: superato. Rimane l'avviso preesistente sull'elemento `img` delle
  fotografie private nella schermata federale.
- Build backend e web production: superata.
- Coverage: esecuzione completa superata su 188 test backend e 103 web.
- Smoke: health backend, build web e OpenAPI disponibili.
- Pacchetto cloud isolato: superato. Esegue realmente l'API compilata usando
  soltanto i file `.nft.json` del deploy; carica Sharp, ExcelJS e PG, completa
  un'importazione XLSX privata e un blocco di 100 giocatori su PostgreSQL
  PGlite. Il blocco usa una sola istruzione di scrittura batch e meno di 40
  SELECT complessive; la lista restituisce 50 dei 100 tesserati.
- Chromium production: superato, con screenshot e controlli senza errori JS.

I test sono eseguiti localmente. Questo documento non dichiara approvata la CI
remota né collaudato il deployment Vercel/Supabase reale.

## Casi verificati

Il flusso sportivo include due organizzazioni, strutture regionali/provinciali,
una sezione arbitrale delegata e una sezione estranea alla delega. Sono
verificate le negazioni di accesso al campionato non delegato, il divieto di
usare arbitri di un'altra sezione e le revoche sulle API nuove e preesistenti.

L'attivazione con codice produce un account personale; il token non può essere
riutilizzato. Sono verificati il recupero, l'invalidazione delle vecchie
sessioni e la distinzione fra verifica email e account senza email. La revoca
dell'appartenenza di un nuovo dirigente toglie l'accesso alle API legacy della
sua società. La revoca intervenuta fra lettura del file privato e commit
impedisce il blocco import.

Sono stati importati 10.000 giocatori e, separatamente, 10.000 società, con
anteprima, conferma, checkpoint, ripresa e retry. Il test dei dati storici
verifica che il collegamento di giocatori e staff conservi gli UUID dei loro
tesseramenti esistenti. CSV malformati e formule Excel vengono rifiutati.

Calcio: riconoscimento, aggiornamenti di periodo, controllo revisione,
rettifiche motivate, referto e omologazione. Basket e pallavolo: rose e
formazioni con 5/6 titolari senza portiere, numero 0 per il basket, distinte,
riconoscimento con note per le foto assenti nei dati sintetici, punti/set,
conferme, referto e omologazione. Nella pallavolo al meglio di tre la gara può
terminare al secondo set con risultato 2–0.

La verifica da browser comprende i flussi precedenti di foto, distinta e
referto e il nuovo percorso: creazione della delegazione e del campionato,
import CSV, censimento arbitro, invito personale, attivazione/login per codice,
accettazione e apertura della gara tramite il collegamento della specifica
designazione. È controllato anche l'aggiornamento della scheda «Prossima gara».

I riavvii forzati, la ripetizione del bootstrap e il backup non sostituiscono
foto storiche o snapshot. I contenuti delle fotografie e i metadati originali
del workspace sono stati confrontati prima e dopo la prova.

## Artefatti e comandi

Gli screenshot e i log Chromium sono conservati in
`/tmp/refcheckid-acceptance-nL3uNB` nella sessione di verifica. La CI raccoglie
automaticamente gli artefatti delle esecuzioni successive. Fra i nuovi file:

- `platform-import-completed.png`
- `platform-referee-appointment.png`
- `platform-delegated-designations.png`

Ripetizione: `pnpm lint`, typecheck dei due pacchetti, `pnpm test`,
`pnpm coverage`, `pnpm build`, `pnpm verify:cloud-bundle`, `pnpm smoke` e
`REFCHECKID_ACCEPTANCE_WEB_MODE=production REFCHECKID_ACCEPTANCE_BACKEND_PORT=4000 pnpm test:acceptance`.

Il test di 10.000 righe dimostra correttezza e avanzamento dell'importazione
locale. Non misura migliaia di utenti concorrenti o la latenza della rete
Vercel/Supabase. Le istruzioni per il collaudo reale, la migrazione degli indici
e i limiti delle discipline sono nella
[guida operativa](ORGANIZATION_PLATFORM_OPERATIONS.md).
