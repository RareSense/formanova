# Backend handoff: CAD history classification and result contract

Owner: History/API backend

## Problem

Staging returns `source_type: "unknown"` for completed, text-only `ring_cad_nurbs_v1` workflows. This value is present in both the history response and the full `/api/result/{workflow_id}` response. Consequently, clients cannot reliably distinguish Text-to-CAD from Image-to-CAD without inferring from workflow inputs.

Canonical source types requested by product:

- `text_to_cad`
- `image_to_cad`

Do not introduce `sketch` as a product category. Older `cad_text` and `cad_sketch` values may be accepted as migration aliases, but new and backfilled records should use the canonical values above.

## Reproductions

| Workflow ID | Reference images | `/api/result` | Current source type | Output asset |
| --- | ---: | --- | --- | --- |
| `state-c807f6b4877b4cdcb6d4d23818701824` | 0 | HTTP 200, completed | `unknown` | `c8291687-b7f0-4232-9919-2b99d3ea41bb` |
| `state-0bc00515ba4a401f89b6d77550f13201` | 0 | HTTP 200, completed | `unknown` | `d7c64086-e378-42ed-b292-3914ce08c4eb` |

Both result payloads contain one successful `final_validated` result, 12 screenshots, a GLB artifact, and a 3DM artifact:

| Workflow | GLB bytes | 3DM bytes |
| --- | ---: | ---: |
| `state-c807f6…` | 6,511,060 | 1,076,154 |
| `state-0bc005…` | 7,788,044 | 1,428,261 |

Full unmodified response bodies:

- `result-state-c807f6b4.json`
- `result-state-0bc00515.json`

Authenticated staging URLs:

- `https://staging-gsdgds12.formanova.ai/api/result/state-c807f6b4877b4cdcb6d4d23818701824`
- `https://staging-gsdgds12.formanova.ai/api/result/state-0bc00515ba4a401f89b6d77550f13201`

Matching full history-detail bodies:

- `history-details-state-c807f6b4.json`
- `history-details-state-0bc00515.json`

## Required backend behavior

When serializing `ring_cad_nurbs_v1` into `/api/history/workflows/me`, workflow details, and `/api/result/{workflow_id}`:

- Return `source_type: "text_to_cad"` when the submitted reference-image count is zero.
- Return `source_type: "image_to_cad"` when one or more reference images were submitted.
- Store the resolved value on the canonical workflow/asset record so History, Product Vault, result links, and future clients receive the same classification.

## Result shape required for interactive history

The two captured results are valid and include the interactive-preview GLB and machinable 3DM under `final_validated[0]`. Preserve these typed artifact objects in `/api/result/{workflow_id}`:

```json
{
  "source_type": "text_to_cad",
  "output_asset_id": "...",
  "final_validated": [
    {
      "status": "completed",
      "ok": true,
      "glb_artifact": {
        "type": "model/gltf-binary",
        "url": "/api/artifacts/{sha256}"
      },
      "threedm_artifact": {
        "type": "model/vnd.rhino.3dm",
        "url": "/api/artifacts/{sha256}"
      },
      "screenshots": []
    }
  ]
}
```

Artifact URLs are content-addressed and extensionless. Clients must use the typed artifact field/MIME type; the backend must not require or fabricate a `.glb` filename suffix.

Admin generation detail must expose enough information to resolve the same workflow result. The frontend now fetches `/api/result/{workflow_id}` as the authoritative fallback for the interactive Admin viewer.

The frontend contains a compatibility fallback for `unknown`, based on the backend-provided reference-image count. It also accepts old `cad_text`/`cad_sketch` inputs at the API boundary and immediately normalizes them to `text_to_cad`/`image_to_cad`. Recognized canonical backend source types remain authoritative. These migration aliases and the `unknown` fallback should be removable after historical records are backfilled and the API contract is fixed.
