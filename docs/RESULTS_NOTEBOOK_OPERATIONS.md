# Referti riservati, taccuino e risultati ufficiali

## Rilascio e accessi

Queste istruzioni diventano operative dopo il deployment del branch corrente. Nessun account o dato reale viene creato dai test. Applicare prima le migrazioni precedenti della piattaforma e poi `supabase/migrations/202611120001_result_archive_index.sql`: aggiunge soltanto l'indice dell'archivio revisioni. Le competizioni restano private e i referti esistenti sono conservati.

Sul dominio staging:

| Funzione | Indirizzo | Accesso |
| --- | --- | --- |
| Portale ufficiale | https://refcheckid-staging.vercel.app/results | Pubblico, senza account |
| Singola gara | `/results/ID_GARA_PIATTAFORMA` | Solo se pubblicata |
| Arbitro | `/referee` | Account arbitro e designazione accettata |
| Taccuino | `/referee/notebook?fixtureId=ID_GARA_PIATTAFORMA` | Ufficiali autorizzati alla gara |
| Referto autore | `/referee/report?fixtureId=ID_GARA_PIATTAFORMA` | Arbitro principale autore |
| Gestione federazione | `/federation` | Account federale e ambito assegnato |
| Referto federale | `/federation/reports?fixtureId=ID_GARA_PIATTAFORMA` | Federazione competente con permesso referti |
| Distribuzione | `/admin/publication` | Amministratore centrale piattaforma |

L'ID gara è quello della piattaforma, presente nei collegamenti di gestione; non sostituirlo con l'ID della distinta o con il numero di giornata.

## Confini di accesso

Il referto contiene le note riservate dell'arbitro e ha un endpoint distinto. Lo leggono l'arbitro principale con incarico accettato e valido e la federazione sportiva competente. Per il personale federale si può usare il ruolo `report_reader` limitato all'ambito necessario; anche `competition_manager` e `org_admin` possiedono il permesso referti nel proprio ambito. I profili federali preesistenti mantengono l'accesso alla propria federazione.

Una delega di designazione, l'appartenenza a una sezione arbitrale, un incarico di assistente o la lettura dei risultati non conferiscono accesso ai referti. L'amministratore centrale della pubblicazione non riceve automaticamente accesso ai referti né il potere di omologare i risultati. Per consultare referti deve avere anche un'esplicita appartenenza alla federazione sportiva competente.

L'archivio eventi conserva le revisioni del risultato e degli eventi, separatamente dal referto. Il contesto gara espone soltanto lo stato del referto. Il portale usa una proiezione pubblica dedicata: non legge il repository referti, non espone note riservate, documenti, codici fiscali, date di nascita, identificativi interni dei tesserati o autori delle modifiche. Anche gli endpoint legacy di referto e audit applicano il controllo riservato.

## Uso del taccuino

1. Accedere come arbitro, accettare la designazione e completare il riconoscimento della distinta.
2. Dalla gara aprire **Taccuino digitale**. L'arbitro principale avvia il cronometro; può metterlo in pausa, riprenderlo o sospendere la gara.
3. Selezionare squadra, giocatore ed evento. Il minuto viene proposto dal cronometro ed è modificabile. Le azioni disponibili seguono lo sport: gol/cartellini/sostituzioni, punti basket, set e sostituzioni per la pallavolo.
4. Con l'invio automatico attivo, gli eventi registrati vengono trasmessi come provvisori. Gli ufficiali di supporto autorizzati possono contribuire ai provvisori; la conferma del periodo e il finale spettano all'arbitro principale.
5. Confermare la fine del periodo e, alla conclusione, la fine della gara. Il finale non può tornare provvisorio. Per correggere eventi già confermati occorre una motivazione di almeno 20 caratteri; rimane una nuova revisione nell'archivio.
6. Compilare e inviare separatamente il referto riservato. Dopo l'invio è in sola lettura. La federazione competente lo apre dal collegamento riservato nei risultati.

