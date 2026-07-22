# Audit completo workflow foto — 2026-07-22

## Decisione sintetica

Dalle verifiche UI condivise e dal codice in repository, il flusso **Dirigente Web → Backend foto ufficiali → Federazione → ritorno al Dirigente** risulta coerente con l'obiettivo immediato: il dirigente vede foto corrente/proposta, la Federazione vede il contatore e la coda richieste, può approvare/rifiutare, e dopo l'approvazione la foto ufficiale torna disponibile nella distinta del dirigente.

La parte che considero completata è quindi il **vertical slice web/backoffice del workflow foto ufficiale con approvazione federale**. Non considero invece chiuso l'intero programma foto ARCH-1: restano attività importanti su mobile, arbitro/offline, hardening produzione, migrazione legacy e qualità operativa.

## Riferimenti di governance letti

- `refcheckid-docs/MASTER_BIBLE/Master_Bible_v1.0.md`: conferma che la Bible consolida visione, ruoli, workflow, business rules, audit log, roadmap e governance documentale senza introdurre da sola nuove implementazioni eseguibili.
- `refcheckid-docs/ARCHITECTURE/ARCH-1_Shared_Official_Photo_Storage.md`: definisce backend come source of truth, object storage privato, versioni immutabili, approvazione federale, snapshot gara, audit-first e privacy-by-default.
- `docs/HANDOVER/ARCH-1_Milestone_B_Backend_Official_Photo_Core.md`: documenta il core backend foto ufficiali.
- `docs/HANDOVER/ARCH-1_Milestone_C_Federation_Approval_Workflow.md`: documenta coda e decisioni federali.
- `refcheckid-docs/HANDOVER/Manager_Photo_Audit.md`: documento storico del pilota localStorage, oggi superato per il percorso backend quando i feature flag ufficiali sono attivi.

## Cosa è stato fatto

### 1. Modello dati ARCH-1

È presente la migrazione ARCH-1 con il modello dati dedicato alle foto ufficiali:

- identità fotografabile (`photo_subjects`);
- foto ufficiale globale (`global_official_photos`);
- versioni immutabili (`photo_versions`);
- legame stagionale/tesseramento (`season_registration_photos`);
- approvazioni federali (`photo_approvals`);
- snapshot foto distinta (`match_sheet_photo_snapshots`);
- audit eventi foto (`photo_audit_events`);
- grant temporanei di accesso (`photo_access_grants`);
- manifest offline (`photo_sync_manifests`).

È stata aggiunta anche una migrazione correttiva che consente snapshot con foto non disponibile, importante per non bloccare la distinta quando il dato foto è mancante/non ancora risolto.

### 2. Backend foto ufficiali

Il backend contiene un `PhotoService` centrale che governa upload, validazione, versioni, accessi, approvazioni, rigetti, snapshot e audit. La logica importante è concentrata nel servizio, non dispersa nei client.

Funzioni completate:

- creazione upload intent;
- completamento upload;
- validazione e normalizzazione;
- creazione versione `pending_approval`;
- creazione richiesta `photo_approvals` pending;
- URL firmati di lettura;
- controlli autorizzativi per admin, federation, manager, referee e grant;
- approvazione idempotente;
- rigetto idempotente;
- superseding della versione precedente in caso di sostituzione;
- aggiornamento della foto ufficiale globale;
- creazione/aggiornamento del puntatore stagionale;
- audit degli eventi critici;
- creazione snapshot immutabile in chiusura distinta.

### 3. API backend

Sono implementati gli endpoint REST necessari al vertical slice web:

- upload intent;
- completamento upload;
- lettura foto soggetto/registrazione;
- contenuto versione foto;
- lista richieste approvazione;
- dettaglio richiesta approvazione;
- approve;
- reject;
- audit foto;
- manifest/snapshot dove previsto dall'architettura.

La documentazione OpenAPI interna marca gli endpoint del workflow approvazione come implementati.

### 4. Dirigente Web

La distinta dirigente ora usa il backend quando i feature flag ufficiali sono attivi.

Cosa funziona:

- lettura stato foto per giocatori e staff;
- fallback controllato se il backend non risponde;
- upload foto con conversione Data URL → bytes;
- calcolo SHA-256;
- richiesta upload intent;
- upload via signed URL oppure fallback base64 nel completamento upload;
- rilettura dello stato foto dopo il completamento;
- UI coerente con foto corrente, proposta pending e foto approvata.

Le schermate condivise confermano che il dirigente vede correttamente la foto approvata dopo la decisione federale.

### 5. Federazione Web

La sezione Federazione carica la coda dal backend e non solo da store locale quando l'endpoint è disponibile.

Cosa funziona:

- dashboard con contatore richieste foto pending;
- lista richieste foto filtrabile per stato, SLA e società;
- confronto foto attuale/proposta;
- approve;
- reject con motivo e note;
- storico basato anche su audit foto.

Le schermate condivise confermano il percorso: contatore pending, elenco pending, approvazione, lista approved e visibilità successiva lato dirigente.

### 6. Feature flag

I flag foto ufficiali sono accesi di default per lettura backend, upload backend, manifest arbitro e snapshot congelato. Il dual write legacy è spento di default.

Questo è positivo per il test end-to-end attuale, ma richiede attenzione in deploy: ambienti di demo, staging e produzione devono dichiarare chiaramente quali flag sono abilitati.

### 7. Test automatici già presenti

La repository contiene test mirati per:

