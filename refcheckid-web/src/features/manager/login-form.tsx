"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const loginSchema = z.object({
  email: z.string().email("Inserisci una email valida"),
  password: z.string().min(8, "La password deve avere almeno 8 caratteri"),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export function LoginForm() {
  const form = useForm<LoginFormValues>({ resolver: zodResolver(loginSchema) });

  return (
    <Card className="w-full max-w-md space-y-6">
      <div>
        <p className="text-sm font-semibold text-primary">RefCheckID</p>
        <h1 className="text-2xl font-bold">Accesso Dirigente</h1>
        <p className="text-sm text-slate-500">
          Accedi per gestire la distinta della prossima gara.
        </p>
      </div>
      <form className="space-y-4" onSubmit={form.handleSubmit(() => undefined)}>
        <label className="block space-y-1 text-sm font-medium">
          Email
          <Input
            type="email"
            autoComplete="email"
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
            type="password"
            autoComplete="current-password"
            {...form.register("password")}
          />
          {form.formState.errors.password ? (
            <span className="text-xs text-red-600">
              {form.formState.errors.password.message}
            </span>
          ) : null}
        </label>
        <Button className="w-full" type="submit">
          Entra
        </Button>
      </form>
    </Card>
  );
}
