# Contratto API: referti, archivio e pubblicazione

Tutti i percorsi seguenti hanno prefisso `/api/v1`. Le scritture usano le transazioni del router esistente. Non esiste un'autorizzazione alla lettura del referto ereditata dalla pubblicazione.

| Metodo e risorsa | Autorizzazione / risposta |
| --- | --- |
| GET `/platform/games/:id` | Lettore interno autorizzato; solo `reportStatus`, nessun contenuto referto |
| GET `/platform/games/:id/report` | Politica riservata centralizzata `canReadReport` |
| GET `/platform/games/:id/history?cursor=REVISIONE` | Lettore gara; revisioni decrescenti, pagine limitate, nessuna nota privata o autore |
| GET `/platform/games/:id/access` | Incarico accettato, valido e abilitato al taccuino |
| POST `/platform/games/:id/clock` | Arbitro principale; `operationId`, `revision`, `action` start/pause/resume/suspend |
| GET `/platform/competitions/:id/publication` | Proprietario con permesso struttura oppure admin piattaforma |
| POST `/platform/competitions/:id/publication/consent` | Proprietario effettivo; `revision`, `consent`, `consentEvents`, `consentNames` |
| GET `/platform/publication/catalog?cursor=...` | Admin piattaforma; catalogo paginato |
| POST `/platform/competitions/:id/publication` | Admin piattaforma; `revision`, `mode` private/public, `includeLive`, `includeEvents`, `includeNames` |
| GET `/public/competitions?sport=...&cursor=...` | Anonimo; soltanto competizioni autorizzate e attivate |
| GET `/public/competitions/:id/fixtures?cursor=...` | Anonimo; solo proiezioni pubbliche, massimo 50 per pagina |
| GET `/public/games/:id` | Anonimo; 404 se competizione privata o consenso ritirato |

Gli endpoint pubblici accettano esclusivamente GET senza autenticazione. Non usano token del visitatore. Risposte e errori pubblici hanno `Cache-Control: no-store` e `X-Content-Type-Options: nosniff`. Il controllo di pubblicazione viene rivalutato per ogni lettura. Le revisioni delle impostazioni sono archiviate; aggiornamenti concorrenti obsoleti restituiscono 409.

La proiezione pubblica è una lista esplicita di campi: competizione, squadre, calendario, sede, giornata, stato gara, certificazione, punteggio, periodo, revisione, data aggiornamento ed eventi consentiti. Identificativi pubblici di eventi e persone sono distinti da quelli interni. Nessun repository di referti viene letto dalla proiezione. I nomi richiedono sia consenso del proprietario sia selezione dell'amministratore.

Le API preesistenti dei periodi rimangono il canale di scrittura degli eventi: una stessa `operationId` ritentata con gli stessi dati non duplica la revisione; modifiche del contenuto con la stessa chiave sono respinte. I collaboratori accettati possono scrivere provvisori; lettori e designatori no. Conferme di periodo/finale e referto competono al principale. Il risultato finale non è declassabile a provvisorio; una rettifica conserva il finale e richiede motivazione.

La politica riservata copre anche `/match-reports`, relativi endpoint per ID, `/audit/by-match`, final-report e report-draft legacy. `/audit/by-action` non consente più l'elenco trasversale: il filtro per azione non garantiva l'isolamento per gara. L'accesso all'audit di gara richiede la stessa autorizzazione del referto.

## Evidenze di verifica locale

- Suite completa: 190 test backend e 107 frontend, inclusi controlli PostgreSQL su paginazione di 110 revisioni e isolamento tra gare.
- Enumerazione degli endpoint GET registrati con visitatore, delegato arbitrale e amministratore della pubblicazione: nessuna esposizione della nota privata di controllo.
- Test del taccuino: seconda bozza offline conservata mentre la precedente operazione attende conferma; ritentativo e invio successivo con revisione aggiornata.
- Chromium su build di produzione locale: consenso federale, attivazione centrale, gol live visto dal visitatore, fine periodo/finale, referto riservato, diniego all'amministratore e revoca immediata.
- Bundle Next isolato: caricamento delle dipendenze native e cloud, importazione XLSX e paginazione SQL.

Non sono verifiche sul deployment Vercel reale: richiede rilascio e configurazione dei profili nel proprio ambiente.
