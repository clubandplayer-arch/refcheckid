# ARCH-1 Milestone D — Manager Web Migration

## Summary

Milestone D migra il Manager Web verso il backend ARCH-1 come Source of Truth delle fotografie ufficiali. Il flusso principale non considera più `manager-photo-store` come archivio ufficiale: il Manager legge prima dal backend, usa Upload Intent e Upload Complete per i nuovi caricamenti dei giocatori, e mostra gli stati reali restituiti dal backend.

## File modificati

- `refcheckid-web/src/lib/photo-feature-flags.ts`
- `refcheckid-web/src/lib/manager-photo-backend.ts`
- `refcheckid-web/src/lib/api-client.ts`
- `refcheckid-web/src/lib/types.ts`
- `refcheckid-web/src/features/manager/match-sheet-workflow.tsx`
- `refcheckid-web/tests/unit/manager-photo-source.test.ts`
- `refcheckid-web/tests/unit/manager-photo-backend.test.ts`
- `docs/HANDOVER/ARCH-1_Milestone_D_Manager_Web_Migration.md`

## Flusso migrato

1. Il Manager Web carica la rosa.
2. La lettura foto passa da `fetchPlayers` a un servizio centralizzato di dual read.
3. Il servizio tenta prima `GET /players/{id}/photo` usando la foto reale; il placeholder UI non viene salvato come foto ufficiale.
4. Se esiste una richiesta backend, interroga `/photo-approvals` per il vero `registrationId` stagionale e legge la versione proposta con `/photos/versions/{id}/content`.
5. Se il backend non ha ancora la foto e `photos.legacyLocalFallback` è abilitato, viene applicato solo il fallback legacy controllato dentro il servizio foto Manager.
6. L'upload giocatore usa il vero `registrationId` del tesseramento stagionale:
   - `POST /photos/upload-intent`
   - eventuale signed upload diretto quando disponibile, con verifica `response.ok`
   - `POST /photos/uploads/{id}/complete`, senza `contentBase64` quando il signed upload è già riuscito
7. Dopo il complete, la UI aggiorna lo stato e invalida la query giocatori.

## Feature flag utilizzati

- `photos.officialBackendRead`
- `photos.officialBackendUpload`
- `photos.legacyLocalFallback`
- `photos.dualWriteLegacy`

Non sono stati introdotti nuovi feature flag ARCH-1.

## Componenti rimossi o declassati

- `manager-photo-store` non è più usato come Source of Truth del flusso principale giocatori.
- Il salvataggio locale resta disponibile solo come fallback legacy o percorso di compatibilità controllato dai feature flag e viene applicato esclusivamente dal servizio foto Manager centralizzato.
- La nota UI che indicava il localStorage come storage pilota condiviso è stata sostituita con una nota backend ARCH-1.

## UI Manager

La UI Manager mostra gli stati backend normalizzati:

- Missing
- Pending Approval
- Active
- Rejected
- Suspended

Per una sostituzione pending, la UI mostra:

```text
Foto ufficiale corrente
↓
Nuova foto proposta
```

La foto corrente rimane visibile fino all'approvazione federale.

## Test

Eseguiti:

- `pnpm --dir refcheckid-web typecheck`
- `pnpm --dir refcheckid-web test:unit`

Copertura aggiunta/aggiornata per:

- upload backend tramite Upload Intent e Upload Complete;
- verifica errori signed upload prima di Upload Complete;
- uso del vero `registrationId` per upload e approval;
- first photo / missing state senza interpretare il placeholder come foto attiva;
- replacement pending con foto corrente e proposta;
- rejected/pending/active/suspended/missing labels;
- backend read;
- fallback legacy controllato da feature flag;
- centralizzazione del dual read.

## Limitazioni

- Superata da Milestone F.1: il workflow ufficiale è stato generalizzato a `photo_subject` e include anche Staff Member.
- Il Manager Web usa gli endpoint esistenti senza introdurre nuove API.
- Non è stata implementata la Milestone E.

## Milestone successiva

Attendere approvazione esplicita prima di procedere alla Milestone E.
