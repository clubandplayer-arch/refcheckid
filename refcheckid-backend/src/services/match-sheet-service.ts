import { randomUUID } from 'node:crypto';
import { requestContext } from '../api/request-context.js';

import type {
  MatchSheet,
  MatchSheetPhotoSnapshot,
  MatchSheetStatus,
  UUID,
} from '../domain/index.js';
import type { EventPublisher } from '../events/index.js';
import type {
  MatchSheetPlayerRepositoryPort,
  MatchSheetRepositoryPort,
  MatchSheetStaffRepositoryPort,
  MatchSheetPhotoSnapshotRepository,
  MatchRepositoryPort,
  PlayerRepository,
  RecognitionRepositoryPort,
  RegistrationRepository,
  MatchReportRepositoryPort,
  ReportDraftRepository,
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

export class MatchSheetPhotoManifestIncompleteError extends Error {
  constructor(
    matchSheetId: UUID,
    readonly expectedRegistrationIds: readonly UUID[],
    readonly actualRegistrationIds: readonly UUID[],
  ) {
    const actual = new Set(actualRegistrationIds);
    const missing = expectedRegistrationIds.filter((registrationId) => !actual.has(registrationId));
    super(
      `Match sheet ${matchSheetId} photo manifest is incomplete: expected ` +
        `${expectedRegistrationIds.length} snapshots, found ${actualRegistrationIds.length}; ` +
        `missing registrations: ${missing.join(', ') || 'none'}.`,
    );
    this.name = 'MatchSheetPhotoManifestIncompleteError';
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
  readonly matchSheetPhotoSnapshotsRepository?: MatchSheetPhotoSnapshotRepository;
  readonly matchesRepository?: MatchRepositoryPort;
  readonly recognitionsRepository?: RecognitionRepositoryPort;
  readonly reportsRepository?: MatchReportRepositoryPort;
  readonly reportDraftsRepository?: ReportDraftRepository;
}

export interface SubmitMatchSheetPlayerInput {
  readonly playerRegistrationId: UUID;
  readonly shirtNumber: number | null;
  readonly role: string;
  readonly lineupOrder?: number;
  readonly isGoalkeeper?: boolean;
  readonly isCaptain?: boolean;
  readonly isViceCaptain?: boolean;
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

  async submitMatchSheet(
    matchSheetId: UUID,
    input: SubmitMatchSheetInput = {},
  ): Promise<MatchSheet> {
    const matchSheet = await this.dependencies.matchSheetsRepository.findById(matchSheetId);
    if (matchSheet === null) {
      throw new MatchSheetNotFoundError(matchSheetId);
    }
    if (matchSheet.status === 'locked') {
      throw new LockedMatchSheetError(matchSheetId);
    }
    await this.validateLineup(matchSheet, input);
    await this.replaceLineup(matchSheetId, input);
    return this.transitionMatchSheetStatus(matchSheetId, 'submitted');
  }

  async saveDraft(matchSheetId: UUID, input: SubmitMatchSheetInput): Promise<MatchSheet> {
    const sheet = await this.dependencies.matchSheetsRepository.findById(matchSheetId);
    if (!sheet) throw new MatchSheetNotFoundError(matchSheetId);
    if (sheet.status !== 'draft') throw new LockedMatchSheetError(matchSheetId);
    await this.validateLineup(sheet, input, true);
    await this.replaceLineup(matchSheetId, input);
    return sheet;
  }

  async lockMatchSheet(matchSheetId: UUID): Promise<MatchSheet> {
    const sheet = await this.dependencies.matchSheetsRepository.findById(matchSheetId);
    if (!sheet) throw new MatchSheetNotFoundError(matchSheetId);
    if (sheet.status !== 'submitted' && sheet.status !== 'locked') {
      throw new InvalidMatchSheetStatusTransitionError(sheet.status, 'locked');
    }
    await this.freezePhotoSnapshots({ ...sheet, status: 'locked' });
    return this.transitionMatchSheetStatus(matchSheetId, 'locked');
  }

  async resetSmokeMatchSheet(matchSheetId: UUID): Promise<MatchSheet> {
    if (process.env.NODE_ENV === 'production' && process.env.REFCHECKID_SMOKE_RESET !== 'true') {
      throw new Error('Smoke reset is available only in dev/smoke environments.');
    }
    const matchSheet = await this.dependencies.matchSheetsRepository.findById(matchSheetId);
    if (matchSheet === null) {
      throw new MatchSheetNotFoundError(matchSheetId);
    }
    const matchSheets = await this.dependencies.matchSheetsRepository.listByMatch(
      matchSheet.matchId,
    );
    await Promise.all(
      matchSheets.map(async (sheet) => {
        await this.dependencies.matchSheetsRepository.updateStatus(sheet.id, 'draft');
        await this.dependencies.matchSheetPlayersRepository?.replaceByMatchSheet(sheet.id, []);
        await this.dependencies.matchSheetStaffRepository?.replaceByMatchSheet(sheet.id, []);
        await this.dependencies.matchSheetPhotoSnapshotsRepository?.deleteByMatchSheet(sheet.id);
      }),
    );
    await this.dependencies.recognitionsRepository?.updateWorkflowStatus(
      matchSheet.matchId,
      'not_started',
    );
    await this.dependencies.recognitionsRepository?.resetByMatch?.(matchSheet.matchId);
    await this.dependencies.reportsRepository?.resetByMatch?.(matchSheet.matchId);
    if (await this.dependencies.reportDraftsRepository?.findById(matchSheet.matchId)) {
      await this.dependencies.reportDraftsRepository?.update(matchSheet.matchId, { deletedAt: new Date().toISOString() });
    }
    await this.dependencies.matchesRepository?.updateStatus(matchSheet.matchId, 'scheduled');
    return (await this.dependencies.matchSheetsRepository.findById(matchSheetId)) ?? matchSheet;
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
      (input.players ?? []).map((player, index) => ({
        matchSheetId,
        playerRegistrationId: player.playerRegistrationId,
        shirtNumber: player.shirtNumber,
        role: player.role,
        lineupOrder: player.lineupOrder ?? index,
        isGoalkeeper: player.isGoalkeeper ?? false,
        isCaptain: player.isCaptain ?? false,
        isViceCaptain: player.isViceCaptain ?? false,
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

  private async validateLineup(sheet: MatchSheet, input: SubmitMatchSheetInput, allowEmpty = false): Promise<void> {
    if (!this.dependencies.registrationsRepository || !this.dependencies.matchesRepository) return;
    const match = await this.dependencies.matchesRepository.findById(sheet.matchId);
    if (!match || match.status !== 'scheduled') throw new Error('Lineups can be submitted only for a scheduled match.');
    const ids = [...(input.players ?? []).map((p) => p.playerRegistrationId), ...(input.staff ?? []).map((p) => p.staffRegistrationId)];
    if (new Set(ids).size !== ids.length) throw new Error('Duplicate registration in lineup.');
    if (!allowEmpty && !input.players?.length) throw new Error('A lineup must contain players.');
    if ((input.players ?? []).some((player) => !['starter', 'reserve'].includes(player.role) || (!allowEmpty && player.shirtNumber === null))) throw new Error('Players require a valid lineup role and shirt number before submission.');
    const numbers = (input.players ?? []).map((p) => p.shirtNumber).filter((n) => n !== null);
    if (new Set(numbers).size !== numbers.length || numbers.some((n) => !Number.isInteger(n) || n < 1 || n > 99)) throw new Error('Shirt numbers must be unique integers between 1 and 99.');
    for (const row of input.players ?? []) {
      const registration = await this.dependencies.registrationsRepository.findPlayerRegistrationById(row.playerRegistrationId);
      if (!registration || registration.deletedAt !== null || registration.clubId !== sheet.clubId || registration.season !== match.season || registration.status !== 'active') throw new Error('Player registration is not eligible for this lineup.');
    }
    for (const row of input.staff ?? []) {
      const registration = await this.dependencies.registrationsRepository.findStaffRegistrationById(row.staffRegistrationId);
      if (!registration || registration.deletedAt !== null || registration.clubId !== sheet.clubId || registration.season !== match.season || registration.status !== 'active') throw new Error('Staff registration is not eligible for this lineup.');
    }
  }

  private async freezePhotoSnapshots(matchSheet: MatchSheet): Promise<void> {
    if (
      this.dependencies.matchSheetPlayersRepository === undefined ||
      this.dependencies.matchSheetStaffRepository === undefined ||
      this.dependencies.photosService === undefined ||
      this.dependencies.playersRepository === undefined ||
      this.dependencies.registrationsRepository === undefined ||
      this.dependencies.matchSheetPhotoSnapshotsRepository === undefined
    ) {
      return;
    }
    const {
      matchSheetPlayersRepository,
      matchSheetStaffRepository,
      photosService,
      playersRepository,
      registrationsRepository,
      matchSheetPhotoSnapshotsRepository,
    } = this.dependencies;

    const [players, staff] = await Promise.all([
      matchSheetPlayersRepository.listByMatchSheet(matchSheet.id),
      matchSheetStaffRepository.listByMatchSheet(matchSheet.id),
    ]);

    const expectedRegistrationIds = [
      ...players.map((player) => player.playerRegistrationId),
      ...staff.map((staffMember) => staffMember.staffRegistrationId),
    ];
    const existingSnapshots = await photosService.listMatchSheetPhotoSnapshots(matchSheet.id);
    if (hasExactSnapshotCoverage(expectedRegistrationIds, existingSnapshots) && existingSnapshots.every((row) => row.matchId === matchSheet.matchId)) return;

    if (expectedRegistrationIds.length === 0) {
      throw new MatchSheetPhotoManifestIncompleteError(
        matchSheet.id,
        expectedRegistrationIds,
        existingSnapshots.map((snapshot) => snapshot.registrationId),
      );
    }

    // Photo metadata survives process restarts while the demo lineup repositories do not.
    // Rebuild an incomplete or stale manifest from the current locked lineup instead of treating
    // the presence of any old snapshot as proof that the manifest is ready.
    await matchSheetPhotoSnapshotsRepository.deleteByMatchSheet(matchSheet.id);

    const outcomes = await Promise.allSettled([
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
            roleLabel: toMatchSheetPlayerRoleLabel(player.role),
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
    const failure = outcomes.find((result): result is PromiseRejectedResult => result.status === 'rejected');
    if (failure) throw failure.reason;

    const rebuiltSnapshots = await photosService.listMatchSheetPhotoSnapshots(matchSheet.id);
    if (!hasExactSnapshotCoverage(expectedRegistrationIds, rebuiltSnapshots)) {
      throw new MatchSheetPhotoManifestIncompleteError(
        matchSheet.id,
        expectedRegistrationIds,
        rebuiltSnapshots.map((snapshot) => snapshot.registrationId),
      );
    }
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
        frozenByUserId: requestContext.getStore()?.auth?.actorId ?? '00000000-0000-4000-8000-000000000001',
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
        frozenByUserId: requestContext.getStore()?.auth?.actorId ?? '00000000-0000-4000-8000-000000000001',
        freezeReason: 'match_sheet_locked',
        auditCorrelationId: randomUUID(),
      });
    }

    const version = await this.dependencies.photosService.getPhotoVersionById(
      seasonPhoto.effectiveVersionId,
    );
    if (version === null || version.status !== 'active') {
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
        frozenByUserId: requestContext.getStore()?.auth?.actorId ?? '00000000-0000-4000-8000-000000000001',
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
      frozenByUserId: requestContext.getStore()?.auth?.actorId ?? '00000000-0000-4000-8000-000000000001',
      freezeReason: 'match_sheet_locked',
      auditCorrelationId: randomUUID(),
    });
  }
}

function hasExactSnapshotCoverage(
  expectedRegistrationIds: readonly UUID[],
  snapshots: readonly MatchSheetPhotoSnapshot[],
): boolean {
  if (expectedRegistrationIds.length === 0) return false;
  if (expectedRegistrationIds.length !== snapshots.length) return false;
  const expected = new Set(expectedRegistrationIds);
  const actual = new Set(snapshots.map((snapshot) => snapshot.registrationId));
  if (expected.size !== expectedRegistrationIds.length || actual.size !== snapshots.length) {
    return false;
  }
  return (
    expected.size === actual.size &&
    [...expected].every((registrationId) => actual.has(registrationId))
  );
}

function toMatchSheetPlayerRoleLabel(role: string): string {
  if (role === 'starter') return 'Titolare';
  if (role === 'reserve') return 'Riserva';
  return role;
}
