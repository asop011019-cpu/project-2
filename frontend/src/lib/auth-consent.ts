import type { ConsentDocument } from "./auth-api";
export function requiredAccepted(documents: ConsentDocument[], values: Record<string, boolean>) {
  return (
    documents.some((d) => d.required) &&
    documents.filter((d) => d.required).every((d) => values[d.key] === true)
  );
}
