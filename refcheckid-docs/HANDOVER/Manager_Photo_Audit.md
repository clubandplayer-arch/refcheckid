# Audit gestione foto dirigente — giocatori e staff

## Perimetro attuale

L'attività foto del dirigente è implementata nel frontend della distinta gara. Il flusso copre sia i giocatori sia lo staff: il dirigente può aggiungere una foto quando manca, oppure proporre una modifica quando una foto è già presente.

Il sistema attuale è una persistenza pilota/browser-side: le foto caricate dalla UI dirigente non vengono inviate a un bucket o a un repository file condiviso, ma vengono salvate nel `localStorage` del browser che effettua il caricamento.

## Dove viene salvata la foto

Quando il dirigente seleziona o scatta una foto, il browser la legge come Data URL, apre una preview di ritaglio e, alla conferma, produce un JPEG in formato 300x400 tramite canvas.

La destinazione dipende dallo stato della foto precedente:

- **Foto mancante**: la nuova immagine è considerata subito approvata per il pilota e viene salvata nella mappa `localStorage` per squadra.
  - Chiave home: `refcheckid.managerPhotos.home`
  - Chiave away: `refcheckid.managerPhotos.away`
- **Foto già presente**: la nuova immagine non sostituisce subito quella corrente. Viene salvata come richiesta di approvazione nella chiave `refcheckid.photoApprovalRequests`, con foto attuale e foto proposta.

## Come viene gestita la modifica fino al confronto

Quando il dirigente modifica una foto già presente, il sistema crea una richiesta con questi dati logici:

- squadra/club del dirigente;
- soggetto interessato, giocatore o membro staff;
- nome visualizzato del soggetto;
- foto corrente;
- foto proposta;
- timestamp della richiesta;
- stato `pending`.

Finché la Federazione non approva, la distinta e il riconoscimento continuano a usare la foto corrente. La foto proposta resta disponibile nell'area federazione come richiesta pendente, così l'operatore può confrontare foto corrente e foto proposta e decidere se approvare o rifiutare.

Se la richiesta viene approvata, la foto proposta viene promossa nella mappa approvata `refcheckid.managerPhotos.<team>` e diventa la foto usata nei roster e nel riconoscimento. Se viene rifiutata, resta valida la foto corrente.

## Perché su mobile non si vede dove sono le foto caricate

Il comportamento è coerente con l'implementazione attuale: il `localStorage` è locale al browser e al dispositivo. Una foto caricata da desktop resta nel browser desktop; una foto caricata da mobile resta nel browser mobile. Non esiste ancora una sincronizzazione server-side delle immagini caricate dal dirigente.

Quindi la repository/app mobile non può "vedere" le foto se:

- la foto è stata caricata su un altro dispositivo;
- il browser mobile usa un profilo diverso;
- la cache/localStorage è stato cancellato;
- la build mobile si aspetta un URL remoto o un bucket condiviso invece di un Data URL locale.

## Gap architetturale da chiudere

Per rendere le foto disponibili su tutti i dispositivi serve spostare la persistenza da browser a backend/storage condiviso:

1. creare un endpoint di upload foto per giocatori e staff;
2. salvare il file in uno storage applicativo, ad esempio bucket Supabase Storage;
3. salvare nel database il riferimento stabile alla foto, ad esempio `storagePath`, `subjectId`, `subjectType`, `clubId`, `status`;
4. restituire al frontend un URL firmato o pubblico controllato dalle policy;
5. usare lo stesso record anche per la coda di confronto Federazione;
6. aggiornare mobile/web perché leggano la stessa fonte remota invece del `localStorage` locale.

## Raccomandazione operativa

Per il pilota, il flusso è valido per dimostrare caricamento, ritaglio, richiesta di approvazione e confronto. Per produzione o test multi-dispositivo, invece, va introdotto storage remoto: altrimenti le foto caricate dal dirigente non sono condivise tra desktop, mobile, arbitro e federazione.
