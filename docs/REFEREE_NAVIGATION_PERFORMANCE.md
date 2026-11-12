# Navigazione arbitro: correzione delle attese

Il passaggio dashboard → gara → referto presentava richieste dipendenti e letture legacy eseguite come transazioni di comando PostgreSQL. Queste ultime acquisivano il blocco consultivo globale dei salvataggi: richieste di sola lettura potevano quindi attendere inutilmente altri comandi.

La correzione usa transazioni PostgreSQL `READ ONLY` per gli endpoint verificati di gare, distinte, stato/decisioni di riconoscimento e referti. Queste letture non acquisiscono il blocco globale. Restano attivi autenticazione, autorizzazione e isolamento dei referti. Le scritture conservano transazioni e blocco: non cambia la protezione da salvataggi concorrenti. Gli endpoint fotografici che possono generare autorizzazioni temporanee mantengono il percorso precedente.

Nel client:

- **Apri gara** include l'ID già noto dalla dashboard, senza attendere una nuova selezione della partita.
- Le distinte con conteggi completi non richiedono il manifest fotografico come semplice fonte di conteggi; resta il recupero di compatibilità per conteggi mancanti.
- Manifest del riconoscimento e decisioni vengono richiesti in parallelo.
- Il passaggio del puntatore o del focus sul referto legacy ne prepara la lettura nella cache della sessione; il cambio utente continua a separare le cache. La pagina conserva i controlli server dei permessi.

Verifiche: suite backend/frontend, TypeScript e build; prova SQL reale con cinque endpoint di navigazione in `BEGIN READ ONLY` e nessuna acquisizione di `pg_advisory_xact_lock`; test che conferma una sola richiesta per le distinte con conteggi completi; percorso Chromium su build di produzione locale.

Il miglioramento è strutturale. Non è stata misurata la latenza del deployment Vercel reale né eliminato il tempo di avvio delle funzioni o la latenza Vercel–Supabase. Dopo il deployment dello stesso branch, confrontare le durate in Network sul sito reale per verificare l'effetto nell'ambiente dell'utente. Non cambiare regioni, dimensioni database o disattivare TLS senza misure.
