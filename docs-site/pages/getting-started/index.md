---
title: Quick Start
layout: layouts/doc.njk
order: 1
---

Get started with Chipp in under 5 minutes.

## Prerequisites

Before you begin, make sure you have:

- A Chipp account (sign up at [app.chipp.ai](https://app.chipp.ai))
- An API key from your dashboard

## Create Your First App

1. Log in to the [Chipp dashboard](https://app.chipp.ai)
2. Click "Create App"
3. Give your app a name and description
4. Configure your AI settings

## Make Your First API Call

Once you have an app, you can start making API calls:

```bash
curl -X POST https://api.chipp.ai/v1/chat \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "appId": "your-app-id",
    "message": "Hello, Chipp!"
  }'
```

## Next Steps

- [Configure your AI model](/getting-started/installation/)
- [Add knowledge sources](/api/knowledge/)
- [Integrate with your app](/api/chat/)
