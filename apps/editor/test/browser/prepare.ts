/** `pnpm browser:prepare`: recreate every browser regression scratch directory under tmp/. */
import path from "node:path";
import { prepareBrowserFixtures, REPOSITORY_ROOT } from "./fixtures.ts";

for (const dir of prepareBrowserFixtures()) console.log(`prepared ${path.relative(REPOSITORY_ROOT, dir)}`);
