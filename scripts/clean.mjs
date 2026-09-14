import { rmSync } from "node:fs";

for (const folder of ["dist", ".test-build", "site"]) {
    rmSync(folder, { recursive: true, force: true });
}
