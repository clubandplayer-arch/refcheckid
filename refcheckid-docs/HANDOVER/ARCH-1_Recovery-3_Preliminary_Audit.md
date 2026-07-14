# ARCH-1 Recovery-3 — Audit preliminare workflow federazione

**Stato:** Aperta — audit preliminare completato, piano in attesa di approvazione
**Data apertura:** 2026-07-14
**Perimetro:** workflow federazione per approvazioni foto ufficiali ARCH-1.
**Vincolo:** nessuna modifica codice Recovery-3 deve partire prima dell'approvazione di questo audit e del piano operativo.

## 1. Metodo applicato

Recovery-3 viene aperta con il metodo consolidato:

1. audit domain-first;
2. verifica oggettiva del codice esistente;
3. classificazione delle attività;
4. piano di implementazione limitato al perimetro Recovery-3;
5. audit conclusivo e chiusura Recovery dopo implementazione approvata.

Questa apertura non avvia ancora modifiche applicative.

## 2. Fonti domain-first verificate

| Fonte | Evidenza rilevante per Recovery-3 |
| --- | --- |
| `ARCH-1_Shared_Official_Photo_Storage.md` | La federazione deve avere coda approvazioni, dettaglio/confronto, comandi `approve/reject`, reason code e audit. |
| `ARCH-1_Milestone_A_Backend_Data_Model_API_Contracts.md` | I contratti backend dichiarano coda `photo_approvals`; i comandi erano parte del percorso successivo. |
| `ARCH-1_Recovery-2_RBAC_Public_API_Audit.md` | Recovery-2 ha consolidato RBAC, scope federazione e audit di accesso come prerequisiti. |
| `Manager_Photo_Audit.md` | Il flusso pilota prevede richiesta pendente, confronto foto corrente/proposta e decisione federale. |
| `Mobile_Handover_Package.md` | Da usare solo come riferimento di parità futura; Mobile resta fuori perimetro Recovery-3. |

## 3. Verifica codice esistente

| Area | Stato osservato | Classificazione |
| --- | --- | --- |
| Backend router | Gli endpoint `GET /photo-approvals`, `GET /photo-approvals/:id`, `POST /approve`, `POST /reject` sono registrati. | R3-CONF |
| Backend service | `approvePhotoApproval` e `rejectPhotoApproval` aggiornano approval, versioni foto, puntatore ufficiale o rifiuto e audit. | R3-CONF |
| Backend controller | Lista, dettaglio e decisioni applicano scope federazione/admin e bloccano manager/referee sulla coda. | R3-CONF |
| Backend test | Esiste copertura dedicata per lista/dettaglio, approve idempotente, replacement, reject e denial cross-scope. | R3-CONF |
| OpenAPI | `rejectPhotoApproval` è ancora marcato `defined` anche se il router lo espone e il service lo implementa. | R3-GAP |
| Web API client | Il client federazione legge `/photo-approvals` e invia comandi approve/reject, ma mantiene fallback a richieste locali legacy. | R3-GAP |
| Web UI federazione | La tab Foto espone confronto, reason code, note e pulsanti approve/reject. | R3-CONF |
| Web mapping richiesta | Le approval backend non includono ancora dati arricchiti per nome tesserato, club e URL di foto corrente/proposta; la UI mostra identificativi tecnici o placeholder. | R3-GAP |
| Storico federazione | Lo storico corrente è focalizzato sui referti/audit generici, non sulla timeline decisionale foto federale. | R3-GAP |
| Stati extra | Il tipo Web `PhotoRequestStatus` non include `cancelled`/`expired`, presenti nel dominio approval backend. | R3-GAP |
| Filtri coda federazione | ARCH-1 richiede filtri per società, competizione, rischio e SLA; l'implementazione osservata copre status/stagione/registration/date ma non tutto il set operativo. | R3-GAP |
| Reason code federali | ARCH-1 richiede reason code standardizzati; UI e API accettano stringhe libere. | R3-GAP |
| Audit cambio ufficiale | ARCH-1 richiede audit `photo.approved` e `photo.official_changed`; il service registra `photo.approved` e `photo.superseded`, ma non risulta evento dedicato `photo.official_changed`. | R3-GAP |
| Invalidation/cache dopo decisione | ARCH-1 prevede cambio `photoEtag`, invalidazione cache e manifest incrementale dopo approve; il perimetro osservato non dimostra ancora la propagazione end-to-end nel workflow federazione. | R3-RISK |
| Mobile | Nessuna azione richiesta. | R3-OOS |
| Eliminazione fallback legacy | Da non anticipare; appartiene a Recovery-4. | R3-OOS |

## 4. Non conformità preliminari Recovery-3

