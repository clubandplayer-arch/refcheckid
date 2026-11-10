import type { ApplicationContainer } from '../config/application-container.js';
import { requireBodyObject } from './validation.js';

/** Validate against frozen participants and saved decisions, independent of browser checks. */
export async function validateFinalReport(container: ApplicationContainer, matchId: string, content: Record<string, unknown>) {
  const match = await container.repositories.matches.findById(matchId);
  if (!match) throw new Error('Match not found.');
  const result = requireBodyObject(content.result);
  if (content.matchId !== matchId || ![result.homeGoals, result.awayGoals].every((score) => typeof score === 'number' && Number.isInteger(score) && score >= 0 && score <= 999)) throw new Error('Invalid report score or match.');
  const homeName = (await container.repositories.clubs.findById(match.homeClubId))?.name ?? match.homeClubId;
  const awayName = (await container.repositories.clubs.findById(match.awayClubId))?.name ?? match.awayClubId;
  const sheets = await container.repositories.matchSheets.listByMatch(matchId);
  const decisions = await container.repositories.recognitions.listByMatch(matchId);
  const participants = new Map<string, { registrationId: string; name: string; role: string }>();
  for (const sheet of sheets) {
    const team = sheet.clubId === match.homeClubId ? 'Casa' : 'Ospite';
    for (const snapshot of await container.repositories.matchSheetPhotoSnapshots.listByMatchSheet(sheet.id)) {
      if (!decisions.some((row) => row.registrationId === snapshot.registrationId && row.snapshotId === snapshot.id && row.status === 'recognized')) continue;
      const manifest = snapshot.renditionManifest;
      if (manifest.subjectKind === 'player' && typeof manifest.shirtNumber === 'number') {
        participants.set(`${team}:${manifest.shirtNumber}`, { registrationId: snapshot.registrationId, name: `${String(manifest.lastName)} ${String(manifest.firstName)}`, role: String(manifest.roleLabel) });
      }
    }
  }
  const goals = { Casa: 0, Ospite: 0 };
  const exited = new Map<string, number>();
  const entered = new Map<string, number>();
  const activities: { key: string; minute: number }[] = [];
  for (const kind of ['substitutions', 'expulsions', 'goals', 'cautions']) {
    const entries: unknown = content[kind];
    if (!Array.isArray(entries) || entries.length > 1000) throw new Error(`Invalid ${kind} list.`);
    let previousMinute = 0;
    for (const value of entries as unknown[]) {
      const event = requireBodyObject(value);
      const minute = event.minute;
      const team = event.teamName === homeName ? 'Casa' : event.teamName === awayName ? 'Ospite' : event.teamName;
      if ((team !== 'Casa' && team !== 'Ospite') || typeof minute !== 'number' || !Number.isInteger(minute) || minute < 1 || minute > 120 || minute < previousMinute) throw new Error('Report events require a valid team, minute and chronological order.');
      previousMinute = minute;
      event.teamName = team;
      if (kind === 'substitutions') {
        const outKey = `${team}:${String(event.outgoingShirtNumber)}`;
        const inKey = `${team}:${String(event.incomingShirtNumber)}`;
        const outgoing = participants.get(outKey);
        const incoming = participants.get(inKey);
        if (!outgoing || !incoming || outKey === inKey || exited.has(outKey) || entered.has(inKey)) throw new Error('Substitution participants must be recognized, distinct and eligible.');
        exited.set(outKey, minute); entered.set(inKey, minute);
        event.outgoingRegistrationId = outgoing.registrationId; event.incomingRegistrationId = incoming.registrationId;
        event.outgoingPlayerName = outgoing.name; event.incomingPlayerName = incoming.name;
      } else {
        const key = `${team}:${String(event.shirtNumber)}`;
        const player = participants.get(key);
        if (!player) throw new Error('Report participant is not recognized in this team lineup.');
        event.registrationId = player.registrationId; event.playerName = player.name;
        if (kind === 'expulsions') {
          if (exited.has(key) && exited.get(key)! < minute) throw new Error('Player has already left the match.');
          exited.set(key, Math.min(minute, exited.get(key) ?? minute));
        } else activities.push({ key, minute });
        if (kind === 'goals') goals[team]++;
      }
    }
  }
  if (goals.Casa !== result.homeGoals || goals.Ospite !== result.awayGoals) throw new Error('Goal events do not match the final score.');
  for (const activity of activities) {
    if ((exited.get(activity.key) ?? Infinity) <= activity.minute) throw new Error('An event cannot occur after a player leaves the match.');
    if ((entered.get(activity.key) ?? 0) > activity.minute) throw new Error('An event cannot occur before a player enters the match.');
    if (participants.get(activity.key)?.role === 'Riserva' && !entered.has(activity.key)) throw new Error('A reserve must enter before participating in match events.');
  }
  return { ...content, homeTeam: homeName, awayTeam: awayName };
}
