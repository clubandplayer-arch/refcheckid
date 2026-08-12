# Federation Import PR 3 — Parser + riconoscimento + mapping

## Stato PR 3

Stato: **In verifica tecnica/prodotto**.

Questa PR estende lo staging PR 2: legge contenuto CSV, riconosce il tipo di file importato, propone il mapping colonne e salva le righe normalizzate in staging. Non esegue ancora validazione business completa né commit nei dati finali.

## Cosa è stato implementato

- Parser CSV backend senza nuove dipendenze esterne, con supporto base per:
  - intestazioni;
  - righe dati;
  - campi separati da virgola;
  - campi quotati;
  - virgolette escaped;
  - newline `CRLF`/`LF`.
- Riconoscimento automatico tipo import in base alle colonne richieste:
  - società/squadre;
  - tesserati generale;
  - tesserati per società;
  - staff;
  - arbitri;
  - calendario gare;
  - designazioni arbitrali.
- Mapping automatico colonne verso nomi canonici.
- Supporto iniziale sinonimi/intestazioni alternative, per esempio:
  - `tessera` → `codice_tessera`;
  - `first_name` → `nome`;
  - `last_name` → `cognome`;
  - `birth_date` → `data_nascita`;
  - `status` → stato canonico del template rilevato.
- Warning se:
  - mancano colonne obbligatorie;
  - il tipo rilevato non coincide con il tipo dichiarato nel batch;
  - il tipo file è ambiguo.
- Salvataggio righe staged con:
  - `rawData` originale;
  - `normalizedData` canonico;
  - `rowNumber` riferito alla riga CSV reale;
  - stato riga `pending`, perché la validazione completa arriva in PR 4.
- Endpoint REST:
  - `POST /api/v1/federation-imports/{id}/parse`.
- Contratto OpenAPI dell'endpoint parser/mapping.
- Test backend PR 3.

## Cosa NON è stato implementato

- Upload file binario da UI.
- Persistenza object storage del file originale.
- Validazione business completa delle righe.
- Risoluzione società/tesserati/arbitri esistenti.
- Preview nuovi/aggiornati/invariati/duplicati/errori.
- Correzione mapping da UI.
- Salvataggio mapping riutilizzabile per Federazione/source system.
- Commit nei dati finali.

Questi elementi appartengono alle PR successive.

## Regola di sicurezza confermata

Solo Federazione/Admin può lanciare il parsing di un batch import nello scope autorizzato.

## Regola di staging confermata

Il parser salva righe in `federation_import_rows`, aggiorna metadata e report del batch, ma non crea né aggiorna società, tesserati, staff, arbitri, gare o designazioni finali.

## Check richiesto prima della PR 4

Verificare con file CSV realistici che:

1. un file società venga riconosciuto come `clubs`;
2. un file tesserati generale venga riconosciuto come `players_general`;
3. un file tesserati per società venga riconosciuto come `players_by_club`;
4. un file calendario venga riconosciuto come `calendar`;
5. un file designazioni venga riconosciuto come `designations`;
6. intestazioni alternative frequenti vengano mappate correttamente;
7. un file con tipo dichiarato diverso dal tipo rilevato produca warning;
8. un file con colonne mancanti produca warning;
9. le righe staged contengano sia dati originali sia dati normalizzati;
10. nessun dato finale venga creato o aggiornato durante PR 3.