- architettura foto;
- Milestone B;
- Milestone C approvazione federale;
- client federazione;
- integrazione contratti frontend;
- sorgente foto dirigente/backend;
- store legacy;
- regressione invio distinta dirigente;
- suite backend più ampia.

La copertura test descrive bene il comportamento funzionale base del workflow.

## Cosa non considero ancora chiuso

### 1. Produzione storage e policy reali

Il codice astrae lo storage con `PhotoObjectStore`, ma prima di produzione va verificato che il provider reale sia configurato come bucket privato, con URL firmati brevi, lifecycle policy, limiti dimensione, MIME allowlist, scan/normalizzazione e rimozione EXIF effettiva.

### 2. Migrazione dal localStorage legacy

Esiste ancora documentazione e codice legacy/pilota. Va deciso se:

- mantenere localStorage solo come fallback demo esplicito;
- migrare dati demo importanti verso backend;
- rimuovere o isolare definitivamente il vecchio store per evitare ambiguità nei test.

### 3. Mobile dirigente

Il flusso web appare corretto, ma la parte mobile va validata separatamente:

- upload da fotocamera reale;
- compressione/ritaglio coerente;
- gestione rete instabile;
- ripresa upload interrotto;
- cache locale non source-of-truth;
- sincronizzazione dello stato pending/approved/rejected.

### 4. Arbitro e offline

ARCH-1 richiede che l'arbitro possa consumare manifest e snapshot senza trasformare la cache offline in source of truth. Da verificare con scenari reali:

- distinta chiusa con foto attiva;
- distinta chiusa con foto mancante;
- approvazione dopo chiusura distinta che non cambia lo snapshot già congelato;
- manifest scaricato prima/dopo approvazione;
- revoca o scadenza URL firmati.

### 5. Sicurezza e privacy

Prima di considerare il modulo production-ready servono controlli specifici:

- nessuna foto ufficiale accessibile con URL permanente pubblico;
- no PII nei path object storage;
- EXIF rimossi;
- audit su letture critiche e decisioni;
- RBAC verificato per manager di altra società, federazione di altra federazione, arbitro non assegnato e utente anonimo;
- TTL firmati compatibili con UX e sicurezza;
- limiti anti-abuso su upload e download.

### 6. UX operativa Federazione

La Federazione oggi può decidere, ma per uso reale consiglierei:

- ordinamento per SLA e urgenza gara;
- ricerca per atleta/società/tessera;
- batch approval solo se consentito dalla policy;
- pagina dettaglio più robusta;
- conferma decisione in caso di rigetto;
- messaggi chiari al dirigente sul motivo del rifiuto;
- badge più leggibili per `pending`, `approved`, `rejected`, `closed`.

### 7. Osservabilità

Servono metriche operative:

- upload intent creati;
- upload completati/falliti;
- validazioni fallite per motivo;
- tempo medio approvazione;
- richieste pending oltre SLA;
- errori signed URL;
- access denied;
- storage bytes per ambiente.

### 8. Pulizia documentale

Il documento `Manager_Photo_Audit.md` descrive il vecchio pilota localStorage. Va aggiornato o marcato esplicitamente come storico, altrimenti può creare confusione rispetto al flusso backend attuale.

## Raccomandazione operativa

Secondo me **non serve aggiungere altro al vertical slice web prima di chiudere questa fase**: quello che mostri nelle schermate è il comportamento atteso per Dirigente e Federazione.

La prossima cosa giusta da fare è una chiusura ordinata in quattro passi:

1. **Congelare questa fase come Milestone D Web Validation**: documentare che il flusso web dirigente/federazione è validato manualmente con evidenza screenshot.
2. **Eseguire regression completa**: backend test, web test, typecheck backend, typecheck web, smoke se l'ambiente demo è disponibile.
3. **Aprire checklist production-readiness**: storage privato, sicurezza, mobile, arbitro/offline, legacy cleanup, osservabilità.
4. **Non partire subito con nuove feature**: prima trasformare quello che funziona in web demo in comportamento stabile e verificabile su staging.

## Checklist consigliata prima della prossima milestone

### Must-have prima di produzione

- [ ] Confermare bucket privato e signed URL su ambiente reale.
- [ ] Verificare RBAC negativo con test automatici per manager/federazione/arbitro fuori scope.
- [ ] Validare upload mobile reale.
- [ ] Validare manifest arbitro e snapshot immutabile su distinta chiusa.
- [ ] Aggiornare/archiviare documentazione legacy localStorage.
- [ ] Definire retention e cancellazione GDPR/federale.
- [ ] Aggiungere metriche minime e alert su upload/approval.

### Should-have per qualità operativa

- [ ] Migliorare filtri e ordinamento Federazione.
- [ ] Mostrare al dirigente motivo rigetto e stato SLA.
- [ ] Aggiungere audit UI consultabile per ogni tesserato.
- [ ] Aggiungere test visual/regression per le card foto.
- [ ] Preparare script demo ripetibile per creare richieste foto pending/approved/rejected.

### Nice-to-have

- [ ] Cropping guidato con qualità minima lato client.
- [ ] Preview responsive di thumbnails.
- [ ] Notifiche automatiche a società su approvazione/rigetto.
- [ ] Dashboard federale con trend e backlog per società.

## Conclusione

Il lavoro principale del workflow foto web è sostanzialmente fatto. La domanda ora non è “quale bottone manca?”, ma “come rendiamo questo flusso sicuro, ripetibile, testato e pronto per mobile/arbitro/produzione?”.

La mia raccomandazione è: **chiudere formalmente la fase web, fare regression, poi aprire una milestone separata per production hardening + mobile/arbitro/offline**.
