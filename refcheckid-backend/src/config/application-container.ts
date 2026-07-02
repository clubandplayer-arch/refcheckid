import { EventDispatcher } from '../events/index.js';
import {
  AuditRepository,
  ClubRepository,
  FederationRepository,
  MatchReportRepository,
  MatchRepository,
  MatchSheetRepository,
  PhotoRepository,
  PlayerRepository,
  RecognitionRepository,
  RefereeRepository,
  RegistrationRepository,
} from '../repositories/index.js';
import {
  AuditService,
  FederationSyncService,
  MatchReportService,
  MatchService,
  MatchSheetService,
  RecognitionService,
} from '../services/index.js';
import { pilotMatches, pilotMatchReports, pilotMatchSheets } from './pilot-data.js';

export interface ApplicationContainer {
  readonly events: EventDispatcher;
  readonly repositories: {
    readonly audit: AuditRepository;
    readonly clubs: ClubRepository;
    readonly federations: FederationRepository;
    readonly matches: MatchRepository;
    readonly matchReports: MatchReportRepository;
    readonly matchSheets: MatchSheetRepository;
    readonly photos: PhotoRepository;
    readonly players: PlayerRepository;
    readonly recognitions: RecognitionRepository;
    readonly referees: RefereeRepository;
    readonly registrations: RegistrationRepository;
  };
  readonly services: {
    readonly audit: AuditService;
    readonly federationSync: FederationSyncService;
    readonly matches: MatchService;
    readonly matchReports: MatchReportService;
    readonly matchSheets: MatchSheetService;
    readonly recognitions: RecognitionService;
  };
}

export function createApplicationContainer(): ApplicationContainer {
  const events = new EventDispatcher();
  const repositories = {
    audit: new AuditRepository(),
    clubs: new ClubRepository(),
    federations: new FederationRepository(),
    matches: new MatchRepository(pilotMatches),
    matchReports: new MatchReportRepository(pilotMatchReports),
    matchSheets: new MatchSheetRepository(pilotMatchSheets),
    photos: new PhotoRepository(),
    players: new PlayerRepository(),
    recognitions: new RecognitionRepository(),
    referees: new RefereeRepository(),
    registrations: new RegistrationRepository(),
  };

  const services = {
    audit: new AuditService({ auditRepository: repositories.audit, eventPublisher: events }),
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
      eventPublisher: events,
    }),
    recognitions: new RecognitionService({
      matchSheetsRepository: repositories.matchSheets,
      recognitionsRepository: repositories.recognitions,
      eventPublisher: events,
    }),
  };

  return { events, repositories, services };
}