Aprire il taccuino online prima della gara. Durante una perdita di connessione gli eventi vengono conservati nel browser come bozza/operazione in attesa; si possono aggiungere altri eventi mentre la precedente operazione attende l'invio. Il ritorno online ritenta le operazioni senza duplicarle. Non cancellare i dati del browser o cambiare dispositivo prima della sincronizzazione. Dopo una chiusura o ricarica offline, la coda rimane ma il caricamento della rosa può richiedere nuovamente la rete. I comandi del cronometro richiedono connessione: non è una PWA offline completa. Il portale può aggiornarsi solo dopo la ricezione effettiva da parte del server.

## Pubblicazione: due decisioni separate

1. La federazione seleziona organizzazione, ambito e competizione in **Gestione ente → Pubblicazione**. Autorizza la diffusione e, separatamente, eventi e nomi. I nomi sono disabilitati per impostazione iniziale.
2. L'amministratore piattaforma entra in `/admin/publication`, seleziona la competizione e sceglie **pubblico**, eventuale aggiornamento live, eventi e nomi. Senza il consenso corrispondente l'attivazione viene rifiutata.
3. Visitare `/results` senza autenticazione. Se non è pubblicata alcuna competizione il portale resta vuoto.

Il consenso della federazione da solo non pubblica. La revoca disabilita immediatamente le nuove letture pubbliche e non si annulla automaticamente quando il consenso viene ripristinato. I contenuti già scaricati da terzi non possono essere ritirati dai loro dispositivi. Pubblicare significa renderli accessibili a chiunque: non è un canale privato per un sito partner.

Con **live** attivo vengono mostrati anche aggiornamenti provvisori. Disattivandolo, durante la gara resta visibile l'ultimo aggiornamento confermato. Il portale distingue attesa, gara in corso, intervallo, sospensione e termine; distingue inoltre risultato provvisorio, confermato dall'arbitro e omologato dalla federazione. La lettura viene aggiornata ogni 5 secondi: non costituisce una garanzia di latenza. In assenza di rete viene segnalato il mancato aggiornamento.

Il consenso ai nomi va attivato solo con le autorizzazioni effettivamente necessarie, anche per i minori: una casella nell'applicazione non crea tali autorizzazioni. Nessuna API commerciale, credenziale partner, fatturazione o distribuzione a siti terzi viene attivata da questo rilascio.

## Creazione dell'amministratore centrale

Non usare un invito a un'organizzazione per creare l'amministratore centrale. Creare e verificare prima un utente reale in Supabase Auth con email dedicata, per esempio un indirizzo amministrativo controllato da voi; scegliere la password attraverso il flusso sicuro del provider.

Su una macchina amministrativa con `DATABASE_URL` già configurata nell'ambiente sicuro, creare un file JSON locale (senza password o token):

```json
{
  "id": "UUID_UTENTE_SUPABASE_AUTH",
  "actorId": "NUOVO_UUID_ATTORE",
  "email": "EMAIL_REALE_VERIFICATA",
  "displayName": "Amministrazione pubblicazione",
  "role": "admin",
  "enabled": true,
  "clubIds": [],
  "federationIds": [],
  "refereeIds": [],
  "authorizedMatchIds": []
}
```

Eseguire dalla repository:

```sh
pnpm -C refcheckid-backend supabase:profile /percorso/assoluto/profilo.json
```

Lo script verifica che UUID ed email corrispondano all'utente Auth. Accedere poi dal sito con quell'email: il profilo admin viene indirizzato a `/admin/publication`. Le liste vuote sono intenzionali: questo utente gestisce la diffusione, senza ottenere i referti delle federazioni.

Per prove manuali servono un account federale proprietario, un arbitro designato e questo amministratore. Si possono usare email di test sotto un dominio controllato da voi, evitando dati personali reali. Non sono necessarie email per i visitatori del portale. I test automatici creano identità finte esclusivamente in database temporanei locali; non forniscono credenziali valide su staging.
