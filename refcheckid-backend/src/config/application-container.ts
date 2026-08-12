import { EventDispatcher } from '../events/index.js';
import {
  AuditRepository,
  ClubRepository,
  FederationRepository,
  FederationImportBatchRepository,
  FederationImportRowRepository,
  MatchReportRepository,
  MatchSheetPlayerRepository,
  MatchRepository,
  MatchSheetRepository,
  MatchSheetStaffRepository,
  GlobalOfficialPhotoRepository,
  MatchSheetPhotoSnapshotRepository,
  PhotoAccessGrantRepository,
  PhotoApprovalRepository,
  PhotoAuditEventRepository,
  PhotoRepository,
  PhotoSubjectRepository,
  PhotoSyncCursorRepository,
  PhotoVersionRepository,
  PlayerRepository,
  SeasonRegistrationPhotoRepository,
  RecognitionRepository,
  RefereeRepository,
  RegistrationRepository,
} from '../repositories/index.js';
import {
  AuditService,
  FederationImportService,
  FederationSyncService,
  MatchReportService,
  MatchService,
  MatchSheetService,
  PhotoService,
  RecognitionService,
  LocalPhotoObjectStore,
} from '../services/index.js';
import { pilotMatches, pilotMatchReports, pilotMatchSheets } from './pilot-data.js';

export interface ApplicationContainer {
  readonly events: EventDispatcher;
  readonly repositories: {
    readonly audit: AuditRepository;
    readonly clubs: ClubRepository;
    readonly federations: FederationRepository;
    readonly federationImportBatches: FederationImportBatchRepository;
    readonly federationImportRows: FederationImportRowRepository;
    readonly matches: MatchRepository;
    readonly matchReports: MatchReportRepository;
    readonly matchSheets: MatchSheetRepository;
    readonly matchSheetPlayers: MatchSheetPlayerRepository;
    readonly matchSheetStaff: MatchSheetStaffRepository;
    readonly photos: PhotoRepository;
    readonly photoSubjects: PhotoSubjectRepository;
    readonly globalOfficialPhotos: GlobalOfficialPhotoRepository;
    readonly seasonRegistrationPhotos: SeasonRegistrationPhotoRepository;
    readonly photoVersions: PhotoVersionRepository;
    readonly photoApprovals: PhotoApprovalRepository;
    readonly matchSheetPhotoSnapshots: MatchSheetPhotoSnapshotRepository;
    readonly photoAccessGrants: PhotoAccessGrantRepository;
    readonly photoAuditEvents: PhotoAuditEventRepository;
    readonly photoSyncCursors: PhotoSyncCursorRepository;
    readonly players: PlayerRepository;
    readonly recognitions: RecognitionRepository;
    readonly referees: RefereeRepository;
    readonly registrations: RegistrationRepository;
  };
  readonly services: {
    readonly audit: AuditService;
    readonly federationImports: FederationImportService;
    readonly federationSync: FederationSyncService;
    readonly matches: MatchService;
    readonly matchReports: MatchReportService;
    readonly matchSheets: MatchSheetService;
    readonly photos: PhotoService;
    readonly recognitions: RecognitionService;
  };
  readonly objectStores: {
    readonly photos: LocalPhotoObjectStore;
  };
}

export interface ApplicationContainerOptions {
  readonly runtimeStateRoot?: string | null;
  readonly photoMetadataRoot?: string | null;
  readonly photoStorageRoot?: string;
}

