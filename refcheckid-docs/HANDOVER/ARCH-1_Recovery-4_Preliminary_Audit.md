# ARCH-1 Recovery-4 — Audit preliminare eliminazione fallback legacy

**Stato:** Aperta — audit preliminare completato, piano in attesa di approvazione
**Data apertura:** 2026-07-15
**Perimetro:** eliminazione controllata dei fallback legacy ARCH-1 in Web e documentazione collegata.
**Vincolo:** nessuna modifica codice Recovery-4 deve partire prima dell'approvazione di questo audit e del piano operativo.

## 1. Metodo applicato

Recovery-4 viene aperta con il metodo consolidato:

1. audit domain-first;
2. verifica oggettiva del codice esistente;
3. inventario dei fallback legacy residui;
4. classificazione delle attività;
5. piano di implementazione limitato al perimetro Recovery-4;
6. audit conclusivo e chiusura Recovery dopo implementazione approvata.

Questa apertura non avvia ancora modifiche applicative.

## 2. Fonti domain-first verificate

| Fonte | Evidenza rilevante per Recovery-4 |
| --- | --- |
| `ARCH-1_Shared_Official_Photo_Storage.md` | Il backend è source of truth; localStorage, cache arbitro e store Manager non devono restare archivi ufficiali. La fase finale prevede disabilitazione di `photos.legacyLocalFallback`, rimozione della dipendenza da `manager-photo-store` e assenza di fallback arbitrari se esiste manifest valido. |
| `ARCH-1_Milestone_D_Manager_Web_Migration.md` | Il Manager Web usa backend/upload intent come flusso principale; `manager-photo-store` resta solo fallback legacy controllato da feature flag. |
| `ARCH-1_Milestone_E_Referee_Official_Manifest.md` | Il riconoscimento primario non usa snapshot locali o override Manager quando il manifest è attivo; il fallback locale resta temporaneo dietro flag. |
| `ARCH-1_Recovery-3_Closing_Audit.md` | Recovery-3 ha chiuso la coda federale ufficiale e ha rinviato a Recovery-4 la rimozione definitiva dei fallback legacy in altre aree. |

## 3. Verifica codice esistente

| Area | Stato osservato | Classificazione |
| --- | --- | --- |
| Feature flag foto | `photo-feature-flags.ts` abilita `photos.legacyLocalFallback` di default. | R4-GAP |
| Manager foto | `manager-photo-backend.ts` legge ancora override da `manager-photo-store` quando il flag legacy è attivo. | R4-GAP |
| Store foto locale | `manager-photo-store.ts` mantiene persistenza localStorage per foto e richieste approval locali. | R4-GAP |
| Workflow distinta Manager | `match-sheet-workflow.tsx` salva ancora foto e snapshot distinta attraverso store locali. | R4-GAP |
| Snapshot distinta | `submitted-match-sheet.ts` salva/legge snapshot localStorage usati dal workflow arbitro. | R4-GAP |
| Workflow arbitro | `referee-api-client.ts` applica fallback a snapshot locali, pilot data e override Manager se il flag legacy lo consente. | R4-GAP |
| Manifest arbitro | Quando il manifest è abilitato e non disponibile, il client non attiva fallback legacy. | R4-CONF |
| Referti federazione | `federation-api-client.ts` legge ancora referti locali da `submitted-report` e li integra in dashboard/storico. | R4-GAP |
| Sessione browser | `session.tsx` usa localStorage per sessione utente client-side. | R4-OOS |
| Dati pilot/demo | `pilot-data.ts` e script demo backend devono restare utilizzabili esclusivamente come fixture di test o bootstrap dimostrativo; ogni uso come fallback operativo del runtime è vietato nel target Recovery-4. | R4-GAP |
| Test frontend | Diversi test unitari verificano fallback localStorage e flag legacy. | R4-GAP |

## 4. Inventario preliminare fallback legacy residui

