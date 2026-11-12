# Catalogo unico delle discipline

La fonte unica è `refcheckid-backend/src/platform/sports.ts`, esportata come `refcheckid-backend/sports`. Contiene le 36 discipline richieste, raggruppate per famiglia, con identificativi stabili e nomi italiani. Calcio a 7 e a 8 hanno voci distinte; Quadball e il nome precedente Quidditch identificano la stessa disciplina.

Il catalogo alimenta il filtro del portale risultati, i selettori delle squadre e degli ufficiali, le validazioni delle importazioni e la tabella dei codici nella sezione Importazioni. È consultabile anche senza autenticazione tramite `GET /api/v1/public/sports`.

I codici esistenti `football`, `basketball` e `volleyball` sono conservati, quindi non occorre modificare competizioni o file già presenti. I file CSV/XLSX devono usare gli identificativi del catalogo, non i nomi tradotti; nell'interfaccia di importazione è presente l'elenco completo dei nomi e relativi codici. Le discipline non riconosciute vengono rifiutate.

## Catalogo e regolamenti

L'inserimento nel catalogo classifica una disciplina e ne permette selezione nei filtri, censimento delle squadre e abilitazioni degli ufficiali. Non dichiara automaticamente valido un regolamento o un processo di riconoscimento per ogni federazione e categoria.

Il campo `detailedResults` distingue le discipline il cui flusso completo di campionato, distinta ed eventi live è già configurato. Al momento sono calcio a 11, pallacanestro e pallavolo. La creazione dei campionati offre questi regolamenti; il server impedisce che una nuova disciplina erediti per errore le regole della pallavolo o di un altro sport.

Per attivare le altre discipline nei campionati live occorre definire i rispettivi regolamenti e verificarli: formazione e riserve, riconoscimento, tempi/set/inning/round, punteggi, falli o sanzioni, sostituzioni, parità e chiusura della gara. Le varianti della stessa famiglia hanno codici distinti e non ereditano automaticamente le regole della disciplina principale.

Non servono migrazioni, rinominazioni dei dati o nuove variabili d'ambiente per questo catalogo. La pubblicazione dei risultati resta subordinata ai consensi e ai controlli esistenti.

## Verifica dopo il deployment

1. In `/results`, aprire Disciplina: devono esserci Tutte e 36 discipline, comprese rugby, sport acquatici, varianti e Quadball.
2. Scegliere, per esempio, Rugby a 15: il filtro deve cercare solo quella disciplina. Se non ci sono campionati pubblicati il risultato vuoto è corretto.
3. Nella gestione delle squadre e degli ufficiali verificare lo stesso catalogo. In Importazioni aprire “Catalogo discipline e codici per importazione”.
4. I tre campionati già supportati devono mantenere nomi, dati e funzionamento precedenti. Le nuove discipline non devono avviare un regolamento live non ancora configurato.
