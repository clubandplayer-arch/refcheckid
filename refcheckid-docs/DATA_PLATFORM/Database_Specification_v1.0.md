# Database Specification v1.0

**Versione:** v1.0  
**Stato:** Draft tecnico vincolato alla Master Bible  
**Ultimo aggiornamento:** 2026-06-29

## Indice

1. [Scopo del documento](#1-scopo-del-documento)
2. [Fonti autorizzate](#2-fonti-autorizzate)
3. [Stato di definizione](#3-stato-di-definizione)
4. [Naming Convention](#4-naming-convention)
5. [UUID Strategy](#5-uuid-strategy)
6. [Timestamp Strategy](#6-timestamp-strategy)
7. [Soft Delete Strategy](#7-soft-delete-strategy)
8. [Ownership Matrix](#8-ownership-matrix)
9. [Schema ER definitivo](#9-schema-er-definitivo)
10. [Elenco completo di tutte le entità](#10-elenco-completo-di-tutte-le-entità)
11. [Database Conventions](#11-database-conventions)
12. [Index Strategy](#12-index-strategy)
13. [Foreign Key Strategy](#13-foreign-key-strategy)
14. [Unique Constraints Strategy](#14-unique-constraints-strategy)
15. [Check Constraints Strategy](#15-check-constraints-strategy)
16. [Migration Strategy](#16-migration-strategy)
17. [Storage Strategy](#17-storage-strategy)
18. [Audit Strategy](#18-audit-strategy)
19. [Versioning Strategy](#19-versioning-strategy)
20. [Glossario Database](#20-glossario-database)
21. [TODO consolidati](#21-todo-consolidati)

---

## 1. Scopo del documento

Questo documento è la specifica tecnica di riferimento per la futura progettazione delle migrazioni PostgreSQL di RefCheckID.

Il documento non contiene SQL, migrazioni, API o logica applicativa.

Il documento deve essere utilizzato per guidare:

- la definizione futura delle tabelle PostgreSQL;
- la definizione futura delle relazioni;
- la definizione futura degli indici;
- la definizione futura dei vincoli;
- la definizione futura delle policy di persistenza;
- la definizione futura delle strategie di storage;
- la definizione futura dei meccanismi di audit e versioning.

### 1.1 Vincolo principale

La specifica deve derivare esclusivamente da decisioni già presenti nella Master Bible.

Poiché la Master Bible attualmente disponibile è un placeholder e non contiene ancora decisioni di dominio, le sezioni che richiedono decisioni non presenti sono marcate come `TODO`.

### 1.2 Cosa non contiene questo documento

Questo documento non contiene:

- SQL;
- migrazioni;
- DDL;
- DML;
- definizioni operative di API;
- business logic;
- implementazioni TypeScript;
- policy Supabase eseguibili;
- funzioni database;
- trigger;
- procedure;
- seed data.

---

## 2. Fonti autorizzate

### 2.1 Fonte primaria

La fonte primaria autorizzata per questa specifica è:

- `MASTER_BIBLE/Master_Bible_v1.0.md`

### 2.2 Stato della fonte primaria

La Master Bible disponibile contiene:

- titolo;
- versione;
- stato;
- ultimo aggiornamento;
- indice placeholder;
- placeholder di contenuto.

Non contiene ancora:

- entità definitive;
- regole di dominio;
- relazioni definitive;
- ownership definitive;
- cicli di vita definitivi;
- stati definitivi;
- vincoli definitivi;
- workflow definitivi utilizzabili per modellazione dati.

### 2.3 Regola di non invenzione

Ogni informazione non esplicitamente presente nella Master Bible è indicata come `TODO`.

Questa scelta è intenzionale e necessaria per rispettare il vincolo progettuale: non prendere decisioni di prodotto, non introdurre assunzioni e non anticipare scelte architetturali non ancora documentate nella fonte autorizzata.

---

## 3. Stato di definizione

### 3.1 Stato generale

**Stato:** non finalizzabile in modo completo fino alla compilazione della Master Bible.

### 3.2 Elementi già documentabili

Gli elementi documentabili senza introdurre decisioni non autorizzate sono:

- struttura formale della Database Specification;
- criteri di compilazione;
- placeholder tecnici per ogni area richiesta;
- regole di tracciabilità verso la Master Bible;
- elenco dei TODO bloccanti.

### 3.3 Elementi non ancora documentabili

Gli elementi non documentabili in modo definitivo sono:

- schema ER definitivo;
- elenco completo delle entità;
- ownership matrix;
- stati delle entità;
- cicli di vita;
- relazioni;
- vincoli di unicità;
- vincoli di check;
- indici specifici;
- foreign key specifiche;
- storage specifico;
- audit specifico;
- versioning specifico.

---

## 4. Naming Convention

### 4.1 Principio

La naming convention database deve essere derivata dalla Master Bible.

### 4.2 Naming degli schemi

**Stato:** TODO.

**Motivo:** la Master Bible non definisce schemi PostgreSQL, namespace logici o separazioni tra aree di dominio.

**Da definire nella Master Bible:**

- elenco degli schemi PostgreSQL;
- criterio di separazione tra schemi;
- ownership degli schemi;
- convenzioni di naming degli schemi.

### 4.3 Naming delle tabelle

**Stato:** TODO.

**Motivo:** la Master Bible non definisce l'elenco definitivo delle entità e quindi non consente di derivare i nomi tabellari.

**Da definire nella Master Bible:**

- elenco delle entità persistenti;
- denominazione canonica di ogni entità;
- regola singolare/plurale;
- eventuali prefissi o suffissi vietati;
- eventuali nomi riservati.

### 4.4 Naming delle colonne

**Stato:** TODO.

**Motivo:** la Master Bible non definisce attributi, campi o proprietà di dominio.

**Da definire nella Master Bible:**

- attributi per ogni entità;
- attributi tecnici obbligatori;
- attributi di audit;
- attributi di stato;
- attributi temporali;
- attributi di ownership.

### 4.5 Naming degli indici

**Stato:** TODO.

**Motivo:** gli indici dipendono da query, relazioni e vincoli non ancora definiti.

**Da definire nella Master Bible o in documento tecnico derivato:**

- pattern di naming degli indici;
- criteri per indici univoci;
- criteri per indici parziali;
- criteri per indici composti;
- criteri per indici su foreign key.

### 4.6 Naming dei vincoli

**Stato:** TODO.

**Motivo:** primary key, foreign key, unique constraint e check constraint non sono ancora derivabili.

**Da definire:**

- naming primary key;
- naming foreign key;
- naming unique constraint;
- naming check constraint;
- naming eventuali exclusion constraint.

---

## 5. UUID Strategy

### 5.1 Principio

La strategia UUID deve stabilire quali entità usano identificativi UUID, come vengono generati e quali garanzie devono offrire.

### 5.2 Stato corrente

**Stato:** TODO.

**Motivo:** la Master Bible disponibile non contiene una decisione esplicita sulla strategia UUID.

### 5.3 Decisioni richieste

Prima di creare migrazioni PostgreSQL devono essere definite almeno le seguenti decisioni:

- se tutte le entità persistenti usano UUID;
- se esistono eccezioni;
- versione UUID autorizzata;
- generazione lato database o lato applicazione;
- regole per esposizione pubblica degli identificativi;
- regole per identificativi esterni;
- regole per identificativi federativi o legacy;
- regole per correlazione eventi;
- regole per idempotenza.

### 5.4 Template futuro

Quando la Master Bible conterrà la decisione, questa sezione dovrà specificare per ogni entità:

| Entità | Primary Key | Tipo | Generazione | Esposta esternamente | Note |
| --- | --- | --- | --- | --- | --- |
| TODO | TODO | TODO | TODO | TODO | TODO |

---

## 6. Timestamp Strategy

### 6.1 Principio

La timestamp strategy deve definire come il database registra creazione, aggiornamento, cancellazione logica, eventi di dominio e tempi operativi.

### 6.2 Stato corrente

**Stato:** TODO.

**Motivo:** la Master Bible non definisce ancora attributi temporali, timezone, precisione, semantica dei timestamp o lifecycle temporali.

### 6.3 Decisioni richieste

Devono essere definite:

- timezone canonica;
- tipo PostgreSQL da utilizzare;
- precisione temporale;
- attributi temporali standard;
- differenza tra timestamp tecnici e timestamp di dominio;
- responsabilità di aggiornamento;
- regole per valori immutabili;
- regole per eventi retroattivi;
- regole per ordinamento eventi;
- regole per concorrenza.

### 6.4 Template futuro

| Campo | Scopo | Obbligatorio | Mutabilità | Fonte | Note |
| --- | --- | --- | --- | --- | --- |
| TODO | TODO | TODO | TODO | TODO | TODO |

---

## 7. Soft Delete Strategy

### 7.1 Principio

La soft delete strategy deve definire come vengono gestite cancellazioni logiche, ripristini, esclusioni da viste operative e coerenza referenziale.

### 7.2 Stato corrente

**Stato:** TODO.

**Motivo:** la Master Bible non definisce ancora quali entità siano cancellabili, archiviabili, ripristinabili o permanentemente conservate.

### 7.3 Decisioni richieste

Devono essere definite:

- entità soggette a soft delete;
- entità non cancellabili;
- campo tecnico di cancellazione logica;
- attore autorizzato alla cancellazione;
- semantica di ripristino;
- effetti sulle relazioni;
- effetti sugli indici univoci;
- effetti su audit log;
- regole di retention;
- regole di anonimizzazione, se previste.

### 7.4 Template futuro

| Entità | Soft delete | Ripristino | Retention | Impatto relazioni | Note |
| --- | --- | --- | --- | --- | --- |
| TODO | TODO | TODO | TODO | TODO | TODO |

---

## 8. Ownership Matrix

### 8.1 Principio

La ownership matrix deve indicare il soggetto proprietario o responsabile di ogni entità persistente.

### 8.2 Stato corrente

**Stato:** TODO.

**Motivo:** la Master Bible non definisce ancora ownership dati, ruoli proprietari o responsabilità di modifica.

### 8.3 Template ownership

| Entità | Owner funzionale | Owner tecnico | Può creare | Può modificare | Può eliminare | Può leggere | Note |
| --- | --- | --- | --- | --- | --- | --- | --- |
| TODO | TODO | TODO | TODO | TODO | TODO | TODO | TODO |

### 8.4 Decisioni richieste

La Master Bible deve definire:

- attori ufficiali;
- ruoli ufficiali;
- permessi ufficiali;
- ownership delle entità;
- confini di visibilità;
- responsabilità di modifica;
- responsabilità di validazione;
- responsabilità di audit.

---

## 9. Schema ER definitivo

### 9.1 Stato corrente

**Stato:** TODO.

**Motivo:** la Master Bible non contiene ancora entità e relazioni definitive.

### 9.2 Vincolo

Non è possibile produrre uno schema ER definitivo senza introdurre assunzioni non autorizzate.

### 9.3 Placeholder ER

```text
TODO: Schema ER definitivo da derivare dalla Master Bible quando saranno disponibili:

- entità persistenti;
- attributi;
- primary key;
- foreign key;
- cardinalità;
- ownership;
- stati;
- cicli di vita;
- vincoli di dominio.
```

### 9.4 Checklist per completamento ER

Prima di finalizzare lo schema ER, devono essere completati:

- [ ] elenco entità;
- [ ] descrizione scopo entità;
- [ ] attributi per entità;
- [ ] primary key per entità;
- [ ] foreign key per entità;
- [ ] cardinalità relazioni;
- [ ] regole di obbligatorietà;
- [ ] regole di cancellazione;
- [ ] regole di unicità;
- [ ] stati di dominio;
- [ ] audit requirements;
- [ ] versioning requirements;
- [ ] storage requirements.

---

## 10. Elenco completo di tutte le entità

### 10.1 Stato corrente

**Stato:** TODO.

**Motivo:** la Master Bible non contiene ancora un elenco definitivo di entità.

### 10.2 Regola applicata

Non vengono introdotte entità candidate, ipotetiche o dedotte da nomi di cartelle, perché il task richiede di usare esclusivamente le decisioni presenti nella Master Bible.

### 10.3 Registro entità definitive

Al momento non sono presenti entità definitive documentate nella Master Bible.

| Entità | Scopo | Owner | Relazioni | Stato | Ciclo di vita |
| --- | --- | --- | --- | --- | --- |
| TODO | TODO | TODO | TODO | TODO | TODO |

### 10.4 Template obbligatorio per ogni entità futura

Ogni entità dovrà essere documentata con il seguente formato.

#### 10.4.x Nome entità: TODO

**Scopo:** TODO.

**Owner:** TODO.

**Relazioni:** TODO.

**Stato:** TODO.

**Ciclo di vita:** TODO.

**Attributi principali:** TODO.

**Identificativo primario:** TODO.

**Vincoli:** TODO.

**Audit:** TODO.

**Versioning:** TODO.

**Storage correlato:** TODO.

**Note:** TODO.

### 10.5 Sezioni entità future

Le seguenti sezioni sono riservate alle entità definitive quando saranno documentate nella Master Bible.

#### 10.5.1 Entità 001

**Scopo:** TODO.

**Owner:** TODO.

**Relazioni:** TODO.

**Stato:** TODO.

**Ciclo di vita:** TODO.

#### 10.5.2 Entità 002

**Scopo:** TODO.

**Owner:** TODO.

**Relazioni:** TODO.

**Stato:** TODO.

**Ciclo di vita:** TODO.

#### 10.5.3 Entità 003

**Scopo:** TODO.

**Owner:** TODO.

**Relazioni:** TODO.

**Stato:** TODO.

**Ciclo di vita:** TODO.

#### 10.5.4 Entità 004

**Scopo:** TODO.

**Owner:** TODO.

**Relazioni:** TODO.

**Stato:** TODO.

**Ciclo di vita:** TODO.

#### 10.5.5 Entità 005

**Scopo:** TODO.

**Owner:** TODO.

**Relazioni:** TODO.

**Stato:** TODO.

**Ciclo di vita:** TODO.

---

## 11. Database Conventions

### 11.1 Stato corrente

**Stato:** TODO.

**Motivo:** la Master Bible non definisce convenzioni database operative.

### 11.2 Convenzioni da definire

Devono essere definite:

- uso degli schemi PostgreSQL;
- convenzioni sui tipi dati;
- convenzioni sui boolean;
- convenzioni sugli enum;
- convenzioni sui campi JSON, se previsti;
- convenzioni sugli importi numerici, se previsti;
- convenzioni sui codici esterni;
- convenzioni sulle descrizioni testuali;
- convenzioni sugli allegati;
- convenzioni sui dati personali;
- convenzioni sui dati sensibili;
- convenzioni sulla retention;
- convenzioni su tabelle di lookup;
- convenzioni su viste e viste materializzate, se previste.

### 11.3 Template convenzioni

| Area | Convenzione | Motivazione | Fonte Master Bible | Stato |
| --- | --- | --- | --- | --- |
| TODO | TODO | TODO | TODO | TODO |

---

## 12. Index Strategy

### 12.1 Stato corrente

**Stato:** TODO.

**Motivo:** la Master Bible non definisce query pattern, entità, cardinalità o workflow utilizzabili per progettare indici.

### 12.2 Decisioni richieste

La strategia degli indici richiede:

- query principali;
- filtri principali;
- ordinamenti principali;
- cardinalità attese;
- volumi attesi;
- colonne di join;
- colonne di stato;
- colonne temporali;
- colonne di ownership;
- vincoli di unicità;
- policy RLS previste.

### 12.3 Tipologie da valutare quando definite

Le seguenti tipologie dovranno essere valutate solo dopo la definizione delle entità:

- indici su primary key;
- indici su foreign key;
- indici compositi;
- indici univoci;
- indici parziali;
- indici su timestamp;
- indici su stato;
- indici per audit;
- indici per soft delete;
- indici per ownership.

### 12.4 Template indice

| Entità | Indice | Colonne | Tipo | Motivazione | Fonte | Stato |
| --- | --- | --- | --- | --- | --- | --- |
| TODO | TODO | TODO | TODO | TODO | TODO | TODO |

---

## 13. Foreign Key Strategy

### 13.1 Stato corrente

**Stato:** TODO.

**Motivo:** non sono ancora definite entità, relazioni, cardinalità e regole di cancellazione.

### 13.2 Decisioni richieste

Devono essere definite:

- relazione tra entità;
- cardinalità;
- obbligatorietà;
- comportamento on delete;
- comportamento on update;
- deferrability;
- naming convention;
- impatto su soft delete;
- impatto su audit;
- impatto su import e migrazioni dati.

### 13.3 Template foreign key

| Tabella sorgente | Colonna | Tabella target | Cardinalità | Obbligatoria | On delete | On update | Stato |
| --- | --- | --- | --- | --- | --- | --- | --- |
| TODO | TODO | TODO | TODO | TODO | TODO | TODO | TODO |

---

## 14. Unique Constraints Strategy

### 14.1 Stato corrente

**Stato:** TODO.

**Motivo:** la Master Bible non definisce ancora identità funzionali, codici, chiavi naturali o ambiti di unicità.

### 14.2 Decisioni richieste

Devono essere definite:

- chiavi naturali;
- codici univoci;
- ambiti di unicità;
- unicità globale o per owner;
- impatto soft delete;
- impatto versioning;
- messaggi funzionali associati;
- gestione dei duplicati;
- gestione dei dati legacy.

### 14.3 Template unique constraint

| Entità | Constraint | Colonne | Ambito | Include soft-deleted | Motivazione | Stato |
| --- | --- | --- | --- | --- | --- | --- |
| TODO | TODO | TODO | TODO | TODO | TODO | TODO |

---

## 15. Check Constraints Strategy

### 15.1 Stato corrente

**Stato:** TODO.

**Motivo:** la Master Bible non definisce ancora valori ammessi, range, stati, invarianti o regole validabili a livello database.

### 15.2 Decisioni richieste

Devono essere definite:

- stati ammessi;
- range numerici;
- obbligatorietà condizionale;
- coerenza tra campi;
- regole temporali;
- regole su enum;
- regole di validazione compatibili con PostgreSQL;
- confine tra vincoli database e validazioni applicative.

### 15.3 Template check constraint

| Entità | Constraint | Regola funzionale | Campi coinvolti | Motivazione | Stato |
| --- | --- | --- | --- | --- | --- |
| TODO | TODO | TODO | TODO | TODO | TODO |

---

## 16. Migration Strategy

### 16.1 Stato corrente

**Stato:** TODO.

**Motivo:** la Master Bible non definisce ancora il modello dati e non esistono migrazioni da pianificare.

### 16.2 Obiettivo della strategia

La migration strategy dovrà definire come passare da specifiche approvate a migrazioni PostgreSQL controllate, reversibili e revisionabili.

### 16.3 Decisioni richieste

Devono essere definite:

- tool ufficiale di migrazione;
- ordine delle migrazioni;
- naming delle migrazioni;
- processo di review;
- processo di rollback;
- gestione ambienti;
- gestione seed;
- gestione dati iniziali;
- compatibilità con Supabase;
- criteri per breaking changes;
- criteri per migrazioni additive;
- criteri per migrazioni distruttive.

### 16.4 Template migrazione

| Migrazione | Scopo | Dipendenze | Reversibile | Ambiente | Fonte specifica | Stato |
| --- | --- | --- | --- | --- | --- | --- |
| TODO | TODO | TODO | TODO | TODO | TODO | TODO |

---

## 17. Storage Strategy

### 17.1 Stato corrente

**Stato:** TODO.

**Motivo:** la Master Bible non definisce ancora file, allegati, fotografie, documenti, retention o bucket Supabase Storage.

### 17.2 Decisioni richieste

Devono essere definite:

- tipologie di file;
- owner dei file;
- bucket;
- naming oggetti storage;
- metadata database;
- relazione tra record e file;
- visibilità;
- autorizzazioni;
- retention;
- cancellazione logica o fisica;
- audit accessi;
- limiti dimensione;
- formati ammessi.

### 17.3 Template storage

| Oggetto storage | Entità correlata | Bucket | Owner | Retention | Accesso | Stato |
| --- | --- | --- | --- | --- | --- | --- |
| TODO | TODO | TODO | TODO | TODO | TODO | TODO |

---

## 18. Audit Strategy

### 18.1 Stato corrente

**Stato:** TODO.

**Motivo:** la Master Bible non definisce ancora eventi auditabili, attori, azioni, livelli di audit o retention audit.

### 18.2 Decisioni richieste

Devono essere definite:

- eventi auditabili;
- attori auditabili;
- azioni auditabili;
- entità soggette ad audit;
- attributi audit;
- immutabilità audit;
- retention audit;
- accesso audit;
- correlazione con eventi di dominio;
- correlazione con richieste applicative;
- dati personali nell'audit;
- anonimizzazione o pseudonimizzazione, se previste.

### 18.3 Template audit

| Entità | Evento | Attore | Dati registrati | Retention | Accesso | Stato |
| --- | --- | --- | --- | --- | --- | --- |
| TODO | TODO | TODO | TODO | TODO | TODO | TODO |

---

## 19. Versioning Strategy

### 19.1 Stato corrente

**Stato:** TODO.

**Motivo:** la Master Bible non definisce ancora entità versionabili, versioning documentale, versioning dati o storicizzazione.

### 19.2 Decisioni richieste

Devono essere definite:

- entità versionabili;
- granularità del versioning;
- versioning tecnico o funzionale;
- snapshot;
- history table;
- validità temporale;
- gestione stato corrente;
- rollback funzionale;
- audit collegato;
- retention versioni;
- regole di immutabilità.

### 19.3 Template versioning

| Entità | Versioning richiesto | Strategia | Stato corrente | Storico | Retention | Stato |
| --- | --- | --- | --- | --- | --- | --- |
| TODO | TODO | TODO | TODO | TODO | TODO | TODO |

---

## 20. Glossario Database

### 20.1 Stato corrente

**Stato:** TODO parziale.

**Motivo:** la Master Bible non definisce ancora glossario di dominio o terminologia database ufficiale.

### 20.2 Termini tecnici del documento

I seguenti termini sono usati come categorie tecniche, non come decisioni di prodotto.

| Termine | Definizione | Stato |
| --- | --- | --- |
| Database Specification | Documento tecnico che guida la futura definizione del modello PostgreSQL. | Definito dal task |
| Master Bible | Fonte primaria da cui derivare decisioni di dominio e database. | Definito dal task |
| TODO | Marcatore per informazione non presente nella Master Bible. | Definito dal task |
| Entità | Oggetto persistente da definire nella Master Bible. | TODO |
| Owner | Responsabile funzionale o tecnico di un'entità. | TODO |
| Relazione | Collegamento tra entità persistenti. | TODO |
| Stato | Condizione di ciclo di vita di un'entità. | TODO |
| Ciclo di vita | Sequenza di stati e transizioni di un'entità. | TODO |
| Audit | Tracciamento di eventi o modifiche. | TODO |
| Versioning | Gestione delle versioni di dati o documenti. | TODO |
| Storage | Persistenza di file o oggetti esterni al record relazionale. | TODO |

---

## 21. TODO consolidati

### 21.1 TODO bloccanti per la prima migrazione PostgreSQL

Prima di produrre qualunque migrazione PostgreSQL devono essere completati nella Master Bible o in documenti da essa derivati:

- TODO: naming convention definitiva;
- TODO: UUID strategy definitiva;
- TODO: timestamp strategy definitiva;
- TODO: soft delete strategy definitiva;
- TODO: ownership matrix definitiva;
- TODO: schema ER definitivo;
- TODO: elenco completo entità;
- TODO: scopo di ogni entità;
- TODO: owner di ogni entità;
- TODO: relazioni di ogni entità;
- TODO: stato di ogni entità;
- TODO: ciclo di vita di ogni entità;
- TODO: database conventions definitive;
- TODO: index strategy definitiva;
- TODO: foreign key strategy definitiva;
- TODO: unique constraints strategy definitiva;
- TODO: check constraints strategy definitiva;
- TODO: migration strategy definitiva;
- TODO: storage strategy definitiva;
- TODO: audit strategy definitiva;
- TODO: versioning strategy definitiva;
- TODO: glossario database definitivo.

### 21.2 Regola di avanzamento

Nessun elemento marcato come `TODO` deve essere trasformato in SQL, migrazione, API o implementazione finché non sarà sostituito da una decisione esplicita nella Master Bible.

### 21.3 Stato finale di questo documento

Questo documento è completo come struttura tecnica professionale e conforme al vincolo di non invenzione.

Il contenuto definitivo di dominio rimane intenzionalmente sospeso perché la Master Bible attuale non contiene ancora decisioni utilizzabili per la modellazione PostgreSQL.
