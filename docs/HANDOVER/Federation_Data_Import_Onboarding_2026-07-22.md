# Federation Data Import & Onboarding — Decisione operativa 2026-07-22

## Stato

Decisione funzionale approvata per impostare la prossima milestone di prodotto. Questo documento corregge la priorità emersa dopo la validazione del workflow foto: prima di hardening foto/mobile/offline serve progettare e realizzare il caricamento federale dei dati reali.

## Principio guida

RefCheckID deve essere alimentato dalla Federazione/Ente come source of truth operativo per:

- società/squadre iscritte;
- tesserati;
- staff;
- arbitri;
- calendari gare;
- designazioni arbitrali.

Dirigenti e società non importano dati anagrafici o calendario. I dirigenti possono lavorare sui dati federali già presenti e, nel perimetro attuale, possono aggiornare/proporre foto ufficiali. Non possono creare o importare anagrafiche ufficiali.

## Decisioni approvate

### 1. Formati import

- Primo formato supportato: **CSV**.
- Secondo formato: **XLSX**, da supportare subito dopo o insieme al CSV se l'impatto tecnico resta contenuto.

### 2. Ruoli autorizzati

- Può importare solo la **Federazione/Ente/Admin federale**.
- Il dirigente non può importare dati, né ora né in seguito nel perimetro deciso.
- Il dirigente può al massimo aggiornare o proporre foto, secondo il workflow foto già implementato.

### 3. Società non esistente

- Di base una società esiste solo quando viene caricata dalla Federazione.
- Import calendario, tesserati o designazioni che referenziano una società non presente devono generare errore bloccante o richiesta di risoluzione manuale.
- Il sistema non deve creare automaticamente società implicite da un file calendario/tesserati senza conferma esplicita della Federazione.

### 4. Tesserato già presente

- Il sistema deve riconoscere il tesserato tramite codice tessera/federale e, quando disponibile, codice fiscale.
- Se il tesserato è già presente, l'import deve poter aggiornare la posizione/anagrafica ammessa senza duplicare il soggetto.
- Gli aggiornamenti devono essere tracciati nel report import e auditati.

### 5. Cambio società / mercato / nuova stagione

- Il cambio società è un caso ordinario e deve essere supportato.
- Esempi attesi:
  - mercato di riparazione di dicembre;
  - cambio squadra nella stagione successiva;
  - aggiornamento stato tesseramento.
- Il sistema non deve cancellare la storia precedente: deve chiudere/aggiornare la registrazione stagionale precedente e creare/aggiornare la nuova posizione mantenendo storico e audit.

### 6. Reimport dello stesso file

- L'import deve essere idempotente.
- Reimportare lo stesso file non deve creare duplicati.
- Il report deve distinguere almeno:
  - record già presenti;
  - record nuovi;
  - record aggiornati;
  - record invariati;
  - record con warning;
  - record con errori bloccanti.
- Gli aggiornamenti devono essere applicati solo se i dati sono realmente cambiati.

## Tipi di import da supportare

### Società / squadre

Import per creare o aggiornare società/squadre gestite dalla Federazione.

Campi minimi consigliati:

- codice società federale;
- nome società/squadra;
- stato;
- stagione o competizione, se applicabile.

Campi opzionali:

- codice fiscale/P.IVA;
- email referente;
- telefono;
- indirizzo;
- comune/provincia;
- categoria/campionato/girone.

### Tesserati generale

Import dell'elenco generale dei tesserati della Federazione, anche non filtrato per società.

Campi minimi consigliati:

- codice tessera/codice federale tesserato;
- nome;
- cognome;
- data nascita.

Campi consigliati:

- codice fiscale;
- luogo nascita;
- stato tesseramento.

### Tesserati per società

Import dell'elenco tesserati di una singola società oppure file generale con codice società per riga.

Modalità supportate:

1. **File per singola società**: la Federazione seleziona società e stagione prima dell'upload; il file può non contenere il codice società.
2. **File multi-società**: ogni riga contiene codice società e codice tesserato.

Campi minimi consigliati:

- codice tessera/codice federale;
- nome;
- cognome;
- data nascita;
- codice società, se file multi-società;
- stagione;
- stato posizione/tesseramento.

### Staff

Import anagrafica e posizione staff per società/stagione.

Campi minimi consigliati:

- codice staff/tessera;
- nome;
- cognome;
- ruolo;
- codice società o società selezionata nel contesto import;
- stagione;
- stato.

### Arbitri

Import anagrafica arbitri abilitati dalla Federazione.

Campi minimi consigliati:

- codice arbitro;
- nome;
- cognome;
- stato.

Campi opzionali:

- codice fiscale;
- email;
- sezione;
- qualifica/categoria.

### Calendario gare

Import calendario ufficiale.

Campi minimi consigliati:

- codice gara, se disponibile;
- stagione;
- data;
- ora;
- società/squadra casa;
- società/squadra ospite.

Campi opzionali:

- campo/impianto;
- comune;
- giornata/turno;
- categoria/campionato/girone;
- arbitro designato, se già incluso nel calendario;
- note.