| ID | Fallback residuo | File principali | Impatto |
| --- | --- | --- | --- |
| R4-01 | Flag `photos.legacyLocalFallback` default-on. | `refcheckid-web/src/lib/photo-feature-flags.ts` | Mantiene attivi percorsi legacy senza opt-in esplicito. |
| R4-02 | Override foto Manager da localStorage nel flusso backend. | `manager-photo-backend.ts`, `manager-photo-store.ts` | Rischio di divergenza tra foto ufficiale backend e UI. |
| R4-03 | Snapshot distinta salvata localmente dopo submit Manager. | `match-sheet-workflow.tsx`, `submitted-match-sheet.ts` | L'arbitro può vedere dati locali invece di snapshot ufficiali. |
| R4-04 | Fallback arbitro a snapshot/pilot data/override Manager. | `referee-api-client.ts` | Può mascherare assenza di manifest o snapshot backend. |
| R4-05 | Referti locali federazione. | `submitted-report.ts`, `federation-api-client.ts`, `referee-match-workflow.tsx` | La federazione può vedere referti non provenienti dal backend ufficiale. |
| R4-06 | Test che proteggono comportamenti legacy. | `refcheckid-web/tests/unit/*` | La suite va aggiornata per proteggere il nuovo stato source-of-truth. |
| R4-07 | Dati demo/pilot usati come fallback runtime. | `pilot-data.ts`, client Web e script demo | I dati demo devono rimanere solo fixture di test o bootstrap dimostrativo, mai sostituti operativi dei dati backend/manifest. |

## 5. Piano di implementazione proposto

L'implementazione Recovery-4, se approvata, deve restare limitata ai seguenti step:

1. Rendere `photos.legacyLocalFallback` opt-in o rimuoverlo dai percorsi runtime ufficiali, mantenendo solo eventuali helper smoke/demo esplicitamente isolati.
2. Rimuovere gli override `manager-photo-store` dal flusso Manager backend e aggiornare i messaggi UI/test relativi.
3. Eliminare l'uso di snapshot localStorage come fonte operativa per l'arbitro quando backend/manifest/snapshot ufficiali sono disponibili o richiesti.
4. Rimuovere il merge dei referti federazione locali dal client federazione se il backend espone i referti ufficiali.
5. Isolare i dati demo/pilot come fixture di test o bootstrap dimostrativo e impedire che vengano usati come fallback operativo del runtime.
6. Aggiornare o cancellare i test che codificano fallback legacy, sostituendoli con test di assenza fallback e failure esplicita.
7. Aggiornare handover e roadmap con audit conclusivo, rischi residui e fuori perimetro.

## 6. Fuori perimetro confermati

- Sessione browser in localStorage, perché riguarda autenticazione client-side e non fallback dati ARCH-1.
- Script demo backend e dataset demo ufficiali, solo se confinati a fixture di test o bootstrap dimostrativo e mai usati come fallback operativo del runtime.
- Mobile/offline sync e porting Mobile.
- Nuovi endpoint o migrazioni non necessari per disabilitare i fallback residui.
- Riprogettazione visuale delle dashboard.

## 7. Criteri di chiusura Recovery-4

Recovery-4 potrà essere chiusa solo quando:

- il flusso foto Manager non dipenderà da `manager-photo-store` come fallback runtime ufficiale;
- il flusso arbitro non userà snapshot locali, pilot data o override Manager per sostituire manifest/snapshot ufficiali nel percorso ARCH-1;
- il flusso federazione non userà referti locali come source alternativa ai dati backend ufficiali;
- i test frontend/backend rilevanti saranno aggiornati e verdi o motivati;
- la documentazione dichiarerà chiaramente quali helper demo/smoke restano e certificherà che sono solo fixture di test o bootstrap dimostrativo, non fallback runtime né source of truth;
- l'handover Recovery-4 conterrà audit conclusivo, commit e stato finale.
