# Checklist italiana — persistenza e riavvio dello stato operativo

Questo documento indica **cosa è già controllato automaticamente** e **cosa deve ancora essere
verificato manualmente** prima del merge della PR.

Legenda:

- `[x]` controllo automatico già superato;
- `[ ]` controllo manuale ancora da eseguire;
- non trasformare `[ ]` in `[x]` finché il risultato non è stato verificato realmente.

## 1. Ambito e limiti della soluzione

`REFCHECKID_RUNTIME_STATE_ROOT` configura un adapter JSON locale destinato allo sviluppo e alle
dimostrazioni con **un solo processo backend**. La sostituzione atomica dei file evita di lasciare
un file scritto solo in parte, ma non offre transazioni tra più file, locking tra processi o
scritture sicure da più istanze contemporanee. Prima di eseguire il backend su più istanze, la
persistenza operativa deve essere trasferita sull'architettura SQL.

Fotografie e stato operativo restano separati:

- `REFCHECKID_RUNTIME_STATE_ROOT`: anagrafiche e stato operativo;
- `REFCHECKID_PHOTO_METADATA_ROOT`: metadati fotografici;
- `REFCHECKID_PHOTO_STORAGE_ROOT`: file binari delle fotografie.

Audit e staging dell'importazione federale sono persistenti perché rappresentano informazioni e
lavoro dell'utente che non devono scomparire dopo un normale riavvio. La consegna degli eventi di
dominio interni al processo rimane invece transitoria.

## 2. Controlli automatici già coperti

Il test `refcheckid-backend/tests/integration/runtime-state-restart.integration.test.ts` crea un
container A, completa il flusso, crea un container B sulle stesse root e verifica quanto segue.

### Persistenza anagrafica

- [x] Federazione.
- [x] Società di casa e società ospite.
- [x] Giocatori delle due società.
- [x] Tesseramenti dei giocatori.
- [x] Membri dello staff delle due società.
- [x] Tesseramenti dello staff.
- [x] Arbitro.

### Persistenza della gara e delle distinte

- [x] Gara e relativo stato `completed`.
- [x] Distinta di casa e distinta ospite.
- [x] Stato `locked` di entrambe le distinte.
- [x] Giocatori inseriti nelle distinte.
- [x] Staff inserito nelle distinte.
- [x] `lineupOrder`.
- [x] Ruolo di portiere (`isGoalkeeper`).
- [x] Ruolo di capitano (`isCaptain`).
- [x] Ruolo di vicecapitano (`isViceCaptain`).

### Persistenza del riconoscimento e del referto

- [x] Workflow del riconoscimento.
- [x] Riconoscimenti individuali di un giocatore e di un membro dello staff.
- [x] Chiusura del riconoscimento con stato `locked`.
- [x] Contenuto disponibile nel campo `summary` del referto.
- [x] Stato `submitted` del referto.
- [x] Stato conclusivo `completed` della gara.

### Persistenza fotografica verificata automaticamente

- [x] Snapshot congelati della distinta di casa.
- [x] Snapshot congelati della distinta ospite.
- [x] Copertura di giocatore e staff in ciascuna distinta: due snapshot per distinta.
- [x] Permanenza dei byte di un oggetto fotografico nella stessa photo storage root.
- [x] Separazione tra runtime root, photo metadata root e photo storage root.

> **Attenzione:** il test automatico non dimostra ancora che una fotografia ufficiale reale e i
> suoi metadati completi restino collegati correttamente al manifest dopo un riavvio. Questa parte,
> insieme alla protezione effettiva dello script `demo:init`, deve essere controllata manualmente.

### Riavvio verificato automaticamente

- [x] Il container B viene creato dopo aver completato il lavoro nel container A.
- [x] Il container B usa le stesse tre persistence root.
- [x] Prima delle verifiche sul container B non viene eseguito `demo:init`.
- [x] Il workflow è ancora leggibile e utilizzabile dal container B.
- [x] Una terza costruzione del container non sostituisce gli stati terminali con i dati pilot di
      fallback.

## 3. Controllo manuale passo per passo prima del merge

### 3.1 Preparazione sicura

1. Aprire un terminale nel Codespace e posizionarsi nella repository:

   ```bash
   cd /workspaces/refcheckid
   git status --short --branch
   ```

2. Verificare che non compaiano file modificati, foto, backup o JSON di runtime non tracciati.
3. Non usare le directory che contengono le sette fotografie recuperate. Creare tre root di prova
   separate:

   ```bash
   export REFCHECKID_RUNTIME_STATE_ROOT=/tmp/refcheckid-manual-runtime
   export REFCHECKID_PHOTO_METADATA_ROOT=/tmp/refcheckid-manual-photo-metadata
   export REFCHECKID_PHOTO_STORAGE_ROOT=/tmp/refcheckid-manual-photo-storage
   ```

