import { createHash, randomUUID } from 'node:crypto';
import { Publication } from './publication.js';
import { PlatformError, text, optional, timestamp } from './organizations.js';
import { stableId } from './store.js';
import { parseSpreadsheet, importColumns, optionalImportColumns } from './import-files.js';
import type {
  PersonRecord,
  Entity,
  ImportJob,
  ImportRow,
  ImportKind,
  Organization,
  Team,
  Official,
  Fixture,
  Competition,
} from './types.js';
import type { ClubRecord } from './catalog.js';
interface Upload extends Entity {
  organizationId: string;
  unitId: string;
  competitionId: string | null;
  kind: ImportKind;
  filename: string;
  objectKey: string;
  sha256: string;
  size: number;
  actorId: string;
  expiresAt: string;
}
export class Imports extends Publication {
  private registrationCache: readonly Record<string, unknown>[] | null = null;
  private async priorRegistration(kind: string, personId: string, clubId: string, season: string) {
    const repository = kind === 'player' ? 'player_registrations' : 'staff_registrations';
    const key = kind === 'player' ? 'playerId' : 'staffMemberId';
    const rows =
      this.registrationCache ??
      (this.app.store.find
        ? await this.app.store.find<Record<string, unknown>>(repository, {
            [key]: personId,
            clubId,
            season,
          })
        : await this.app.store.list<Record<string, unknown>>(repository));
    const matches = rows.filter(
      (row) =>
        row[key] === personId &&
        row.clubId === clubId &&
        row.season === season &&
        row.deletedAt === null,
    );
    if (matches.length > 1)
      throw new PlatformError(
        409,
        'Più tesseramenti esistenti per persona, società e stagione: risolvi il duplicato prima di importare.',
      );
    return matches[0]?.id as string | undefined;
  }
  private async prefetchChunk(
    job: ImportJob,
    offset: number,
    data: readonly Record<string, string>[],
  ) {
    const runtime = this.app.store;
    if (!runtime.prefetch) {
      if (['players', 'staff'].includes(job.kind))
        this.registrationCache = await runtime.list<Record<string, unknown>>(
          job.kind === 'players' ? 'player_registrations' : 'staff_registrations',
        );
      return;
    }
    const keys: { repository: string; id: string }[] = [];
    const add = (repository: string, id: string) => {
      if (id) keys.push({ repository, id });
    };
    data.forEach((row, n) => {
      add('platform_import_rows', stableId('row', job.id, String(offset + n)));
      if (row.code) {
        add(
          `platform_${job.kind}`,
          stableId(
            job.kind === 'clubs'
              ? 'club-code'
              : job.kind === 'teams'
                ? 'team'
                : job.kind === 'officials'
                  ? 'official'
                  : 'fixture',
            job.kind === 'fixtures' ? job.competitionId! : job.organizationId,
            row.code,
            ...(job.kind === 'teams' ? [row.season] : []),
          ),
        );
      }
      if (row.club_code)
        add('platform_clubs', stableId('club-code', job.organizationId, row.club_code));
      if (row.code && ['players', 'staff'].includes(job.kind))
        add(
          'platform_identities',
          stableId(
            'person-code',
            job.organizationId,
            job.kind === 'players' ? 'player' : 'staff',
            row.code,
          ),
        );
    });
    await runtime.prefetch(keys);
    const related: { repository: string; id: string }[] = [];
    const people: string[] = [];
    for (const row of data) {
      if (job.kind === 'clubs') {
        const mapped = await this.db.get<ClubRecord>(
          'clubs',
          stableId('club-code', job.organizationId, row.code),
        );
        related.push({
          repository: 'clubs',
          id:
            mapped?.clubId ||
            row.existing_club_id ||
            stableId('club', job.organizationId, row.code),
        });
      }
      if (['players', 'staff'].includes(job.kind)) {
        const kind = job.kind === 'players' ? 'player' : 'staff';
        const identity = await this.db.get<Entity & { personId: string }>(
          'identities',
          stableId('person-code', job.organizationId, kind, row.code),
        );
        const personId =
          identity?.personId ||
          row.existing_person_id ||
          stableId(kind, job.organizationId, row.code);
        people.push(personId);
        related.push({ repository: kind === 'player' ? 'players' : 'staff_members', id: personId });
        if (row.team_code)
          related.push({
            repository: 'platform_teams',
            id: stableId('team', job.organizationId, row.team_code, row.season),
          });
        const club = await this.db.get<ClubRecord>(
          'clubs',
          stableId('club-code', job.organizationId, row.club_code),
        );
        if (club) {
          const registrationId = stableId(
            kind === 'player' ? 'registration' : 'staff-registration',
            personId,
            club.clubId,
            row.season,
          );
          related.push(
            {
              repository: kind === 'player' ? 'player_registrations' : 'staff_registrations',
              id: registrationId,
            },
            { repository: 'platform_people', id: stableId('person-record', registrationId) },
          );
        }
      }
    }
    await runtime.prefetch(related);
    if (people.length && runtime.findMany) {
      this.registrationCache = await runtime.findMany<Record<string, unknown>>(
        job.kind === 'players' ? 'player_registrations' : 'staff_registrations',
        job.kind === 'players' ? 'playerId' : 'staffMemberId',
        people,
      );
      await runtime.prefetch(
        this.registrationCache.map((row) => ({
          repository: 'platform_people',
          id: stableId('person-record', String(row.id)),
        })),
      );
    }
  }
  async importScope(
    organizationId: string,
    unitId: string,
    kind: ImportKind,
    competitionId?: string,
  ) {
    await this.scope(
      organizationId,
      unitId,
      ['fixtures', 'appointments'].includes(kind)
        ? kind === 'appointments'
          ? 'designate'
          : 'competitions'
        : 'people',
    );
    if (['fixtures', 'appointments'].includes(kind)) {
      if (!competitionId) throw new PlatformError(400, 'Seleziona un campionato.');
      await this.competition(competitionId, kind === 'appointments' ? 'designate' : 'competitions');
    }
  }
  async upload(body: Record<string, unknown>) {
    const organizationId = text(body, 'organizationId'),
      unitId = text(body, 'unitId'),
      kind = text(body, 'kind') as ImportKind,
      competitionId = optional(body, 'competitionId');
    if (!Object.hasOwn(importColumns, kind))
      throw new PlatformError(400, 'Tipo import non valido.');
    await this.importScope(organizationId, unitId, kind, competitionId);
    const filename = text(body, 'filename');
    if (!/\.(csv|xlsx)$/i.test(filename)) throw new PlatformError(400, 'Usa CSV o XLSX.');
    const size = Number(body.size),
      sha256 = text(body, 'sha256');
    if (
      !Number.isInteger(size) ||
      size < 1 ||
      size > 5 * 1024 * 1024 ||
      !/^[a-f0-9]{64}$/.test(sha256)
    )
      throw new PlatformError(400, 'Dimensione o checksum non validi.');
    const id = randomUUID(),
      objectKey = `platform/imports/${organizationId}/${id}.${filename.toLowerCase().endsWith('.xlsx') ? 'xlsx' : 'csv'}`;
    const row = await this.app.store.transaction(async () => {
      this.resetScopeCache();
      await this.importScope(organizationId, unitId, kind, competitionId);
      return this.db.put<Upload>('uploads', {
        id,
        organizationId,
        unitId,
        competitionId: competitionId || null,
        kind,
        filename,
        objectKey,
        sha256,
        size,
        actorId: this.auth.actorId,
        expiresAt: new Date(Date.now() + 600000).toISOString(),
      });
    });
    const intent = await this.app.objectStores.photos.createUploadIntent({
      objectKey,
      mimeType: 'application/octet-stream',
      fileSizeBytes: size,
      sha256,
    });
    return {
      id: row.id,
      url: intent.uploadUrl,
      method: intent.method,
      local: !intent.uploadUrl.startsWith('http'),
    };
  }
  async prepare(body: Record<string, unknown>) {
    const upload = await this.db.get<Upload>('uploads', text(body, 'uploadId'));
    if (
      !upload ||
      upload.actorId !== this.auth.actorId ||
      upload.expiresAt <= new Date().toISOString()
    )
      throw new PlatformError(403, 'Caricamento scaduto o non autorizzato.');
    await this.importScope(
      upload.organizationId,
      upload.unitId,
      upload.kind,
      upload.competitionId ?? undefined,
    );
    const key = stableId(
      'job',
      upload.organizationId,
      upload.unitId,
      upload.kind,
      upload.competitionId ?? '',
      upload.sha256,
    );
    const existing = await this.db.get<ImportJob>('imports', key);
    if (existing) return existing;
    let bytes: Buffer;
    if (typeof body.contentBase64 === 'string' && process.env.REFCHECKID_RUNTIME !== 'supabase') {
      bytes = Buffer.from(body.contentBase64, 'base64');
      await this.app.objectStores.photos.putObject(upload.objectKey, bytes);
    } else bytes = await this.app.objectStores.photos.readObject(upload.objectKey);
    if (
      bytes.length !== upload.size ||
      createHash('sha256').update(bytes).digest('hex') !== upload.sha256
    )
      throw new PlatformError(400, 'Il file non corrisponde al checksum dichiarato.');
    const records = await parseSpreadsheet(bytes, upload.filename);
    const headers = Object.keys(records[0]);
    const rawMapping = body.mapping ?? {};
    if (!rawMapping || typeof rawMapping !== 'object' || Array.isArray(rawMapping))
      throw new PlatformError(400, 'Mappatura colonne non valida.');
    const mapping = rawMapping as Record<string, string>;
    if (importColumns[upload.kind].some((column) => !headers.includes(mapping[column] ?? column))) {
      if (!Object.keys(mapping).length)
        return { mappingRequired: true, headers, required: importColumns[upload.kind] };
      throw new PlatformError(400, 'Completa la mappatura di tutte le colonne richieste.');
    }
    const columns = [...importColumns[upload.kind], ...(optionalImportColumns[upload.kind] ?? [])];
    const normalized = records.map((row) =>
      Object.fromEntries(
        columns.map((key) => {
          const source = mapping[key] ?? key;
          if (typeof source !== 'string' || (mapping[key] && !headers.includes(source)))
            throw new PlatformError(400, 'Mappatura su colonna sconosciuta.');
          return [key, row[source] ?? ''];
        }),
      ),
    );
    const chunks: string[] = [];
    const seen = new Set<string>();
    const identities = new Map<string, string>();
    for (let start = 0; start < normalized.length; start += 100) {
      const part = normalized.slice(start, start + 100).map((data) => {
        const externalKey =
          upload.kind === 'appointments'
            ? `${data.fixture_code}:${data.role === 'principal' ? 'principal' : data.official_code + ':' + data.role}`
            : ['players', 'staff'].includes(upload.kind)
              ? `${data.code}:${data.club_code}:${data.season}:${data.team_code}`
              : upload.kind === 'teams'
                ? `${data.code}:${data.season}`
                : data.code;
        const signature = JSON.stringify([data.first_name, data.last_name, data.birth_date]);
        const conflict =
          ['players', 'staff'].includes(upload.kind) &&
          identities.has(data.code) &&
          identities.get(data.code) !== signature;
        if (['players', 'staff'].includes(upload.kind)) identities.set(data.code, signature);
        const duplicate = seen.has(externalKey) || conflict;
        seen.add(externalKey);
        return { data, duplicate };
      });
      const chunk = `${upload.objectKey}.normalized.${start / 100}.json`;
      const serialized = Buffer.from(JSON.stringify(part));
      if (serialized.length > 4 * 1024 * 1024)
        throw new PlatformError(413, 'Troppi dati nel blocco: riduci la lunghezza delle celle.');
      await this.app.objectStores.photos.putObject(chunk, serialized);
      chunks.push(chunk);
    }
    return this.app.store.transaction(async () => {
      this.resetScopeCache();
      await this.importScope(
        upload.organizationId,
        upload.unitId,
        upload.kind,
        upload.competitionId ?? undefined,
      );
      const raced = await this.db.get<ImportJob>('imports', key);
      return (
        raced ??
        this.db.put<ImportJob>('imports', {
          id: key,
          organizationId: upload.organizationId,
          unitId: upload.unitId,
          competitionId: upload.competitionId,
          kind: upload.kind,
          filename: upload.filename,
          status: 'validating',
          chunks,
          validated: 0,
          total: records.length,
          errors: 0,
          processed: 0,
          actorId: this.auth.actorId,
          sha256: upload.sha256,
        })
      );
    });
  }
  async job(id: string) {
    const job = await this.db.get<ImportJob>('imports', id);
    if (!job) throw new PlatformError(404, 'Importazione non trovata.');
    await this.importScope(
      job.organizationId,
      job.unitId,
      job.kind,
      job.competitionId ?? undefined,
    );
    return job;
  }
  async validateRow(job: ImportJob, data: Record<string, string>) {
    for (const key of importColumns[job.kind])
      if (!data[key]?.trim()) throw new PlatformError(400, `Campo ${key} richiesto.`);
    if (Object.values(data).some((s) => s.length > 200))
      throw new PlatformError(400, 'Valore troppo lungo.');
    const root = { organizationId: job.organizationId, unitId: job.unitId };
    const club = async (code: string) => {
      const row = await this.db.get<ClubRecord>(
        'clubs',
        stableId('club-code', job.organizationId, code),
      );
      if (!row)
        throw new PlatformError(
          400,
          `Società ${code} sconosciuta: importala o collega il suo identificativo esistente.`,
        );
      return row;
    };
    const competition = job.competitionId
      ? await this.db.get<Competition>('competitions', job.competitionId)
      : null;
    if (job.kind === 'teams') {
      await club(data.club_code);
      if (!['football', 'basketball', 'volleyball'].includes(data.sport))
        throw new PlatformError(400, 'Sport non valido.');
    }
    if (job.kind === 'players' || job.kind === 'staff') {
      await club(data.club_code);
      const org = await this.db.get<Organization>('organizations', job.organizationId);
      if (!org?.federationId)
        throw new PlatformError(400, 'Import tesserati riservato agli enti sportivi.');
      if (
        job.kind === 'players' &&
        (!/^\d{4}-\d\d-\d\d$/.test(data.birth_date) ||
          !Number.isFinite(Date.parse(data.birth_date)) ||
          new Date(data.birth_date).toISOString().slice(0, 10) !== data.birth_date ||
          data.birth_date > new Date().toISOString().slice(0, 10))
      )
        throw new PlatformError(400, 'Data nascita non valida: usa YYYY-MM-DD.');
    }
    if (
      job.kind === 'officials' &&
      data.sports
        .split(',')
        .some((s) => !['football', 'basketball', 'volleyball'].includes(s.trim()))
    )
      throw new PlatformError(400, 'Discipline arbitro non valide.');
    if (job.kind === 'fixtures') {
      if (!competition) throw new PlatformError(400, 'Campionato richiesto.');
      for (const code of [data.home_team_code, data.away_team_code]) {
        const team = await this.db.get<Team>(
          'teams',
          stableId('team', competition.organizationId, code, competition.season),
        );
        if (!team || !(await this.db.get('entries', stableId('entry', competition.id, team.id))))
          throw new PlatformError(400, `Squadra ${code} non iscritta al campionato.`);
      }
      if (
        data.home_team_code === data.away_team_code ||
        !/^\d{4}-\d\d-\d\dT.*(Z|[+-]\d\d:\d\d)$/.test(data.scheduled_at) ||
        !Number.isFinite(Date.parse(data.scheduled_at))
      )
        throw new PlatformError(400, 'Squadre o data gara non valide: specifica il fuso orario.');
    }
    if (job.kind === 'fixtures' && competition) {
      const home = (await this.db.get<Team>(
          'teams',
          stableId('team', competition.organizationId, data.home_team_code, competition.season),
        ))!,
        away = (await this.db.get<Team>(
          'teams',
          stableId('team', competition.organizationId, data.away_team_code, competition.season),
        ))!;
      if (home.clubId === away.clubId)
        throw new PlatformError(400, 'Le squadre devono appartenere a società diverse.');
      const date = timestamp(data.scheduled_at),
        duration = Number(data.duration_minutes || 120);
      if (!Number.isInteger(duration) || duration < 30 || duration > 480)
        throw new PlatformError(400, 'Durata gara non valida.');
      const existing = await this.db.get<Fixture>(
        'fixtures',
        stableId('fixture', competition.id, data.code),
      );
      if (
        existing &&
        (existing.scheduledAt !== date ||
          existing.venue !== data.venue ||
          existing.homeTeamId !== home.id ||
          existing.awayTeamId !== away.id)
      )
        throw new PlatformError(
          409,
          'Gara già presente con dati diversi: usa Variazione calendario per avvisare gli arbitri.',
        );
    }
    if (job.kind === 'appointments') {
      if (
        !competition ||
        !(await this.db.get<Fixture>(
          'fixtures',
          stableId('fixture', competition.id, data.fixture_code),
        ))
      )
        throw new PlatformError(400, 'Gara non trovata.');
      if (
        !(await this.db.get<Official>(
          'officials',
          stableId('official', job.organizationId, data.official_code),
        )) ||
        !['principal', 'assistant', 'table'].includes(data.role)
      )
        throw new PlatformError(400, 'Arbitro o incarico non valido.');
      const fixtureId = stableId('fixture', competition.id, data.fixture_code),
        officialId = stableId('official', job.organizationId, data.official_code);
      const existing = (
        await this.db.find('appointments', { fixtureId, officialId, role: data.role })
      ).find((row) =>
        ['draft', 'invited', 'accepted'].includes((row as unknown as { status: string }).status),
      );
      if (!existing)
        await this.createAppointment({ fixtureId, officialId, role: data.role, send: false }, true);
    }
    if (job.kind === 'clubs' && data.existing_club_id) {
      const org = await this.db.get<Organization>('organizations', job.organizationId),
        existing = await this.app.repositories.clubs.findById(data.existing_club_id);
      if (!existing || existing.federationId !== org?.federationId)
        throw new PlatformError(400, 'Identificativo società esistente fuori competenza.');
    }
    if (['players', 'staff'].includes(job.kind)) {
      if (data.status && !['active', 'suspended', 'ended'].includes(data.status))
        throw new PlatformError(400, 'Stato tesseramento non valido: active, suspended, ended.');
      if (data.existing_person_id) {
        const org = (await this.db.get<Organization>('organizations', job.organizationId))!;
        await this.scope(org.id, org.rootUnitId, 'people');
        const person =
          job.kind === 'players'
            ? await this.app.repositories.players.findById(data.existing_person_id)
            : await this.app.repositories.registrations.findStaffMemberById(
                data.existing_person_id,
              );
        if (!person || person.federationId !== org.federationId)
          throw new PlatformError(400, 'Identificativo persona esistente fuori competenza.');
      }
      const identity = await this.db.get<Entity & { personId: string; unitId?: string }>(
        'identities',
        stableId(
          'person-code',
          job.organizationId,
          job.kind === 'players' ? 'player' : 'staff',
          data.code,
        ),
      );
      if (identity) {
        try {
          await this.scope(
            job.organizationId,
            identity.unitId ??
              (await this.db.get<Organization>('organizations', job.organizationId))!.rootUnitId,
            'people',
          );
        } catch (error) {
          if (!(error instanceof PlatformError && error.status === 403)) throw error;
          const person =
            job.kind === 'players'
              ? await this.app.repositories.players.findById(identity.personId)
              : await this.app.repositories.registrations.findStaffMemberById(identity.personId);
          if (
            !person ||
            person.firstName !== data.first_name ||
            person.lastName !== data.last_name ||
            (job.kind === 'players' && person.birthDate !== data.birth_date)
          )
            throw new PlatformError(
              403,
              'Anagrafica di competenza di un’altra struttura: chiedi una rettifica al responsabile.',
            );
        }
      }
      const linkedClub = await club(data.club_code),
        kind = job.kind === 'players' ? 'player' : 'staff',
        personId =
          identity?.personId ||
          data.existing_person_id ||
          stableId(kind, job.organizationId, data.code);
      const existingRegistration = await this.priorRegistration(
        kind,
        personId,
        linkedClub.clubId,
        data.season,
      );
      if (existingRegistration) {
        const record = await this.db.get<PersonRecord>(
          'people',
          stableId('person-record', existingRegistration),
        );
        if (record) await this.scope(job.organizationId, record.unitId, 'people');
      }
      if (data.team_code) {
        const team = await this.db.get<Team>(
          'teams',
          stableId('team', job.organizationId, data.team_code, data.season),
        );
        const linkedClub = await club(data.club_code);
        if (!team || team.clubId !== linkedClub.clubId)
          throw new PlatformError(400, 'Squadra non trovata per società e stagione indicate.');
        await this.scope(team.organizationId, team.unitId, 'people');
      }
    }
    return root;
  }
  async advance(
    id: string,
    action: string,
    preparedChunk?: { data: Record<string, string>; duplicate: boolean }[],
  ) {
    const job = await this.job(id);
    if (action === 'cancel') {
      if (job.processed)
        throw new PlatformError(
          409,
          'Importazione già parzialmente applicata: conserva il rapporto e completa o correggi, non cancellare i dati di gara.',
        );
      return this.db.update<ImportJob>('imports', id, { status: 'cancelled' });
    }
    if (action === 'commit') {
      if (job.status !== 'preview' || job.errors)
        throw new PlatformError(
          409,
          'Completa la validazione e correggi gli errori prima della conferma.',
        );
      return this.db.update<ImportJob>('imports', id, { status: 'running' });
    }
    if (!['validating', 'running'].includes(job.status)) return job;
    const offset = job.status === 'validating' ? job.validated : job.processed;
    if (job.status === 'validating') {
      const chunk = preparedChunk;
      if (!chunk) throw new PlatformError(409, 'Blocco di validazione non disponibile.');
      let errors = job.errors;
      for (let n = 0; n < chunk.length; n++) {
        const { data, duplicate } = chunk[n];
        const rowErrors: string[] = [];
        if (duplicate)
          rowErrors.push('Identificativo duplicato o dati anagrafici discordanti nel file.');
        try {
          await this.validateRow(job, data);
        } catch (error) {
          if (error instanceof PlatformError) rowErrors.push(error.message);
          else throw error;
        }
        if (rowErrors.length) errors++;
        await this.db.put<ImportRow>('import_rows', {
          id: stableId('row', id, String(offset + n)),
          organizationId: job.organizationId,
          jobId: id,
          number: offset + n + 2,
          data,
          errors: rowErrors,
          state: rowErrors.length ? 'error' : 'ready',
          targetId: null,
        });
      }
      const validated = offset + chunk.length;
      return this.db.update<ImportJob>('imports', id, {
        validated,
        errors,
        status: validated === job.total ? 'preview' : 'validating',
      });
    }
    const end = Math.min(offset + 100, job.total);
    for (let n = offset; n < end; n++) {
      const row = await this.db.get<ImportRow>('import_rows', stableId('row', id, String(n)));
      if (!row || row.errors.length) throw new PlatformError(409, 'Riga non validata.');
      const targetId = await this.applyRow(job, row.data);
      await this.db.update<ImportRow>('import_rows', row.id, { state: 'committed', targetId });
    }
    return this.db.update<ImportJob>('imports', id, {
      processed: end,
      status: end === job.total ? 'completed' : 'running',
    });
  }
  async runAdvance(id: string, action: string) {
    const snapshot = await this.job(id);
    const chunk =
      action === 'advance' && snapshot.status === 'validating'
        ? (JSON.parse(
            (
              await this.app.objectStores.photos.readObject(
                snapshot.chunks[Math.floor(snapshot.validated / 100)],
              )
            ).toString(),
          ) as { data: Record<string, string>; duplicate: boolean }[])
        : undefined;
    const transact =
      this.app.store.bulkTransaction?.bind(this.app.store) ??
      this.app.store.transaction.bind(this.app.store);
    return transact(async () => {
      this.resetScopeCache();
      const current = await this.job(id);
      if (
        current.validated !== snapshot.validated ||
        current.processed !== snapshot.processed ||
        current.status !== snapshot.status
      )
        return current;
      if (action === 'advance' && ['validating', 'running'].includes(current.status)) {
        const offset = current.status === 'validating' ? current.validated : current.processed;
        if (!chunk)
          await this.app.store.prefetch?.(
            Array.from({ length: Math.min(100, current.total - offset) }, (_, n) => ({
              repository: 'platform_import_rows',
              id: stableId('row', id, String(offset + n)),
            })),
          );
        const rows =
          chunk?.map((row) => row.data) ??
          (await Promise.all(
            Array.from(
              { length: Math.min(100, current.total - offset) },
              async (_, n) =>
                (await this.db.get<ImportRow>(
                  'import_rows',
                  stableId('row', id, String(offset + n)),
                ))!.data,
            ),
          ));
        await this.prefetchChunk(current, offset, rows);
      }
      return this.advance(id, action, chunk);
    });
  }
  async applyRow(job: ImportJob, data: Record<string, string>) {
    const root = { organizationId: job.organizationId, unitId: job.unitId };
    await this.validateRow(job, data);
    if (job.kind === 'clubs')
      return (
        await this.createClub({
          ...root,
          code: data.code,
          name: data.name,
          existingClubId: data.existing_club_id || undefined,
          fiscalCode: data.fiscal_code || undefined,
        })
      ).clubId;
    if (job.kind === 'teams') {
      const club = (await this.db.get<ClubRecord>(
        'clubs',
        stableId('club-code', job.organizationId, data.club_code),
      ))!;
      return (
        await this.createTeam({
          ...root,
          code: data.code,
          name: data.name,
          clubId: club.clubId,
          sport: data.sport,
          season: data.season,
          category: data.category,
        })
      ).id;
    }
    if (job.kind === 'officials')
      return (
        await this.createOfficial({
          ...root,
          code: data.code,
          firstName: data.first_name,
          lastName: data.last_name,
          sports: data.sports,
        })
      ).id;
    if (job.kind === 'fixtures') {
      const c = (await this.db.get<Competition>('competitions', job.competitionId!))!;
      return (
        await this.createFixture({
          competitionId: c.id,
          code: data.code,
          homeTeamId: stableId('team', c.organizationId, data.home_team_code, c.season),
          awayTeamId: stableId('team', c.organizationId, data.away_team_code, c.season),
          scheduledAt: data.scheduled_at,
          venue: data.venue,
          round: data.round,
          durationMinutes: data.duration_minutes ? Number(data.duration_minutes) : 120,
        })
      ).id;
    }
    if (job.kind === 'appointments') {
      const fixtureId = stableId('fixture', job.competitionId!, data.fixture_code),
        officialId = stableId('official', job.organizationId, data.official_code);
      const existing = (
        await this.db.find('appointments', { fixtureId, officialId, role: data.role })
      )[0];
      if (existing) return existing.id;
      return (await this.createAppointment({ fixtureId, officialId, role: data.role, send: false }))
        .id;
    }
    const org = (await this.db.get<Organization>('organizations', job.organizationId))!,
      club = (await this.db.get<ClubRecord>(
        'clubs',
        stableId('club-code', job.organizationId, data.club_code),
      ))!;
    const kind = job.kind === 'players' ? 'player' : 'staff';
    const key = stableId('person-code', job.organizationId, kind, data.code);
    const mapped = await this.db.get<Entity & { personId: string; unitId?: string }>(
      'identities',
      key,
    );
    if (data.existing_person_id) await this.scope(job.organizationId, org.rootUnitId, 'people');
    const personId =
      mapped?.personId ??
      (data.existing_person_id || stableId(kind, job.organizationId, data.code));
    let canUpdateIdentity = true;
    if (mapped) {
      try {
        await this.scope(job.organizationId, mapped.unitId ?? org.rootUnitId, 'people');
      } catch (error) {
        if (!(error instanceof PlatformError && error.status === 403)) throw error;
        canUpdateIdentity = false;
        const current =
          kind === 'player'
            ? await this.app.repositories.players.findById(personId)
            : await this.app.repositories.registrations.findStaffMemberById(personId);
        if (
          !current ||
          current.firstName !== data.first_name ||
          current.lastName !== data.last_name ||
          (kind === 'player' && current.birthDate !== data.birth_date)
        )
          throw new PlatformError(
            403,
            'Anagrafica di competenza di un’altra struttura: chiedi una rettifica al responsabile.',
          );
      }
    }
    let registrationId: string;
    if (kind === 'player') {
      const player = await this.app.repositories.players.findById(personId);
      if (player && player.federationId !== org.federationId)
        throw new PlatformError(403, 'Persona fuori competenza.');
      const value = {
        firstName: data.first_name,
        lastName: data.last_name,
        birthDate: data.birth_date,
      };
      if (player && canUpdateIdentity) await this.app.repositories.players.update(personId, value);
      else if (!player)
        await this.app.repositories.players.create({
          id: personId,
          federationId: org.federationId!,
          ...value,
          birthPlace: null,
          fiscalCode: null,
          status: 'active',
        });
      registrationId =
        (await this.priorRegistration(kind, personId, club.clubId, data.season)) ??
        stableId('registration', personId, club.clubId, data.season);
      const existing = await this.app.repositories.registrations.findById(registrationId);
      if (existing && data.status)
        await this.app.repositories.registrations.update(registrationId, {
          status: data.status as 'active' | 'suspended' | 'ended',
        });
      if (!existing)
        await this.app.repositories.registrations.create({
          id: registrationId,
          playerId: personId,
          clubId: club.clubId,
          season: data.season,
          registrationNumber: data.code,
          status: (data.status as 'active' | 'suspended' | 'ended') || 'active',
          registeredAt: new Date().toISOString(),
        });
    } else {
      const existing = await this.app.repositories.registrations.findStaffMemberById(personId);
      if (existing && existing.federationId !== org.federationId)
        throw new PlatformError(403, 'Persona fuori competenza.');
      const now = new Date().toISOString();
      if (!existing || canUpdateIdentity)
        await this.app.repositories.registrations.syncStaffMember({
          ...existing,
          id: personId,
          federationId: org.federationId!,
          firstName: data.first_name,
          lastName: data.last_name,
          birthDate: data.birth_date || existing?.birthDate || null,
          fiscalCode: existing?.fiscalCode ?? null,
          status: existing?.status ?? 'active',
          createdAt: existing?.createdAt ?? now,
          updatedAt: now,
          deletedAt: null,
        });
      registrationId =
        (await this.priorRegistration(kind, personId, club.clubId, data.season)) ??
        stableId('staff-registration', personId, club.clubId, data.season);
      const priorRegistration =
        await this.app.repositories.registrations.findStaffRegistrationById(registrationId);
      await this.app.repositories.registrations.syncStaffRegistration({
        id: registrationId,
        staffMemberId: personId,
        clubId: club.clubId,
        season: data.season,
        role: data.role,
        registrationNumber: data.code,
        status:
          (data.status as 'active' | 'suspended' | 'ended') ||
          priorRegistration?.status ||
          'active',
        createdAt: priorRegistration?.createdAt ?? now,
        updatedAt: now,
        deletedAt: null,
      });
    }
    const previousPerson = await this.db.get<PersonRecord>(
      'people',
      stableId('person-record', registrationId),
    );
    if (previousPerson) await this.scope(job.organizationId, previousPerson.unitId, 'people');
    await this.db.put<PersonRecord>('people', {
      id: stableId('person-record', registrationId),
      organizationId: job.organizationId,
      unitId: previousPerson?.unitId ?? job.unitId,
      kind,
      code: data.code,
      firstName: data.first_name,
      lastName: data.last_name,
      birthDate: data.birth_date || null,
      clubId: club.clubId,
      season: data.season,
      registrationId,
      personId,
      status:
        (kind === 'player'
          ? await this.app.repositories.registrations.findById(registrationId)
          : await this.app.repositories.registrations.findStaffRegistrationById(registrationId)
        )?.status ?? 'active',
    });
    if (data.team_code) {
      const teamId = stableId('team', job.organizationId, data.team_code, data.season);
      await this.assignSquad({ personRecordId: stableId('person-record', registrationId), teamId });
    }
    await this.db.put<
      Entity & {
        organizationId: string;
        unitId: string;
        personId: string;
        code: string;
        kind: string;
      }
    >('identities', {
      id: key,
      organizationId: job.organizationId,
      unitId: mapped?.unitId ?? job.unitId,
      personId,
      code: data.code,
      kind,
    });
    return personId;
  }
}
