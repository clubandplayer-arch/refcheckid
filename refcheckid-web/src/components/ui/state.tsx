import { Button } from "./button";
import { Card } from "./card";

export function SkeletonBlock() {
  return (
    <Card className="space-y-3">
      <div className="h-5 w-1/3 animate-pulse rounded bg-muted" />
      <div className="h-20 animate-pulse rounded-xl bg-muted" />
      <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
    </Card>
  );
}

export function EmptyState({ message }: Readonly<{ message: string }>) {
  return (
    <p className="rounded-xl bg-muted p-4 text-sm text-slate-500">{message}</p>
  );
}

export function ErrorState({
  message,
  onRetry,
}: Readonly<{ message: string; onRetry?: () => void }>) {
  return (
    <Card className="space-y-3 border-red-200 bg-red-50 text-red-950">
      <p className="font-semibold">Errore API</p>
      <p className="text-sm">{message}</p>
      {onRetry ? (
        <Button className="bg-red-600" onClick={onRetry} type="button">
          Riprova
        </Button>
      ) : null}
    </Card>
  );
}
