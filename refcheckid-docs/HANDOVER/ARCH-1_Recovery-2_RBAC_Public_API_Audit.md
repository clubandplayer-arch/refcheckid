# ARCH-1 Recovery-2 — RBAC, API pubbliche e Audit

**Stato:** Completata, validata e chiusa
**Data chiusura:** 2026-07-14
**Commit di chiusura:** `a8c3216 Complete Recovery-2 RBAC API audit hardening`

## Metodo applicato

Recovery-2 è stata chiusa con lo stesso metodo ufficializzato dopo Recovery-1:

1. audit domain-first su ARCH-1;
2. verifica puntuale del codice;
3. implementazione limitata alle non conformità confermate;
4. test di regressione e sicurezza;
5. audit conclusivo di chiusura.

L'intervento non modifica il dominio e non introduce funzionalità appartenenti a Recovery-3, Recovery-4 o Mobile.

## Decisioni ARCH-1 implementate

Recovery-2 implementa le decisioni ARCH-1 relative a:

- API sotto `/api/v1` protette da Bearer auth;
- autorizzazione basata su ruolo e relazione di dominio;
- manager limitato alla propria società;
- federazione limitata alla propria federazione;
- arbitro limitato alle gare assegnate;
- signed URL emesse solo dopo policy check;
- audit degli accessi e degli eventi sensibili;
- contratto pubblico OpenAPI allineato agli endpoint core definiti da ARCH-1.

## Non conformità chiuse

| ID | Non conformità | Stato |
| --- | --- | --- |
| R2-01 | RBAC globale troppo debole | Chiuso |
| R2-02 | Auth context privo di relazioni dominio | Chiuso |
| R2-03 | Spoofing tramite `photoContext` | Chiuso |
| R2-04 | Actor admin hardcoded sulla signed URL content route | Chiuso |
| R2-05 | Policy foto incompleta per arbitro | Chiuso |
| R2-06 | Fallback permissivo senza relazione verificabile | Chiuso |
| R2-07 | Endpoint audit foto non filtrato/scopato | Chiuso |
| R2-08 | Copertura audit minima ARCH-1 nel perimetro Recovery-2 | Chiuso |
| R2-09 | API pubbliche core non rappresentate come contratto | Chiuso |
| R2-10 | OpenAPI incompleta/non affidabile per Recovery-2 | Chiuso |

## Implementazione consegnata

### Auth Context domain-aware

`AuthContext` contiene ora gli scope di dominio necessari alle policy:

- `clubIds`;
- `federationIds`;
- `refereeIds`;
- `authorizedMatchIds`.

Gli utenti demo vengono risolti in un contesto autorizzativo esplicito e `/auth/me` restituisce gli scope disponibili al client.

### RBAC e `photoContext`

`photoContext` non accetta più ruolo, actor id, club id o federation id dal body/query della richiesta.

Il contesto foto deriva da `request.auth`; il club del tesseramento viene risolto dal backend usando i dati di tesseramento sincronizzati.

### Signed URL e policy foto

La generazione signed URL richiede una relazione verificabile tra:

- versione foto;
- tesseramento stagionale;
- ruolo dell'attore;
- scope club/federazione/match.

Per gli attori non admin, una versione foto priva di relazione stagionale verificabile produce `PhotoAuthorizationError` e audit `photo.access_denied`.

La policy include il caso arbitro, autorizzato solo se il match richiesto è incluso negli `authorizedMatchIds`.

### Audit

Sono stati aggiunti o resi operativi nel perimetro Recovery-2 gli eventi:

- `photo.signed_url_issued`;
- `photo.manifest_generated`;
- `photo.version_viewed_for_approval`;
- `photo.snapshot_served`;
- `photo.access_denied`.

Gli eventi `photo.manifest_acknowledged` e `photo.grant_revoked` sono presenti nel dominio, ma il relativo flusso operativo completo resta legato agli endpoint sync/grant definiti per milestone successive.

### API pubbliche e OpenAPI

Il router espone gli endpoint ARCH-1 core implementati e registra come contratti autenticati `501` gli endpoint già definiti da ARCH-1 ma non ancora implementati nel perimetro Recovery-2.

OpenAPI dichiara bearer security e distingue endpoint `implemented` da endpoint `defined`.

## Test di chiusura

Eseguiti con esito positivo:

- `pnpm -C refcheckid-backend test`;
- `pnpm -r test`;
- `pnpm -r lint`.

Note:

- `pnpm -r lint` completa con un warning Next.js preesistente su `<img>` in `federation-workflow.tsx`.
- È stato eseguito anche un comando errato `pnpm -C refcheckid-backend test -- --runInBand`; Vitest non supporta l'opzione Jest `--runInBand`, quindi il comando è stato corretto e rieseguito senza quell'opzione.

## Stato finale

Recovery-2 è ufficialmente **completata, validata e chiusa**.

Le verifiche finali del 2026-07-14 confermano merge su `main`, build verde, test verdi, lint verde e Quality Gate GitHub completamente verdi.

Non risultano attività ancora indispensabili per dichiarare chiuso l'ambito RBAC, API pubbliche core e audit.

## Prossima Recovery

La prossima attività architetturale può partire da:

**Recovery-3 — Workflow federazione**

Prima di qualsiasi modifica codice, Recovery-3 deve produrre audit preliminare e piano di lavoro da approvare. Il kickoff amministrativo è tracciato in `ARCH-1_Recovery-3_Kickoff.md`.

Seguendo lo stesso metodo:

1. audit domain-first;
2. classificazione delle attività;
3. implementazione limitata al perimetro Recovery-3;
4. audit conclusivo;
5. chiusura Recovery.
