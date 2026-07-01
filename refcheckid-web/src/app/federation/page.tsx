import { AuthGate } from "@/components/auth/auth-gate";
import { FederationWorkflow } from "@/features/federation/federation-workflow";

export default function FederationPage() {
  return (
    <AuthGate allowedRole="federation">
      <main className="mx-auto flex max-w-7xl flex-col gap-6 p-6">
      <header>
        <p className="text-sm font-semibold text-primary">Area Federazione</p>
        <h1 className="text-3xl font-bold">Cruscotto operativo</h1>
      </header>
        <FederationWorkflow />
      </main>
    </AuthGate>
  );
}
