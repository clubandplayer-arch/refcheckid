# Federation Import — Piano PR sequenziale

## Scopo

Questo file è il tracker operativo per implementare la milestone **Federation Data Import & Onboarding** in PR piccole, verificabili e ordinate.

Regola di lavoro:

1. si lavora su una PR alla volta;
2. prima di passare alla PR successiva si aggiorna questo tracker;
3. se la PR richiede una verifica prodotto/manuale, la PR resta in stato `In verifica` fino al check;
4. se non serve verifica manuale, la PR viene marcata `Eseguita` dopo merge/chiusura tecnica;
5. nessuna PR successiva deve anticipare decisioni o implementazioni della PR precedente, salvo necessità tecnica esplicitata nel tracker.

## Stati ammessi

- `Da fare` — non iniziata.
- `In corso` — implementazione aperta.
- `In verifica` — implementazione completata, attende check manuale/prodotto.
- `Eseguita` — PR completata e tracker aggiornato.
- `Bloccata` — serve decisione o dato esterno.

## Sequenza PR approvata

| Ordine | PR   | Tema                                                | Perché                                             | Stato       | Check prima della prossima PR                                               |
| ------ | ---- | --------------------------------------------------- | -------------------------------------------------- | ----------- | --------------------------------------------------------------------------- |
| 1      | PR 1 | Template e specifica finale                         | Evita di scrivere codice su formato non confermato | Eseguita    | Sì: conferma template e colonne da parte prodotto/Federazione               |
| 2      | PR 2 | Backend import batch/staging                        | Crea base sicura                                   | Eseguita    | Sì: verifica che upload/staging non scriva nei dati finali                  |
| 3      | PR 3 | Parser + riconoscimento + mapping                   | Risolve file federali diversi                      | Eseguita    | Sì: verifica riconoscimento file e mapping colonne con esempi realistici    |
| 4      | PR 4 | Validazione + preview + report                      | Evita import ciechi                                | In verifica | Sì: verifica preview, warning, errori bloccanti e report                    |
| 5      | PR 5 | Commit società/tesserati/staff                      | Primo valore reale per dirigente                   | Da fare     | Sì: verifica import reale, reimport idempotente e cambio società            |
| 6      | PR 6 | Commit arbitri/calendario/designazioni              | Primo valore reale per arbitro                     | Da fare     | Sì: verifica calendario, designazioni e visibilità arbitro                  |
| 7      | PR 7 | UI Federazione import                               | Rende usabile il sistema                           | Da fare     | Sì: verifica guidata end-to-end da UI Federazione                           |
| 8      | PR 8 | Collegamento flussi reali + rimozione demo/fallback | Chiude il cerchio                                  | Da fare     | Sì: verifica ciclo completo Federazione → Dirigente → Arbitro → Federazione |
| 9      | PR 9 | XLSX + miglioramenti                                | Dopo CSV stabile                                   | Da fare     | Sì: verifica import XLSX sugli stessi scenari CSV                           |

## Dettaglio PR 1 — Template e specifica finale

### Obiettivo

Confermare i template CSV e le regole prima di scrivere codice runtime.

### Output atteso

- Template CSV società/squadre.
- Template CSV tesserati generale.
- Template CSV tesserati per società.
- Template CSV staff.
- Template CSV arbitri.
- Template CSV calendario.
- Template CSV designazioni.
- Regole di colonne obbligatorie/facoltative.
- Regole di validazione iniziali.
- Esempi file realistici.

### Check richiesto

Prodotto/Federazione deve confermare:

- se le colonne obbligatorie sono disponibili nei database federali;
- se i nomi colonna sono realistici;
- se servono campi aggiuntivi per categoria, campionato, girone o stagione;
- se società e squadra sono sinonimi nel MVP oppure entità separate;
- se i template sono comprensibili da un operatore federale;
- se la gestione grandi import deve usare riepilogo, filtri, paginazione e download errori invece di mostrare tutte le righe.

## Dettaglio PR 2 — Backend import batch/staging

