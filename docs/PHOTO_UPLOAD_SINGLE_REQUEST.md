# Foto tesserati: caricamento, motivazione e richiesta unica

## Comportamento

La distinta mostra la rosa senza attendere tutte le immagini. Finché i metadati non sono disponibili compare **Caricamento foto…**, non Missing. Un errore di lettura viene distinto dall'assenza effettiva della foto e impedisce di iniziare un caricamento con regole annuali sconosciute. La decodifica dell'immagine ha a sua volta un indicatore di caricamento.

Il client richiede stati e policy fotografiche in blocchi da massimo 100 tesseramenti, separatamente per giocatori e staff: per una rosa ordinaria si usano due richieste di metadati invece di una per tesserato. Le immagini della rosa sono miniature private da 320 px. La latenza reale dipende anche da rete, avvio delle funzioni e creazione iniziale delle miniature: non viene garantito un tempo fisso sul dispositivo.

Le foto ufficiali seguono sempre l'approvazione federale. Il primo caricamento non consuma il cambio annuale. Dopo un cambio approvato nello stesso anno, il cambio aggiuntivo richiede una motivazione di almeno 20 caratteri prima di avviare l'upload. La UI mostra il campo soltanto quando richiesto e disabilita l'invio finché non è completo. Il server ricontrolla la regola sia prima dell'upload sia al completamento.

Un tesserato con richiesta pendente non può crearne un'altra. Il blocco sul server verifica il tesseramento e le versioni della persona, all'interno della transazione di comando già serializzata. Due intenti ottenuti prima del primo completamento non possono produrre due richieste: il secondo completamento viene respinto. Ripetere il completamento dello stesso upload restituisce la stessa versione. Nel browser un blocco immediato e il pulsante disabilitato proteggono anche dal doppio tocco.

Quando si decide una richiesta, eventuali doppioni pendenti preesistenti per lo stesso tesseramento, stagione e federazione vengono annullati; le relative versioni ancora pendenti vengono respinte. Gli identificativi restituiti consentono al client di rimuovere quelle schede dalla pagina senza ricaricare tutta la coda. Non vengono cancellate o riscritte decisioni storiche già approvate o rifiutate. Un rifiuto lascia invariata l'ultima foto ufficialmente approvata.

## Accesso

`GET /api/v1/platform/club-photo-roster/:id?registrations=UUID,UUID` è riservato al dirigente del club richiesto e usa una transazione di sola lettura. Verifica ogni tesseramento prima di restituire metadati o URL firmati. Non consente di leggere altre società o di cercare persone per nominativo. Gli URL delle miniature sono temporanei e lo storage resta privato.

## Loghi

Nell'area dirigente il logo club occupa l'intestazione principale (80 px su telefono, 96 px su schermi più ampi). Il logo federale compare in una fascia separata, allineato a destra, con il nome e la dicitura **Federazione di appartenenza** (64/80 px). Non sono più affiancati come se fossero un unico marchio.

## Verifiche manuali dopo il deployment

1. Su smartphone aprire la distinta: prima dei metadati deve apparire Caricamento foto…, poi lo stato effettivo. Verificare che i giocatori restino selezionabili durante il caricamento.
2. Per una persona che ha già utilizzato il cambio annuale, selezionare una foto: deve apparire subito la motivazione obbligatoria nella preview, prima dell'invio. Con motivo vuoto o breve il pulsante resta disabilitato.
3. Compilare il motivo, inviare e provare un doppio tocco: nel filtro federale In attesa deve esserci una sola nuova richiesta per quella persona. Dal dirigente deve risultare Richiesta già in attesa.
4. Rifiutare una richiesta di prova: la foto ufficiale deve restare quella precedente. Approvare una richiesta di prova soltanto se si intende davvero sostituire la foto.
5. Se esistevano doppioni precedenti, decidere una richiesta: gli altri pendenti dello stesso tesseramento e stagione devono chiudersi, mantenendo lo storico delle decisioni già definitive.
6. Verificare intestazione club e fascia federale sia da telefono sia da desktop.

Non occorrono nuove migrazioni o variabili d'ambiente. Nessun database staging, foto reale o decisione reale è stato modificato durante lo sviluppo: le prove usano archivi temporanei.
