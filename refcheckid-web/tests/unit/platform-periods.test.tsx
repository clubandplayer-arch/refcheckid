// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
const mock = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("@/lib/session", () => ({
  useSession: () => ({ session: { user: { id: "referee-test" } } }),
}));
vi.mock("../../src/features/platform/api", async () => ({
  ...(await vi.importActual("../../src/features/platform/api")),
  platformGet: mock.get,
  platformPost: mock.post,
}));
import { PeriodPanel } from "../../src/features/platform/referee";
let client: QueryClient;
const context = {
  fixture: { id: "fixture" },
  competition: { sport: "football", rules: { periods: 2 } },
  summary: null,
  events: [],
  players: [],
  home: { id: "home", name: "Casa" },
  away: { id: "away", name: "Ospite" },
  reportStatus: null,
};
beforeEach(() => {
  localStorage.clear();
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  mock.get.mockResolvedValue(context);
  mock.post.mockRejectedValue(new Error("Connessione assente"));
});
afterEach(() => {
  cleanup();
  client.clear();
  vi.resetAllMocks();
});
function show(role: "principal" | "assistant" = "principal",notebook=false) {
  render(
    <QueryClientProvider client={client}>
      <PeriodPanel fixtureId="fixture" role={role} notebook={notebook} />
    </QueryClientProvider>,
  );
}
it("keeps an unacknowledged period on the device and retries the same operation after reconnection", async () => {
  show();
  await screen.findByText(/Aggiornamenti gara/);
  fireEvent.click(screen.getByText(/Aggiornamenti gara/));
  fireEvent.click(
    screen.getByRole("button", {
      name: "Conferma fine periodo, anche senza eventi",
    }),
  );
  await screen.findByRole("alert");
  const key = "refcheckid:period:referee-test:fixture";
  const saved = JSON.parse(localStorage.getItem(key)!);
  expect(saved).toMatchObject({
    period: 1,
    revision: 0,
    homeScore: 0,
    awayScore: 0,
    state: "period_confirmed",
  });
  expect(saved.operationId).toBeTruthy();
  mock.post.mockResolvedValue({ ...saved, revision: 1 });
  fireEvent(window, new Event("online"));
  await waitFor(() => expect(localStorage.getItem(key)).toBeNull());
  expect(mock.post).toHaveBeenLastCalledWith("games/fixture/periods", saved);
  await screen.findByText("Aggiornamento ricevuto e salvato dal server.");
});
it("retains a conflicting offline update until the referee explicitly resolves it", async () => {
  const saved = {
    operationId: "offline-op",
    revision: 0,
    period: 1,
    homeScore: 0,
    awayScore: 0,
    events: [],
    state: "period_confirmed",
  };
  localStorage.setItem(
    "refcheckid:period:referee-test:fixture",
    JSON.stringify(saved),
  );
  mock.post.mockRejectedValue(new Error("Calendario modificato: ricarica."));
  show();
  await screen.findByText(/Aggiornamenti gara/);
  fireEvent.click(screen.getByText(/Aggiornamenti gara/));
  fireEvent.click(
    screen.getByRole("button", { name: "Sincronizza aggiornamento salvato" }),
  );
  await screen.findByText("Calendario modificato: ricarica.");
  expect(
    JSON.parse(localStorage.getItem("refcheckid:period:referee-test:fixture")!),
  ).toEqual(saved);
});
it("allows an assistant to send provisional updates and reserves official confirmations for the principal", async () => {
  show("assistant");
  await screen.findByText(/Aggiornamenti gara/);
  fireEvent.click(screen.getByText(/Aggiornamenti gara/));
  expect(
    screen.queryByRole("button", { name: "Conferma fine gara" }),
  ).toBeNull();
  expect(
    screen.getByRole("button", { name: "Invia aggiornamento provvisorio" }),
  ).toBeTruthy();
});

it("restores an unsent draft with its original server revision instead of silently overwriting a newer update", async () => {
  const key = "refcheckid:period:referee-test:fixture:draft";
  localStorage.setItem(
    key,
    JSON.stringify({
      events: [],
      period: 1,
      revision: 0,
      correctionReason: "",
    }),
  );
  mock.get.mockResolvedValue({
    ...context,
    summary: {
      revision: 2,
      period: 1,
      state: "provisional",
      homeScore: 0,
      awayScore: 0,
      confirmedAt: new Date().toISOString(),
    },
  });
  show();
  await screen.findByText(/Bozza locale recuperata/);
  fireEvent.click(screen.getByText(/Aggiornamenti gara/));
  fireEvent.click(
    screen.getByRole("button", {
      name: "Conferma fine periodo, anche senza eventi",
    }),
  );
  await screen.findByRole("alert");
  expect(mock.post).toHaveBeenCalledWith(
    "games/fixture/periods",
    expect.objectContaining({ revision: 0 }),
  );
});

it('keeps recording offline notebook events and sends the newer draft after the older pending operation is acknowledged',async()=>{
 const base={...context,recognitionStatus:'locked',progress:null,players:[{registrationId:'player-1',clubId:'home',name:'Alice Player',shirtNumber:9,role:'starter'}]};mock.get.mockResolvedValue(base);show('principal',true);
 await screen.findByRole('heading',{name:'Inserimento rapido'});fireEvent.change(screen.getByLabelText('Giocatore evento',{exact:true}),{target:{value:'player-1'}});fireEvent.click(screen.getByRole('button',{name:/^Registra evento$/}));
 await waitFor(()=>expect(mock.post).toHaveBeenCalledTimes(1),{timeout:2000});await screen.findByText('Connessione assente');
 fireEvent.click(screen.getByRole('button',{name:/^Registra evento$/}));await waitFor(()=>expect(JSON.parse(localStorage.getItem('refcheckid:period:referee-test:fixture:draft')!).events).toHaveLength(2));
 expect(JSON.parse(localStorage.getItem('refcheckid:period:referee-test:fixture')!).events).toHaveLength(1);
 cleanup();let revision=0;let serverEvents:unknown[]=[];mock.post.mockImplementation(async(_path:string,body:Record<string,unknown>)=>{revision++;serverEvents=body.events as unknown[];return{...body,revision};});mock.get.mockImplementation(async()=>({...base,events:serverEvents,summary:revision?{revision,period:1,state:'provisional',homeScore:serverEvents.length,awayScore:0,confirmedAt:new Date().toISOString()}:null}));
 show('principal',true);await screen.findByRole('heading',{name:'Inserimento rapido'});fireEvent(window,new Event('online'));
 await waitFor(()=>expect(mock.post).toHaveBeenCalledTimes(3),{timeout:3000});await waitFor(()=>expect(localStorage.getItem('refcheckid:period:referee-test:fixture')).toBeNull());
 expect(mock.post.mock.calls.at(-1)?.[1]).toMatchObject({revision:1,events:expect.any(Array)});expect((mock.post.mock.calls.at(-1)?.[1] as {events:unknown[]}).events).toHaveLength(2);
});
