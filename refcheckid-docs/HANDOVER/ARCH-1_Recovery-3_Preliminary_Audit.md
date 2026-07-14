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

## 5. Piano di implementazione proposto

L'implementazione Recovery-3, se approvata, deve restare limitata ai seguenti step:

1. Allineare OpenAPI e test per dichiarare implementato `rejectPhotoApproval`.
2. Rafforzare il client Web federazione per trattare `/photo-approvals` come fonte ufficiale del workflow.
3. Arricchire la rappresentazione UI delle approval con dati minimi di contesto disponibili senza introdurre nuovo dominio.
4. Estendere gli stati UI a quelli già presenti nel dominio backend.
5. Collegare lo storico federazione agli eventi audit foto già esposti dal backend.
6. Eseguire test mirati backend, frontend e lint.
7. Produrre audit conclusivo e aggiornare handover Recovery-3.

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
