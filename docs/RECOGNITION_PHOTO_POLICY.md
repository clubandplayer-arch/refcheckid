# Riconoscimento e cambio foto

La federazione gestisce i dati del tesserato. La dirigenza carica la foto di
giocatori e staff; tutte le nuove proposte devono essere approvate dalla
federazione. Durante il riconoscimento l'arbitro confronta il volto con la foto
approvata presente nella distinta. Può chiedere un documento in caso di dubbio;
non è necessario aprire i dati del documento né confermarne la verifica per
riconoscere il soggetto. Rimangono obbligatorie le note per anomalie o foto
assente/non disponibile.

Il primo caricamento non è una sostituzione. È consentita una sostituzione
ordinaria per anno solare (UTC), per persona, indipendentemente da società e
stagione. Dal secondo cambio occorre una motivazione specifica, tra 20 e 2000
caratteri, inserita dalla dirigenza nella proposta. La federazione vede la
motivazione ed effettua la valutazione: la lunghezza del testo non costituisce
approvazione automatica. Un semplice taglio di capelli non giustifica un altro
cambio; una crescita fisica che ostacola il riconoscimento può giustificarlo.

Il limite è verificato sul backend all'emissione dell'upload intent e nuovamente
all'approvazione, per evitare che proposte preparate prima di un altro cambio
aggirino la regola. Contano le sostituzioni approvate nella cronologia delle
versioni; caricamenti falliti o rifiutati non consumano la possibilità ordinaria.
La motivazione è conservata sulla versione e sulla richiesta di approvazione.
La foto corrente rimane attiva fino all'approvazione della nuova; le distinte
congelate mantengono la propria foto storica.

Non sono necessarie migrazioni SQL: i nuovi campi opzionali sono nei documenti
JSON esistenti. Le approvazioni già effettuate non vengono annullate o riscritte;
la loro cronologia viene usata per valutare le prossime richieste.
