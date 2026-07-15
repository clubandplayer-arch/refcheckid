# ARCH-1 Recovery-4 — Audit conclusivo eliminazione fallback legacy

**Stato:** Implementazione completata; audit conclusivo approvato; Ready for Merge
**Data chiusura implementativa:** 2026-07-15
**Perimetro:** rimozione dei fallback legacy runtime Web approvati nell'audit preliminare Recovery-4.

## 1. Sintesi esecutiva

Recovery-4 ha rimosso i fallback legacy dal runtime Web ARCH-1 senza introdurre nuove funzionalità di dominio e senza anticipare Mobile.

Il runtime Manager, Arbitro e Federazione ora resta vincolato alla Source of Truth ARCH-1: backend, API pubbliche, manifest foto gara e snapshot ufficiali esposti dal backend. I dati demo/pilot rimangono utilizzabili come fixture di test o bootstrap dimostrativo, ma non sono più usati come fallback operativo dai client runtime modificati in questa recovery.

## 2. Esito non conformità Recovery-4

| ID | Esito | Evidenza conclusiva |
| --- | --- | --- |
| R4-01 | Chiuso | `photos.legacyLocalFallback` è stato rimosso dai feature flag Web runtime. |
| R4-02 | Chiuso | Il layer Manager foto non applica più override da `manager-photo-store` né usa foto legacy quando la lettura backend fallisce. |
| R4-03 | Chiuso | Il submit distinta Manager non salva più snapshot localStorage come fonte per l'arbitro. |
| R4-04 | Chiuso | Il riconoscimento arbitro legge esclusivamente il manifest foto gara quando è disponibile e non sintetizza soggetti da snapshot locali, pilot data o override Manager. |
| R4-05 | Chiuso | Il client Federazione non legge più referti locali da `submitted-report` e usa solo referti backend per dashboard, calendario e lista referti. |
| R4-06 | Chiuso | I test frontend sono stati aggiornati per proteggere l'assenza di fallback legacy runtime e la Source of Truth backend/manifest. |
| R4-07 | Chiuso | I dati demo/pilot non sono più importati dai client runtime modificati come fallback operativo; restano confinati a test/fixture o bootstrap dimostrativo. |

## 3. Verifica codice conclusiva

| Area | Verifica | Stato |
| --- | --- | --- |
| Feature flag foto | `photo-feature-flags.ts` non espone più `legacyLocalFallback`. | Conforme |
| Manager foto backend | `manager-photo-backend.ts` legge foto e approval dal backend; in caso di errore non ripiega su localStorage. | Conforme |
| Workflow Manager | `match-sheet-workflow.tsx` usa Upload Intent/Complete o fallisce esplicitamente se l'upload ufficiale è disabilitato; non salva più snapshot distinta locali. | Conforme |
| API roster Manager | `api-client.ts` non sostituisce liste backend vuote con `pilot-data`. | Conforme |
| Riconoscimento Arbitro | `referee-api-client.ts` non importa più `pilot-data`, `manager-photo-store` o snapshot localStorage per costruire soggetti runtime. | Conforme |
| Referti Federazione | `federation-api-client.ts` non importa più `submitted-report` e non fonde referti locali con backend. | Conforme |
| Workflow referto Arbitro | `referee-match-workflow.tsx` non salva più copie locali per la federazione dopo submit. | Conforme |
| Helper legacy residui | `manager-photo-store`, `submitted-match-sheet`, `submitted-report` e `pilot-data` non sono referenziati dai runtime modificati; rimangono disponibili solo per test/fixture o compatibilità non operativa. | Conforme con nota |

## 4. Test e controlli eseguiti

| Comando | Esito | Note |
| --- | --- | --- |
| `pnpm -C refcheckid-web test:unit -- federation-api-client.test.ts referee-api-client.test.ts manager-photo-backend.test.ts api-client.test.ts manager-photo-source.test.ts` | Pass | La suite unit Web eseguita da Vitest ha completato 15 file e 75 test. |
| `pnpm -C refcheckid-web typecheck` | Pass | TypeScript `tsc --noEmit` completato senza errori. |
| `rg -n "legacyLocalFallback\|readSubmittedFederationReports\|saveSubmittedFederationReport\|saveSubmittedMatchSheetSnapshot\|readSubmittedMatchSheetSnapshot\|buildPilotSubmitted\|buildPilotAway\|applyManagerPhotoOverrides\|pilotPlayers\|pilotAwayPlayers\|pilotStaff\|pilotAwayStaff\|saveManagerSubjectPhoto" refcheckid-web/src` | Pass con residui non runtime | Restano solo helper legacy/demo non importati dai runtime modificati. |

## 5. Fuori perimetro rispettati

- Nessuna implementazione Mobile o offline sync.
- Nessuna nuova migrazione dati.
- Nessuna riprogettazione UX estesa.
- Nessuna rimozione dei dataset/script demo backend usati come bootstrap dimostrativo.
- Nessuna modifica di dominio oltre alla rimozione dei fallback runtime approvati.

## 6. Rischi residui e note di review

- I conteggi giocatori/staff nella verifica distinte arbitro non vengono più ricostruiti da snapshot locali; restano a zero finché il backend non espone conteggi/snapshot ufficiali nel DTO delle distinte o nel manifest collegato. La scelta è intenzionale per evitare fallback non governati.
- Gli helper legacy locali restano nel codice sorgente per test/fixture e compatibilità non runtime; non sono più importati dai percorsi runtime modificati in Recovery-4.
- Eventuali esigenze demo devono passare da bootstrap/API pubbliche e non da fallback UI nascosti.

## 7. Stato finale

Recovery-4 ha implementazione completata, audit conclusivo approvato ed è **Ready for Merge**.

La chiusura definitiva della Recovery-4 avverrà dopo il merge su `main` e la conferma dei Quality Gate GitHub.
