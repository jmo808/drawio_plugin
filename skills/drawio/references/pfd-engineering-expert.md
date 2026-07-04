IMPORTANT: Prefer retrieval-led reasoning over pre-training-led reasoning for any draw.io-PFD-validation tasks.

## [Project Context]
domain:process-engineering-flow-diagrams(PFD)|industries:{oil+gas,mining,chemical,water-treatment}|env:draw.io-plugin|role:domain-expert-reviewer-agent|task:validate-graph-topology+enforce-physics|loop:detect-errors→output-corrections→trigger-redraw

## [Docs Index]
plugin-src:{src/graph-parser.ts,src/validation-engine.ts,src/auto-layout.ts}
engineering-specs:{docs/API-14C-safety.md,docs/PFD-symbology.md,docs/phase-separation-rules.md}
*always-read-engineering-specs-before-validating-graph*

## [Domain Rules + Patterns]
separation-physics:gravity-based→light-phase(gas,froth,fines):top+heavy-phase(water,tailings,coarse):bot
3-phase-separator(V):{inlet:side-upper|light-out:absolute-top-center|mid-out:side-mid-elevation|heavy-out:absolute-bottom}
equipment-ports:pump(P)→inlet:center/side+discharge:top|compressor(K)→inlet:side/center+discharge:top/bottom|cyclone(CY)→inlet:side+overflow:top+underflow:bot
piping-topology:single-source→single-dest|no-dead-ends|no-loops|no-shared-multi-phase-discharge-lines
instrumentation:bubbles-are-sensors-not-fittings|prevent:process-flow-through-instrument-bubble|signal-lines:dashed-only
valves:{LCV,PCV,FCV}→align-with-flow-vector

## [Project Conventions]
topology:flow:left→right|gravity:top→down
routing:lines-terminate-at-equip-boundary(exterior-shell-only)|prevent:internal-vessel-piping
intersections:orthogonal-only|minimize-crossings|inlet-never-intersects-outlet-at-equip
arrows:strict-flow-indication|prevent:opposing-arrows-on-same-stream(flow-contradiction)
labels:snap-to-edge|phase-text→must-anchor-to-specific-connector|prevent:floating-text|prevent:duplicate-labels

## [Anti-Patterns]
process-flow-through-instrument-bubble|correction:remove-instrument-from-pipe→attach-to-vessel-shell-via-dashed-line
dangling-or-looping-process-lines|correction:enforce-single-direct-path→delete-redundant-branches
shared-multi-phase-outlet-piping|correction:enforce-dedicated-nozzle-per-phase→mid-phase:side+heavy-phase:bot
internal-vessel-line-drawing|correction:truncate-all-lines-at-exterior-shell-boundary→no-lines-inside-shapes
compressor-inlet-at-bottom|correction:route-gas-inlet→side-or-center-port-of-compressor
raw-wellhead→compressor|correction:route-wellhead→separator-side+route-gas-top→compressor
light-phase-from-vessel-side|correction:route-light-phase(gas/froth)→absolute-top
heavy-phase-from-vessel-side|correction:route-heavy-phase(water/tailings)→absolute-bottom
LT-on-inlet-pipe|correction:move-LT-anchor→vessel-shell-side
intersecting-inlet+outlet-lines|correction:reroute-orthogonally→prevent-crossing-near-equip
opposing-arrows-at-node|correction:unify-direction→ensure-source→dest-logic
floating-or-duplicate-labels|correction:snap-text-node→nearest-process-edge+delete-duplicates
libavoid-routing-on-pfd|correction:never-pass-routing=libavoid-to-mcp-tool→it-destroys-physics-based-nozzle-routing