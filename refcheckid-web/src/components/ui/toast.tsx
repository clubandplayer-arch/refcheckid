"use client";

import { createContext, useContext, useMemo, useState } from "react";

type ToastTone = "success" | "error" | "info";
interface ToastMessage {
  id: string;
  message: string;
  tone: ToastTone;
}
interface ToastContextValue {
  notify: (message: string, tone?: ToastTone) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const [messages, setMessages] = useState<readonly ToastMessage[]>([]);
  const value = useMemo<ToastContextValue>(
    () => ({
      notify(message, tone = "info") {
        const id = crypto.randomUUID();
        setMessages((current) => [...current, { id, message, tone }]);
        window.setTimeout(() => {
          setMessages((current) => current.filter((toast) => toast.id !== id));
        }, 3500);
      },
    }),
    [],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 space-y-2">
        {messages.map((toast) => (
          <div
            className={`rounded-xl px-4 py-3 text-sm text-white shadow-lg ${toast.tone === "error" ? "bg-red-600" : toast.tone === "success" ? "bg-green-600" : "bg-slate-800"}`}
            key={toast.id}
          >
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (context === null) {
    throw new Error("useToast must be used inside ToastProvider.");
  }
  return context;
}