| ID | Descrizione | Impatto | Azione proposta |
| --- | --- | --- | --- |
| R3-01 | OpenAPI non allineata: `POST /photo-approvals/{id}/reject` risulta `defined` invece che `implemented`. | Contratto pubblico incoerente. | Aggiornare OpenAPI e test contratto. |
| R3-02 | Coda Web mischia backend approvals e richieste locali legacy. | Ambiguità operativa nel workflow federazione ARCH-1. | Separare fonte backend ufficiale e confinare fallback legacy senza renderlo source of truth. |
| R3-03 | DTO Web delle approval non espone dettaglio utile a confronto corrente/proposta. | Operatore federale vede ID tecnici e placeholder invece di informazioni operative. | Arricchire mapping/API nel perimetro minimo senza cambiare dominio. |
| R3-04 | Stati `cancelled` ed `expired` non sono rappresentati nel tipo Web. | Possibile perdita di stato per approval non pending/approved/rejected. | Estendere tipo UI e badge, senza implementare nuovi comandi non richiesti. |
| R3-05 | Storico federazione non integra eventi foto `photo.approved`, `photo.rejected`, `photo.version_viewed_for_approval`. | Audit federale meno leggibile in UI. | Integrare lettura sintetica audit foto già disponibile. |
| R3-06 | Filtri coda incompleti rispetto ad ARCH-1: società, competizione, rischio, SLA e paginazione operativa non sono coperti in modo esplicito. | La coda federale può non scalare o non consentire priorità operative. | Estendere query/UI ai filtri disponibili o marcare esplicitamente quelli non implementabili senza nuovo dominio. |
| R3-07 | Reason code di rigetto non standardizzati. | Decisioni federali non confrontabili e audit meno governabile. | Introdurre elenco controllato minimo di reason code lato UI/API. |
| R3-08 | Evento audit `photo.official_changed` non tracciato come evento distinto all'approvazione. | Delta rispetto al lifecycle ARCH-1 e minore tracciabilità del cambio ufficiale. | Aggiungere audit dedicato quando cambia `current_version_id`/versione efficace. |
| R3-09 | Invalidation cache, cambio `photoEtag` e feed/manifest incrementale post-approve non risultano verificati end-to-end nel workflow federazione. | Rischio di client con foto non aggiornata dopo decisione federale. | Verificare copertura esistente e, se nel perimetro minimo, aggiungere test/integrazione; altrimenti registrare come dipendenza Recovery successiva. |

## 5. Piano di implementazione proposto

L'implementazione Recovery-3, se approvata, deve restare limitata ai seguenti step:

1. Allineare OpenAPI e test per dichiarare implementato `rejectPhotoApproval`.
2. Rafforzare il client Web federazione per trattare `/photo-approvals` come fonte ufficiale del workflow.
3. Arricchire la rappresentazione UI delle approval con dati minimi di contesto disponibili senza introdurre nuovo dominio.
4. Estendere gli stati UI a quelli già presenti nel dominio backend.
5. Collegare lo storico federazione agli eventi audit foto già esposti dal backend.
6. Aggiungere o classificare esplicitamente filtri coda, reason code standardizzati, audit `photo.official_changed` e verifica di invalidazione/cache post-decisione.
7. Eseguire test mirati backend, frontend e lint.
8. Produrre audit conclusivo e aggiornare handover Recovery-3.

## 5.1 Verifica aggiuntiva dopo rilettura integrale ARCH-1

La rilettura integrale delle sezioni ARCH-1 su approvazione federazione, lifecycle, impatti client federazione, audit e scalabilità conferma che le prime cinque non conformità non rappresentavano tutto il delta tra dominio e implementazione.

Recovery-3 resta prevalentemente una recovery di UI/API perché il modello dati, i comandi principali approve/reject, le policy federazione e la base audit esistono già; tuttavia il delta architetturale non è limitato alla presentazione UI. Restano divergenze puntuali su filtri/SLA della coda, reason code standardizzati, audit del cambio ufficiale e verifica della propagazione post-approvazione tramite `photoEtag`/manifest/cache.

Questi elementi devono essere risolti o esplicitamente classificati fuori perimetro prima di iniziare l'implementazione.

## 6. Fuori perimetro confermati

- Mobile e sincronizzazione offline Mobile.
- Eliminazione definitiva dei fallback legacy, riservata a Recovery-4.
- Nuove migrazioni dati non necessarie al workflow federazione minimo.
- Nuove decisioni di dominio non presenti in ARCH-1.
- Riprogettazione grafica estesa della dashboard federazione.

## 7. Criteri di chiusura Recovery-3

Recovery-3 potrà essere chiusa solo quando:

- OpenAPI e router saranno coerenti per gli endpoint approval implementati;
- coda, dettaglio, approve e reject saranno verificati come workflow federazione ufficiale;
- gli scope federazione/admin resteranno enforced;
- gli eventi audit foto saranno consultabili dal perimetro federazione;
- test backend, frontend e lint saranno verdi o esplicitamente motivati;
- l'handover Recovery-3 conterrà audit conclusivo, commit e stato finale.
