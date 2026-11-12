import { AuthGate } from "@/components/auth/auth-gate";
import { PublicationAdmin } from "@/features/platform/publication-settings";
export default function PublicationPage() {
  return (
    <AuthGate allowedRole="admin">
      <PublicationAdmin />
    </AuthGate>
  );
}
