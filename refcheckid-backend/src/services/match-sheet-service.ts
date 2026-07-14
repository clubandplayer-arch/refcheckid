import { randomUUID } from 'node:crypto';

import type { MatchSheet, MatchSheetPhotoSnapshot, MatchSheetStatus, UUID } from '../domain/index.js';
import type { EventPublisher } from '../events/index.js';
import type {
  MatchSheetPlayerRepositoryPort,
  MatchSheetRepositoryPort,
  MatchSheetStaffRepositoryPort,
  PlayerRepository,
  RegistrationRepository,
} from '../repositories/index.js';
import type { PhotoService } from './photo-service.js';

const allowedMatchSheetStatusTransitions: Readonly<
  Record<MatchSheetStatus, readonly MatchSheetStatus[]>
> = {
  draft: ['submitted', 'locked'],
  submitted: ['locked'],
  locked: [],
};

export class MatchSheetNotFoundError extends Error {
  constructor(matchSheetId: UUID) {
    super(`Match sheet ${matchSheetId} was not found.`);
    this.name = 'MatchSheetNotFoundError';
  }
}

export class InvalidMatchSheetStatusTransitionError extends Error {
  constructor(from: MatchSheetStatus, to: MatchSheetStatus) {
    super(`Invalid match sheet status transition from ${from} to ${to}.`);
    this.name = 'InvalidMatchSheetStatusTransitionError';
  }
}

export class LockedMatchSheetError extends Error {
  constructor(matchSheetId: UUID) {
    super(`Match sheet ${matchSheetId} is locked and cannot be modified.`);
    this.name = 'LockedMatchSheetError';
  }
}

export interface MatchSheetServiceDependencies {
  readonly eventPublisher?: EventPublisher;
  readonly matchSheetsRepository: MatchSheetRepositoryPort;
  readonly matchSheetPlayersRepository?: MatchSheetPlayerRepositoryPort;
  readonly matchSheetStaffRepository?: MatchSheetStaffRepositoryPort;
  readonly photosService?: PhotoService;
  readonly playersRepository?: PlayerRepository;
  readonly registrationsRepository?: RegistrationRepository;
}

export interface SubmitMatchSheetPlayerInput {
  readonly playerRegistrationId: UUID;
  readonly shirtNumber: number | null;
  readonly role: string;
}

export interface SubmitMatchSheetStaffInput {
  readonly staffRegistrationId: UUID;
  readonly role: string;
}

export interface SubmitMatchSheetInput {
  readonly players?: readonly SubmitMatchSheetPlayerInput[];
  readonly staff?: readonly SubmitMatchSheetStaffInput[];
}

export class MatchSheetService {
  constructor(private readonly dependencies: MatchSheetServiceDependencies) {}

  getMatchSheetById(matchSheetId: UUID): Promise<MatchSheet | null> {
    return this.dependencies.matchSheetsRepository.findById(matchSheetId);
  }

  listMatchSheetsByMatch(matchId: UUID): Promise<readonly MatchSheet[]> {
    return this.dependencies.matchSheetsRepository.listByMatch(matchId);
  }

  listMatchSheetsByClub(clubId: UUID): Promise<readonly MatchSheet[]> {
    return this.dependencies.matchSheetsRepository.listByClub(clubId);
  }

  async submitMatchSheet(matchSheetId: UUID, input: SubmitMatchSheetInput = {}): Promise<MatchSheet> {
    const matchSheet = await this.dependencies.matchSheetsRepository.findById(matchSheetId);
    if (matchSheet === null) {
      throw new MatchSheetNotFoundError(matchSheetId);
    }
    if (matchSheet.status === 'locked') {
      throw new LockedMatchSheetError(matchSheetId);
    }
    await this.replaceLineup(matchSheetId, input);
    return this.transitionMatchSheetStatus(matchSheetId, 'submitted');
  }

  async lockMatchSheet(matchSheetId: UUID): Promise<MatchSheet> {
    const locked = await this.transitionMatchSheetStatus(matchSheetId, 'locked');
    await this.freezePhotoSnapshots(locked);
    return locked;
  }

