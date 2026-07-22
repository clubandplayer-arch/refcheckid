import type {
  FederationImportBatch,
  FederationImportRow,
  FederationImportStatus,
  FederationImportType,
  ISODateTime,
  UUID,
} from '../domain/index.js';
import type {
  FederationImportBatchFilter,
  FederationImportBatchRepository,
  FederationImportRowRepository,
} from '../repositories/index.js';

export class FederationImportAuthorizationError extends Error {
  constructor(message = 'Federation import requires federation or admin scope.') {
    super(message);
    this.name = 'FederationImportAuthorizationError';
  }
}

export class FederationImportInvariantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FederationImportInvariantError';
  }
}

export interface FederationImportActorContext {
  readonly actorId: UUID;
  readonly roles: readonly string[];
  readonly federationIds?: readonly UUID[];
}

export interface FederationImportServiceDependencies {
  readonly importBatches: FederationImportBatchRepository;
  readonly importRows: FederationImportRowRepository;
  readonly now?: () => ISODateTime;
}

export interface ParseFederationImportBatchCommand {
  readonly batchId: UUID;
  readonly csvContent: string;
  readonly context: FederationImportActorContext;
}

export interface FederationImportParseResult {
  readonly importBatch: FederationImportBatch;
  readonly detectedType: FederationImportType;
  readonly confidence: number;
  readonly mapping: Record<string, string>;
  readonly warnings: readonly string[];
  readonly rows: readonly FederationImportRow[];
}

export interface CreateFederationImportBatchCommand {
  readonly federationId: UUID;
  readonly importType: FederationImportType;
  readonly originalFilename: string;
  readonly mimeType: string;
  readonly fileSizeBytes: number;
  readonly sha256: string;
  readonly sourceSystem?: string | null;
  readonly context: FederationImportActorContext;
}

export class FederationImportService {
  private readonly now: () => ISODateTime;

  constructor(private readonly dependencies: FederationImportServiceDependencies) {
    this.now = dependencies.now ?? (() => new Date().toISOString());
  }

  async createBatch(command: CreateFederationImportBatchCommand): Promise<FederationImportBatch> {
    this.assertCanAccessFederation(command.context, command.federationId);
    if (!Number.isFinite(command.fileSizeBytes) || command.fileSizeBytes < 0) {
      throw new FederationImportInvariantError(
        'fileSizeBytes must be a finite number greater than or equal to zero.',
      );
    }
    const uploadedAt = this.now();
    return this.dependencies.importBatches.create({
      federationId: command.federationId,
      importType: command.importType,
      originalFilename: command.originalFilename,
      mimeType: command.mimeType,
      fileSizeBytes: command.fileSizeBytes,
      sha256: command.sha256,
      uploadedByUserId: command.context.actorId,
      uploadedAt,
      status: 'uploaded',
      sourceSystem: command.sourceSystem ?? null,
      declaredType: command.importType,
      detectedType: null,
      totalRows: 0,
      validRows: 0,
      warningRows: 0,
      errorRows: 0,
      committedRows: 0,
      mappingConfig: null,
      report: null,
    });
  }

  async listBatches(
    context: FederationImportActorContext,
    filter: FederationImportBatchFilter = {},
  ): Promise<readonly FederationImportBatch[]> {
    const scopedFilter = this.scopedFilter(context, filter);
    return this.dependencies.importBatches.listByFilter(scopedFilter);
  }

  async getBatch(
    context: FederationImportActorContext,
    batchId: UUID,
  ): Promise<FederationImportBatch | null> {
    const batch = await this.dependencies.importBatches.findById(batchId);
    if (batch === null) return null;
    this.assertCanAccessFederation(context, batch.federationId);
    return batch;
  }

  async listRows(
    context: FederationImportActorContext,
    batchId: UUID,
    filter: { readonly status?: FederationImportRow['status'] } = {},
  ): Promise<readonly FederationImportRow[]> {
    const batch = await this.getBatch(context, batchId);
    if (batch === null) return [];
    return this.dependencies.importRows.listByBatch(batch.id, filter);
  }

