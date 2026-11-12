// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  ResultsPortal,
  PublicGamePage,
} from "../../src/features/public-results/portal";
const clients: QueryClient[] = [];
afterEach(() => {
  Object.defineProperty(navigator, "onLine", {
    value: true,
    configurable: true,
  });
  fireEvent(window, new Event("online"));
  cleanup();
  for (const client of clients.splice(0)) client.clear();
  vi.unstubAllGlobals();
});
function show(node: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  clients.push(client);
  return render(
    <QueryClientProvider client={client}>{node}</QueryClientProvider>,
  );
}
it("shows only authorized public data, sends no operator credentials and distinguishes provisional results", async () => {
  const fetcher = vi
    .fn()
    .mockImplementation(async () =>
      Response.json({
        id: "game",
        competition: {
          id: "cup",
          name: "Published cup",
          season: "2026",
          sport: "football",
        },
        home: "Home",
        away: "Away",
        phase: "live",
        certification: "provisional",
        liveUpdates: true,
        score: { home: 2, away: 1 },
        period: 1,
        revision: 3,
        updatedAt: "2026-11-12T10:00:00Z",
        scheduledAt: "2026-11-12T10:00:00Z",
        venue: "Field",
        round: "1",
        events: [],
        report: { summary: "PRIVATE REPORT" },
        birthDate: "PRIVATE BIRTHDATE",
      }),
    );
  vi.stubGlobal("fetch", fetcher);
  show(<PublicGamePage fixtureId="game" />);
  await screen.findByText("Aggiornamento provvisorio");
  expect(screen.getByLabelText("Punteggio").textContent).toBe("2 – 1");
  expect(screen.queryByText("PRIVATE REPORT")).toBeNull();
  expect(screen.queryByText("PRIVATE BIRTHDATE")).toBeNull();
  expect(fetcher.mock.calls[0][1]).toMatchObject({
    credentials: "omit",
    cache: "no-store",
  });
  expect(fetcher.mock.calls[0][1]).not.toHaveProperty("headers");
  Object.defineProperty(navigator, "onLine", {
    value: false,
    configurable: true,
  });
  fireEvent(window, new Event("offline"));
  await screen.findByText(/Connessione assente/);
  Object.defineProperty(navigator, "onLine", {
    value: true,
    configurable: true,
  });
});
it("starts with an empty portal when no championship has been explicitly published", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockImplementation(async () =>
        Response.json({ items: [], total: 0, nextCursor: null }),
      ),
  );
  show(<ResultsPortal />);
  await screen.findByText(/Non ci sono campionati pubblicati/);
  expect(screen.queryByLabelText("Punteggio")).toBeNull();
});
it("requests server-side sport filtering rather than filtering only the first catalog page", async () => {
  const fetcher = vi
    .fn()
    .mockImplementation(async () =>
      Response.json({ items: [], total: 0, nextCursor: null }),
    );
  vi.stubGlobal("fetch", fetcher);
  show(<ResultsPortal />);
  await screen.findByText(/Non ci sono campionati pubblicati/);
  fireEvent.change(
    screen.getByLabelText("Disciplina risultati", { exact: true }),
    { target: { value: "basketball" } },
  );
  await waitFor(() =>
    expect(
      fetcher.mock.calls.some(([url]) =>
        String(url).includes("sport=basketball"),
      ),
    ).toBe(true),
  );
});
it('shows all 36 disciplines and sends the selected new sport to the server',async()=>{
 const fetcher=vi.fn().mockImplementation(async()=>Response.json({items:[],total:0,nextCursor:null}));vi.stubGlobal('fetch',fetcher);show(<ResultsPortal/>);await screen.findByText(/Non ci sono campionati pubblicati/);
 const discipline=screen.getByLabelText('Disciplina risultati',{exact:true}) as HTMLSelectElement;
 expect(discipline.options).toHaveLength(37);
 expect(Array.from(discipline.options).some(o=>o.text==='Rugby a 15')).toBe(true);
 fireEvent.change(discipline,{target:{value:'rugby_union'}});
 await waitFor(()=>expect(fetcher.mock.calls.some(([url])=>String(url).includes('sport=rugby_union'))).toBe(true));
});
