# Desktop app icon v1

- Status: Implemented
- Last verified: 2026-10-31 (#864; approved PNG sources, ICO frame selection, Editor captures and targeted checks; native packaging/install proof belongs to Windows CI).
- Authority: [ADR-0004](../adr/0004-desktop-host-distribution.md), [Desktop distribution](desktop-distribution-v1.md), [Discussion #856](https://github.com/litzio/litzio/discussions/856) and [packager guide](../guides/branding.md).
- Scope: Desktop EXE, window/taskbar, NSIS installer/uninstaller and shortcuts, Editor product marks and favicon.

## Artwork and provenance

The owner approved the image-generation results on 2026-10-31: a transparent ribbon L whose twist evokes Litz wire and whose upper fold evokes a document page. These PNGs replace the earlier document/wing SVG selected in [the historical #170 record](app-icon-v1-plan.md). No hand-authored SVG reconstruction, background tile, added shadow or pixel edits are part of this change.

- [Base original, 1024px](../../apps/desktop/assets/litzio-icon-1024.png): 48px and larger Windows frames and on-screen product marks.
- [Simplified original, 1024px](../../apps/desktop/assets/litzio-icon-small-1024.png): 16–32px Windows frames and favicon.
- [Windows ICO](../../apps/desktop/assets/icon.ico): 16, 24 and 32px from the simplified original; 48, 64, 128 and 256px from the base original.

The approved files are preserved byte for byte and supplied under the repository [MIT license](../../LICENSE). The known accepted limitation is that the dark ribbon face partially blends into dark backgrounds at 16/24px. Changing artwork requires a subsequent owner decision; no monochrome variant was approved for this delivery.

## Regeneration and integration

```powershell
pnpm --filter @litzio/desktop icons
```

The helper uses the checksum-verified icons 1.1.0 toolset pinned by electron-builder 26.15.3 to resize both configured PNGs with Lanczos and encode their ICO frames. It then merges the unchanged encoded frames, choosing the source by size. Recheck this internal tool entry point on builder upgrades. Commit both original PNGs and the regenerated ICO together. Packaging consumes the committed ICO.

`brand.ts` owns `icons.png`, `icons.smallPng` and `icons.ico`. Vite resolves the two PNG aliases for the Editor marks and favicon; Desktop build copies the configured ICO beside main, and BrowserWindow uses it. `win.icon`, `nsis.installerIcon` and `nsis.uninstallerIcon` use that same configured ICO. NSIS shortcuts point to the application EXE. The alternate-brand CI swaps the two approved source files to create a distinct configured identity, then verifies the built ICO and exact Editor/favicon PNG bytes.

About and README explain the name: Litzio (리치오) connects input/output (I/O) with Litz wire. About uses the configured product name in both languages. This artwork/copy change has no document semantics and needs no Core operation or CLI command.

## Verification boundary

Local checks cover original hashes, seven ICO frames and their source selection, deterministic regeneration, targeted Desktop tests/typecheck, Editor build, documentation and browser regressions. Manual captures cover 16/24/32/48/256px on light/dark surfaces and Editor at 1440/640px including Korean Dark. Captures are reproducible review artifacts under `tmp/864-icon`, not committed source assets.

Windows packaging, native EXE/installer resources, actual installation/update/uninstallation and alternate-brand coinstallation are verified by the existing required Windows CI. They are not run locally for #864. Historical #170 native screenshots remain in their historical files and do not prove the new mark's native appearance.
