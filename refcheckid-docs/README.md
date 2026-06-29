# RefCheckID Docs

**Versione:** v1.0  
**Stato:** Iniziale  
**Ultimo aggiornamento:** 2026-06-29

## Cos'è RefCheckID

RefCheckID è il progetto dedicato alla definizione di un sistema per la gestione strutturata dei processi di identificazione, controllo e validazione legati alle gare sportive, con particolare attenzione a società, arbitri, federazioni, ruoli, permessi, stati operativi e tracciabilità degli eventi.

## Scopo del repository

Questo repository contiene esclusivamente la documentazione di progetto di RefCheckID.

Non contiene backend, frontend, database, infrastruttura eseguibile o codice applicativo. La sua funzione è mantenere in modo ordinato e versionato le specifiche funzionali, di dominio, operative, API, sicurezza, UX e decisioni progettuali.

## Organizzazione della documentazione

La documentazione è organizzata nelle seguenti aree:

- `MASTER_BIBLE/`: documento principale di visione, requisiti, regole di business, workflow e glossario.
- `MASTER_BIBLE/chapters/`: capitoli separati della Master Bible.
- `DATA_PLATFORM/`: specifiche del modello dati, stati, flussi operativi, architettura dei servizi ed event engine.
- `API/`: specifiche delle API.
- `SECURITY/`: ruoli, permessi e Row Level Security.
- `UX/`: wireframe e user flow.
- `ADR/`: Architecture Decision Record e decisioni architetturali già approvate.
- `MEETINGS/`: decisioni emerse da riunioni e allineamenti.
- `ROADMAP.md`: avanzamento per fasi e milestone.
- `CHANGELOG.md`: storico delle versioni della documentazione.

## Workflow di aggiornamento

1. Ogni modifica alla documentazione deve essere effettuata nel file più specifico e coerente con l'area interessata.
2. I capitoli della Master Bible devono essere aggiornati senza introdurre contenuti duplicati in altre sezioni.
3. Ogni documento deve mantenere intestazione con titolo, versione, stato e ultimo aggiornamento.
4. Le decisioni architetturali devono essere registrate in `ADR/` solo quando già definite e approvate.
5. Le modifiche rilevanti devono aggiornare `CHANGELOG.md`.
6. Le milestone completate o modificate devono aggiornare `ROADMAP.md`.
7. Non devono essere introdotti codice applicativo, backend, frontend o database in questo repository di documentazione.

## Stato attuale

La struttura iniziale della documentazione è stata creata come base per le attività successive del progetto. I contenuti dei capitoli e delle specifiche saranno compilati nelle prossime milestone.