  async resetSmokeMatchSheet(matchSheetId: UUID): Promise<MatchSheet> {
    if (process.env.NODE_ENV === 'production' && process.env.REFCHECKID_SMOKE_RESET !== 'true') {
      throw new Error('Smoke reset is available only in dev/smoke environments.');
    }
    const matchSheet = await this.dependencies.matchSheetsRepository.findById(matchSheetId);
    if (matchSheet === null) {
      throw new MatchSheetNotFoundError(matchSheetId);
    }
    return this.dependencies.matchSheetsRepository.updateStatus(matchSheetId, 'draft');
  }

  private async transitionMatchSheetStatus(
    matchSheetId: UUID,
    nextStatus: MatchSheetStatus,
  ): Promise<MatchSheet> {
    const matchSheet = await this.dependencies.matchSheetsRepository.findById(matchSheetId);

    if (matchSheet === null) {
      throw new MatchSheetNotFoundError(matchSheetId);
    }

    if (matchSheet.status === nextStatus) {
      return matchSheet;
    }

    if (matchSheet.status === 'locked') {
      throw new LockedMatchSheetError(matchSheetId);
    }

    if (!allowedMatchSheetStatusTransitions[matchSheet.status].includes(nextStatus)) {
      throw new InvalidMatchSheetStatusTransitionError(matchSheet.status, nextStatus);
    }

    return this.dependencies.matchSheetsRepository.updateStatus(matchSheetId, nextStatus);
  }

  protected get eventPublisher(): EventPublisher | undefined {
    return this.dependencies.eventPublisher;
  }

  private async replaceLineup(matchSheetId: UUID, input: SubmitMatchSheetInput): Promise<void> {
    if (
      this.dependencies.matchSheetPlayersRepository === undefined ||
      this.dependencies.matchSheetStaffRepository === undefined
    ) {
      return;
    }
    await this.dependencies.matchSheetPlayersRepository.replaceByMatchSheet(
      matchSheetId,
      (input.players ?? []).map((player) => ({
        matchSheetId,
        playerRegistrationId: player.playerRegistrationId,
        shirtNumber: player.shirtNumber,
        role: player.role,
        status: 'listed',
      })),
    );
    await this.dependencies.matchSheetStaffRepository.replaceByMatchSheet(
      matchSheetId,
      (input.staff ?? []).map((staffMember) => ({
        matchSheetId,
        staffRegistrationId: staffMember.staffRegistrationId,
        role: staffMember.role,
        status: 'listed',
      })),
    );
  }

  private async freezePhotoSnapshots(matchSheet: MatchSheet): Promise<void> {
    if (
      this.dependencies.matchSheetPlayersRepository === undefined ||
      this.dependencies.matchSheetStaffRepository === undefined ||
      this.dependencies.photosService === undefined ||
      this.dependencies.playersRepository === undefined ||
      this.dependencies.registrationsRepository === undefined
    ) {
      return;
    }
    const {
      matchSheetPlayersRepository,
      matchSheetStaffRepository,
      photosService,
      playersRepository,
      registrationsRepository,
    } = this.dependencies;
    const existingSnapshots = await photosService.listMatchSheetPhotoSnapshots(matchSheet.id);
    if (existingSnapshots.length > 0) return;

    const [players, staff] = await Promise.all([
      matchSheetPlayersRepository.listByMatchSheet(matchSheet.id),
      matchSheetStaffRepository.listByMatchSheet(matchSheet.id),
    ]);

    await Promise.all([
      ...players.map(async (player) => {
        const registration = await registrationsRepository.findPlayerRegistrationById(
          player.playerRegistrationId,
        );
        if (registration === null) return;
        const person = await playersRepository.findById(registration.playerId);
        await this.freezeRegistrationPhoto({
          matchSheet,
          registrationId: player.playerRegistrationId,
          seasonId: registration.season,
          renditionManifest: {
            firstName: person?.firstName ?? 'Tesserato',
            lastName: person?.lastName ?? player.playerRegistrationId,
            shirtNumber: player.shirtNumber,
            roleLabel: player.role,
            teamName: matchSheet.clubId,
            subjectKind: 'player',
          },
        });
      }),
      ...staff.map(async (staffMember) => {
        const registration = await registrationsRepository.findStaffRegistrationById(
          staffMember.staffRegistrationId,
        );
        if (registration === null) return;
        const person = await registrationsRepository.findStaffMemberById(
          registration.staffMemberId,
        );
        await this.freezeRegistrationPhoto({
          matchSheet,
          registrationId: staffMember.staffRegistrationId,
          seasonId: registration.season,
          renditionManifest: {
            firstName: person?.firstName ?? 'Staff',
            lastName: person?.lastName ?? staffMember.staffRegistrationId,
            shirtNumber: null,
            roleLabel: staffMember.role,
            teamName: matchSheet.clubId,
            subjectKind: 'staff',
          },
        });
      }),
    ]);
  }

