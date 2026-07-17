const defaultApiBaseUrl = 'http://localhost:4000/api/v1';
const defaultClubId = '70000000-0000-4000-8000-000000000003';
const defaultCredentials = {
  email: 'dirigente@refcheckid.local',
  password: 'Password123!',
};

const apiBaseUrl = (process.env.REFCHECKID_API_BASE_URL ?? defaultApiBaseUrl).replace(/\/$/, '');
const clubId = process.env.REFCHECKID_MANAGER_CLUB_ID ?? defaultClubId;
const credentials = {
  email: process.env.REFCHECKID_MANAGER_EMAIL ?? defaultCredentials.email,
  password: process.env.REFCHECKID_MANAGER_PASSWORD ?? defaultCredentials.password,
};

const session = await postJson('/auth/login', credentials);
const authHeaders = { authorization: `Bearer ${session.accessToken}` };

const [players, playerRegistrations, staffMembers, staffRegistrations, matchSheets] = await Promise.all([
  getJson('/players', authHeaders),
  getJson(`/player-registrations?clubId=${encodeURIComponent(clubId)}`, authHeaders),
  getJson('/staff-members', authHeaders),
  getJson(`/staff-registrations?clubId=${encodeURIComponent(clubId)}`, authHeaders),
  getJson(`/match-sheets?clubId=${encodeURIComponent(clubId)}`, authHeaders),
]);

const registrationByPlayerId = new Map(
  playerRegistrations.map((registration) => [String(registration.playerId), registration]),
);
const staffRegistrationByStaffMemberId = new Map(
  staffRegistrations.map((registration) => [String(registration.staffMemberId), registration]),
);

const playerJoin = players.map((player) => {
  const playerId = String(player.id);
  const registration = registrationByPlayerId.get(playerId) ?? null;
  return {
    id: playerId,
    firstName: String(player.firstName ?? player.first_name ?? ''),
    lastName: String(player.lastName ?? player.last_name ?? ''),
    join: registration !== null,
    matchingRegistrationId: registration?.id ?? null,
    failedCondition:
      registration === null
        ? `registrationByPlayerId.get(String(player.id)) returned undefined for ${playerId}`
        : null,
  };
});

const staffJoin = staffMembers.map((staffMember) => {
  const staffMemberId = String(staffMember.id);
  const registration = staffRegistrationByStaffMemberId.get(staffMemberId) ?? null;
  return {
    id: staffMemberId,
    fullName: String(staffMember.fullName ?? staffMember.full_name ?? staffMember.id),
    join: registration !== null,
    matchingRegistrationId: registration?.id ?? null,
    failedCondition:
      registration === null
        ? `registrationByStaffId.get(String(staffMember.id)) returned undefined for ${staffMemberId}`
        : null,
  };
});

const fetchPlayersItems = playerJoin.filter((row) => row.join).length;
const fetchStaffItems = staffJoin.filter((row) => row.join).length;

console.log(
  JSON.stringify(
    {
      apiBaseUrl,
      clubId,
      counts: {
        players: players.length,
        playerRegistrations: playerRegistrations.length,
        playerJoinMatches: fetchPlayersItems,
        fetchPlayersItems,
        staffMembers: staffMembers.length,
        staffRegistrations: staffRegistrations.length,
        staffJoinMatches: fetchStaffItems,
        fetchStaffItems,
        matchSheets: matchSheets.length,
      },
      playerRegistrationKeys: playerRegistrations.map((registration) => String(registration.playerId)),
      players: playerJoin,
      playerRegistrations: playerRegistrations.map((registration) => ({
        id: registration.id,
        playerId: registration.playerId,
        clubId: registration.clubId,
        season: registration.season,
        status: registration.status,
      })),
      staffRegistrationKeys: staffRegistrations.map((registration) => String(registration.staffMemberId)),
      staff: staffJoin,
      staffRegistrations: staffRegistrations.map((registration) => ({
        id: registration.id,
        staffMemberId: registration.staffMemberId,
        clubId: registration.clubId,
        season: registration.season,
        role: registration.role,
        status: registration.status,
      })),
      ui: {
        fetchedPlayers: fetchPlayersItems,
        filteredPlayersWithEmptySearch: fetchPlayersItems,
        playersEmptyState: fetchPlayersItems === 0 ? 'Nessun giocatore trovato.' : null,
        fetchedStaff: fetchStaffItems,
        staffEmptyState: fetchStaffItems === 0 ? 'Nessuno staff disponibile.' : null,
      },
    },
    null,
    2,
  ),
);

async function getJson(path, headers) {
  return requestJson(path, { headers });
}

async function postJson(path, body) {
  return requestJson(path, {
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  });
}

async function requestJson(path, init = {}) {
  const response = await fetch(`${apiBaseUrl}${path}`, init);
  const body = await response.json();
  if (!response.ok) {
    throw new Error(`${init.method ?? 'GET'} ${path} failed with ${response.status}: ${JSON.stringify(body)}`);
  }
  return body;
}
