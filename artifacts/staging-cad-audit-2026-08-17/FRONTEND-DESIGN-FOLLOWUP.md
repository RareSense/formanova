# Frontend/design follow-up: long-running CAD and Product Vault

This is separate from the backend handoff and is not implemented in the current bug-fix pass.

## Long-running generation UI

- Replace the viewport-dominating spinner with a compact, conspicuous background-job state.
- Copy: “Complex designs can take over an hour. You can safely leave this page.”
- Default completion recipient is the logged-in user’s email, never a studio/shared email.
- Show: “We’ll email **user@example.com** when ready · Edit”.
- Persist an editable user-level CAD notification email and snapshot it onto each submitted workflow.
- Keep **Continue creating** available and show the active CAD job count globally.
- Completion link opens the exact workflow result using `workflow_id`.

## CAD Product Vault

- Add canonical `generated_cad` assets alongside the existing Photo Studio product library.
- A CAD asset groups the interactive GLB, primary 3DM download, screenshots, prompt, canonical source type, workflow ID, and dimensions/metadata.
- Vault cards show an interactive GLB preview; static screenshots are fallback only.
- Primary action: **Download 3DM**. Secondary actions: **Open in CAD**, **Export GLB**, and **Rename**.
- Text-to-CAD and Image-to-CAD are separate filters, using `text_to_cad` and `image_to_cad`.
- Generation History, Admin, notification email, and Product Vault must resolve the same `output_asset_id` and workflow result.

No GStack mockup was generated because no GStack design tool or destination is connected to this workspace. This file is the implementation brief for that mockup task.
