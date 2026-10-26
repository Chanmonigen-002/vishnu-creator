# ADR-0005: How ZastTranslate code may be reused

- **Status:** Accepted — Option 3 (clean re-implementation; no ZastTranslate source files copied verbatim)
- **Date:** 2026-10-26
- **Deciders:** Project owner

## Context

- [zast57/ZastTranslate](https://github.com/zast57/ZastTranslate) has the most useful dubbing logic (subtitle stabilization, fitted-CPS length fitting, reformulator, time-sync, mixer, assembler).
- The reference clone has **no LICENSE file** (checked 2026-10-25). Without a license, default copyright applies: we may read the code, but copying it into a product we distribute is not clearly permitted.
- VoxCPM is Apache-2.0 (copying allowed with attribution). OpenCreator's license is in the repo `LICENSE`.

## Options

1. **Ask the author for permission or a license** (for example MIT or Apache-2.0), then copy with attribution. Fastest path if granted.
2. **Clean re-implementation:** write our own code from the documented behaviour (the README feature list and the observed inputs and outputs), without copying source text. Slower, but owned outright.
3. **Hybrid:** re-implement now; switch to copying if a license arrives later.

## Recommendation

Option 3: start with option 2 for T2.4 so Phase 2 isn't blocked, and contact the author in parallel.

## Consequences

- Blocks T2.1 and T2.4 until accepted.
- Under options 2 and 3, each module in `services/dub-engine` notes "independent implementation" in its header. Under option 1, it notes the origin and license.
