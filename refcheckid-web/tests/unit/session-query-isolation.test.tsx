// @vitest-environment jsdom
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { useQuery } from "@tanstack/react-query";
const mock = vi.hoisted(() => ({ actor: "user-A" }));
vi.mock("@/lib/session", () => ({
  SessionProvider: ({ children }: { children: ReactNode }) => children,
  useSession: () => ({ session: { user: { id: mock.actor } } }),
}));
import { Providers } from "../../src/app/providers";
afterEach(cleanup);
function Probe() {
  const query = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => Promise.resolve(`Data for ${mock.actor}`),
  });
  return <p>{query.data ?? "Loading"}</p>;
}
it("rebinds all query observers to the new user cache when the authenticated identity changes", async () => {
  const tree = render(
    <Providers>
      <Probe />
    </Providers>,
  );
  await screen.findByText("Data for user-A");
  mock.actor = "user-B";
  tree.rerender(
    <Providers>
      <Probe />
    </Providers>,
  );
  await screen.findByText("Data for user-B");
  expect(screen.queryByText("Data for user-A")).toBeNull();
});
