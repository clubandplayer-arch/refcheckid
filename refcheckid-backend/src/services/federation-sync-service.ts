import type {
  Club,
  Federation,
  Match,
  Player,
  PlayerRegistration,
  Referee,
  StaffMember,
  StaffRegistration,
} from '../domain/index.js';
import type { EventPublisher } from '../events/index.js';
import type {
  ClubRepository,
  FederationRepository,
  MatchRepositoryPort,
  PlayerRepository,
  RefereeRepository,
  RegistrationRepository,
} from '../repositories/index.js';

export interface FederationSyncPayload {
  readonly federations?: readonly Federation[];
  readonly clubs?: readonly Club[];
  readonly referees?: readonly Referee[];
  readonly players?: readonly Player[];
  readonly playerRegistrations?: readonly PlayerRegistration[];
  readonly staffMembers?: readonly StaffMember[];
  readonly staffRegistrations?: readonly StaffRegistration[];
  readonly matches?: readonly Match[];
}

export interface FederationSyncResult {
  readonly federations: number;
  readonly clubs: number;
  readonly referees: number;
  readonly players: number;
  readonly playerRegistrations: number;
  readonly staffMembers: number;
  readonly staffRegistrations: number;
  readonly matches: number;
}

export interface FederationSyncServiceDependencies {
  readonly eventPublisher?: EventPublisher;
  readonly federationsRepository: FederationRepository;
  readonly clubsRepository: ClubRepository;
  readonly refereesRepository: RefereeRepository;
  readonly playersRepository: PlayerRepository;
  readonly registrationsRepository: RegistrationRepository;
  readonly matchesRepository: MatchRepositoryPort & { upsert(entity: Match): Promise<Match> };
}

export class FederationSyncService {
  constructor(private readonly dependencies: FederationSyncServiceDependencies) {}

  async syncFederations(federations: readonly Federation[]): Promise<number> {
    await Promise.all(
      federations.map((federation) => this.dependencies.federationsRepository.upsert(federation)),
    );
    return federations.length;
  }

  async syncClubs(clubs: readonly Club[]): Promise<number> {
    await Promise.all(clubs.map((club) => this.dependencies.clubsRepository.upsert(club)));
    return clubs.length;
  }

  async syncReferees(referees: readonly Referee[]): Promise<number> {
    await Promise.all(
      referees.map((referee) => this.dependencies.refereesRepository.upsert(referee)),
    );
    return referees.length;
  }

  async syncPlayers(players: readonly Player[]): Promise<number> {
    await Promise.all(players.map((player) => this.dependencies.playersRepository.upsert(player)));
    return players.length;
  }

  async syncPlayerRegistrations(registrations: readonly PlayerRegistration[]): Promise<number> {
    await Promise.all(
      registrations.map((registration) =>
        this.dependencies.registrationsRepository.upsert(registration),
      ),
    );
    return registrations.length;
  }

  async syncStaff(
    staffMembers: readonly StaffMember[],
    staffRegistrations: readonly StaffRegistration[],
  ): Promise<{
    readonly staffMembers: number;
    readonly staffRegistrations: number;
  }> {
    await Promise.all(
      staffMembers.map((staffMember) =>
        this.dependencies.registrationsRepository.syncStaffMember(staffMember),
      ),
    );
    await Promise.all(
      staffRegistrations.map((staffRegistration) =>
        this.dependencies.registrationsRepository.syncStaffRegistration(staffRegistration),
      ),
    );

    return { staffMembers: staffMembers.length, staffRegistrations: staffRegistrations.length };
  }

  async syncMatches(matches: readonly Match[]): Promise<number> {
    await Promise.all(matches.map((match) => this.dependencies.matchesRepository.upsert(match)));
    return matches.length;
  }

  async syncAll(payload: FederationSyncPayload): Promise<FederationSyncResult> {
    const federations = await this.syncFederations(payload.federations ?? []);
    const clubs = await this.syncClubs(payload.clubs ?? []);
    const referees = await this.syncReferees(payload.referees ?? []);
    const players = await this.syncPlayers(payload.players ?? []);
    const playerRegistrations = await this.syncPlayerRegistrations(
      payload.playerRegistrations ?? [],
    );
    const staff = await this.syncStaff(
      payload.staffMembers ?? [],
      payload.staffRegistrations ?? [],
    );
    const matches = await this.syncMatches(payload.matches ?? []);

    return {
      federations,
      clubs,
      referees,
      players,
      playerRegistrations,
      staffMembers: staff.staffMembers,
      staffRegistrations: staff.staffRegistrations,
      matches,
    };
  }

  protected get eventPublisher(): EventPublisher | undefined {
    return this.dependencies.eventPublisher;
  }
}
