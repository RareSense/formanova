# Explicit CAD analysis routing

Request: use direct OpenAI for analysis as well as coding.
Cause: llm_tier only selected coding; omitted analysis_tier used the server's
OpenRouter review default in the failed ring contract call.
Design gate: no UI changes. Bind analysis_tier to the selected CAD tier in the
shared request builder. Preserve null/empty omission and explicit tier choices.
Validate image and text requests and all jewelry categories. No paid calls.
