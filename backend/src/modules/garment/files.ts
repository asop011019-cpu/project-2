import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import path from "node:path";
export function garmentFiles(root: string) {
  return {
    remove(filename: string) {
      const full = path.join(root, filename);
      const bytes = readFileSync(full);
      unlinkSync(full);
      return () => writeFileSync(full, bytes, { mode: 0o600 });
    },
  };
}
