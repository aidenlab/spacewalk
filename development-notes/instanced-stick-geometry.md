# Instanced stick geometry

**Status:** Shipped, July 2026.

## Why sticks are instanced

Sticks used to be baked: `createSticks` built one `CylinderGeometry` per stick *at the
chosen radius*, applied the orientation quaternion and midpoint translation directly to
its vertices, and `mergeGeometries`'d the lot into a single static `BufferGeometry`. The
radius lived in the vertex positions.

That was fine while the radius was fixed at construction. It stopped being fine when the
Stick Radius control was added, because changing the radius meant disposing the merged
mesh and rebuilding every cylinder on each click of the stepper — an allocation and a
merge per click, sitting right next to a Ball Radius control that responds instantly.

Sticks are now an `InstancedMesh` over one canonical unit-radius, unit-length cylinder
aligned to +y. Each instance matrix carries:

- **rotation** — the quaternion from +y to the stick axis (as before)
- **translation** — the midpoint of the two endpoints (as before)
- **scale** — `(radius, distance, radius)`, which is the new part

So a radius change is a walk over the instance matrices rewriting x and z, exactly as
`updateBallRadius` walks the ball matrices. The two controls now genuinely work the same
way rather than merely looking like they do.

## Things that bite

**The stick scale is non-uniform, and y is load-bearing.** y carries the endpoint
distance. `updateStickRadius` writes `ss.x = ss.z = radius` and must never reach for
`setScalar`, which is what the ball path correctly does. This is the main reason the two
update methods were left as separate explicit methods instead of being factored behind a
shared matrix walker with a callback — a shared walker would have made the distinction
implicit, and a later "simplification" of the stick callback to `setScalar` would squash
every stick to unit length.

**The instance count is not `trace.length`.** Sticks are built from
`getSingleCentroidVertices(trace, true)`, which filters missing-data vertices out, so
there are (filtered vertices − 1) sticks, plus one more when `spacewalkConfig.isCircular`.
Iterate `this.sticks.count`. `updateBallRadius` iterates `trace.length` because balls
*are* one-per-index; the asymmetry is real and deliberate.

**`InstancedMesh.dispose()` does not free geometry or material.** It frees only the
instance buffers. `disposalUtils.disposeObject` prefers an object's own `dispose()` when
present, so the fallback path that would have freed geometry and material never runs.
`BallAndStick.dispose` therefore frees geometry and material explicitly for both meshes.
Balls had this leak since long before the stick conversion — `createBalls` has always
produced an `InstancedMesh` — and sticks would have acquired it the moment they stopped
being a plain `Mesh` taking the fallback path. Disposing is safe because each
`BallAndStick` owns fresh materials: `getColorRampMaterial(...)` for balls, and
`stickMaterial.clone()` for sticks, never `SceneManager`'s original.

Anything else in this codebase that becomes an `InstancedMesh` inherits the same trap.

## Related

- Radius ladders come from `generateRadiusTable`: 11 entries spanning 0.5×–2× of a base
  derived from the average inter-vertex distance. Ball base `2e-1 ×`, stick base
  `0.5e-1 ×`, so the stick maximum coincides exactly with the ball minimum — sticks can
  become as fat as balls but never fatter, and the ball-and-stick reading never
  degenerates into an undifferentiated tube.
- Both radius indices persist across trace rebuilds by write-through to `SceneManager`
  (`ballRadiusIndex`, `stickRadiusIndex`), not by capture-on-death in `purgeScene` the way
  `isStickVisible` does. Neither is in the session JSON.
