import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import path from "node:path";
export function garmentFiles(root: string) {
  return {
    /** missingOk (account deletion only): an already-missing file counts as removed. */
    remove(filename: string, options: { missingOk?: boolean } = {}) {
      const full = path.join(root, filename);
      let bytes: Buffer;
      try {
        bytes = readFileSync(full);
      } catch (error) {
        if (
          options.missingOk &&
          (error as NodeJS.ErrnoException).code === "ENOENT"
        )
          return () => {};
        throw error;
      }
      unlinkSync(full);
      return () => writeFileSync(full, bytes, { mode: 0o600 });
    },
  };
}
