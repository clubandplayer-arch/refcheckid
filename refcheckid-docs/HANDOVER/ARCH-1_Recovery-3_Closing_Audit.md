# ARCH-1 Recovery-3 — Audit conclusivo workflow federazione

**Stato:** Implementazione completata, audit conclusivo pronto per revisione pre-merge
**Data audit:** 2026-07-14
**Perimetro:** workflow federazione per approvazioni foto ufficiali ARCH-1.

## Metodo applicato

Recovery-3 è stata implementata nel perimetro approvato dopo audit preliminare:

1. allineamento contratti API e OpenAPI;
2. rafforzamento coda federale come fonte backend ufficiale;
3. arricchimento contesto approval per UI federazione;
4. reason code federali standardizzati;
5. audit decisionale completo sul cambio foto ufficiale;
6. verifica invalidation/cache tramite `photoEtag` e audit `photo.official_changed`;
7. test mirati, test monorepo e lint.

## Esito non conformità Recovery-3

| ID | Esito | Evidenza |
| --- | --- | --- |
| R3-01 | Chiuso | OpenAPI marca `rejectPhotoApproval` come `implemented` e il test contratto lo verifica. |
| R3-02 | Chiuso | Il client federazione usa `/photo-approvals` come fonte ufficiale e non mischia più richieste locali legacy nella coda federale. |
| R3-03 | Chiuso | La lista/dettaglio approval backend restituisce contesto operativo minimo: club, soggetto, versioni corrente/proposta, SLA e `photoEtag`. |
| R3-04 | Chiuso | Gli stati Web includono `cancelled` ed `expired` oltre a `pending`, `approved` e `rejected`. |
| R3-05 | Chiuso | Lo storico federazione integra eventi audit foto rilevanti: approval, reject, cambio ufficiale e vista per approval. |
| R3-06 | Chiuso | La coda supporta filtri backend per status, stagione, registration, date, club, SLA e paginazione `limit/offset`; la UI espone status, SLA e club. |
| R3-07 | Chiuso | Il rigetto federale usa reason code standardizzati lato UI e validazione API. |
| R3-08 | Chiuso | L'approvazione genera audit dedicato `photo.official_changed` con versione precedente, versione corrente e `photoEtag`. |
| R3-09 | Chiuso | Il workflow espone `photoEtag` nella coda e nell'audit del cambio ufficiale; la UI invalida le query foto/player/staff dopo la decisione. |

## Audit tecnico finale

### Backend/API

- `POST /api/v1/photo-approvals/{id}/reject` è allineato a OpenAPI come endpoint implementato.
- La coda approval arricchisce ogni richiesta con informazioni operative senza introdurre nuovo dominio.
- La coda applica filtri e paginazione compatibili con il perimetro Recovery-3.
- Il rigetto federale accetta solo reason code standardizzati.
- L'approvazione mantiene gli effetti lifecycle esistenti e aggiunge l'evento `photo.official_changed`.

### Web federazione

- La tab Foto usa la coda backend `/photo-approvals` come fonte ufficiale.
- La UI espone filtri operativi per stato, SLA e società.
- La UI gestisce gli stati `cancelled` ed `expired`.
- Il rigetto usa un elenco controllato di reason code federali.
- La card approval mostra SLA e `photoEtag` quando disponibili.
- Lo storico federazione include gli eventi audit foto già esposti dal backend.

### Fuori perimetro preservati

Restano fuori da Recovery-3:

- Mobile e sincronizzazione offline Mobile;
- eliminazione definitiva dei fallback legacy in altre aree, riservata a Recovery-4;
- nuove migrazioni dati;
- nuove decisioni di dominio non presenti in ARCH-1;
- riprogettazione grafica estesa della dashboard federazione.

## Verifiche eseguite

- `pnpm -C refcheckid-backend test -- photo-approval-milestone-c.test.ts` — verde.
- `pnpm -C refcheckid-web test -- federation-api-client.test.ts federation-workflow-source.test.ts` — verde.
- `pnpm -r test` — verde.
- `pnpm -r lint` — verde con warning Next.js preesistente su `<img>` in `federation-workflow.tsx`.

## Stato finale pre-merge

Recovery-3 è implementata e l'audit conclusivo è pronto per revisione.

Non procedere al merge prima dell'approvazione esplicita dell'audit conclusivo.
