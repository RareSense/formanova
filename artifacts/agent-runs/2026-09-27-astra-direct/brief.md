# Direct Astra CAD routing

Request: change the FormaNova jewelry-workflows CAD default to direct OpenAI.
Design gate: no visual changes. Reuse GPT_6_ASTRA_OPENAI; preserve explicit overrides,
existing pricing preflight and request shaping. Backend fallback policy is unchanged.
Validation: the CAD request-shaping tests. No paid runs or deployment.
