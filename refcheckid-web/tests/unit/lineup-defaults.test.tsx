// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
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

it('shows loading rather than missing while photo policy is pending',async()=>{
 mocks.photos.mockReturnValue(new Promise(()=>{}));show();await screen.findByText('Rossi Mario');expect(screen.getByText('Caricamento foto…')).toBeTruthy();expect(screen.queryByText('Missing')).toBeNull();
});
it('requires the annual reason before enabling the upload button',async()=>{
 mocks.photos.mockImplementation(async (_team,players)=>players.map((player:Record<string,unknown>)=>({...player,photoUrl:'/photo.jpg',photo:{status:'active',currentPhotoUrl:'/photo.jpg',proposedPhotoUrl:null,approvalId:null,requiresReplacementReason:true}})));
 show();await screen.findByText('Active');const input=screen.getByLabelText('Modifica foto Rossi Mario') as HTMLInputElement;
 fireEvent.change(input,{target:{files:[new File(['fake-image'],'face.jpg',{type:'image/jpeg'})]}});
 const reason=await screen.findByPlaceholderText('Motivo del cambio aggiuntivo (almeno 20 caratteri)');
 expect((screen.getByRole('button',{name:'Invia richiesta'}) as HTMLButtonElement).disabled).toBe(true);
 fireEvent.change(reason,{target:{value:'Crescita fisica rilevante che rende necessario un aggiornamento della foto.'}});
 expect((screen.getByRole('button',{name:'Invia richiesta'}) as HTMLButtonElement).disabled).toBe(false);
});

it('moves a player with buttons and saves their edited number and role in the new order', async () => {
  const first = { id: 'player', registrationId: 'registration', season: '2026', firstName: 'Mario', lastName: 'Rossi', photoUrl: null, selected: false, suspended: false, warning: false, shirtNumber: 1, role: 'starter', isGoalkeeper: false, isCaptain: false, isViceCaptain: false };
  mocks.players.mockResolvedValue([first, {...first, id:'second', registrationId:'registration2', firstName:'Luca',lastName:'Bianchi',shirtNumber:2}]);
  show(); await screen.findByText('Rossi Mario');
  fireEvent.click(screen.getByRole('button',{name:'Seleziona tutti'}));
  fireEvent.click(screen.getByRole('button',{name:'2. Ordine'}));
  expect((screen.getByRole('button',{name:'Sposta su Rossi Mario'}) as HTMLButtonElement).disabled).toBe(true);
  const second=within(screen.getByRole('listitem',{name:'Bianchi Luca'}));
  fireEvent.change(second.getByRole('spinbutton'),{target:{value:'25'}});
  fireEvent.click(second.getByRole('radio',{name:'Riserva'}));
  fireEvent.click(second.getByRole('checkbox',{name:/^Capitano$/}));
  fireEvent.click(second.getByRole('button',{name:'Sposta su Bianchi Luca'}));
  expect(screen.getAllByRole('listitem')[0].getAttribute('aria-label')).toBe('Bianchi Luca');
  expect((screen.getByRole('button',{name:'Sposta giù Rossi Mario'}) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole('button',{name:'Salva distinta in bozza'}));
  await vi.waitFor(()=>expect(mocks.save).toHaveBeenCalledWith('sheet',expect.objectContaining({players:[expect.objectContaining({playerRegistrationId:'registration2',shirtNumber:25,role:'reserve',isCaptain:true,lineupOrder:0}),expect.objectContaining({playerRegistrationId:'registration',lineupOrder:1})]})));
});

it('keeps order and player controls disabled after submission', async () => {
  mocks.sheets.mockResolvedValue([{id:'sheet',matchId:'match',clubId:'club',status:'submitted',players:[saved]}]);
  show();await screen.findByText('Rossi Mario');
  fireEvent.click(screen.getByRole('button',{name:'2. Ordine'}));
  const card=screen.getByRole('listitem',{name:'Rossi Mario'});
  expect(card.querySelector('fieldset')?.disabled).toBe(true);
  expect((screen.getByRole('button',{name:'Sposta su Rossi Mario'}) as HTMLButtonElement).disabled).toBe(true);
  expect((screen.getByRole('checkbox',{name:'Convoca Rossi Mario'}) as HTMLInputElement).disabled).toBe(true);
});
