import { request } from "@/lib/api-client";
export type * from "refcheckid-backend/platform-types";
export interface Page<T> {
  items: T[];
  total: number;
  nextCursor: string | null;
}
export const platformGet = <T>(path: string) => request<T>(`/platform/${path}`);
export const platformPost = <T>(path: string, body: unknown = {}) =>
  request<T>(`/platform/${path}`, {
    method: "POST",
    body: JSON.stringify(body),
  });
export const params = (values: Record<string, string | undefined | null>) =>
  new URLSearchParams(
    Object.entries(values).filter(
      (pair): pair is [string, string] => !!pair[1],
    ),
  ).toString();