### Obiettivo

Creare la base sicura per caricare file senza scrivere direttamente nei dati finali.

### Output atteso

- Modello import batch.
- Modello import row.
- Stati import.
- Persistenza metadata file.
- Checksum file.
- API upload/stato import.
- Audit minimo upload import.

### Check richiesto

Verificare che:

- un file venga caricato e tracciato;
- l'import resti in staging;
- nessuna società/tesserato/gara venga creata prima della conferma;
- il checksum venga conservato;
- lo stato import sia leggibile.

## Dettaglio PR 3 — Parser + riconoscimento + mapping

### Obiettivo

Leggere CSV diversi, riconoscere il tipo import e proporre mapping colonne correggibile.

### Output atteso

- Parser CSV.
- Classificatore tipo import.
- Confidence/warning su tipo rilevato.
- Mapping colonne automatico.
- Correzione mapping.
- Salvataggio mapping riutilizzabile.

### Check richiesto

Verificare con file realistici che:

- società venga riconosciuto come import società;
- tesserati generale venga riconosciuto come import tesserati;
- tesserati per società venga riconosciuto correttamente;
- calendario venga riconosciuto come calendario;
- designazioni venga riconosciuto come designazioni;
- un file ambiguo richieda scelta manuale;
- un mapping sbagliato sia correggibile.

## Dettaglio PR 4 — Validazione + preview + report

### Obiettivo

Mostrare cosa succederà prima del commit definitivo.

### Output atteso

- Validazione righe.
- Errori bloccanti.
- Warning.
- Preview nuovi/aggiornati/invariati/duplicati/errori.
- Report import preliminare.
- Download errori/warning, se previsto nello scope tecnico.

### Check richiesto

Verificare:

- file corretto;
- file con colonne mancanti;
- file con date non valide;
- società inesistente;
- tesserato duplicato;
- tesserato già presente;
- cambio società;
- reimport stesso file.

## Dettaglio PR 5 — Commit società/tesserati/staff

### Obiettivo

Scrivere nei dati finali le anagrafiche e posizioni necessarie al dirigente.

### Output atteso

- Commit società/squadre.
- Commit tesserati generale.
- Commit tesserati per società.
- Commit staff.
- Aggiornamento posizione tesserato.
- Gestione storico cambio società/stagione.
- Idempotenza reimport.
- Report finale.
- Audit import commit.

### Check richiesto

Verificare:

- dopo import società, le società siano disponibili;
- dopo import tesserati, la rosa sia reale;
- reimport non crei duplicati;
- cambio società aggiorni la posizione senza perdere storico;
- dirigente veda dati coerenti, se il collegamento è incluso nello scope della PR o in una PR successiva.

## Dettaglio PR 6 — Commit arbitri/calendario/designazioni

### Obiettivo

Scrivere gare e designazioni reali per abilitare il flusso arbitro.

### Output atteso

- Commit arbitri.
- Commit calendario gare.
- Commit designazioni.
- Collegamento gara → arbitro principale MVP.
- Report finale.
- Audit import commit.

### Check richiesto

Verificare:

- arbitri importati;
- calendario importato;
- società casa/ospite risolte;
- arbitro designato risolto;
- gara visibile in Federazione;
- gara assegnata visibile all'arbitro corretto, se il collegamento UI/API è incluso nello scope della PR o in una PR successiva.

## Dettaglio PR 7 — UI Federazione import

### Obiettivo

Rendere l'import utilizzabile da operatore federale senza strumenti tecnici.

### Output atteso

- Sezione Federazione `Import dati`.
- Scelta tipo import.
- Scelta contesto, se richiesta.
- Download template.
- Upload file.
- Mapping colonne.
- Preview errori/warning.
- Conferma commit.
- Report finale.
- Storico import.

### Check richiesto

Verificare end-to-end da UI:

- import società;
- import tesserati;
- import calendario;
- import designazioni;
- correzione mapping;
- errori comprensibili;
- report leggibile;
- blocco accesso a dirigente/non autorizzato.

