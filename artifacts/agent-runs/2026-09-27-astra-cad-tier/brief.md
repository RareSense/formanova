# CAD tier default

Request: use GPT-6 Astra through OpenRouter on feature/jewelry-cad-workflows.
Scope: shared Text-to-CAD and Image-to-CAD default and its regression test.
Design gate: no visual/layout changes; existing controls and pricing preflight stay
unchanged. Reuse the existing GPT_6_ASTRA tier constant. Preserve explicit overrides.
Validation: request-shaping tests; no paid generations. Production is out of scope.
