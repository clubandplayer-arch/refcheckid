# Federation Import — PR 5 Commit società, tesserati e staff

Data: 2026-07-23  
Stato: in verifica

## Obiettivo

La PR 5 introduce il primo commit reale dei dati federali verso le tabelle finali usate dai flussi operativi del dirigente.

Fino alla PR 4 l'import arrivava solo a staging, parsing, mapping, validazione, preview e report. Con questa PR il sistema può promuovere in modo controllato i batch validati per:

- società/squadre;
- anagrafica generale tesserati;
- posizioni tesserati presso società/stagione;
- staff e posizioni staff presso società/stagione.

## Endpoint aggiunto

```http
POST /api/v1/federation-imports/{id}/commit
```

Il commit è autorizzato solo per contesti `federation` o `admin`, come upload, parsing e validazione.

## Regole funzionali

### Stati ammessi

Il commit è consentito solo se il batch è già in stato `validated`.

Il commit viene bloccato se il batch contiene righe in errore bloccante (`errorRows > 0`).

Le righe con stato `valid` e `warning` sono eleggibili al commit. Le righe non eleggibili vengono conteggiate come saltate nel report.

### Tipi import supportati in PR 5

Supportati:

- `clubs`;
- `players_general`;
- `players_by_club`;
- `staff`.

Non supportati in PR 5, perché pianificati nella PR 6:

- `referees`;
- `calendar`;
- `designations`.

## Idempotenza e upsert

Il commit usa identificativi deterministici ricavati da federazione, codici esterni e stagione. Questo permette il reimport dello stesso file senza duplicare società, tesserati, posizioni o staff.

Il comportamento previsto è:

- se l'entità non esiste, viene creata;
- se l'entità esiste già, viene aggiornata;
- `createdAt` viene preservato sugli aggiornamenti;
- `updatedAt` viene aggiornato a ogni commit;
- il batch passa a `committed` e le righe committate passano a `committed`.

## Mapping verso dati finali

### Società / squadre

Il file `clubs` crea o aggiorna le società della federazione.

Campi principali:

- `codice_societa`;
- `nome_societa`;
- `codice_fiscale`;
- `stato`;
- `stagione`.

### Tesserati generale

Il file `players_general` crea o aggiorna l'anagrafica generale dei tesserati.

Campi principali:

- `codice_tessera`;
- `nome`;
- `cognome`;
- `data_nascita`;
- `luogo_nascita`;
- `codice_fiscale`;
- `stato_tesserato`.

### Tesserati per società

Il file `players_by_club` crea o aggiorna la posizione stagionale del tesserato presso una società.

Campi principali:

- `codice_societa`;
- `codice_tessera`;
- `stagione`;
- `stato_posizione`.

Nota: questa PR non chiude automaticamente una posizione precedente quando un tesserato cambia società. La base idempotente e stagionale è presente; la logica avanzata di trasferimento/storico mercato può essere affinata con dati reali della Federazione.

### Staff

Il file `staff` crea o aggiorna anagrafica staff e posizione staff presso società/stagione.

Campi principali:

- `codice_societa`;
- `codice_staff`;
- `nome`;
- `cognome`;
- `ruolo`;
- `stagione`;
- `stato_posizione`.

## Report commit

Il report del batch viene esteso con:

- `phase: commit_complete`;
- `committedRows`;
- `createdRows`;
- `updatedRows`;
- `skippedRows`;
- `importType`.

## Non obiettivi della PR 5

Restano fuori da questa PR:

- commit arbitri;
- commit calendario gare;
- commit designazioni arbitrali;
- UI completa di upload/preview/commit per operatore federale;
- collegamento end-to-end definitivo tra dati importati e distinta dirigente;
- rimozione definitiva di dati demo/fallback;
- import XLSX.

## Check richiesto prima della PR 6

Verificare con dati realistici o template PR1 che:

1. un import `clubs` validato e committato crea/aggiorna le società;
2. un import `players_general` validato e committato crea/aggiorna i tesserati;
3. un import `players_by_club` validato e committato crea/aggiorna le posizioni stagionali;
4. un import `staff` validato e committato crea/aggiorna staff e posizioni staff;
5. il reimport dello stesso file non crea duplicati;
6. un file con errori di validazione non può essere committato;
7. `referees`, `calendar` e `designations` restano bloccati fino alla PR 6;
8. un utente dirigente/manager non può eseguire il commit.

Se questi punti sono confermati, si può procedere con la PR 6 — Commit arbitri/calendario/designazioni.
