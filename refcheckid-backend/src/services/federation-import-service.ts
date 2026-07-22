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

export interface ValidateFederationImportBatchCommand {
  readonly batchId: UUID;
  readonly context: FederationImportActorContext;
}

export interface FederationImportValidationResult {
  readonly importBatch: FederationImportBatch;
  readonly rows: readonly FederationImportRow[];
  readonly report: Record<string, unknown>;
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

  async validateBatch(
    command: ValidateFederationImportBatchCommand,
  ): Promise<FederationImportValidationResult> {
    const batch = await this.getBatch(command.context, command.batchId);
    if (batch === null) throw new FederationImportInvariantError('Import batch was not found.');
    const rows = await this.dependencies.importRows.listByBatch(batch.id);
    if (rows.length === 0) {
      throw new FederationImportInvariantError('Import batch must be parsed before validation.');
    }
    const importType = batch.detectedType ?? batch.importType;
    const validationRows = validateRows(importType, rows);
    const updatedRows: FederationImportRow[] = [];
    for (const validation of validationRows) {
      updatedRows.push(
        await this.dependencies.importRows.update(validation.row.id, {
          status: validation.status,
          errors: validation.errors,
          warnings: validation.warnings,
        }),
      );
    }
    const report = buildValidationReport(importType, validationRows);
    const updatedBatch = await this.dependencies.importBatches.update(batch.id, {
      status: 'validated',
      validRows: validationRows.filter((row) => row.status === 'valid').length,
      warningRows: validationRows.filter((row) => row.status === 'warning').length,
      errorRows: validationRows.filter((row) => row.status === 'error').length,
      report,
    });
    return { importBatch: updatedBatch, rows: updatedRows, report };
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

interface RowValidationResult {
  readonly row: FederationImportRow;
  readonly key: string;
  readonly status: 'valid' | 'warning' | 'error';
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
}

function validateRows(
  importType: FederationImportType,
  rows: readonly FederationImportRow[],
): readonly RowValidationResult[] {
  const keyCounts = new Map<string, number>();
  const firstPass = rows.map((row) => {
    const normalizedData = stringRecord(row.normalizedData ?? {});
    const key = rowBusinessKey(importType, normalizedData);
    keyCounts.set(key, (keyCounts.get(key) ?? 0) + 1);
    return { row, normalizedData, key };
  });

  return firstPass.map(({ row, normalizedData, key }) => {
    const errors = [
      ...missingValueErrors(importType, normalizedData),
      ...formatErrors(importType, normalizedData),
      ...(key === '' ? ['Cannot compute row business key.'] : []),
      ...(key !== '' && (keyCounts.get(key) ?? 0) > 1
        ? [`Duplicate row key in import file: ${key}.`]
        : []),
    ];
    const warnings = [
      ...statusWarnings(importType, normalizedData),
      ...(errors.length === 0
        ? [
            `Preview: row will be treated as new ${previewEntityName(importType)} unless PR5/PR6 finds an existing record.`,
          ]
        : []),
    ];
    const status = errors.length > 0 ? 'error' : warnings.length > 0 ? 'warning' : 'valid';
    return { row, key, status, errors, warnings };
  });
}

function buildValidationReport(
  importType: FederationImportType,
  validations: readonly RowValidationResult[],
): Record<string, unknown> {
  const errorRows = validations.filter((row) => row.status === 'error');
  const warningRows = validations.filter((row) => row.status === 'warning');
  const duplicateRows = validations.filter((row) =>
    row.errors.some((error) => error.startsWith('Duplicate row key')),
  );
  const commitEligibleRows = validations.length - errorRows.length;
  return {
    phase: 'validation_preview',
    importType,
    summary: {
      totalRows: validations.length,
      validRows: validations.filter((row) => row.status === 'valid').length,
      warningRows: warningRows.length,
      errorRows: errorRows.length,
      newRows: commitEligibleRows,
      updatedRows: 0,
      unchangedRows: 0,
      duplicateRows: duplicateRows.length,
      commitBlocked: errorRows.length > 0,
    },
    sampleRows: validations.slice(0, 10).map((validation) => ({
      rowNumber: validation.row.rowNumber,
      key: validation.key,
      status: validation.status,
      errors: validation.errors,
      warnings: validation.warnings,
      normalizedData: validation.row.normalizedData,
    })),
    downloadableReports: {
      errors: errorRows.map((validation) => ({
        rowNumber: validation.row.rowNumber,
        key: validation.key,
        errors: validation.errors,
      })),
      warnings: warningRows.map((validation) => ({
        rowNumber: validation.row.rowNumber,
        key: validation.key,
        warnings: validation.warnings,
      })),
    },
  };
}

function missingValueErrors(
  importType: FederationImportType,
  row: Record<string, string>,
): readonly string[] {
  const definition = importTemplateDefinitions.find((item) => item.type === importType);
  if (definition === undefined) return [`Unsupported import type ${importType}.`];
  return definition.required
    .filter((column) => (row[column] ?? '').trim().length === 0)
    .map((column) => `Missing required value ${column}.`);
}

function formatErrors(
  importType: FederationImportType,
  row: Record<string, string>,
): readonly string[] {
  const errors: string[] = [];
  for (const column of ['data_nascita', 'data']) {
    if (row[column] !== undefined && row[column].trim().length > 0 && !isIsoDate(row[column])) {
      errors.push(`Invalid ISO date ${column}: ${row[column]}.`);
    }
  }
  if (row.ora !== undefined && row.ora.trim().length > 0 && !/^\d{2}:\d{2}$/.test(row.ora)) {
    errors.push(`Invalid time ora: ${row.ora}.`);
  }
  if (
    importType === 'calendar' &&
    row.codice_societa_casa !== undefined &&
    row.codice_societa_ospite !== undefined &&
    row.codice_societa_casa === row.codice_societa_ospite
  ) {
    errors.push('Home and away society codes must be different.');
  }
  return errors;
}

function statusWarnings(
  importType: FederationImportType,
  row: Record<string, string>,
): readonly string[] {
  const checks: Record<FederationImportType, Record<string, readonly string[]>> = {
    clubs: { stato: ['active', 'inactive'] },
    players_general: { stato_tesserato: ['active', 'inactive'] },
    players_by_club: { stato_posizione: ['active', 'inactive'] },
    staff: { stato_posizione: ['active', 'inactive'] },
    referees: { stato: ['active', 'inactive'] },
    calendar: { stato_gara: ['scheduled', 'in_progress', 'completed', 'cancelled'] },
    designations: { stato_designazione: ['assigned', 'cancelled'] },
  };
  return Object.entries(checks[importType]).flatMap(([column, allowed]) => {
    const value = row[column];
    if (value === undefined || value.trim().length === 0 || allowed.includes(value)) return [];
    return [`Unexpected ${column} value ${value}; allowed values are ${allowed.join(', ')}.`];
  });
}

function rowBusinessKey(importType: FederationImportType, row: Record<string, string>): string {
  const keyColumns: Record<FederationImportType, readonly string[]> = {
    clubs: ['codice_societa', 'stagione'],
    players_general: ['codice_tessera'],
    players_by_club: ['codice_societa', 'codice_tessera', 'stagione'],
    staff: ['codice_societa', 'codice_staff', 'stagione'],
    referees: ['codice_arbitro'],
    calendar: ['codice_gara'],
    designations: ['codice_gara', 'codice_arbitro', 'ruolo'],
  };
  const parts = keyColumns[importType].map((column) => row[column]?.trim() ?? '');
  return parts.some((part) => part.length === 0) ? '' : parts.join('|');
}

function previewEntityName(importType: FederationImportType): string {
  const names: Record<FederationImportType, string> = {
    clubs: 'society/club',
    players_general: 'player registry entry',
    players_by_club: 'player position',
    staff: 'staff position',
    referees: 'referee',
    calendar: 'match',
    designations: 'referee designation',
  };
  return names[importType];
}

function stringRecord(value: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, String(entry ?? '')]),
  );
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
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
