# Federation Import PR 4 — Validazione + preview + report

## Stato PR 4

Stato: **In verifica tecnica/prodotto**.

Questa PR estende parser e mapping PR 3 aggiungendo validazione riga per riga, stati riga, preview riepilogativa e report scaricabili/logici per errori e warning. Non esegue ancora commit nei dati finali.

## Cosa è stato implementato

- Validazione backend su righe già parsate in staging.
- Endpoint REST:
  - `POST /api/v1/federation-imports/{id}/validate`.
- Aggiornamento batch a stato `validated` dopo validazione.
- Aggiornamento conteggi batch:
  - `validRows`;
  - `warningRows`;
  - `errorRows`.
- Aggiornamento stato riga:
  - `valid`;
  - `warning`;
  - `error`.
- Controllo valori obbligatori mancanti.
- Controllo duplicati nello stesso file importato.
- Controlli formato iniziali:
  - date ISO `YYYY-MM-DD`;
  - ora `HH:mm`;
  - società casa/ospite diverse per calendario.
- Warning valori stato inattesi rispetto agli stati ammessi MVP.
- Preview report con:
  - totale righe;
  - righe valide;
  - righe con warning;
  - righe con errori;
  - righe nuove previste;
  - righe aggiornate previste, per ora `0` fino alla risoluzione PR5/PR6;
  - righe invariate previste, per ora `0` fino alla risoluzione PR5/PR6;
  - duplicati;
  - flag `commitBlocked`.
- Sezione report logica per errori e warning, pronta per essere esposta come download in una PR UI successiva.
- Test backend PR 4.

## Cosa NON è stato implementato

- Commit nei dati finali.
- Risoluzione reale contro società/tesserati/staff/arbitri/gare già presenti.
- Calcolo definitivo aggiornati/invariati rispetto ai dati finali.
- Download fisico CSV/XLSX errori e warning da UI.
- Correzione righe o mapping da UI.
- UI operatore federale per upload/preview/conferma.

Questi elementi appartengono alle PR successive.

## Regola di staging confermata

La validazione aggiorna solo batch e righe staging. Nessuna società, tesserato, staff, arbitro, gara o designazione finale viene creata o aggiornata.

## Regola blocco commit

Se `errorRows > 0`, il report imposta `commitBlocked: true`. Il commit finale delle PR successive dovrà impedire il commit finché restano errori bloccanti.

## Check richiesto prima della PR 5

Verificare con CSV realistici che:

1. un file corretto produca report senza errori bloccanti;
2. un file con colonne/valori obbligatori mancanti produca righe `error`;
3. un file con date non ISO produca righe `error`;
4. un file calendario con ora non `HH:mm` produca righe `error`;
5. un file calendario con società casa uguale a ospite produca righe `error`;
6. righe duplicate nello stesso file producano errori duplicato;
7. valori stato inattesi producano warning;
8. il report mostri conteggi coerenti;
9. `commitBlocked` sia `true` quando esistono errori;
10. nessun dato finale venga creato o aggiornato durante PR 4.
