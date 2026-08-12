# Federation Import PR 1 — Template e specifica finale

## Stato PR 1

Stato: **In verifica prodotto**.

Questa PR non implementa codice runtime. Fissa i template CSV iniziali e le regole funzionali minime che le PR successive dovranno rispettare.

## Obiettivo

Confermare i formati file e le colonne prima di implementare parser, staging, mapping, validazione e commit import.

La PR 1 serve a evitare codice basato su assunzioni non verificate sui database federali.

## Formato iniziale

- Formato obbligatorio MVP: CSV UTF-8 con intestazione nella prima riga.
- Separatore: virgola `,`.
- Date: formato ISO `YYYY-MM-DD`.
- Orari gara: formato `HH:mm` 24 ore.
- Stagione: formato consigliato `YYYY/YYYY`, esempio `2026/2027`.
- Valori enum consigliati in minuscolo snake_case.
- XLSX resta fuori dalla PR 1 e viene previsto nella PR 9 dopo stabilizzazione CSV.

## Regole trasversali

### Permessi

Solo Federazione/Ente/Admin federale può importare file.

Il dirigente non può importare dati anagrafici, società, tesserati, staff, arbitri, calendario o designazioni. Il dirigente può operare sui dati federali già caricati e può aggiornare/proporre foto ufficiali nel workflow foto.

### Identificativi esterni

Ogni import deve usare codici federali stabili come chiave di riconciliazione:

- `codice_societa` per società/squadra;
- `codice_tessera` per tesserati;
- `codice_staff` per staff;
- `codice_arbitro` per arbitri;
- `codice_gara` per calendario/designazioni.

Gli UUID interni RefCheckID non devono essere richiesti nei file federali.

### Idempotenza

Reimportare lo stesso file o gli stessi record non deve creare duplicati.

Il sistema deve distinguere:

- nuovo record;
- record invariato;
- record aggiornato;
- duplicato/conflict;
- warning;
- errore bloccante.

### Società non esistente

Import tesserati, staff, calendario o designazioni che referenziano una società non esistente devono essere bloccati o messi in risoluzione manuale. Il sistema non crea automaticamente società implicite da file non-società.

### Cambio società/tesseramento

Il cambio società è un caso ordinario. Deve aggiornare la posizione del tesserato mantenendo storico e audit, senza cancellare la posizione precedente.

### Grandi volumi e anteprima

I template PR 1 contengono solo poche righe esempio per verificare colonne e formato. Non rappresentano il comportamento UI finale su import reali da migliaia di record.

Per import reali, il sistema non deve mai renderizzare in UI tutte le righe del file contemporaneamente. La gestione prevista per le PR successive è:

- upload in staging;
- parsing asincrono o comunque isolato dal commit finale;
- conteggi sintetici per righe totali, valide, warning, errori, nuove, aggiornate, invariate;
- anteprima campione limitata;
- paginazione server-side o equivalente;
- filtri per stato riga;
- ricerca per codice società, codice tessera, codice gara o testo;
- download file errori/warning;
- commit solo dopo conferma esplicita.

Questa regola è obbligatoria per casi come 10.000 tesserati, 3.000 società o calendari molto estesi.

## Template CSV inclusi

| Tipo import | File template | Scopo |
| ----------- | ------------- | ----- |
| Società/squadre | `federation-import-templates/societa.csv` | Crea/aggiorna società o squadre gestite dalla Federazione |
| Tesserati generale | `federation-import-templates/tesserati_generale.csv` | Crea/aggiorna anagrafica generale tesserati |
| Tesserati società | `federation-import-templates/tesserati_societa.csv` | Associa tesserati a società/stagione |
| Staff | `federation-import-templates/staff.csv` | Crea/aggiorna staff e posizione società/stagione |
| Arbitri | `federation-import-templates/arbitri.csv` | Crea/aggiorna arbitri |
| Calendario | `federation-import-templates/calendario.csv` | Crea/aggiorna gare ufficiali |
| Designazioni | `federation-import-templates/designazioni.csv` | Designa arbitro principale MVP per gara |

## Specifica template società/squadre

Template: `docs/HANDOVER/federation-import-templates/societa.csv`.

### Colonne obbligatorie

- `codice_societa`
- `nome_societa`
- `stato`
- `stagione`

### Colonne facoltative

- `codice_fiscale`
- `email_referente`
- `telefono`
- `indirizzo`
- `comune`
- `provincia`
- `categoria`
- `campionato`
- `girone`

### Validazioni iniziali

- `codice_societa` obbligatorio e univoco nella Federazione.
- `nome_societa` obbligatorio.
- `stato` ammesso: `active`, `inactive`.
- `stagione` obbligatoria nel MVP per contestualizzare la partecipazione.
- `email_referente`, se presente, deve avere formato email valido.

## Specifica template tesserati generale

Template: `docs/HANDOVER/federation-import-templates/tesserati_generale.csv`.

### Colonne obbligatorie

- `codice_tessera`
- `nome`
- `cognome`
- `data_nascita`
- `stato_tesserato`

### Colonne consigliate/facoltative

- `codice_fiscale`
- `luogo_nascita`

### Validazioni iniziali