  async parseBatch(
    command: ParseFederationImportBatchCommand,
  ): Promise<FederationImportParseResult> {
    const batch = await this.getBatch(command.context, command.batchId);
    if (batch === null) throw new FederationImportInvariantError('Import batch was not found.');
    const existingRows = await this.dependencies.importRows.listByBatch(batch.id);
    if (existingRows.length > 0) {
      throw new FederationImportInvariantError('Import batch has already been parsed.');
    }

    const parsed = parseCsv(command.csvContent);
    const detection = detectImportType(parsed.headers);
    const mapping = mapColumns(parsed.headers, detection.detectedType);
    const warnings = [
      ...detection.warnings,
      ...missingRequiredColumns(detection.detectedType, mapping),
      ...(detection.detectedType === batch.importType
        ? []
        : [
            `Detected type ${detection.detectedType} differs from declared type ${batch.importType}.`,
          ]),
    ];

    const rows: FederationImportRow[] = [];
    for (const [index, rawData] of parsed.rows.entries()) {
      rows.push(
        await this.dependencies.importRows.create({
          batchId: batch.id,
          rowNumber: index + 2,
          rawData,
          normalizedData: normalizeRow(rawData, mapping),
          status: 'pending',
          errors: [],
          warnings: [],
          targetEntityType: null,
          targetEntityId: null,
        }),
      );
    }

    const updatedBatch = await this.dependencies.importBatches.update(batch.id, {
      status: 'mapped',
      detectedType: detection.detectedType,
      totalRows: rows.length,
      mappingConfig: {
        columns: mapping,
        headers: parsed.headers,
        confidence: detection.confidence,
      },
      report: {
        phase: 'parser_mapping',
        warnings,
        sampleRows: rows.slice(0, 5).map((row) => ({
          rowNumber: row.rowNumber,
          normalizedData: row.normalizedData,
        })),
      },
    });

    return {
      importBatch: updatedBatch,
      detectedType: detection.detectedType,
      confidence: detection.confidence,
      mapping,
      warnings,
      rows,
    };
  }

  async transitionBatchStatus(
    context: FederationImportActorContext,
    batchId: UUID,
    status: FederationImportStatus,
  ): Promise<FederationImportBatch> {
    const batch = await this.getBatch(context, batchId);
    if (batch === null) throw new FederationImportInvariantError('Import batch was not found.');
    return this.dependencies.importBatches.update(batch.id, { status });
  }

  private scopedFilter(
    context: FederationImportActorContext,
    filter: FederationImportBatchFilter,
  ): FederationImportBatchFilter {
    if (context.roles.includes('admin')) return filter;
    const federationId = filter.federationId ?? context.federationIds?.[0];
    if (federationId === undefined) throw new FederationImportAuthorizationError();
    this.assertCanAccessFederation(context, federationId);
    return { ...filter, federationId };
  }

  private assertCanAccessFederation(
    context: FederationImportActorContext,
    federationId: UUID,
  ): void {
    if (context.roles.includes('admin')) return;
    if (context.roles.includes('federation') && context.federationIds?.includes(federationId))
      return;
    throw new FederationImportAuthorizationError();
  }
}

interface ParsedCsv {
  readonly headers: readonly string[];
  readonly rows: readonly Record<string, string>[];
}

interface ImportTemplateDefinition {
  readonly type: FederationImportType;
  readonly required: readonly string[];
  readonly synonyms: Record<string, readonly string[]>;
}

const importTemplateDefinitions: readonly ImportTemplateDefinition[] = [
  {
    type: 'clubs',
    required: ['codice_societa', 'nome_societa', 'stato', 'stagione'],
    synonyms: {
      codice_societa: ['codice societa', 'codice società', 'codice_club', 'club_id', 'id_societa'],
      nome_societa: ['nome societa', 'nome società', 'denominazione', 'societa', 'società', 'club'],
      stato: ['status', 'stato_societa'],
      stagione: ['season', 'anno_sportivo'],
    },
  },
  {
    type: 'players_general',
    required: ['codice_tessera', 'nome', 'cognome', 'data_nascita', 'stato_tesserato'],
    synonyms: {
      codice_tessera: ['tessera', 'numero_tessera', 'matricola', 'id_tesserato'],
      nome: ['first_name', 'firstname'],
      cognome: ['last_name', 'lastname'],
      data_nascita: ['nascita', 'birth_date', 'dob'],
      stato_tesserato: ['stato', 'status'],
    },
  },
  {
    type: 'players_by_club',
    required: ['codice_societa', 'codice_tessera', 'stagione', 'stato_posizione'],
    synonyms: {
      codice_societa: ['codice societa', 'codice società', 'codice_club', 'club_id'],
      codice_tessera: ['tessera', 'numero_tessera', 'matricola', 'id_tesserato'],
      stagione: ['season', 'anno_sportivo'],
      stato_posizione: ['stato', 'status', 'stato_tesseramento'],
    },
  },
  {
    type: 'staff',
    required: [
      'codice_societa',
      'codice_staff',
      'nome',
      'cognome',
      'ruolo',
      'stagione',
      'stato_posizione',
    ],
    synonyms: {
      codice_societa: ['codice societa', 'codice società', 'codice_club', 'club_id'],
      codice_staff: ['matricola_staff', 'id_staff'],
      nome: ['first_name', 'firstname'],
      cognome: ['last_name', 'lastname'],
      ruolo: ['qualifica', 'role'],
      stagione: ['season', 'anno_sportivo'],
      stato_posizione: ['stato', 'status'],
    },
  },
  {
    type: 'referees',
    required: ['codice_arbitro', 'nome', 'cognome', 'stato'],
    synonyms: {
      codice_arbitro: ['matricola_arbitro', 'id_arbitro'],
      nome: ['first_name', 'firstname'],
      cognome: ['last_name', 'lastname'],
      stato: ['status'],
    },
  },
  {
    type: 'calendar',
    required: [
      'codice_gara',
      'stagione',
      'data',
      'ora',
      'codice_societa_casa',
      'codice_societa_ospite',
      'stato_gara',
    ],
    synonyms: {
      codice_gara: ['gara', 'id_gara', 'match_id'],
      stagione: ['season', 'anno_sportivo'],
      data: ['date', 'data_gara'],
      ora: ['time', 'ora_gara'],
      codice_societa_casa: ['casa', 'home', 'home_club', 'societa_casa'],
      codice_societa_ospite: ['ospite', 'away', 'away_club', 'societa_ospite'],
      stato_gara: ['stato', 'status'],
    },
  },
  {
    type: 'designations',
    required: ['codice_gara', 'codice_arbitro', 'ruolo', 'stato_designazione'],
    synonyms: {
      codice_gara: ['gara', 'id_gara', 'match_id'],
      codice_arbitro: ['matricola_arbitro', 'id_arbitro'],
      ruolo: ['qualifica', 'role'],
      stato_designazione: ['stato', 'status'],
    },
  },
];

