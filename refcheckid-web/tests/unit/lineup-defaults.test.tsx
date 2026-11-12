// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
const mocks = vi.hoisted(() => ({ players: vi.fn(), staff: vi.fn(), sheets: vi.fn(), matches: vi.fn(), defaults: vi.fn(), photos:vi.fn(), staffPhotos:vi.fn(), save: vi.fn() }));
vi.mock('@/lib/api-client', async () => ({
  ...await vi.importActual('@/lib/api-client'),
  fetchPlayers: mocks.players, fetchStaff: mocks.staff, fetchMatchSheets: mocks.sheets,
  fetchMatches: mocks.matches, fetchLineupDefaults: mocks.defaults, saveMatchSheetDraft: mocks.save,
  selectOperationalMatch: (matches: unknown[]) => matches[0],
}));
vi.mock('@/lib/manager-photo-backend',async()=>({...await vi.importActual('@/lib/manager-photo-backend'),enrichPlayersWithBackendPhotos:mocks.photos,enrichStaffWithBackendStatus:mocks.staffPhotos}));
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ notify: vi.fn() }) }));
import { MatchSheetWorkflow } from '../../src/features/manager/match-sheet-workflow';
let client: QueryClient;
const saved = { playerRegistrationId: 'registration', shirtNumber: 77, role: 'reserve', isGoalkeeper: true, isCaptain: false, isViceCaptain: true, lineupOrder: 0 };
beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  mocks.players.mockResolvedValue([{ id: 'player', registrationId: 'registration', season: '2026', firstName: 'Mario', lastName: 'Rossi', photoUrl: null,
    selected: false, suspended: false, warning: false, shirtNumber: null, role: 'starter', isGoalkeeper: false, isCaptain: false, isViceCaptain: false }]);
  mocks.photos.mockImplementation(async (_team,players)=>players);
  mocks.staffPhotos.mockImplementation(async (_team,staff)=>staff);
  mocks.staff.mockResolvedValue([]);
  mocks.sheets.mockResolvedValue([{ id: 'sheet', matchId: 'match', clubId: 'club', status: 'draft', players: [] }]);
  mocks.matches.mockResolvedValue([{ id: 'match' }]);
  mocks.defaults.mockResolvedValue({ sourceMatchSheetId: 'previous-sheet', players: [saved] });
  mocks.save.mockResolvedValue({});
});
afterEach(() => { cleanup(); client.clear(); vi.resetAllMocks(); });
function show() { render(<QueryClientProvider client={client}><MatchSheetWorkflow /></QueryClientProvider>); }
it('prefills an unstarted sheet without selecting players, keeps edits and saves them to the backend', async () => {
  show();
  await screen.findByText(/Numeri di maglia, ruoli/);
  expect((screen.getByRole('checkbox', { name: 'Convoca Rossi Mario' }) as HTMLInputElement).checked).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: 'Seleziona tutti' }));
  fireEvent.click(screen.getByRole('button', { name: '2. Ordine' }));
  expect((screen.getByRole('spinbutton') as HTMLInputElement).value).toBe('77');
  expect((screen.getByRole('checkbox', { name: 'Portiere' }) as HTMLInputElement).checked).toBe(true);
  expect((screen.getByRole('checkbox', { name: 'Vice capitano' }) as HTMLInputElement).checked).toBe(true);
  fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '88' } });
  fireEvent.click(screen.getByRole('button', { name: 'Salva distinta in bozza' }));
  await vi.waitFor(() => expect(mocks.save).toHaveBeenCalledWith('sheet', expect.objectContaining({ players: [expect.objectContaining({ shirtNumber: 88, isGoalkeeper: true, isViceCaptain: true })] })));
});
it('never replaces an existing draft with previous-game defaults', async () => {
  mocks.sheets.mockResolvedValue([{ id: 'sheet', matchId: 'match', clubId: 'club', status: 'draft', players: [{ ...saved, shirtNumber: 9, isGoalkeeper: false, isCaptain: true, isViceCaptain: false }] }]);
  show();
  await screen.findByText('Rossi Mario');
  fireEvent.click(screen.getByRole('button', { name: '2. Ordine' }));
  expect((screen.getByRole('spinbutton') as HTMLInputElement).value).toBe('9');
  expect((screen.getByRole('checkbox', { name: 'Capitano' }) as HTMLInputElement).checked).toBe(true);
  expect((screen.getByRole('checkbox', { name: 'Portiere' }) as HTMLInputElement).checked).toBe(false);
});

it('shows the roster and keeps navigation usable while official photo requests are pending',async()=>{
  mocks.photos.mockReturnValue(new Promise(()=>{}));
  mocks.staffPhotos.mockReturnValue(new Promise(()=>{}));
  show();
  await screen.findByText('Rossi Mario');
  expect(mocks.players).toHaveBeenCalledWith({includePhotos:false});
  fireEvent.click(screen.getByRole('button',{name:'Seleziona tutti'}));
  fireEvent.click(screen.getByRole('button',{name:'2. Ordine'}));
  expect((screen.getByRole('spinbutton') as HTMLInputElement).value).toBe('77');
});
