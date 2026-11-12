# Profili, loghi, colori e verifica staging

## Cosa cambia

Il collegamento **Profilo e loghi** nella barra superiore apre `/profile`.

- **Dirigente**: sceglie il proprio club e carica il logo quando manca. Può aggiornare un logo caricato dal club; se il logo è stato inserito dalla federazione, soltanto la federazione può sostituirlo o rimuoverlo. Può modificare la presentazione del club, non i suoi dati anagrafici federali o quelli di altre società.
- **Federazione / lega**: imposta nome visualizzato, presentazione, sito HTTPS, logo e colori del proprio ente. I colori principali e il logo vengono usati nelle schermate degli affiliati del relativo ente. Non vengono modificati i colori semantici di errori o stati gara. Gli amministratori competenti possono gestire i loghi dei club da **Gestione ente → Società e squadre → Logo e profilo club**.
- **Ente arbitrale**: gli amministratori della propria organizzazione hanno un profilo ente con logo, colori e presentazione, accessibile anche dal collegamento nella gestione dell'ente. Non ottengono permessi su federazioni sportive estranee.
- **Arbitro**: può caricare la propria foto personale. Compare nell'intestazione dell'area personale e nella lista degli arbitri della struttura, per gli operatori autorizzati. Non viene pubblicata automaticamente nel portale pubblico.
- **Gare**: i loghi dei club compaiono nella verifica distinte dell'arbitro e nelle schede delle gare pubblicate nel portale risultati. Gli endpoint pubblici dei loghi verificano la pubblicazione: ritirando la competizione, anche le nuove letture dei loghi di quella gara vengono rifiutate.

La presentazione è separata dall'anagrafica federale: un nome visualizzato non cambia tesseramenti o nomi ufficiali nei calendari. La foto personale dell'arbitro non sostituisce una foto ufficiale per il riconoscimento. Restano invariati approvazione federale e limite annuale previsti per le foto ufficiali dei tesserati.

Se un account ha più enti, il selettore del profilo consente di modificarli soltanto entro i permessi assegnati. Il marchio nell’intestazione segue l’ente selezionato nella gestione e, per club e arbitri, la federazione associata; in assenza di un contesto selezionato usa il primo ente accessibile. Non è ancora una personalizzazione diversa per singola gara o delegazione territoriale. Dati e visibilità restano separati per ambito.

## Immagini e leggibilità

Sono ammessi PNG, JPEG e WebP. Il browser riduce il file scelto (massimo 10 MB) prima dell'invio; il server accetta al massimo 500 KiB, verifica il contenuto e produce un WebP 320×320 senza i metadati originali. SVG e formati non ammessi vengono respinti. Per gli enti il colore principale deve avere contrasto sufficiente con il testo bianco e lo sfondo deve essere chiaro. **Salva profilo** conserva logo e presentazione senza applicare i colori in modifica. Usare **Applica colori** per questi ultimi: un colore non leggibile viene rifiutato, lasciando intatto il logo già salvato. Gli errori sono evidenziati in cima al modulo.

I file restano nel bucket privato `refcheckid-photos`, sotto un prefisso dedicato. Non rendere pubblico il bucket e non aggiungere policy anonime. Il caricamento dei profili non usa il flusso di approvazione delle foto ufficiali. Le versioni precedenti dei file non vengono eliminate durante il salvataggio, per non compromettere un eventuale rollback; un'eventuale pulizia storage va gestita separatamente.

## Apertura della distinta

La rosa e lo staff vengono mostrati appena sono disponibili dati e distinta, senza attendere le richieste delle foto ufficiali di tutti i tesserati. Le immagini si completano in seguito. Se inizi a selezionare o ordinare i giocatori, l'arrivo delle foto non cancella le modifiche. La precompilazione di numeri e ruoli e le verifiche server di invio restano attive. Una connessione lenta al database può comunque richiedere alcuni secondi per i dati iniziali: questo intervento elimina l'attesa complessiva delle foto, non promette una durata fissa.

## Come sapere cosa manca su staging

Dagli screenshot precedenti possiamo confermare che accesso e pagine del deployment visitato funzionano. Non possiamo dedurre se la migrazione SQL o l'amministratore centrale siano stati configurati. Non sono state modificate credenziali, profili reali o database staging da questa sessione.

Dopo il nuovo deployment:

1. In Vercel aprire il deployment **Preview più recente del branch `codex/organization-platform-audit`**, attendere Ready e usare Visit. Ricostruire un deployment vecchio non introduce il codice nuovo.
2. Accedere come federazione e aprire **Profilo e loghi**. In fondo compare **Verifica configurazione del sito**. Mostra commit, ambiente dati, presenza dell'indice archivio, presenza del profilo admin e numero di competizioni pubblicate.
3. Se **Indice archivio eventi: presente**, questa verifica è superata. Se è mancante, eseguire nel SQL Editor del solo progetto Supabase RefCheckID staging il contenuto di `supabase/migrations/202611120001_result_archive_index.sql`. È un indice aggiuntivo, non cancella dati. Premere **Aggiorna verifica**.
4. Se **Amministratore pubblicazione: configurato**, un profilo applicativo admin abilitato esiste. Questo controllo non dimostra che la sua email sia verificata o che il login riesca: provarlo separatamente con quell'account. Se non è configurato, seguire la sezione “Creazione dell'amministratore centrale” in `RESULTS_NOTEBOOK_OPERATIONS.md`: creare/verificare l'utente Supabase Auth e associargli il profilo applicativo `admin` tramite lo script indicato. Non trasformare automaticamente in admin un dirigente o un arbitro; non condividere password o segreti in chat.
5. **Competizioni pubblicate: 0** è normale finché non avete deciso di pubblicare. Per attivarne una occorrono consenso della federazione e attivazione dell'amministratore in `/admin/publication`. Le istruzioni sono in `RESULTS_NOTEBOOK_OPERATIONS.md`.

