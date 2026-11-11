// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
const mocks = vi.hoisted(() => ({ page: vi.fn(), clubs: vi.fn(), approve: vi.fn(), reject: vi.fn(), notify: vi.fn() }));
vi.mock('@/lib/federation-api-client', async () => ({
  ...await vi.importActual('@/lib/federation-api-client'),
  fetchPhotoRequestPage: mocks.page, fetchPhotoApprovalClubs: mocks.clubs,
  approvePhotoRequest: mocks.approve, rejectPhotoRequest: mocks.reject,
}));
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ notify: mocks.notify }) }));
import { PhotoRequestsPanel } from '../../src/features/federation/federation-workflow';

let client: QueryClient;
beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } });
  mocks.page.mockResolvedValue({ total: 4000, nextCursor: 'next-page', items: Array.from({ length: 12 }, (_, i) => ({
    id: `approval-${i}`, playerName: `Persona ${i}`, clubName: 'Club', status: 'pending',
    currentPhotoUrl: null, proposedPhotoUrl: '/thumb.webp', proposedFullPhotoUrl: '/full.png', requestedAt: '2026-11-11T00:00:00.000Z',
  })) });
  mocks.clubs.mockResolvedValue([{ id: 'club', name: 'Club' }]);
});
afterEach(() => { cleanup(); client.clear(); vi.resetAllMocks(); });

it('renders only a page for 4000 requests and updates one confirmed approval without refetching the list', async () => {
  let finish!: () => void;
  mocks.approve.mockReturnValue(new Promise<void>((resolve) => { finish = resolve; }));
  render(<QueryClientProvider client={client}><PhotoRequestsPanel /></QueryClientProvider>);
  await screen.findByText('Persona 0');
  expect(screen.getAllByRole('button', { name: 'Approva', exact: true })).toHaveLength(12);
  expect(screen.getAllByRole('img')).toHaveLength(12);
  expect(screen.getAllByRole('img')[0].getAttribute('loading')).toBe('lazy');
  fireEvent.click(screen.getAllByRole('button', { name: 'Approva', exact: true })[0]);
  expect((await screen.findByRole('button', { name: 'Approvazione…' })).hasAttribute('disabled')).toBe(true);
  expect(screen.queryByText('Foto approvata: la nuova immagine è subito disponibile al Club.')).toBeNull();
  await act(async () => { finish(); await Promise.resolve(); });
  await screen.findByText('Foto approvata: la nuova immagine è subito disponibile al Club.');
  expect(mocks.page).toHaveBeenCalledTimes(1);
  expect(screen.getByText('3999 richieste · Pagina 1')).toBeTruthy();
  expect(screen.getAllByRole('button', { name: 'Approva', exact: true }).filter((button) => !button.hasAttribute('disabled'))).toHaveLength(11);
});

it('keeps a failed decision retryable and does not show a false success', async () => {
  mocks.reject.mockRejectedValue(new Error('Decision unavailable'));
  render(<QueryClientProvider client={client}><PhotoRequestsPanel /></QueryClientProvider>);
  await screen.findByText('Persona 0');
  fireEvent.click(screen.getAllByRole('button', { name: 'Rifiuta', exact: true })[0]);
  await waitFor(() => expect(mocks.notify).toHaveBeenCalledWith('Decision unavailable', 'error'));
  expect(screen.queryByText(/Rifiuto comunicato al Club/)).toBeNull();
  expect(mocks.page).toHaveBeenCalledTimes(1);
  expect(screen.getByText('4000 richieste · Pagina 1')).toBeTruthy();
});