4. Stampare le root per evitare di provare accidentalmente sullo storage reale:

   ```bash
   printf '%s\n' \
     "$REFCHECKID_RUNTIME_STATE_ROOT" \
     "$REFCHECKID_PHOTO_METADATA_ROOT" \
     "$REFCHECKID_PHOTO_STORAGE_ROOT"
   ```

### 3.2 Preparazione del container A

1. Avviare l'applicazione con le tre variabili appena impostate.
2. Eseguire `demo:init` **una sola volta** per preparare i dati iniziali della prova.
3. Accedere come dirigente di casa e compilare la distinta di casa.
4. Controllare ordine, portiere, capitano, vicecapitano e staff; quindi inviare la distinta.
5. Accedere come dirigente ospite e ripetere gli stessi controlli sulla distinta ospite.
6. Accedere come arbitro, verificare che entrambe le distinte siano bloccate e che il manifest
   fotografico mostri i soggetti previsti.
7. Avviare il riconoscimento, registrare gli esiti e chiuderlo.
8. Compilare il referto, controllarne il riepilogo e inviarlo.
9. Accedere come Federazione e verificare gara completata e referto ricevuto.

Annotare prima del riavvio:

- numero di giocatori e membri dello staff nelle due distinte;
- ordine e ruoli della lineup;
- numero di soggetti nel manifest;
- foto visibili;
- stato del riconoscimento;
- risultato e contenuto del referto;
- stato della gara.

### 3.3 Riavvio e container B

1. Arrestare completamente backend e frontend.
2. Riavviare l'applicazione mantenendo le stesse tre variabili d'ambiente.
3. **Non eseguire `demo:init`.**
4. Accedere come dirigente di casa e verificare distinta, ordine, ruoli, staff e foto.
5. Accedere come dirigente ospite ed eseguire gli stessi controlli.
6. Accedere come arbitro e verificare:
   - entrambe le distinte ancora `locked`;
   - manifest congelato disponibile e completo;
   - fotografie corrette;
   - riconoscimento ancora chiuso;
   - nessun falso errore `409`.
7. Accedere come Federazione e verificare:
   - gara ancora completata;
   - referto ancora inviato;
   - risultato, eventi e note invariati;
   - storico e audit disponibili.

Se tutti i valori coincidono con quelli annotati prima del riavvio, marcare:

- [ ] Container A arrestato e container B avviato sulle stesse root.
- [ ] Nessun `demo:init` eseguito prima delle verifiche del container B.
- [ ] Anagrafiche e tesseramenti invariati.
- [ ] Entrambe le distinte, lineup e staff invariati.
- [ ] Manifest congelato completo e fotografie corrette.
- [ ] Riconoscimento ancora chiuso e utilizzabile.
- [ ] Referto e stato conclusivo della gara invariati.

### 3.4 Verifica finale di `demo:init`

Solo dopo aver completato tutte le verifiche del container B:

1. Eseguire una volta `pnpm demo:init` mantenendo le stesse root di prova.
2. Ricaricare con hard refresh le aree Manager, Arbitro e Federazione.
3. Verificare che il bootstrap:
   - non duplichi federazioni, società, giocatori, staff o tesseramenti;
   - non sostituisca le fotografie;
   - non riapra le distinte `locked`;
   - non riporti il riconoscimento a `not_started`;
   - non riporti il referto a `draft`;
   - non riporti la gara a `scheduled`.

Se tutti questi controlli passano, marcare:

- [ ] `demo:init` non ha duplicato anagrafiche o tesseramenti.
- [ ] `demo:init` non ha sostituito fotografie o metadati fotografici.
- [ ] `demo:init` non ha modificato manifest o distinte bloccate.
- [ ] `demo:init` non ha fatto regredire riconoscimento, referto o gara.

## 4. Quality gate e controllo Git

Eseguire dalla root della repository:

```bash
pnpm lint
pnpm test:unit
pnpm test:integration
pnpm test:e2e
pnpm test:regression
pnpm test:security
pnpm build
pnpm coverage
pnpm smoke
git diff --check origin/main...HEAD
git status --short --branch
```

Marcare soltanto dopo l'esito positivo:

- [ ] Quality gate completo superato.
- [ ] `git diff --check origin/main...HEAD` senza output.
- [ ] Working tree pulita.
- [ ] Nessuna fotografia, directory di backup o file JSON runtime incluso in Git.

## 5. Condizione per rendere la PR pronta

La Draft PR può diventare **Ready for review** soltanto quando:

- tutti i controlli automatici restano verdi;
- tutte le caselle manuali delle sezioni 3 e 4 sono state realmente verificate;
- gli eventuali commenti inline della PR sono risolti;
- il branch remoto contiene tutti i commit e la working tree è pulita.
