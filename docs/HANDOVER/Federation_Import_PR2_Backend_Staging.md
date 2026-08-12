# Federation Import PR 2 — Backend import batch/staging

## Stato PR 2

Stato: **In verifica tecnica/prodotto**.

Questa PR introduce la base backend per caricare e tracciare un import federale in staging. Non implementa ancora parsing CSV, mapping colonne, validazione righe o commit nei dati finali.

## Cosa è stato implementato

- Migrazione `0020_create_federation_import_staging.sql` con:
  - `federation_import_batches`;
  - `federation_import_rows`;
  - stati import batch;
  - stati righe import;
  - indici per Federazione, stato, tipo import e righe batch;
  - vincoli su tipi, stati, conteggi e numeri riga.
- Tipi dominio per:
  - import type;
  - import status;
  - row status;
  - import batch;
  - import row.
- Repository in-memory coerenti con il resto del backend skeleton:
  - `FederationImportBatchRepository`;
  - `FederationImportRowRepository`.
- `FederationImportService` con:
  - creazione batch in stato `uploaded`;
  - controllo ruolo Federazione/Admin;
  - scope per Federazione;
  - lista batch;
  - dettaglio batch;
  - lista righe batch;
  - transizione stato batch per PR successive.
- Endpoint REST:
  - `POST /api/v1/federation-imports`;
  - `GET /api/v1/federation-imports`;
  - `GET /api/v1/federation-imports/{id}`;
  - `GET /api/v1/federation-imports/{id}/rows`.
- Contratti OpenAPI per gli endpoint staging.
- Test backend PR 2.

## Cosa NON è stato implementato

- Parsing CSV.
- Riconoscimento tipo file.
- Mapping colonne.
- Validazione righe.
- Preview con conteggi reali.
- Commit su società/tesserati/staff/arbitri/calendario/designazioni.
- Upload binario persistito in object storage.
- UI collegata agli endpoint staging.

Questi elementi appartengono alle PR successive.

## Regola di sicurezza confermata

Solo Federazione/Admin può creare import. Manager/dirigenti non possono creare import federali.

## Regola di staging confermata

Creare un import batch non scrive nulla nelle tabelle finali del dominio. Le tabelle finali restano invariate fino a una futura fase di commit esplicito.

## Check richiesto prima della PR 3

Verificare che:

1. l'endpoint crei un batch import in stato `uploaded`;
2. il batch conservi filename, tipo import, mime type, size, sha256, Federazione, utente e source system;
3. `GET /federation-imports` mostri i batch della Federazione;
4. `GET /federation-imports/{id}` mostri il dettaglio;
5. `GET /federation-imports/{id}/rows` ritorni lista vuota prima del parser;
6. un dirigente/manager non possa creare import;
7. nessuna società, tesserato o gara venga creata durante la PR 2.
