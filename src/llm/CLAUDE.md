# LLM Integration Layer

Unified interface for OpenAI, Anthropic, and Google models routed through Stripe Token Billing.

## Architecture

```
createAdapterWithBilling(model, billingContext)
       │
       ▼
StripeTokenBillingProvider  ──► Stripe proxy (https://llm.stripe.com)
       │                              │
       ▼                              ▼
Normalization Layer              Provider APIs
(encoders/decoders)              (billed to customer)
```

## Critical Rules

1. **Always use `createAdapterWithBilling()`** - Direct provider calls bypass billing
2. **Every org needs `stripeCustomerId`** - Required for billing attribution
3. **Tool call arguments are objects, not strings** - Unified format parses JSON on decode
4. **Google correlates tool results by name, not ID** - History normalizer handles this

## Key Files

| File | Purpose |
|------|---------|
| `adapter.ts` | Factory functions, provider detection |
| `providers/stripe-token-billing.ts` | Main provider, routes through Stripe |
| `providers/stripe-model-mapping.ts` | Model ID mapping, capability flags |
| `normalization/types.ts` | Unified message format |
| `normalization/history-normalizer.ts` | Cross-provider tool call conversion |
| `normalization/encoders/` | Unified → provider format |
| `normalization/decoders/` | Provider → unified format |

## Provider Quirks

- **Responses API**: o1-pro, o3-pro, gpt-5 use `/responses` endpoint (not chat completions)
- **BYOK**: Only OpenAI supports Bring Your Own Key via Stripe
- **Gemini bypass**: Video/audio content routes directly to Google (Stripe has 1MB limit)
- **Parameter stripping**: GPT-5 and o-series don't support temperature/top_p

## Error Handling

All LLM errors use the unified logger with model/provider context:
```typescript
import { log } from "@/lib/logger.ts";

log.error("Provider error", {
  source: "llm",
  feature: "provider-name",
  model, customerId,
}, error);
```

## Billing Flow

1. `BillingContext` contains `stripeCustomerId` and sandbox flag
2. Request includes `X-Stripe-Customer-ID` header
3. `stream_options.include_usage = true` required for billing attribution
4. Usage returned in final `done` chunk