function parseCsv(content: string): ParsedCsv {
  const records = splitCsvRecords(content).filter((record) =>
    record.some((cell) => cell.trim().length > 0),
  );
  if (records.length === 0) throw new FederationImportInvariantError('CSV content is empty.');
  const headers = records[0].map((header) => header.trim());
  if (headers.length === 0 || headers.some((header) => header.length === 0)) {
    throw new FederationImportInvariantError('CSV header row must contain non-empty columns.');
  }
  return {
    headers,
    rows: records
      .slice(1)
      .map((record) =>
        Object.fromEntries(headers.map((header, index) => [header, record[index]?.trim() ?? ''])),
      ),
  };
}

function splitCsvRecords(content: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    const next = content[index + 1];
    if (char === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === ',' && !inQuotes) {
      row.push(cell);
      cell = '';
      continue;
    }
    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      continue;
    }
    cell += char;
  }
  row.push(cell);
  rows.push(row);
  return rows;
}

function detectImportType(headers: readonly string[]): {
  readonly detectedType: FederationImportType;
  readonly confidence: number;
  readonly warnings: readonly string[];
} {
  const scores = importTemplateDefinitions
    .map((definition) => {
      const mapping = mapColumns(headers, definition.type);
      const matched = definition.required.filter((column) => mapping[column] !== undefined).length;
      return { definition, confidence: matched / definition.required.length };
    })
    .sort((left, right) => right.confidence - left.confidence);
  const best = scores[0];
  const second = scores[1];
  const warnings = [
    ...(best.confidence < 1 ? ['Some required columns were not mapped automatically.'] : []),
    ...(second !== undefined && best.confidence === second.confidence
      ? [`Ambiguous file type: ${best.definition.type} ties with ${second.definition.type}.`]
      : []),
  ];
  return { detectedType: best.definition.type, confidence: best.confidence, warnings };
}

function mapColumns(
  headers: readonly string[],
  type: FederationImportType,
): Record<string, string> {
  const definition = importTemplateDefinitions.find((item) => item.type === type);
  if (definition === undefined)
    throw new FederationImportInvariantError(`Unsupported import type: ${type}`);
  const normalizedHeaders = new Map(headers.map((header) => [normalizeColumnName(header), header]));
  return Object.fromEntries(
    definition.required.flatMap((canonicalColumn) => {
      const candidates = [canonicalColumn, ...(definition.synonyms[canonicalColumn] ?? [])].map(
        normalizeColumnName,
      );
      const matched = candidates
        .map((candidate) => normalizedHeaders.get(candidate))
        .find((header) => header !== undefined);
      return matched === undefined ? [] : [[canonicalColumn, matched]];
    }),
  );
}

function missingRequiredColumns(
  type: FederationImportType,
  mapping: Record<string, string>,
): readonly string[] {
  const definition = importTemplateDefinitions.find((item) => item.type === type);
  if (definition === undefined) return [];
  return definition.required
    .filter((column) => mapping[column] === undefined)
    .map((column) => `Missing required column ${column}.`);
}

function normalizeRow(
  rawData: Record<string, string>,
  mapping: Record<string, string>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(mapping).map(([canonicalColumn, sourceColumn]) => [
      canonicalColumn,
      rawData[sourceColumn] ?? '',
    ]),
  );
}

function normalizeColumnName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}