  private async freezeRegistrationPhoto(input: {
    readonly matchSheet: MatchSheet;
    readonly registrationId: UUID;
    readonly seasonId: string;
    readonly renditionManifest: Record<string, unknown>;
  }): Promise<MatchSheetPhotoSnapshot | null> {
    if (this.dependencies.photosService === undefined) return null;
    const seasonPhoto =
      await this.dependencies.photosService.getSeasonRegistrationPhotoByRegistrationSeason(
        input.registrationId,
        input.seasonId,
      );
    if (seasonPhoto === null) {
      return this.dependencies.photosService.createMatchSheetPhotoSnapshot({
        matchSheetId: input.matchSheet.id,
        matchId: input.matchSheet.matchId,
        registrationId: input.registrationId,
        seasonRegistrationPhotoId: null,
        photoSubjectId: null,
        globalOfficialPhotoId: null,
        photoVersionId: null,
        photoEtag: null,
        photoStatus: 'missing',
        renditionManifest: input.renditionManifest,
        frozenAt: new Date().toISOString(),
        frozenByUserId: '00000000-0000-4000-8000-000000000001',
        freezeReason: 'match_sheet_locked',
        auditCorrelationId: randomUUID(),
      });
    }

    if (seasonPhoto.status !== 'valid') {
      return this.dependencies.photosService.createMatchSheetPhotoSnapshot({
        matchSheetId: input.matchSheet.id,
        matchId: input.matchSheet.matchId,
        registrationId: input.registrationId,
        seasonRegistrationPhotoId: seasonPhoto.id,
        photoSubjectId: seasonPhoto.photoSubjectId,
        globalOfficialPhotoId: seasonPhoto.globalOfficialPhotoId,
        photoVersionId: null,
        photoEtag: null,
        photoStatus: seasonPhoto.status === 'suspended' ? 'suspended' : 'unavailable',
        renditionManifest: input.renditionManifest,
        frozenAt: new Date().toISOString(),
        frozenByUserId: '00000000-0000-4000-8000-000000000001',
        freezeReason: 'match_sheet_locked',
        auditCorrelationId: randomUUID(),
      });
    }

    const version = await this.dependencies.photosService.getPhotoVersionById(
      seasonPhoto.effectiveVersionId,
    );
    if (version === null) {
      return this.dependencies.photosService.createMatchSheetPhotoSnapshot({
        matchSheetId: input.matchSheet.id,
        matchId: input.matchSheet.matchId,
        registrationId: input.registrationId,
        seasonRegistrationPhotoId: seasonPhoto.id,
        photoSubjectId: seasonPhoto.photoSubjectId,
        globalOfficialPhotoId: seasonPhoto.globalOfficialPhotoId,
        photoVersionId: null,
        photoEtag: null,
        photoStatus: 'unavailable',
        renditionManifest: input.renditionManifest,
        frozenAt: new Date().toISOString(),
        frozenByUserId: '00000000-0000-4000-8000-000000000001',
        freezeReason: 'match_sheet_locked',
        auditCorrelationId: randomUUID(),
      });
    }

    return this.dependencies.photosService.createMatchSheetPhotoSnapshot({
      matchSheetId: input.matchSheet.id,
      matchId: input.matchSheet.matchId,
      registrationId: input.registrationId,
      seasonRegistrationPhotoId: seasonPhoto.id,
      photoSubjectId: seasonPhoto.photoSubjectId,
      globalOfficialPhotoId: seasonPhoto.globalOfficialPhotoId,
      photoVersionId: seasonPhoto.effectiveVersionId,
      photoEtag: version.sha256,
      photoStatus: 'active',
      renditionManifest: input.renditionManifest,
      frozenAt: new Date().toISOString(),
      frozenByUserId: '00000000-0000-4000-8000-000000000001',
      freezeReason: 'match_sheet_locked',
      auditCorrelationId: randomUUID(),
    });
  }
}