- `codice_tessera` obbligatorio e univoco nella Federazione.
- `nome` e `cognome` obbligatori.
- `data_nascita` in formato `YYYY-MM-DD`.
- `stato_tesserato` ammesso: `active`, `inactive`.
- `codice_fiscale`, se presente, può essere usato come chiave di riconciliazione secondaria.

## Specifica template tesserati per società

Template: `docs/HANDOVER/federation-import-templates/tesserati_societa.csv`.

### Colonne obbligatorie per file multi-società

- `codice_societa`
- `codice_tessera`
- `nome`
- `cognome`
- `data_nascita`
- `stagione`
- `stato_posizione`

### Colonne obbligatorie per file di una singola società

Se la Federazione seleziona società e stagione prima dell'upload, il file può omettere `codice_societa` e `stagione`. Nel template multi-società li manteniamo perché è il formato più esplicito e sicuro.

### Colonne facoltative

- `codice_fiscale`
- `numero_maglia_preferito`
- `ruolo_preferito`

### Validazioni iniziali

- `codice_societa` deve risolvere una società già importata, salvo contesto singola società selezionato prima dell'upload.
- `codice_tessera` identifica il tesserato.
- Se il tesserato non esiste nell'anagrafica generale, il sistema può crearlo dal file società se i dati minimi sono presenti.
- `stato_posizione` ammesso: `active`, `suspended`, `ended`.
- Cambio società/stagione deve aggiornare la posizione senza duplicare il tesserato.

## Specifica template staff

Template: `docs/HANDOVER/federation-import-templates/staff.csv`.

### Colonne obbligatorie

- `codice_societa`
- `codice_staff`
- `nome`
- `cognome`
- `ruolo`
- `stagione`
- `stato_posizione`

### Colonne facoltative

- `data_nascita`
- `codice_fiscale`
- `email`

### Validazioni iniziali

- `codice_societa` deve risolvere una società già importata, salvo contesto singola società selezionato prima dell'upload.
- `codice_staff` obbligatorio e univoco nella Federazione.
- `ruolo` obbligatorio.
- `stato_posizione` ammesso: `active`, `suspended`, `ended`.

## Specifica template arbitri

Template: `docs/HANDOVER/federation-import-templates/arbitri.csv`.

### Colonne obbligatorie

- `codice_arbitro`
- `nome`
- `cognome`
- `stato`

### Colonne facoltative

- `codice_fiscale`
- `email`
- `sezione`
- `qualifica`

### Validazioni iniziali

- `codice_arbitro` obbligatorio e univoco nella Federazione.
- `nome` e `cognome` obbligatori.
- `stato` ammesso: `active`, `inactive`.
- Solo arbitri `active` possono essere designati, salvo decisione futura diversa.

## Specifica template calendario

Template: `docs/HANDOVER/federation-import-templates/calendario.csv`.

### Colonne obbligatorie

- `codice_gara`
- `stagione`
- `data`
- `ora`
- `codice_societa_casa`
- `codice_societa_ospite`
- `stato_gara`

### Colonne facoltative

- `campo`
- `comune`
- `giornata`
- `categoria`
- `campionato`
- `girone`

### Validazioni iniziali

- `codice_gara` obbligatorio e univoco nella Federazione/stagione.
- Le società casa e ospite devono esistere.
- Società casa e ospite non possono coincidere.
- `data` formato `YYYY-MM-DD`.
- `ora` formato `HH:mm`.
- `stato_gara` ammesso MVP: `scheduled`, `in_progress`, `completed`, `cancelled`.

## Specifica template designazioni

Template: `docs/HANDOVER/federation-import-templates/designazioni.csv`.

### Colonne obbligatorie

- `codice_gara`
- `codice_arbitro`
- `ruolo`
- `stato_designazione`

### Colonne facoltative

- `data_designazione`
- `note`

### Validazioni iniziali

- `codice_gara` deve risolvere una gara importata.
- `codice_arbitro` deve risolvere un arbitro importato.
- MVP: `ruolo` ammesso principale `arbitro_principale`.
- `stato_designazione` ammesso MVP: `designato`, `annullato`, `sostituito`.
- Una gara può avere un solo `arbitro_principale` attivo nel MVP.

## Check prodotto richiesto prima della PR 2

Prima di passare alla PR 2, verificare e confermare:

1. i template rappresentano dati realistici per una Federazione;
2. le colonne obbligatorie sono effettivamente disponibili;
3. `codice_societa`, `codice_tessera`, `codice_staff`, `codice_arbitro`, `codice_gara` sono chiavi esterne realistiche;
4. società e squadra possono coincidere nel MVP o serve entità separata;
5. `stagione`, `campionato`, `categoria` e `girone` sono sufficienti per distinguere competizioni;
6. stati proposti sono corretti;
7. calendario e designazioni possono essere file separati nel MVP;
8. XLSX può restare PR 9 senza bloccare CSV.
9. la UX di grandi import deve mostrare riepilogo, filtri, paginazione e righe problematiche, non l'intero file in una tabella unica.

## Esito atteso PR 1

La PR 1 è completata tecnicamente quando:

- tutti i template CSV sono presenti;
- la specifica template è presente;
- il tracker PR è aggiornato a `In verifica` per PR 1;
- non sono state introdotte modifiche runtime.

La PR 1 passa a `Eseguita` solo dopo conferma prodotto/manuale dei template.
