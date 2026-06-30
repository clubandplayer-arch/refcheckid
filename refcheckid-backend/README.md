# RefCheckID Backend

**Versione:** v1.0  
**Stato:** Bootstrap  
**Ultimo aggiornamento:** 2026-06-29

## Scopo del repository

`refcheckid-backend` è il repository enterprise dedicato allo scheletro backend di RefCheckID.

In questa fase il repository definisce solamente la struttura tecnica, le convenzioni di progetto e la configurazione iniziale degli strumenti di sviluppo. Non contiene ancora database, API, business logic, tabelle, SQL o implementazioni applicative.

## Stack tecnologico

Lo stack previsto per il backend RefCheckID è:

- Node.js
- TypeScript
- pnpm
- PostgreSQL 16
- Supabase
- Drizzle ORM
- ESLint
- Prettier
- Vitest

## Struttura del repository

```text
refcheckid-backend/
├── database/
│   ├── migrations/
│   ├── seed/
│   └── schema/
├── docs/
├── src/
│   ├── config/
│   ├── domain/
│   │   ├── federation/
│   │   ├── club/
│   │   ├── player/
│   │   ├── registration/
│   │   ├── referee/
│   │   ├── match/
│   │   ├── match-sheet/
│   │   ├── recognition/
│   │   ├── report/
│   │   ├── event/
│   │   ├── photo/
│   │   └── audit/
│   ├── services/
│   ├── events/
│   ├── repositories/
│   ├── api/
│   ├── middleware/
│   └── utils/
├── tests/
├── scripts/
├── storage/
└── supabase/
    ├── policies/
    └── functions/
```

## Convenzioni

Le convenzioni tecniche già definite per il progetto sono:

- Identificativi basati su UUID.
- Soft delete per la gestione della cancellazione logica.
- Date e orari gestiti in UTC.
- Naming `snake_case` per database e persistenza.
- Naming `camelCase` per TypeScript.
- Organizzazione coerente con Domain Driven Design.
- Comunicazione e integrazione coerenti con Event Driven Architecture.

## Workflow

1. Installare le dipendenze con `pnpm install`.
2. Usare TypeScript come linguaggio di riferimento per il backend.
3. Mantenere la separazione tra dominio, servizi, eventi, repository, API, middleware e utility.
4. Aggiungere migrazioni, schema, seed, policy Supabase e funzioni solo nelle milestone dedicate.
5. Non introdurre API, tabelle, SQL o business logic finché non previsti dal piano di progetto.
6. Eseguire lint, format check, typecheck e test prima di proporre modifiche.

## Stato attuale

Il repository contiene esclusivamente lo scheletro enterprise iniziale e la configurazione di base degli strumenti di sviluppo.

## Backend application layer

La Milestone 10 introduce lo skeleton iniziale dell'application layer backend:

- `src/domain/`: tipi TypeScript principali allineati alle entità PostgreSQL approvate.
- `src/repositories/`: repository base e repository specifici per area dati, senza implementazione database definitiva.
- `src/services/`: service iniziali per orchestrazione futura, senza business logic completa.
- `src/events/`: event engine skeleton con gli eventi applicativi approvati.
- `src/api/`: moduli API skeleton senza endpoint pubblici definitivi.
- `tests/`: test placeholder per repository, services ed event engine.

Questo layer non modifica database, RLS, Master Bible, Domain Model o Product Tree.

## Application Layer Runtime

Milestone 10 provides the first complete application-layer runtime:

- services receive repositories through constructor-based dependency injection;
- repositories expose Drizzle-compatible contracts and in-memory execution semantics for local tests;
- the event engine supports dynamic handler registration, unregistration and ordered dispatch;
- `AuditEventPublisher` can bridge application events into append-only audit records;
- `FederationSyncService` coordinates federation, club, referee, player, staff and match synchronization through injected repositories.

The application layer remains independent from REST APIs and frontend concerns. PostgreSQL migrations and Supabase RLS policies are not modified by the runtime layer.
