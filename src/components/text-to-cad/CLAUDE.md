# text-to-cad components

## Protected files -- DO NOT MODIFY
- `CADCanvas.tsx` -- 3D canvas, GLB loading, mesh selection, transform gizmos
- `GemInstanceRenderer.ts` -- instanced gem rendering
- Do not touch WebGL context management, `_isTransformDragging`, or `SELECTION_MATERIAL`

## CADCanvas.tsx

Ref-based imperative API (`CADCanvasHandle`) -- all mesh operations go through this ref, never via props:

```ts
applyMaterial(matId: string, meshNames: string[])
resetTransform / deleteMeshes / duplicateMeshes / flipNormals / centerOrigin
subdivideMesh(meshNames, iterations) / smoothMesh(meshNames, iterations)
setWireframe(on: boolean)
applyTransform(meshNames) -- bakes current transform into geometry
removeAllTextures() / applyMagicTextures()
getSnapshot() / restoreSnapshot(snap)     -- undo/redo
exportSceneBlob() / exportSceneStlBlob(scaleMm) / exportSceneRawBlob()
zoomIn() / zoomOut() / resetCamera()
```

Props:
- `glbUrl` -- primary model URL; `additionalGlbUrls` -- secondary overlays
- `selectedMeshNames: Set<string>` -- drives selection highlight
- `hiddenMeshNames?: Set<string>`
- `transformMode: string` -- "orbit" | "translate" | "rotate" | "scale"
- `onMeshesDetected` fires once after GLB load with `{ name, verts, faces }[]`
- `onModelReady` fires after first render is complete
- `qualityMode?: QualityMode` -- "performance" | "balanced" | "quality"
- `gemMode?: GemMode` -- "simple" | "refraction"; can be overridden by GPU detection via `onGemModeForced`

Multi-mesh transform: all selected meshes rotate/scale around a shared bounding-box pivot. Do not break this by setting transforms individually.

## LeftPanel.tsx

The CAD Edit/Rebuild workflow (`ring_edit_v1`, Rebuild/Add-On part tools) was
removed entirely -- there is no in-place edit capability. `LeftPanel` only
drives generation.

Props (all required unless marked):
```ts
model / setModel         -- AI model id ("gemini" | "claude-opus")
prompt / setPrompt       -- generation prompt (optional once a reference image exists)
isGenerating / hasModel  -- booleans that gate UI sections
onGenerate               -- trigger generation
magicTexturing / onMagicTexturingChange
onGlbUpload(file: File)
onReset?()
creditBlock?: React.ReactNode        -- slot for credit cost display
referenceImagePreviewUrls?: string[]  -- all uploaded reference images, not just the primary
onRemoveReferenceImage?(index: number)
pageTitle?: string
```

AI model selector is commented out (hidden until model selection ships). Do not re-enable it without a feature flag.

## MeshPanel.tsx

Props:
```ts
meshes: MeshItemData[]           -- from CADCanvas onMeshesDetected
onSelectMesh(name, multi: bool)  -- multi=true on Shift/Ctrl click
onAction(action: string)         -- mesh-level ops ("delete", "duplicate", etc.)
onApplyMaterial(matId: string)
onSceneAction(action: string)    -- scene-level ops
```

Material library split into `"metal"` and `"gemstone"` tabs. Source of truth is `MATERIAL_LIBRARY` in `src/components/cad-studio/materials.ts` -- do not duplicate it here.

## ViewportOverlays.tsx

Stateless display components only -- no direct Three.js access:
- `ViewportToolbar` -- orbit/translate/rotate/scale mode buttons
- `ProgressOverlay` -- generation progress bar + step text

## types.ts

Central constants for this directory:
- `AI_MODELS`, `QUICK_EDITS`, `PART_REGEN_PARTS`, `TRANSFORM_MODES`, `PROGRESS_STEPS`
- `MeshItemData`, `StatsData` interfaces
- Re-exports `MATERIAL_LIBRARY` and material types from `cad-studio/materials`

## Key invariants
- Material definitions live in `src/components/cad-studio/materials.ts` only. Never copy them here.
- There is no CAD Edit/Rebuild workflow -- it was removed entirely (no `CAD_EDIT_WORKFLOW`, no Rebuild/Add-On UI). Do not reintroduce it without a new product decision.
- `CAD_MODEL_SELECTOR_ENABLED` is `false` -- model quality picker stays hidden.
- Text-to-CAD and Image-to-CAD both generate through `ring_cad_nurbs_v1` via the shared `useImageToCADWorkflow` hook -- do not reintroduce a second inline poll loop for generation.
- All PostHog events must be imported from `src/lib/posthog-events.ts`, never from `posthog-js` directly.
