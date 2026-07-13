export function buildFederationSyncPayload(manifest) {
  const timestamp = manifest.generatedAt;

  return {
    clubs: manifest.clubs.map((club) => ({
      createdAt: timestamp,
      deletedAt: null,
      federationId: club.federationId,
      fiscalCode: null,
      id: club.id,
      name: club.name,
      status: 'active',
      updatedAt: timestamp,
    })),
    federations: [
      {
        createdAt: timestamp,
        deletedAt: null,
        fiscalCode: null,
        id: manifest.federation.id,
        name: manifest.federation.name,
        status: 'active',
        updatedAt: timestamp,
      },
    ],
    matches: manifest.matches.map((match) => ({
      awayClubId: match.awayClubId,
      createdAt: timestamp,
      deletedAt: null,
      federationId: match.federationId,
      homeClubId: match.homeClubId,
      id: match.id,
      refereeId: match.refereeId,
      scheduledAt: match.scheduledAt,
      season: match.season,
      status: match.status,
      updatedAt: timestamp,
      venue: match.venue,
    })),
    playerRegistrations: manifest.playerRegistrations.map((registration, index) => ({
      clubId: registration.clubId,
      createdAt: timestamp,
      deletedAt: null,
      id: registration.id,
      playerId: registration.playerId,
      registeredAt: timestamp,
      registrationNumber: buildRegistrationNumber('P', registration, index),
      season: registration.season,
      status: registration.status,
      updatedAt: timestamp,
    })),
    players: manifest.players.map((player, index) => ({
      birthDate: buildBirthDate(index),
      birthPlace: null,
      createdAt: timestamp,
      deletedAt: null,
      federationId: player.federationId,
      firstName: player.firstName,
      fiscalCode: null,
      id: player.id,
      lastName: player.lastName,
      status: 'active',
      updatedAt: timestamp,
    })),
    referees: manifest.referees.map((referee) => ({
      createdAt: timestamp,
      deletedAt: null,
      federationId: referee.federationId,
      firstName: referee.firstName,
      fiscalCode: null,
      id: referee.id,
      lastName: referee.lastName,
      status: 'active',
      updatedAt: timestamp,
    })),
    staffMembers: manifest.staffMembers.map((staffMember) => ({
      birthDate: null,
      createdAt: timestamp,
      deletedAt: null,
      federationId: staffMember.federationId,
      firstName: staffMember.firstName,
      fiscalCode: null,
      id: staffMember.id,
      lastName: staffMember.lastName,
      status: 'active',
      updatedAt: timestamp,
    })),
    staffRegistrations: manifest.staffRegistrations.map((registration, index) => {
      const staffMember = manifest.staffMembers.find(
        (candidate) => candidate.id === registration.staffMemberId,
      );

      return {
        clubId: registration.clubId,
        createdAt: timestamp,
        deletedAt: null,
        id: registration.id,
        registrationNumber: buildRegistrationNumber('S', registration, index),
        role: staffMember?.role ?? 'Staff',
        season: registration.season,
        staffMemberId: registration.staffMemberId,
        status: registration.status,
        updatedAt: timestamp,
      };
    }),
  };
}

export function expectedFederationSyncCounts(manifest) {
  return {
    clubs: manifest.clubs.length,
    federations: 1,
    matches: manifest.matches.length,
    playerRegistrations: manifest.playerRegistrations.length,
    players: manifest.players.length,
    referees: manifest.referees.length,
    staffMembers: manifest.staffMembers.length,
    staffRegistrations: manifest.staffRegistrations.length,
  };
}

export function assertFederationSyncCounts(actual, expected) {
  for (const [key, value] of Object.entries(expected)) {
    if (actual?.[key] !== value) {
      throw new Error(
        `Federation Sync count mismatch for ${key}: expected ${value}, received ${actual?.[key]}`,
      );
    }
  }
}

function buildRegistrationNumber(prefix, registration, index) {
  return `${registration.season}-${prefix}-${String(index + 1).padStart(3, '0')}`;
}

function buildBirthDate(index) {
  const year = 1998 + (index % 8);
  const month = String((index % 12) + 1).padStart(2, '0');
  const day = String((index % 27) + 1).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
