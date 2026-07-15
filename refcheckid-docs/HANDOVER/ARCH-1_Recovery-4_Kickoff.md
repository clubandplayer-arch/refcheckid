# ARCH-1 Recovery-4 — Kickoff eliminazione fallback legacy

**Stato:** Recovery-4 aperta; audit preliminare completato e piano di lavoro da approvare
**Data apertura:** 2026-07-15
**Ambito:** eliminazione controllata dei fallback legacy ARCH-1, senza modifiche codice prima dell'approvazione.

## Premessa operativa

Recovery-4 viene aperta dopo la chiusura implementativa di Recovery-3. Le recovery precedenti hanno consolidato backend, RBAC/API pubbliche, workflow federazione e manifest ufficiale, lasciando esplicitamente fuori perimetro la rimozione definitiva dei fallback legacy.

Questa apertura non autorizza ancora modifiche applicative: prepara il lavoro domain-first e fissa il perimetro da approvare prima di rimuovere codice, feature flag o store locali.

## Metodo consolidato

Recovery-4 segue lo stesso metodo applicato alle recovery precedenti:

1. **Audit domain-first** su ARCH-1, handover e codice corrente.
2. **Classificazione delle attività** in conformità, non conformità, gap documentali, rischi e fuori perimetro.
3. **Implementazione limitata al perimetro Recovery-4**, senza anticipare Mobile o nuove funzionalità di dominio.
4. **Audit conclusivo** su codice, contratti, test e documentazione.
5. **Chiusura Recovery** con handover, test finali, commit e PR.

## Perimetro preliminare Recovery-4

Il perimetro preliminare riguarda la rimozione o il confinamento terminale dei fallback legacy rimasti dopo ARCH-1:

- `photos.legacyLocalFallback` e percorsi foto basati su `manager-photo-store` come fallback operativo;
- snapshot localStorage di distinte e referti usati come source alternativa nei workflow web;
- fallback arbitro a snapshot/pilot data quando il manifest ufficiale è il percorso richiesto;
- fallback federazione a referti locali quando il backend espone già dati ufficiali;
- aggiornamento dei test che oggi codificano i comportamenti legacy;
- documentazione dello stato finale in cui backend, API pubbliche, manifest e snapshot ufficiali sono source of truth.

## Fonti domain-first da usare nell'audit preliminare

L'audit preliminare deve partire da queste fonti, in quest'ordine:

1. `refcheckid-docs/ARCHITECTURE/ARCH-1_Shared_Official_Photo_Storage.md`;
2. `docs/HANDOVER/ARCH-1_Milestone_D_Manager_Web_Migration.md`;
3. `refcheckid-docs/HANDOVER/ARCH-1_Milestone_E_Referee_Official_Manifest.md`;
4. `refcheckid-docs/HANDOVER/ARCH-1_Recovery-3_Closing_Audit.md`;
5. codice Web in `refcheckid-web/src/lib` e workflow in `refcheckid-web/src/features` limitatamente ai fallback legacy.

## Classificazione iniziale attesa

| Classe | Significato | Azione ammessa |
| --- | --- | --- |
| R4-CONF | Già conforme al dominio Recovery-4 | Nessuna modifica, solo verifica/test |
| R4-GAP | Gap confermato nel perimetro Recovery-4 | Implementazione mirata dopo approvazione |
| R4-DOC | Gap o ambiguità documentale | Aggiornamento documentale controllato |
| R4-RISK | Rischio tecnico o di dominio da isolare | Proposta mitigazione prima di implementare |
| R4-OOS | Fuori perimetro Recovery-4 | Nessuna implementazione nella recovery |

## Criteri di esclusione preliminare

Non rientrano nel kickoff Recovery-4, salvo decisione esplicita successiva:

- nuove feature Mobile o porting Mobile;
- nuove migrazioni dati non necessarie alla rimozione fallback;
- riprogettazione UX estesa;
- rimozione di dati demo ufficiali o script demo backend già descritti come bootstrap ARCH-1, purché restino confinati a fixture di test o bootstrap dimostrativo e non diventino fallback runtime;
- modifiche di dominio non presenti in ARCH-1.

## Deliverable prima dell'implementazione

Prima di modificare il codice Recovery-4 devono essere prodotti e approvati:

1. audit preliminare domain-first con riferimenti a documenti e file codice verificati;
2. inventario dei fallback legacy residui e dei test che li proteggono;
3. tabella attività classificata;
4. piano di implementazione limitato al perimetro;
5. piano test previsto;
6. elenco esplicito dei fuori perimetro;
7. verifica esplicita che dati demo/pilot restino solo fixture di test o bootstrap dimostrativo, mai fallback operativo del runtime.

## Stato kickoff

Kickoff preparato e Recovery-4 aperta in audit preliminare. L'audit e il piano sono tracciati in `ARCH-1_Recovery-4_Preliminary_Audit.md`. Implementazione Recovery-4 non avviata.