### Designazioni arbitrali

Import designazioni su calendario già esistente oppure insieme al calendario.

MVP:

- una gara può avere un arbitro principale designato.

Evoluzione futura:

- più ufficiali di gara con ruoli distinti e storico sostituzioni.

Campi minimi consigliati:

- codice gara o chiave gara risolvibile;
- codice arbitro;
- ruolo, se presente;
- stato designazione.

## Riconoscimento automatico del file

Il sistema deve poter aiutare la Federazione a riconoscere il contenuto caricato, ma senza decidere in modo irrevocabile al posto dell'operatore.

Comportamento richiesto:

1. L'operatore può scegliere prima il tipo import.
2. RefCheckID analizza comunque intestazioni e valori del file.
3. Se il file sembra coerente, procede alla mappatura colonne.
4. Se il file sembra di tipo diverso, mostra warning e chiede conferma/correzione.
5. Se il file è ambiguo, obbliga l'operatore a scegliere il tipo import.

Esempi di riconoscimento:

- colonne `codice società`, `denominazione`, `codice fiscale` → probabile import società;
- colonne `numero tessera`, `nome`, `cognome`, `data nascita` → probabile import tesserati;
- colonne `data gara`, `ora`, `casa`, `ospite`, `campo` → probabile calendario;
- colonne `codice gara`, `codice arbitro`, `ruolo` → probabile designazioni.

## Mapping colonne

Ogni Federazione può esportare colonne con nomi diversi. RefCheckID deve proporre un mapping automatico, ma l'operatore deve poterlo correggere prima della validazione finale.

Esempio:

| Colonna file | Campo RefCheckID |
| ------------ | ---------------- |
| Denominazione | Nome società |
| Cod. Affiliazione | Codice società federale |
| Tessera | Codice tessera |
| Nato il | Data nascita |
| Squadra Casa | Società casa |

Il mapping approvato deve essere salvabile e riutilizzabile per la stessa Federazione/import type.

## Staging, preview e conferma

Nessun file deve scrivere direttamente nelle tabelle finali senza preview.

Pipeline obbligatoria:

1. upload file;
2. calcolo checksum;
3. parsing;
4. rilevamento tipo file;
5. mapping colonne;
6. normalizzazione valori;
7. validazione riga per riga;
8. preview risultati;
9. conferma Federazione;
10. commit transazionale;
11. report finale;
12. audit.

## Report import

Ogni import deve produrre un report leggibile dalla Federazione.

Metriche minime:

- righe totali;
- righe valide;
- nuovi record;
- record aggiornati;
- record invariati;
- duplicati rilevati;
- warning;
- errori bloccanti;
- righe non importate.

Il report deve permettere di scaricare:

- file errori;
- file warning;
- riepilogo import;
- mapping usato.

## Audit e tracciabilità

Ogni import federale deve essere tracciato con:

- utente che ha caricato;
- Federazione/Ente;
- data/ora;
- tipo import dichiarato;
- tipo import rilevato;
- nome file originale;
- checksum file;
- mapping colonne;
- numero righe;
- esito;
- record creati/aggiornati;
- errori.

## Implicazioni sul prodotto

Questa milestone diventa prerequisito per test reali di:

- distinta dirigente su rosa reale;
- foto tesserati su tesseramenti reali;
- calendario Federazione reale;
- dashboard arbitro su gare realmente designate;
- referto arbitro su partita reale;
- storico/audit coerente.

## Sequenza consigliata di implementazione

### Fase 1 — Specifica e template

- definire template CSV per società;
- definire template CSV per tesserati generale;
- definire template CSV per tesserati per società;
- definire template CSV per arbitri;
- definire template CSV per calendario;
- definire template CSV per designazioni;
- definire regole di validazione e riconciliazione.

### Fase 2 — Backend import staging

- creare modello import batch;
- creare modello import row;
- parser CSV;
- classificatore tipo file;
- mapping colonne;
- validazione;
- preview;
- commit confermato;
- report.

### Fase 3 — UI Federazione Import

- nuova sezione Federazione `Import dati`;
- scelta tipo import;
- scelta contesto, se richiesta;
- upload file;
- mapping colonne;
- preview errori/warning;
- conferma;
- report finale.

### Fase 4 — Collegamento dati reali ai flussi esistenti

- dashboard dirigente legge società reale;
- distinta legge tesserati/staff reali;
- calendario Federazione legge gare importate;
- dashboard arbitro legge gare designate;
- workflow foto usa i tesseramenti reali.

## Non obiettivi iniziali

- import diretto da API proprietarie federali;
- sincronizzazione bidirezionale;
- deduplica automatica aggressiva tra Federazioni;
- cancellazione automatica dei record assenti dal file;
- gestione completa terne arbitrali;
- modifica anagrafiche ufficiali da parte del dirigente.

## Decisione finale

La prossima milestone deve partire dall'import federale dei dati reali. Il workflow foto resta valido, ma diventa realmente significativo solo quando società, tesserati, calendario e designazioni nascono dalla Federazione e non da dati pilota.
