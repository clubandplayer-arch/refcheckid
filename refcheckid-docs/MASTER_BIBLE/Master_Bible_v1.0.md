# Master Bible v1.0

**Versione:** v1.0  
**Stato:** Definitivo - decisioni approvate consolidate  
**Ultimo aggiornamento:** 2026-06-29

## Indice

1. [01. Introduzione](chapters/01_Introduzione.md)
2. [02. Visione](chapters/02_Visione.md)
3. [03. Missione](chapters/03_Missione.md)
4. [04. Cosa non è RefCheckID](chapters/04_Cosa_non_e_RefCheckID.md)
5. [05. Valore del progetto](chapters/05_Valore_del_progetto.md)
6. [06. Manifesto](chapters/06_Manifesto.md)
7. [07. Attori](chapters/07_Attori.md)
8. [08. Ruoli](chapters/08_Ruoli.md)
9. [09. Permessi](chapters/09_Permessi.md)
10. [10. Workflow Società](chapters/10_Workflow_Societa.md)
11. [11. Workflow Arbitro](chapters/11_Workflow_Arbitro.md)
12. [12. Workflow Federazione](chapters/12_Workflow_Federazione.md)
13. [13. Ciclo di vita della gara](chapters/13_Ciclo_di_vita_della_gara.md)
14. [14. Requisiti funzionali](chapters/14_Requisiti_funzionali.md)
15. [15. Business Rules](chapters/15_Business_Rules.md)
16. [16. Principi UX](chapters/16_Principi_UX.md)
17. [17. Componenti](chapters/17_Componenti.md)
18. [18. Oggetti del sistema](chapters/18_Oggetti_del_sistema.md)
19. [19. Stati del sistema](chapters/19_Stati_del_sistema.md)
20. [20. Audit Log](chapters/20_Audit_Log.md)
21. [21. Edge Cases](chapters/21_Edge_Cases.md)
22. [22. Versioni future](chapters/22_Versioni_future.md)
23. [23. Non Obiettivi](chapters/23_Non_Obiettivi.md)
24. [24. Roadmap](chapters/24_Roadmap.md)
25. [25. Glossario](chapters/25_Glossario.md)
26. [26. Changelog](chapters/26_Changelog.md)

## Scopo

La Master Bible v1.0 consolida in un unico documento le decisioni già approvate per RefCheckID. Non introduce nuove decisioni funzionali, non modifica l'architettura congelata e non autorizza implementazioni non previste dalle milestone approvate.

## Perimetro approvato

RefCheckID è il progetto dedicato alla gestione strutturata dei processi di identificazione, controllo e validazione legati alle gare sportive, con attenzione a società, arbitri, federazioni, ruoli, permessi, stati operativi e tracciabilità degli eventi.

## Governance documentale

La documentazione è organizzata in repository dedicato, con aree per Master Bible, Data Platform, API, Security, UX, ADR e decisioni di meeting. Le modifiche rilevanti devono essere versionate e coerenti con roadmap e changelog.

## Architettura e tecnologia approvate

Il backend skeleton approvato utilizza Node.js, TypeScript, pnpm, PostgreSQL 16, Supabase, Drizzle ORM, ESLint, Prettier e Vitest. La struttura backend è predisposta per configurazione, domini, servizi, eventi, repository, API, middleware, utility, test, script, storage e Supabase, senza codice applicativo.

## Convenzioni approvate

Le convenzioni approvate includono UUID, soft delete, UTC, naming snake_case per database, naming camelCase per TypeScript, Domain Driven Design ed Event Driven Architecture. La loro traduzione in database, API e codice richiede specifiche successive approvate.

## Non obiettivi della versione

Questa versione non crea database, SQL, migrazioni, API, frontend, tabelle, business logic, policy eseguibili, funzioni, trigger o seed.

## Capitoli

I capitoli collegati costituiscono parte integrante della Master Bible v1.0 e consolidano esclusivamente quanto già deciso.
