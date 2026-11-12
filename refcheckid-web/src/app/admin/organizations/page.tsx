import { AuthGate } from "@/components/auth/auth-gate";
import { OrganizationWorkspace } from "@/features/platform/workspace";
export default function OrganizationsPage() {
  return (
    <AuthGate allowedRole="admin">
      <main className="mx-auto max-w-7xl space-y-4 p-6">
        <h1 className="text-3xl font-bold">Registro degli enti autonomi</h1>
        <p>
          Registra enti sportivi e arbitrali indipendenti. Invita poi i loro
          amministratori: le leghe potranno collegare gli enti arbitrali
          registrati ai propri campionati senza crearli o controllarne il
          profilo.
        </p>
        <OrganizationWorkspace />
      </main>
    </AuthGate>
  );
}
