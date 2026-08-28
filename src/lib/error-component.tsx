import type { ErrorComponentProps } from "@tanstack/react-router";

export function AppErrorComponent(_props: ErrorComponentProps) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-6 text-center text-foreground">
      <p className="text-eyebrow text-critical">Something went wrong</p>
      <h1 className="font-display text-3xl tracking-tight">Couldn’t load this page.</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        Your saved nights and confirmations are still in this browser. Try reloading the page.
      </p>
    </main>
  );
}
