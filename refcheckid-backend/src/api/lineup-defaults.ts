import type { ApplicationContainer } from '../config/application-container.js';
import type { ApiRequest } from './http.js';
import { json } from './http.js';
import { requireUuid } from './validation.js';

/** Suggestions only: never changes a saved or submitted match sheet. */
export async function lineupDefaults(app: ApplicationContainer, request: ApiRequest) {
  const clubId = requireUuid(request.params.id, 'id');
  const matchId = requireUuid(request.query.matchId, 'matchId');
  const match = await app.repositories.matches.findById(matchId);
  if (!match || match.deletedAt !== null || ![match.homeClubId, match.awayClubId].includes(clubId)) {
    return json(404, { error: 'MATCH_NOT_FOUND' });
  }
  // Club ownership is checked by resourceAccess before this handler runs.
  const candidates = [];
  for (const sheet of await app.repositories.matchSheets.listByClub(clubId)) {
    if (sheet.deletedAt !== null || sheet.matchId === matchId) continue;
    const previous = await app.repositories.matches.findById(sheet.matchId);
    if (previous && previous.deletedAt === null && previous.status !== 'cancelled' &&
        previous.season === match.season && previous.scheduledAt < match.scheduledAt) {
      candidates.push({ sheet, scheduledAt: previous.scheduledAt });
    }
  }
  candidates.sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt) || b.sheet.id.localeCompare(a.sheet.id));
  for (const { sheet } of candidates) {
    const players = await app.repositories.matchSheetPlayers.listByMatchSheet(sheet.id);
    if (!players.length) continue;
    return json(200, { sourceMatchSheetId: sheet.id, players: players.map((player) => ({
      playerRegistrationId: player.playerRegistrationId, shirtNumber: player.shirtNumber,
      role: player.role, isGoalkeeper: player.isGoalkeeper,
      isCaptain: player.isCaptain, isViceCaptain: player.isViceCaptain,
    })) });
  }
  return json(200, { sourceMatchSheetId: null, players: [] });
}
