# ARCH-1 Recovery-3 — Kickoff workflow federazione

**Stato:** In attesa di approvazione audit preliminare e piano di lavoro
**Data preparazione:** 2026-07-14
**Ambito:** workflow federazione ARCH-1, senza modifiche codice prima dell'approvazione.

## Premessa operativa

Recovery-3 non è ancora iniziata a livello implementativo. Questo documento prepara il kickoff e fissa il metodo di lavoro da approvare prima di qualsiasi modifica al codice.

Recovery-1 e Recovery-2 sono considerate chiuse. Recovery-3 parte solo dopo approvazione esplicita dell'audit preliminare e del piano operativo.

## Metodo consolidato

Recovery-3 seguirà lo stesso metodo applicato alle recovery precedenti:

1. **Audit domain-first** su ARCH-1 e documentazione corrente.
2. **Classificazione delle attività** in conformità, non conformità, gap documentali, rischi e fuori perimetro.
3. **Implementazione limitata al perimetro Recovery-3**, senza anticipare Recovery-4 o Mobile.
4. **Audit conclusivo** su codice, contratti, test e documentazione.
5. **Chiusura Recovery** con handover, test finali, commit e PR.

## Perimetro preliminare Recovery-3

Il perimetro preliminare riguarda il workflow federazione collegato alle foto ufficiali ARCH-1:

- coda federale delle approvazioni foto;
- dettaglio richiesta con confronto tra foto corrente e proposta;
- comandi espliciti di approvazione e rigetto;
- stati federali `pending`, `approved`, `rejected`, `cancelled` ed eventuale scadenza dove già prevista dai contratti;
- audit degli eventi di decisione federale;
- rispetto degli scope federazione già consolidati in Recovery-2;
- allineamento OpenAPI/contratti agli endpoint effettivamente operativi nel perimetro.

## Fonti domain-first da usare nell'audit preliminare

L'audit preliminare dovrà partire da queste fonti, in quest'ordine:

1. `refcheckid-docs/ARCHITECTURE/ARCH-1_Shared_Official_Photo_Storage.md`;
2. `refcheckid-docs/HANDOVER/ARCH-1_Milestone_A_Backend_Data_Model_API_Contracts.md`;
3. `refcheckid-docs/HANDOVER/ARCH-1_Recovery-2_RBAC_Public_API_Audit.md`;
4. `refcheckid-docs/HANDOVER/Manager_Photo_Audit.md`;
5. `refcheckid-docs/HANDOVER/Mobile_Handover_Package.md`, solo come riferimento di parità funzionale futura, non come autorizzazione a modifiche Mobile.

## Classificazione iniziale attesa

Durante l'audit preliminare ogni elemento dovrà essere classificato come:

| Classe | Significato | Azione ammessa |
| --- | --- | --- |
| R3-CONF | Già conforme al dominio Recovery-3 | Nessuna modifica, solo verifica/test |
| R3-GAP | Gap confermato nel perimetro Recovery-3 | Implementazione mirata dopo approvazione |
| R3-DOC | Gap o ambiguità documentale | Aggiornamento documentale controllato |
| R3-RISK | Rischio tecnico o di dominio da isolare | Proposta mitigazione prima di implementare |
| R3-OOS | Fuori perimetro Recovery-3 | Nessuna implementazione nella recovery |

## Criteri di esclusione preliminare

Non rientrano nel kickoff Recovery-3, salvo decisione esplicita successiva:

- modifiche Mobile;
- eliminazione dei fallback legacy, riservata a Recovery-4;
- migrazioni dati non richieste dal workflow federale minimo;
- modifiche di dominio non presenti in ARCH-1;
- feature UX non necessarie a coda, dettaglio, approve/reject e audit federale.

## Deliverable prima dell'implementazione

Prima di modificare il codice Recovery-3 dovranno essere prodotti e approvati:

1. audit preliminare domain-first con riferimenti a documenti e file codice verificati;
2. tabella delle attività classificate;
3. piano di implementazione limitato al perimetro;
4. piano test previsto;
5. elenco esplicito dei fuori perimetro.

## Stato kickoff

Kickoff preparato. Implementazione Recovery-3 non avviata.