## Dettaglio PR 8 — Collegamento flussi reali + rimozione demo/fallback

### Obiettivo

Chiudere il cerchio sostituendo i dati demo/pilota con dati federali reali nei flussi principali.

### Output atteso

- Dashboard dirigente legge società reale.
- Distinta legge tesserati/staff reali.
- Foto usa registration reali.
- Federazione legge calendario reale.
- Arbitro legge gare designate reali.
- Demo/fallback esplicitato, isolato o rimosso dove opportuno.

### Check richiesto

Verifica ciclo completo:

1. Federazione importa società.
2. Federazione importa tesserati/staff.
3. Federazione importa arbitri.
4. Federazione importa calendario/designazioni.
5. Dirigente casa vede rosa reale.
6. Dirigente ospite vede rosa reale.
7. Dirigente compila distinta.
8. Dirigente propone/aggiorna foto.
9. Federazione approva/rifiuta foto.
10. Arbitro vede gara designata.
11. Arbitro riconosce tesserati.
12. Arbitro invia referto.
13. Federazione vede referto/storico.

## Dettaglio PR 9 — XLSX + miglioramenti

### Obiettivo

Aggiungere XLSX e miglioramenti dopo stabilizzazione CSV.

### Output atteso

- Parser XLSX.
- Stesse regole CSV applicate a XLSX.
- Supporto multi-sheet se deciso.
- Miglioramenti mapping/report emersi dalle verifiche precedenti.

### Check richiesto

Ripetere gli scenari CSV principali con file XLSX:

- società;
- tesserati generale;
- tesserati per società;
- staff;
- arbitri;
- calendario;
- designazioni;
- reimport;
- errori/warning.

## Registro avanzamento

| Data       | PR                   | Stato       | Note                                                                                                                                                                       | Check richiesto | Esito check                                                 |
| ---------- | -------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- | ----------------------------------------------------------- |
| 2026-07-22 | Piano iniziale       | Eseguita    | Creato tracker operativo con sequenza PR approvata.                                                                                                                        | No              | n/d                                                         |
| 2026-07-22 | PR 1                 | In verifica | Aggiunti specifica finale e template CSV per società, tesserati, staff, arbitri, calendario e designazioni.                                                                | Sì              | In attesa conferma template                                 |
| 2026-07-22 | PR 1 UI check        | In verifica | Aggiunta area Federazione `Import dati` per scaricare e verificare i template PR 1 prima della PR 2.                                                                       | Sì              | In attesa conferma template da UI                           |
| 2026-07-22 | PR 1 UI preview      | In verifica | Aggiunta anteprima tabellare leggibile dei template perché il CSV scaricato può essere poco comprensibile per utenti non tecnici.                                          | Sì              | In attesa conferma anteprima/template                       |
| 2026-07-22 | PR 1 large import UX | Eseguita    | Chiarito che la UI PR 1 mostra solo esempi e che gli import reali con migliaia di righe dovranno usare staging, riepiloghi, filtri, paginazione e download errori/warning. | Sì              | Confermata: si procede a PR 2                               |
| 2026-07-22 | PR 2                 | Eseguita    | Implementato backend import batch/staging con migrazione, dominio, repository, servizio, endpoint e test.                                                                  | Sì              | Confermata: si procede a PR 3                               |
| 2026-07-22 | PR 3                 | Eseguita    | Implementato parser CSV, riconoscimento tipo file, mapping automatico colonne e salvataggio righe normalizzate in staging.                                                 | Sì              | Confermata: si procede a PR 4                               |
| 2026-07-22 | PR 4                 | In verifica | Implementata validazione righe, stati valid/warning/error, preview report con conteggi, duplicati e commitBlocked.                                                         | Sì              | In attesa verifica report/errori/warning con CSV realistici |

## Decisione finale

La sequenza sopra è vincolante per questa milestone salvo nuova decisione esplicita. Ogni PR deve aggiornare questo file prima di chiudersi, indicando stato, note e se serve un check manuale/prodotto prima di procedere.
