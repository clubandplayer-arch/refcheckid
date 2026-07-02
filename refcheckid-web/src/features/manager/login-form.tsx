"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { roleRedirects } from "@/components/auth/auth-gate";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { AuthError, authenticateWithPassword, type AuthDiagnostics } from "@/lib/auth-client";
import { useSession } from "@/lib/session";
import { useState } from "react";

const loginSchema = z.object({
  email: z.string().email("Inserisci un indirizzo email valido"),
  password: z.string().min(1, "Inserisci la password"),
});

type LoginFormValues = z.infer<typeof loginSchema>;

const errorMessages = {
  ACCOUNT_DISABLED: "Account disabilitato.",
  INVALID_CREDENTIALS: "Credenziali errate.",
  USER_NOT_FOUND: "Utente inesistente.",
} as const;

export function LoginForm() {
  const [diagnostics, setDiagnostics] = useState<AuthDiagnostics | null>(null);
  const form = useForm<LoginFormValues>({
    defaultValues: { email: "", password: "" },
    resolver: zodResolver(loginSchema),
  });
  const router = useRouter();
  const { login } = useSession();
  const { notify } = useToast();

  async function onSubmit(values: LoginFormValues) {
    try {
      const session = await authenticateWithPassword(values);
      setDiagnostics(null);
      login(session);
      notify("Accesso eseguito", "success");
      router.push(roleRedirects[session.user.role]);
    } catch (error) {
      const message =
        error instanceof AuthError
          ? errorMessages[error.code]
          : "Accesso non riuscito.";
      setDiagnostics(error instanceof AuthError ? error.diagnostics : null);
      form.setError("root", { message });
      notify(message, "error");
    }
  }

  return (
    <Card className="w-full max-w-md space-y-6">
      <div>
        <p className="text-sm font-semibold text-primary">RefCheckID</p>
        <h1 className="text-2xl font-bold">Accesso operativo</h1>
        <p className="text-sm text-slate-500">
          Accedi con email e password. Il ruolo operativo viene recuperato
          automaticamente dal backend.
        </p>
      </div>
      <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
        <label className="block space-y-1 text-sm font-medium">
          Email
          <Input
            autoComplete="email"
            placeholder="nome@dominio.it"
            type="email"
            {...form.register("email")}
          />
          {form.formState.errors.email ? (
            <span className="text-xs text-red-600">
              {form.formState.errors.email.message}
            </span>
          ) : null}
        </label>
        <label className="block space-y-1 text-sm font-medium">
          Password
          <Input
            autoComplete="current-password"
            placeholder="Password"
            type="password"
            {...form.register("password")}
          />
          {form.formState.errors.password ? (
            <span className="text-xs text-red-600">
              {form.formState.errors.password.message}
            </span>
          ) : null}
        </label>
        {form.formState.errors.root ? (
          <div className="space-y-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            <p>{form.formState.errors.root.message}</p>
            {diagnostics ? (
              <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded bg-white/70 p-2 text-xs text-red-900">
                {JSON.stringify(diagnostics, null, 2)}
              </pre>
            ) : null}
          </div>
        ) : null}
        <Button className="w-full" disabled={form.formState.isSubmitting} type="submit">
          ACCEDI
        </Button>
      </form>
    </Card>
  );
}
