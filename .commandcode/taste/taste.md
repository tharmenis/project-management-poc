# Taste

## Tooling

- Prefers a hosted LLM API (DeepSeek) over a local model runner (Ollama) as the LLM provider for LLM-backed apps. Confidence: 0.5

## Workflow

- For local/PoC work, is fine pasting secrets (e.g. API tokens) directly into the chat instead of using a side channel, and will say so when asked. Confidence: 0.4
- Works milestone-by-milestone on larger projects, giving an explicit go-ahead before the agent starts the next milestone. Confidence: 0.7
- Prefers to run git commands (e.g. `git init`, commits) themselves, and will tell the agent to hand off only the requested file edits. Confidence: 0.6
