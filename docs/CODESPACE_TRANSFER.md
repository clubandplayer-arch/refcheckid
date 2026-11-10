# Trasferimento dall'ambiente cloud al Codespace

Questa procedura trasferisce codice e dati separatamente. Non esegue reset,
demo:init, upload o approvazioni. Il database esportato contiene rosa, staff e
foto esistenti; la gara è pronta per un nuovo collaudo manuale.

## Contenuto del pacchetto

`refcheckid-transfer-20261110.zip` contiene una directory omonima con:

- `code.bundle`: commit del branch `codex/refcheckid-runtime-transfer`, basato su
  `c34b6bcf52d983bd96dd72847699c5089371343d`. Serve anche se il branch remoto non
  fosse disponibile.
- `data/state.sqlite`: copia coerente del database, con sessioni di login,
  concessioni temporanee di accesso alle foto e sessioni di upload escluse.
- `data/photos/`: originali e normalizzati fotografici referenziati dal database.
- `data/legacy-photo-metadata/`: conservazione dei JSON legacy.
- `data/manifest.json`: checksum del database e delle fotografie.
- `transfer.json`: commit, percorsi relativi, inventario e stato della gara esportati.
- `CHECKSUMS.sha256`: checksum di tutti i file del pacchetto.

Le esclusioni delle sessioni avvengono sulla sola copia esportata; il database
originale resta intatto. Il pacchetto non contiene AUTH_SECRET, password in file
di configurazione o file utenti di produzione. I dati non sono committati in Git.

## Prima di cambiare branch

Il Codespace di destinazione è distinto dall'istanza cloud. Verificare che il
working tree sia pulito e arrestare i server di sviluppo attualmente attivi con
il controllo del terminale che li ha avviati. Se codespace:start li ha avviati
in background, identificare l'albero processi del PID in `/tmp/refcheckid-dev.pid`
e arrestare solo quell'albero, verificando che 3000 e 4000 siano libere. Non usare
kill generici per nome. Non cambiare branch con il vecchio backend ancora attivo.

Questa procedura non importa automaticamente nulla e non arresta alcun processo.

## Codice e verifica del pacchetto

Caricare lo ZIP scaricato dalla chat in `/workspaces/refcheckid-transfer-20261110.zip`.
Verificare lo SHA-256 dell'intero ZIP contro quello consegnato insieme al file.
Poi, senza sovrascrivere file esistenti:

```bash
set -e
cd /workspaces
unzip -n refcheckid-transfer-20261110.zip
cd refcheckid-transfer-20261110
sha256sum -c CHECKSUMS.sha256
```

Nel checkout pulito:

```bash
cd /workspaces/refcheckid
git fetch origin
git switch codex/refcheckid-runtime-transfer
```

Se il branch remoto non è disponibile, il bundle offre lo stesso commit:

```bash
cd /workspaces/refcheckid
git bundle verify /workspaces/refcheckid-transfer-20261110/code.bundle
git fetch /workspaces/refcheckid-transfer-20261110/code.bundle codex/refcheckid-runtime-transfer
git switch -c codex/refcheckid-runtime-transfer FETCH_HEAD
```

Non eseguire entrambe le alternative e non fare merge su main per il collaudo.
Confrontare `git rev-parse HEAD` con `codeCommit` in transfer.json.

## Attivazione su percorsi separati

Il runtime richiede Node.js 24. Con nvm disponibile:

```bash
cd /workspaces/refcheckid
nvm install
nvm use
pnpm install --frozen-lockfile
pnpm -C refcheckid-backend backup:verify /workspaces/refcheckid-transfer-20261110/data
```

Mantenere la directory estratta come volume di collaudo, fuori dal checkout.
Non copiare nulla sopra uno storage eventualmente già presente. Dal terminale
con Node 24 e pnpm attivi, dopo aver verificato che i vecchi server siano fermi:

```bash
set -e
cd /workspaces/refcheckid
TRANSFER_DIR=/workspaces/refcheckid-transfer-20261110
test -f "$TRANSFER_DIR/data/state.sqlite"
test -d "$TRANSFER_DIR/data/photos"
export REFCHECKID_DATABASE_PATH="$TRANSFER_DIR/data/state.sqlite"
export REFCHECKID_PHOTO_STORAGE_ROOT="$TRANSFER_DIR/data/photos"
export REFCHECKID_PHOTO_METADATA_ROOT="$TRANSFER_DIR/data/legacy-photo-metadata"
export NEXT_PUBLIC_API_BASE_URL=/api/v1
export BACKEND_ORIGIN=http://127.0.0.1:4000
export HOST=0.0.0.0
pnpm dev
```

Usare `pnpm dev` in primo piano per questo primo collaudo: log e Ctrl+C restano
visibili. Non eseguire demo:init: i dati provengono già dalla copia verificata.
Non attivare REFCHECKID_DEMO_AUTO_BOOTSTRAP. Le variabili esportate valgono per
questa shell: ai successivi avvii riutilizzare gli stessi percorsi espliciti.
Conservare lo ZIP originale come copia immutata; il database estratto diventa
invece lo stato operativo del nuovo collaudo quando il backend viene avviato.

## Risultato atteso

- Login dirigente casa: 18 giocatori e 4 membri staff.
- Login dirigente ospite: 18 giocatori e 4 membri staff.
- Federazione: 44 approvazioni fotografiche approvate.
- Due distinte in draft senza convocati; gara scheduled; riconoscimento non iniziato.
- Nessun referto attivo e nessun nuovo upload necessario.

Se il risultato differisce, fermarsi alla diagnosi di URL API e percorsi effettivi:
non inizializzare né rigenerare i dati per mascherare una configurazione errata.
