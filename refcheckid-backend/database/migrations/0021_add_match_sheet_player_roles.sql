ALTER TABLE match_sheet_players
    ADD COLUMN lineup_order integer NOT NULL DEFAULT 0,
    ADD COLUMN is_goalkeeper boolean NOT NULL DEFAULT false,
    ADD COLUMN is_captain boolean NOT NULL DEFAULT false,
    ADD COLUMN is_vice_captain boolean NOT NULL DEFAULT false;

ALTER TABLE match_sheet_players
    ADD CONSTRAINT chk_match_sheet_players_lineup_order CHECK (lineup_order >= 0);

COMMENT ON COLUMN match_sheet_players.lineup_order IS 'Stable display order inside the submitted lineup.';
COMMENT ON COLUMN match_sheet_players.is_goalkeeper IS 'Goalkeeper designation frozen at submission.';
COMMENT ON COLUMN match_sheet_players.is_captain IS 'Captain designation frozen at submission.';
COMMENT ON COLUMN match_sheet_players.is_vice_captain IS 'Vice-captain designation frozen at submission.';
