"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { useSession, type AppRole } from "@/lib/session";

const loginSchema = z.object({
  actorId: z.string().uuid("Inserisci l'UUID utente fornito dal backend"),
  role: z.enum(["manager", "referee", "federation"]),
});

type LoginFormValues = z.infer<typeof loginSchema>;

const roleRedirects: Record<AppRole, string> = {
  federation: "/federation",
  manager: "/manager",
  referee: "/referee",
};

export function LoginForm() {
  const form = useForm<LoginFormValues>({
    defaultValues: { actorId: "", role: "manager" },
    resolver: zodResolver(loginSchema),
  });
  const router = useRouter();
  const { login } = useSession();
  const { notify } = useToast();

  function onSubmit(values: LoginFormValues) {
    login({ actorId: values.actorId, roles: [values.role] });
    notify("Sessione avviata", "success");
    router.push(roleRedirects[values.role]);
  }

  return (
    <Card className="w-full max-w-md space-y-6">
      <div>
        <p className="text-sm font-semibold text-primary">RefCheckID</p>
        <h1 className="text-2xl font-bold">Accesso operativo</h1>
        <p className="text-sm text-slate-500">
          Inserisci l’attore applicativo: il frontend invierà le credenziali al
          backend tramite header autenticati.
        </p>
      </div>
      <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
        <label className="block space-y-1 text-sm font-medium">
          Actor ID
          <Input
            autoComplete="username"
            placeholder="UUID utente"
            {...form.register("actorId")}
          />
          {form.formState.errors.actorId ? (
            <span className="text-xs text-red-600">
              {form.formState.errors.actorId.message}
            </span>
          ) : null}
        </label>
        <label className="block space-y-1 text-sm font-medium">
          Ruolo
          <select
            className="w-full rounded-lg border bg-background px-3 py-2"
            {...form.register("role")}
          >
            <option value="manager">Dirigente</option>
            <option value="referee">Arbitro</option>
            <option value="federation">Federazione</option>
          </select>
        </label>
        <Button className="w-full" type="submit">
          Entra
        </Button>
      </form>
    </Card>
  );
}
