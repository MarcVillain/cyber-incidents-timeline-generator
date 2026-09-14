import { rmSync } from "node:fs";

for (const folder of ["dist", ".test-build"]) {
    rmSync(folder, { recursive: true, force: true });
}