Non serve una migrazione aggiuntiva per i profili: usano la tabella generica `refcheckid.entities` e lo storage privato già configurati. Non serve aggiungere variabili d'ambiente o collegamenti a servizi esterni. Il controllo indice è puntuale, non un audit completo di tutte le migrazioni storiche.

## Prove manuali

1. **Dirigente**: aprire la distinta; verificare che i giocatori compaiano mentre le foto finiscono di caricarsi. Selezionare giocatori e passare a Ordine prima dell'arrivo di tutte le foto: le scelte devono restare.
2. **Logo club**: caricare un PNG da Profilo e loghi, salvare, ricaricare; controllare il logo nell'intestazione. Provare anche da telefono.
3. **Federazione**: salvare il logo con **Salva profilo**, poi scegliere colore principale scuro e sfondo chiaro e premere **Applica colori**. Riaprire l'area dirigente dello stesso ente: deve ereditare il marchio. Un club di un altro ente non deve ereditarlo.
4. **Priorità federale**: inserire un logo club come federazione; il dirigente deve vedere un rifiuto se tenta di sostituirlo, ma deve poter aggiornare la descrizione.
5. **Arbitro**: caricare la propria foto, rientrare e verificarla nell'intestazione. La struttura arbitrale competente può consultarla dalla lista Arbitri. Un dirigente non può accedere al profilo di un arbitro estraneo.
6. **Loghi gara**: aprire la verifica distinte come arbitro; poi una gara pubblicata in `/results`. I loghi caricati devono essere visibili. Un club senza logo mantiene una scheda leggibile.
7. **Revoca pubblicazione**: ritirare il consenso di una competizione di prova; le nuove letture pubbliche di gara e loghi devono essere negate. Immagini già scaricate da terzi non possono essere ritirate dai loro dispositivi.
8. **Configurazione**: controllare il riquadro di verifica e provare il login dell'amministratore centrale. Non inviare referti reali né cambiare risultati reali per questi test.

Se il riquadro segnala l'indice mancante, il comando della migrazione è:

```sql
CREATE INDEX IF NOT EXISTS result_archive_fixture_revision
  ON refcheckid.entities ((document->>'fixtureId'), ((document->>'revision')::integer) DESC)
  WHERE repository='platform_updates';
```

`Success. No rows returned` è il risultato normale di questo comando. Tornare poi alla pagina del profilo e premere **Aggiorna verifica**. Non eseguire questo comando sul progetto Club and Player.

Verifiche del rilascio: 196 test backend, 109 frontend, controlli TypeScript/lint/build, pacchetto cloud isolato e flusso Chromium completo anche a 390 px di larghezza. Il test SQL verifica che il rilevamento dell'indice passi da assente a presente dopo l'applicazione della migrazione. Le prove creano utenti e dati soltanto in archivi temporanei locali.


## Gerarchia territoriale ed enti arbitrali autonomi

La pagina del profilo riguarda l’ente selezionato. La schermata **Attiva la gestione della tua federazione** collega la federazione già esistente al gestionale, conservandone identità e logo: non crea una delegazione.

Dopo l’attivazione, in **Gestione ente → Struttura** si aggiungono i livelli territoriali. Esempio: LND nazionale → Comitato regionale Sicilia → Delegazione provinciale Siracusa. Per aggiungere Siracusa scegliere Sicilia come struttura superiore; i campionati provinciali si associano alla delegazione competente. Non creare una nuova federazione per rappresentare ogni livello.

Gli enti arbitrali formano una gerarchia autonoma. Il flusso è:

1. L’amministratore centrale RefCheckID apre **Registro enti autonomi** (`/admin/organizations`) e registra l’ente arbitrale, poi invita il suo responsabile con il ruolo di amministratore dell’ente.
2. Quel responsabile gestisce sezioni, operatori e arbitri della propria organizzazione. Una lega non acquisisce questi permessi quando collega l’ente.
3. La lega apre **Deleghe**, seleziona un proprio campionato, un ente arbitrale già registrato, la sezione destinataria e una scadenza. Concede lettura della gara e designazioni, senza accesso ai referti.
4. Se l’ente non compare nell’elenco deve essere registrato dall’amministrazione della piattaforma. La lega non lo crea come propria sottostruttura.

Le organizzazioni già presenti e gli incarichi esistenti non vengono cancellati. Un’eventuale appartenenza amministrativa già assegnata resta esplicita e va verificata dall’amministrazione; nessuna nuova appartenenza viene creata dalla semplice delega.
