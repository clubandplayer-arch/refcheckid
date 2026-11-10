# Verifica del rilascio locale

Data: 10 novembre 2026. Stato: consolidamento Backend/Web per istanza singola.
Questo documento non certifica un deployment federale o una pubblicazione cloud.

## Modifiche verificabili

- Persistenza transazionale dei repository, comprese formazioni, workflow,
  decisioni, referti, bozze, sessioni di upload e audit.
- Importazione dei metadati fotografici legacy senza alterare file e JSON originali.
- Lock con rollback integrale se il congelamento fallisce; copertura esatta delle
  due distinte e nessun avvio arbitrale senza manifest coerente.
- Decisioni per partecipante salvate lato server, motivazione per anomalie,
  chiusura bloccata se incompleta e stato recuperabile dopo un riavvio.
- Foto storica congelata ancora leggibile dopo sostituzione della foto corrente.
- Upload associati a sessione, attore, oggetto, dimensione e checksum; sessioni
  persistenti e completamento ripetibile senza duplicare versioni.
- Controlli server su società, assegnazioni arbitrali, risultati e partecipanti
  del referto; rifiuto di eventi attribuiti a soggetti non riconosciuti.
- Reset circoscritto alla gara, con conservazione delle fotografie ufficiali.
- Login configurabile con password scrypt, revoca/rotazione sessioni, foto con URL
  firmati e cache privata, configurazione obbligatoria in produzione.
- Correzione della doppia navigazione al login; cache query separata per identità.

## Comandi automatici

```bash
pnpm lint
pnpm test
pnpm build
pnpm coverage
pnpm smoke
pnpm test:acceptance
```

Dopo la build, per collaudare anche il Web compilato:

```bash
REFCHECKID_ACCEPTANCE_WEB_MODE=production REFCHECKID_ACCEPTANCE_BACKEND_PORT=4000 pnpm test:acceptance
```

La porta 4000 deve essere libera e la build deve avere il proxy backend predefinito.
La CI usa questa modalità; il backend di prova continua a usare solo identità e
dati demo su storage temporanei, distinti dall'istanza reale.

`test:acceptance` usa database e storage temporanei, porte libere e processi propri.
Richiede Chromium di sistema (`CHROMIUM_EXECUTABLE_PATH` opzionale) oppure il browser
Playwright installato con `pnpm exec playwright install chromium`.
Non eseguirlo contemporaneamente a un altro server Next sullo stesso checkout.
Verifica sync, upload/approvazioni di 44 foto, entrambe le distinte, decisioni,
riavvio forzato del backend, ripetizione demo:init, reset e ricostruzione,
sostituzione foto dopo il lock, accesso senza firma rifiutato, UI reale Chromium,
ricaricamento, referto, backup e checksum. Confronta anche i checksum dello storage
originale prima/dopo. Conserva screenshot e log nella directory temporanea indicata.

La coverage usa V8 reale: non è più un riepilogo generato che dichiara solo
tests-passed. Le percentuali non equivalgono a una certificazione funzionale.
I test chiamati performance verificano profili; non costituiscono una prova di
carico di un servizio distribuito.

L'audit delle dipendenze di produzione ha richiesto aggiornamenti di Next.js,
Drizzle ORM, Zod e del relativo resolver, oltre alle dipendenze transitive
PostCSS/Sharp. Le risoluzioni correttive sono salvate nel lockfile e negli
override pnpm; non sono state ignorate le segnalazioni. Rieseguire
`pnpm audit --prod` prima di ogni rilascio, perché il catalogo degli advisory cambia.

## Collaudo umano

Esiti osservati in questa sessione: 134 test backend e 92 test Web passati;
typecheck, lint, build completa e smoke passati. Rimane l'avviso preesistente
Next/ESLint sull'elemento img della federazione e la deprecazione di next lint.
L'audit delle dipendenze di produzione non riporta vulnerabilità dopo gli
aggiornamenti. Il collaudo HTTP/Chromium, eseguito anche sul Web compilato in
produzione, ha superato tutti gli scenari elencati sopra, incluso il backup live.
Le evidenze più recenti sono in `/tmp/refcheckid-acceptance-2d6no6` nell'istanza
di lavoro; i log principali sono `/tmp/refcheckid-final-acceptance.log`,
`/tmp/refcheckid-final-build.log` e `/tmp/refcheckid-final-coverage.log`.
I file temporanei non sono artefatti pubblicati o un'esecuzione della CI remota.

L'istanza preparata per il collaudo umano ha backend sulla porta 4000 e Web sulla
3000, gara scheduled, entrambe le distinte in draft senza convocati,
riconoscimento not_started e nessun referto. Le 44 approvazioni fotografiche sono
conservate. Il reset iniziale ha riguardato solo gli esiti automatici della fixture,
verificati prima dell'operazione; nessun riconoscimento umano è stato dichiarato.

Il backup originale dei 139 file foto/metadati è conservato in
`/workspace/.refcheckid-tools/pre-upgrade-20261110`; il backup verificato del
database aggiornato e delle foto è in
`/workspace/.refcheckid-tools/post-upgrade-20261110`. I checksum dei 139 file
originali sono rimasti invariati durante i collaudi.

1. Nel solo ambiente demo, verificare foto e approvazioni già presenti prima del
   reset. Usare il reset gara dall'area dirigente per iniziare un ciclo manuale.
2. Con dirigente casa e ospite, salvare e ricaricare una bozza; completare e inviare
   entrambe le distinte. Verificare l'impossibilità di modificare quella altrui.
3. Come arbitro, bloccare le distinte, verificare immagini e dati, registrare
   riconoscimenti e almeno un'anomalia motivata. Ricaricare la pagina prima di
   concludere e verificare che gli esiti siano conservati.
4. Salvare e riaprire una bozza referto, compilare risultato ed eventi, inviare;
   verificare l'arrivo in federazione e la sola lettura dopo l'invio.
5. Ripetere il reset demo e verificare che le fotografie ufficiali siano ancora
   disponibili. Confermare che la gestione delle eccezioni fotografiche sia
   conforme alle regole operative della federazione prima dell'utilizzo reale.

## Confini del risultato

L'adapter eseguibile è SQLite per istanza singola. L'integrazione del runtime con
lo schema relazionale PostgreSQL/Supabase non è completata da questa modifica.
Le API ancora marcate defined/501 (fra cui sync/offline foto e operazioni avanzate
di conservazione) non sono state trasformate in funzionalità complete. Il mobile
rimane fuori da questo consolidamento, come previsto dalla roadmap esistente.

Non sono stati configurati identità reali, dominio/ingresso HTTPS, servizio
PostgreSQL/Supabase remoto, monitoraggio esterno o un deployment pubblico: mancano
le relative configurazioni nel contesto disponibile. Non dichiarare il prodotto
pronto per un impiego federale completo sulla sola base del collaudo locale.
