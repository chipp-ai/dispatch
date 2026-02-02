# Scenario Tests

Integration and end-to-end scenario tests that test complete user flows.

## LLM Regression Tests

`llm_regression_test.ts` - Tests LLM model support and response formatting.

### What It Tests

1. **Basic Text Response** - Each model can return a simple text response
2. **Tool Calling** - Each model can call tools (getCurrentTime)
3. **Response Format** - No metadata JSON leaking into responses
4. **Multi-turn Conversations** - Context maintained across turns
5. **Performance Baseline** - Response times within expected bounds

### Models Tested

| Model            | Provider  | API Path                      |
| ---------------- | --------- | ----------------------------- |
| GPT-5            | OpenAI    | Responses API                 |
| GPT-4.1          | OpenAI    | Chat Completions              |
| Claude Sonnet 4  | Anthropic | Chat Completions (via Stripe) |
| Claude 3.5 Haiku | Anthropic | Chat Completions (via Stripe) |
| Gemini 2.5 Pro   | Google    | Chat Completions (via Stripe) |
| Gemini 2.5 Flash | Google    | Chat Completions (via Stripe) |

### Running Tests

```bash
# Run all LLM regression tests
deno test src/__tests__/scenarios/llm_regression_test.ts --allow-all

# Run tests for a specific model
deno test src/__tests__/scenarios/llm_regression_test.ts --allow-all --filter "Claude Sonnet 4"

# Run quick smoke test only
deno test src/__tests__/scenarios/llm_regression_test.ts --allow-all --filter "Quick Smoke Test"

# Run with verbose output
deno test src/__tests__/scenarios/llm_regression_test.ts --allow-all -- --verbose
```

### Requirements

- `STRIPE_SANDBOX_KEY` or `STRIPE_CHIPP_KEY` environment variable
- Database connection (local or test environment)
- Tests make REAL API calls - incurs minimal costs

### CI Integration

Add to GitHub Actions workflow:

```yaml
- name: LLM Regression Tests
  run: deno test src/__tests__/scenarios/llm_regression_test.ts --allow-all
  env:
    STRIPE_SANDBOX_KEY: ${{ secrets.STRIPE_SANDBOX_KEY }}
    DATABASE_URL: ${{ secrets.TEST_DATABASE_URL }}
```

### Adding New Models

1. Add model config to `MODELS_TO_TEST` array:

   ```typescript
   {
     id: "model-id-from-frontend",
     name: "Display Name",
     provider: "openai" | "anthropic" | "google",
     usesResponsesApi: boolean,
     timeout: 30000,
   }
   ```

2. Ensure model is mapped in `stripe-model-mapping.ts`

3. Run tests to verify:
   ```bash
   deno test src/__tests__/scenarios/llm_regression_test.ts --allow-all --filter "New Model Name"
   ```

### Debugging Failures

If a model fails:

1. Check server logs: `tail -100 /tmp/chipp-deno-dev.log`
2. Verify model mapping in `stripe-model-mapping.ts`
3. Check Stripe API key permissions
4. Run single model test with verbose output
