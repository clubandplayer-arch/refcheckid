# RefCheckID Web

Frontend web Next.js per RefCheckID.

## Area Dirigente

Questo modulo implementa il workflow completo del dirigente:

1. login;
2. dashboard con prossima gara, stato distinta, notifiche e apertura distinta;
3. compilazione distinta con ricerca giocatori, ordinamento alfabetico, foto, diffide, squalifiche e convocazione;
4. ordinamento distinta con drag & drop, numero maglia e ruoli speciali;
5. selezione staff e ruoli;
6. riepilogo con controlli finali e invio distinta.

## Area Arbitro

Questo modulo implementa il workflow completo dell’arbitro:

1. dashboard con prossima gara, stato gara e apertura gara;
2. verifica distinte casa/ospite con stato e avvio riconoscimento;
3. riconoscimento con foto grande, dati atleta, documento collassabile, avanzamento, swipe destra/sinistra e indietro;
4. referto con risultato, gol, ammonizioni, espulsioni, sostituzioni, note, riepilogo e invio;
5. stati loading-ready, empty state ed error state predisposti nei componenti e nei dati di interfaccia.

## Area Federazione

Questo modulo implementa il workflow completo della federazione:

1. dashboard con referti ricevuti, richieste foto, sincronizzazioni e notifiche operative;
2. calendario gare con stato gara, stato referto e filtri per giornata/stato;
3. referti ricevuti con dettaglio in sola lettura, risultato, eventi, note arbitro e note commissario;
4. richieste foto con foto attuale, proposta, approvazione/rifiuto e stato;
5. storico con ricerca per gara, società o arbitro, accesso referto e audit sintetico.

Il frontend utilizza esclusivamente il layer REST API esistente e non introduce backend, database o nuove API.

## Comandi

```bash
pnpm lint
pnpm test
pnpm build
```