export function createApplicationContainer(
  options: ApplicationContainerOptions = {},
): ApplicationContainer {
  const events = new EventDispatcher();
  const runtimeStateRoot = options.runtimeStateRoot;
  const repositories = {
    audit: new AuditRepository(),
    clubs: new ClubRepository([], runtimeStateRoot),
    federations: new FederationRepository([], runtimeStateRoot),
    federationImportBatches: new FederationImportBatchRepository(),
    federationImportRows: new FederationImportRowRepository(),
    matches: new MatchRepository(pilotMatches, runtimeStateRoot),
    matchReports: new MatchReportRepository(pilotMatchReports, runtimeStateRoot),
    matchSheets: new MatchSheetRepository(pilotMatchSheets, runtimeStateRoot),
    matchSheetPlayers: new MatchSheetPlayerRepository([], runtimeStateRoot),
    matchSheetStaff: new MatchSheetStaffRepository([], runtimeStateRoot),
    photos: new PhotoRepository([], options.photoMetadataRoot),
    photoSubjects: new PhotoSubjectRepository([], options.photoMetadataRoot),
    globalOfficialPhotos: new GlobalOfficialPhotoRepository([], options.photoMetadataRoot),
    seasonRegistrationPhotos: new SeasonRegistrationPhotoRepository([], options.photoMetadataRoot),
    photoVersions: new PhotoVersionRepository([], options.photoMetadataRoot),
    photoApprovals: new PhotoApprovalRepository([], options.photoMetadataRoot),
    matchSheetPhotoSnapshots: new MatchSheetPhotoSnapshotRepository([], options.photoMetadataRoot),
    photoAccessGrants: new PhotoAccessGrantRepository([], options.photoMetadataRoot),
    photoAuditEvents: new PhotoAuditEventRepository([], options.photoMetadataRoot),
    photoSyncCursors: new PhotoSyncCursorRepository([], options.photoMetadataRoot),
    players: new PlayerRepository([], runtimeStateRoot),
    recognitions: new RecognitionRepository([], runtimeStateRoot),
    referees: new RefereeRepository([], runtimeStateRoot),
    registrations: new RegistrationRepository([], runtimeStateRoot),
  };

  const objectStores = {
    photos:
      options.photoStorageRoot === undefined
        ? new LocalPhotoObjectStore()
        : new LocalPhotoObjectStore(options.photoStorageRoot),
  };
  const photosService = new PhotoService({
    objectStore: objectStores.photos,
    photoSubjects: repositories.photoSubjects,
    globalOfficialPhotos: repositories.globalOfficialPhotos,
    seasonRegistrationPhotos: repositories.seasonRegistrationPhotos,
    photoVersions: repositories.photoVersions,
    photoApprovals: repositories.photoApprovals,
    matchSheetPhotoSnapshots: repositories.matchSheetPhotoSnapshots,
    photoAccessGrants: repositories.photoAccessGrants,
    photoAuditEvents: repositories.photoAuditEvents,
    registrations: repositories.registrations,
  });

  const services = {
    audit: new AuditService({ auditRepository: repositories.audit, eventPublisher: events }),
    federationImports: new FederationImportService({
      importBatches: repositories.federationImportBatches,
      importRows: repositories.federationImportRows,
      clubs: repositories.clubs,
      players: repositories.players,
      registrations: repositories.registrations,
    }),
    federationSync: new FederationSyncService({
      clubsRepository: repositories.clubs,
      eventPublisher: events,
      federationsRepository: repositories.federations,
      matchesRepository: repositories.matches,
      playersRepository: repositories.players,
      refereesRepository: repositories.referees,
      registrationsRepository: repositories.registrations,
    }),
    matches: new MatchService({ matchesRepository: repositories.matches, eventPublisher: events }),
    matchReports: new MatchReportService({
      matchesRepository: repositories.matches,
      reportsRepository: repositories.matchReports,
      eventPublisher: events,
    }),
    matchSheets: new MatchSheetService({
      matchSheetsRepository: repositories.matchSheets,
      matchSheetPlayersRepository: repositories.matchSheetPlayers,
      matchSheetStaffRepository: repositories.matchSheetStaff,
      photosService,
      playersRepository: repositories.players,
      registrationsRepository: repositories.registrations,
      matchSheetPhotoSnapshotsRepository: repositories.matchSheetPhotoSnapshots,
      matchesRepository: repositories.matches,
      recognitionsRepository: repositories.recognitions,
      eventPublisher: events,
    }),
    photos: photosService,
    recognitions: undefined as never,
  };

  const completedServices = {
    ...services,
    recognitions: new RecognitionService({
      matchSheetPlayersRepository: repositories.matchSheetPlayers,
      matchSheetsRepository: repositories.matchSheets,
      matchSheetStaffRepository: repositories.matchSheetStaff,
      matchSheetPhotoSnapshotsRepository: repositories.matchSheetPhotoSnapshots,
      recognitionsRepository: repositories.recognitions,
      eventPublisher: events,
    }),
  };

  return { events, repositories, services: completedServices, objectStores };
}
