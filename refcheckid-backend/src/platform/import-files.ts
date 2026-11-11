import type { ImportKind } from './types.js';
import { PlatformError } from './organizations.js';
export const importColumns: Record<ImportKind, readonly string[]> = {
  clubs: ['code', 'name'],
  teams: ['code', 'name', 'club_code', 'sport', 'season', 'category'],
  players: ['code', 'first_name', 'last_name', 'birth_date', 'club_code', 'season'],
  staff: ['code', 'first_name', 'last_name', 'club_code', 'season', 'role'],
  officials: ['code', 'first_name', 'last_name', 'sports'],
  fixtures: ['code', 'home_team_code', 'away_team_code', 'scheduled_at', 'venue', 'round'],
  appointments: ['fixture_code', 'official_code', 'role'],
};
export const optionalImportColumns: Partial<Record<ImportKind, readonly string[]>> = {
  clubs: ['existing_club_id', 'fiscal_code'],
  players: ['existing_person_id', 'team_code', 'status'],
  staff: ['existing_person_id', 'birth_date', 'team_code', 'status'],
  fixtures: ['duration_minutes'],
};
export function parseCsv(content: string) {
  if (content.length > 5 * 1024 * 1024)
    throw new PlatformError(413, 'File troppo grande (massimo 5 MB).');
  const first = content.replace(/^\uFEFF/, '').split(/\r?\n/)[0];
  const delimiter = first.includes(';') ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [],
    cell = '',
    quoted = false;
  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    if (char === '"') {
      if (quoted && content[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      row.push(cell.trim());
      cell = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && content[i + 1] === '\n') i++;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = '';
    } else cell += char;
    if (cell.length > 10000 || row.length > 64 || rows.length > 10001)
      throw new PlatformError(
        413,
        'Limite: 10.000 righe, 64 colonne e 10.000 caratteri per cella.',
      );
  }
  if (quoted) throw new PlatformError(400, 'Virgolette CSV non chiuse.');
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return records(rows);
}
function records(rows: string[][]) {
  const headers = rows.shift()?.map((s) => s.replace(/^\uFEFF/, '').trim()) ?? [];
  if (!headers.length || headers.some((s) => !s) || new Set(headers).size !== headers.length)
    throw new PlatformError(400, 'Intestazioni vuote o duplicate.');
  if (rows.length < 1 || rows.length > 10000)
    throw new PlatformError(400, 'Sono richieste da 1 a 10.000 righe.');
  return rows.map((row, index) => {
    if (row.length > headers.length)
      throw new PlatformError(400, `Riga ${index + 2}: colonne in eccesso.`);
    return Object.fromEntries(headers.map((h, i) => [h, row[i] ?? '']));
  });
}
export async function parseSpreadsheet(bytes: Buffer, filename: string) {
  if (bytes.length > 5 * 1024 * 1024) throw new PlatformError(413, 'Massimo 5 MB.');
  if (filename.toLowerCase().endsWith('.csv')) {
    let content: string;
    try {
      content = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      throw new PlatformError(400, 'Il CSV deve essere codificato UTF-8.');
    }
    return parseCsv(content);
  }
  if (!filename.toLowerCase().endsWith('.xlsx'))
    throw new PlatformError(400, 'Usa CSV UTF-8 o XLSX senza macro.');
  // Inspect central directory before inflation: bound XML expansion and reject macros.
  let expanded = 0,
    entries = 0;
  for (let p = 0; p < bytes.length - 46; p++)
    if (bytes.readUInt32LE(p) === 0x02014b50) {
      const size = bytes.readUInt32LE(p + 24),
        nameLength = bytes.readUInt16LE(p + 28),
        extra = bytes.readUInt16LE(p + 30),
        comment = bytes.readUInt16LE(p + 32);
      const name = bytes.subarray(p + 46, p + 46 + nameLength).toString();
      expanded += size;
      entries++;
      if (
        /vbaProject|\.bin$/i.test(name) ||
        size === 0xffffffff ||
        expanded > 20 * 1024 * 1024 ||
        entries > 1000
      )
        throw new PlatformError(413, 'Cartella Excel troppo grande o con macro.');
      p += 45 + nameLength + extra + comment;
    }
  if (!entries) throw new PlatformError(400, 'XLSX non valido.');
  const { Workbook } = await import('exceljs');
  const workbook = new Workbook();
  await workbook.xlsx.load(bytes as never);
  if (workbook.worksheets.length !== 1)
    throw new PlatformError(400, 'Il modello deve contenere un solo foglio.');
  const sheet = workbook.worksheets[0];
  if (sheet.rowCount > 10001 || sheet.columnCount > 64)
    throw new PlatformError(413, 'Massimo 10.000 righe e 64 colonne.');
  const rows: string[][] = [];
  sheet.eachRow((row) => {
    const cells: string[] = [];
    row.eachCell({ includeEmpty: true }, (cell) => {
      if (cell.formula)
        throw new PlatformError(400, 'Le formule non sono ammesse: esporta i valori.');
      const value = cell.value;
      cells.push(value instanceof Date ? value.toISOString().slice(0, 10) : cell.text.trim());
    });
    if (cells.some(Boolean)) rows.push(cells);
  });
  return records(rows);
}
