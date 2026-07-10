# ARCH-1 — Milestone E — Referee Official Manifest

## Summary

La Milestone E migra Referee Web verso il consumo del Match Photo Manifest come unica fonte operativa per le fotografie durante il riconoscimento. Il backend rimane la Source of Truth: il client riceve soggetti, stato foto, URL firmato, `photoEtag` e indicazione di snapshot congelato senza ricostruire o dedurre fotografie da dati locali.

## Architettura utilizzata

- Source of Truth: `refcheckid-docs/ARCHITECTURE/ARCH-1_Shared_Official_Photo_Storage.md`.
- API usata dal Referee Web: `GET /api/v1/matches/{id}/photo-manifest`.
- Il manifest espone una copia temporanea caricata da React Query e invalidabile tramite la query key di riconoscimento e `photoEtag`.
- Gli snapshot congelati sono rappresentati con `manifestSource = frozen_snapshot` e `isFrozenSnapshot = true`.
- Le foto sono precaricate dal client prima della verifica visuale dei tesserati.

## File modificati

- `refcheckid-backend/src/api/controllers.ts`
- `refcheckid-web/src/lib/api-client.ts`
- `refcheckid-web/src/lib/referee-api-client.ts`
- `refcheckid-web/src/lib/referee-types.ts`
- `refcheckid-web/src/lib/photo-feature-flags.ts`
- `refcheckid-web/src/features/referee/referee-match-workflow.tsx`
- `refcheckid-web/tests/unit/referee-api-client.test.ts`
- `refcheckid-backend/tests/rest-api.test.ts`
- `refcheckid-docs/HANDOVER/ARCH-1_Milestone_E_Referee_Official_Manifest.md`

## Flusso migrato

1. Referee Web avvia il riconoscimento per un `matchId`.
2. Il client chiama una sola volta il Match Photo Manifest tramite React Query.
3. Se il manifest è disponibile, i soggetti del riconoscimento derivano esclusivamente dal payload backend.
4. Se il backend restituisce snapshot congelati, la UI li mostra come fonte congelata e non tenta nuove risoluzioni.
5. Le immagini con stato `active` vengono prefetched prima dell'uso operativo.
6. Durante il riconoscimento la UI usa soltanto manifest e immagini già precaricate.
7. Gli stati visualizzati sono quelli del backend: Missing, Pending, Active, Rejected, Suspended.

## Feature Flag utilizzati

- `photos.refereeManifest`: abilita il consumo del Match Photo Manifest nel Referee Web.
- `photos.frozenMatchSnapshot`: mantiene esplicita la semantica ARCH-1 degli snapshot congelati.
- `photos.legacyLocalFallback`: resta disponibile solo per retrocompatibilità controllata quando il manifest referee non è abilitato.

## Componenti legacy rimossi

La risoluzione primaria del riconoscimento non usa più snapshot locali o override Manager quando `photos.refereeManifest` è attivo. Il fallback legacy rimane confinato dietro `photos.legacyLocalFallback` per compatibilità di migrazione.

## Test eseguiti

- `pnpm --dir refcheckid-web typecheck`
- `pnpm --dir refcheckid-backend typecheck`
- `pnpm --dir refcheckid-web test:unit`
- `pnpm --dir refcheckid-backend test:unit`

## Eventuali bug backend corretti

L'endpoint `GET /api/v1/matches/{id}/photo-manifest` era ancora `contract_only` e rispondeva `501`. È stato completato come bug fix necessario alla migrazione Referee Web, riusando repository, Match Sheet Service, Photo Service, snapshot esistenti e signed URL già implementati.

## Limitazioni note

- Il manifest live senza snapshot restituisce un manifest disponibile solo se esistono distinte gara e una lista soggetti vuota quando non sono presenti snapshot congelati popolati.
- Nessuna nuova API è stata introdotta: è stata completata l'API già prevista dal contratto ARCH-1.
- Il fallback locale è mantenuto esclusivamente dietro feature flag.

## Milestone successiva

Non procedere alla Milestone F senza approvazione esplicita. La Milestone F potrà concentrarsi su Manager Mobile e supporto offline coerente con manifest/cache ARCH-1.
