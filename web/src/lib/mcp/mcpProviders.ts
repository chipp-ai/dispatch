/**
 * Standalone MCP provider registry for chipp-deno.
 * Replicates all known providers from shared/utils-server mcpProviders.ts
 * plus the hubspot-whatsapp provider.
 */

export interface McpProviderTool {
  name: string;
  description: string;
}

export interface UrlParam {
  key: string;
  label: string;
  placeholder: string;
  description?: string;
}

export interface McpProvider {
  key: string;
  name: string;
  serverUrl: string;
  transport: "http" | "sse";
  defaultAuthType: "" | "BEARER" | "API_KEY" | "BASIC" | "CUSTOM_HEADER";
  category?: string;
  maintainer?: string;
  iconUrl?: string;
  homepageUrl?: string;
  oauth?: boolean;
  appLevelOauth?: boolean;
  oauthConfig?: {
    authorizeUrl?: string;
    tokenUrl?: string;
    clientIdEnv?: string;
    clientSecretEnv?: string;
    dynamicRegistration?: boolean;
    registrationUrl?: string;
    tokenStyle: "json_basic" | "form_basic";
    additionalAuthorizeParams?: Record<string, string>;
  };
  description?: string;
  tools?: McpProviderTool[];
  useCases?: string[];
  urlParams?: UrlParam[];
}

export interface AggregatorOnlyProvider {
  key: string;
  name: string;
  category: string;
  aggregators: string[];
  description: string;
  iconUrl: string;
}

export const KNOWN_MCP_PROVIDERS: McpProvider[] = [
  // SEO / Marketing
  {
    key: "ahrefs",
    name: "Ahrefs",
    serverUrl: "https://api.ahrefs.com/mcp/mcp",
    transport: "http",
    defaultAuthType: "BEARER",
    category: "SEO",
    maintainer: "Ahrefs",
    iconUrl: "/assets/icons/mcp-providers/ahrefs.png",
  },

  // Productivity / Collaboration
  {
    key: "fireflies",
    name: "Fireflies",
    serverUrl: "https://api.fireflies.ai/mcp",
    transport: "http",
    defaultAuthType: "BEARER",
    category: "Productivity",
    maintainer: "Fireflies",
    iconUrl: "/assets/icons/mcp-providers/fireflies.png",
  },
  {
    key: "notion",
    name: "Notion",
    serverUrl: "https://mcp.notion.com/mcp",
    transport: "http",
    defaultAuthType: "BEARER",
    category: "Productivity",
    maintainer: "Notion",
    iconUrl: "/assets/icons/mcp-providers/notion.png",
    oauth: true,
    oauthConfig: {
      authorizeUrl: "https://mcp.notion.com/authorize",
      tokenUrl: "https://mcp.notion.com/token",
      clientIdEnv: "NOTION_MCP_CLIENT_ID",
      clientSecretEnv: "NOTION_MCP_CLIENT_SECRET",
      tokenStyle: "json_basic",
    },
  },
  {
    key: "asana",
    name: "Asana",
    serverUrl: "https://mcp.asana.com/sse",
    transport: "sse",
    defaultAuthType: "BEARER",
    category: "Productivity",
    maintainer: "Asana",
    iconUrl: "/assets/icons/mcp-providers/asana.png",
    homepageUrl: "https://asana.com",
    appLevelOauth: true,
    oauthConfig: {
      authorizeUrl: "https://mcp.asana.com/authorize",
      tokenUrl: "https://mcp.asana.com/token",
      dynamicRegistration: true,
      registrationUrl: "https://mcp.asana.com/register",
      tokenStyle: "form_basic",
    },
    description:
      "Connect to Asana to manage tasks, projects, and team workflows. Create tasks, update project status, search workspaces, and automate project management directly from your AI assistant.",
    tools: [
      {
        name: "search_tasks",
        description: "Find tasks by name, assignee, project, or custom fields",
      },
      {
        name: "create_task",
        description:
          "Create new tasks with descriptions, due dates, and assignees",
      },
      {
        name: "update_task",
        description: "Modify task details, status, and assignments",
      },
      {
        name: "get_projects",
        description: "List projects in a workspace or team",
      },
      {
        name: "get_workspaces",
        description: "List available Asana workspaces",
      },
    ],
    useCases: [
      "Create and assign tasks from conversation context",
      "Check project status and upcoming deadlines",
      "Update task progress and completion status",
      "Search for tasks across projects and workspaces",
    ],
  },
  {
    key: "atlassian",
    name: "Atlassian",
    serverUrl: "https://mcp.atlassian.com/mcp",
    transport: "http",
    defaultAuthType: "BEARER",
    category: "Productivity",
    maintainer: "Atlassian",
    iconUrl: "/assets/icons/mcp-providers/atlassian.png",
    oauth: true,
    oauthConfig: {
      authorizeUrl: "https://auth.atlassian.com/authorize",
      tokenUrl: "https://auth.atlassian.com/oauth/token",
      clientIdEnv: "ATLASSIAN_MCP_CLIENT_ID",
      clientSecretEnv: "ATLASSIAN_MCP_CLIENT_SECRET",
      tokenStyle: "json_basic",
      additionalAuthorizeParams: {
        audience: "api.atlassian.com",
        prompt: "consent",
      },
    },
  },
  {
    key: "linear",
    name: "Linear",
    serverUrl: "https://mcp.linear.app/mcp",
    transport: "http",
    defaultAuthType: "BEARER",
    category: "Productivity",
    maintainer: "Linear",
    iconUrl: "/assets/icons/mcp-providers/linear.png",
  },
  {
    key: "sentry",
    name: "Sentry",
    serverUrl: "https://mcp.sentry.dev/mcp",
    transport: "http",
    defaultAuthType: "BEARER",
    category: "Monitoring",
    maintainer: "Sentry",
    iconUrl: "/assets/icons/mcp-providers/sentry.png",
    homepageUrl: "https://sentry.io",
    description:
      "Access and analyze errors from your Sentry organization. Search issues, get error details, analyze stack traces, and understand production errors with AI-powered insights. Requires an Auth Token from Settings > Account > API > Auth Tokens.",
    tools: [
      {
        name: "whoami",
        description: "Get authenticated user's name and email",
      },
      {
        name: "find_organizations",
        description: "List organizations you have access to",
      },
      {
        name: "find_projects",
        description: "Find projects in an organization",
      },
      {
        name: "search_issues",
        description: "Search for grouped issues/problems with filters",
      },
      {
        name: "get_issue_details",
        description: "Get detailed information about a specific issue",
      },
      {
        name: "search_events",
        description: "Search for individual error events with timestamps",
      },
      {
        name: "analyze_issue_with_seer",
        description: "AI-powered root cause analysis with code fixes",
      },
      {
        name: "get_trace_details",
        description: "Get trace overview and performance data",
      },
    ],
    useCases: [
      "Debug production errors with AI-powered root cause analysis",
      "Search and analyze error patterns across projects",
      "Get detailed stack traces and error context",
      "Help users troubleshoot errors from your Sentry organization",
    ],
  },

  // Enterprise Storage / Content
  {
    key: "egnyte",
    name: "Egnyte",
    serverUrl: "https://mcp-server.egnyte.com/sse",
    transport: "sse",
    defaultAuthType: "BEARER",
    category: "Enterprise Storage",
    maintainer: "Egnyte",
    iconUrl: "/assets/icons/mcp-providers/egnyte.png",
    oauth: true,
    oauthConfig: {
      authorizeUrl: "https://egnyte.com/oauth/authorize",
      tokenUrl: "https://egnyte.com/oauth/token",
      clientIdEnv: "EGNYTE_MCP_CLIENT_ID",
      clientSecretEnv: "EGNYTE_MCP_CLIENT_SECRET",
      tokenStyle: "json_basic",
    },
  },
  {
    key: "webflow",
    name: "Webflow",
    serverUrl: "https://mcp.webflow.com/mcp",
    transport: "http",
    defaultAuthType: "BEARER",
    category: "CMS",
    maintainer: "Webflow",
    iconUrl: "/assets/icons/mcp-providers/webflow.png",
    oauth: true,
    oauthConfig: {
      authorizeUrl: "https://webflow.com/oauth/authorize",
      tokenUrl: "https://api.webflow.com/oauth/access_token",
      clientIdEnv: "WEBFLOW_MCP_CLIENT_ID",
      clientSecretEnv: "WEBFLOW_MCP_CLIENT_SECRET",
      tokenStyle: "json_basic",
    },
  },

  // CRM / Marketing
  {
    key: "hubspot",
    name: "HubSpot",
    serverUrl: "https://mcp.hubspot.com/",
    transport: "http",
    defaultAuthType: "BEARER",
    category: "CRM",
    maintainer: "HubSpot",
    iconUrl: "/assets/icons/mcp-providers/hubspot.png",
    homepageUrl: "https://www.hubspot.com",
    appLevelOauth: true,
    oauthConfig: {
      authorizeUrl: "https://mcp.hubspot.com/oauth/authorize/user",
      tokenUrl: "https://mcp.hubspot.com/oauth/v1/token",
      clientIdEnv: "HUBSPOT_MCP_CLIENT_ID",
      clientSecretEnv: "HUBSPOT_MCP_CLIENT_SECRET",
      tokenStyle: "json_basic",
      additionalAuthorizeParams: {},
    },
    description:
      "Connect to your HubSpot CRM to manage contacts, deals, companies, and customer data. Access sales pipelines, marketing automation, and customer service tools directly from your AI assistant.",
    tools: [
      {
        name: "search_contacts",
        description: "Find contacts by name, email, or custom properties",
      },
      {
        name: "get_contact",
        description:
          "Retrieve detailed contact information and activity history",
      },
      {
        name: "create_contact",
        description:
          "Add new contacts to your CRM with properties and associations",
      },
      {
        name: "update_contact",
        description: "Modify existing contact information and properties",
      },
      {
        name: "search_companies",
        description: "Find companies in your CRM database",
      },
      {
        name: "get_company",
        description: "Get company details, associated contacts, and deals",
      },
      {
        name: "search_deals",
        description: "Query deals by stage, amount, or custom criteria",
      },
      {
        name: "create_deal",
        description:
          "Create new sales opportunities and associate them with contacts",
      },
      {
        name: "update_deal",
        description: "Move deals through pipeline stages and update properties",
      },
      {
        name: "get_pipeline",
        description: "View sales pipeline stages and configurations",
      },
    ],
    useCases: [
      "Manage customer relationships and track interactions",
      "Update CRM records during conversations with prospects",
      "Query customer data to personalize support responses",
      "Create deals and track sales opportunities",
    ],
  },
  {
    key: "hubspot-whatsapp",
    name: "HubSpot WhatsApp Leads",
    serverUrl: "https://mcp.chipp.ai/clients/hubspot-whatsapp",
    transport: "http",
    defaultAuthType: "BEARER",
    category: "CRM",
    maintainer: "Chipp",
    iconUrl: "/assets/icons/mcp-providers/hubspot.png",
    description:
      "Deposit WhatsApp leads directly into HubSpot CRM. Search contacts, create/update records, and log conversation notes in one call.",
    tools: [
      {
        name: "search_contacts",
        description: "Find contacts by phone, email, or name",
      },
      {
        name: "create_contact",
        description: "Create new HubSpot contact with lead status",
      },
      {
        name: "update_contact",
        description: "Update existing contact properties",
      },
      {
        name: "get_contact_details",
        description: "Get full contact info with associations",
      },
      {
        name: "create_contact_note",
        description: "Add note to contact timeline",
      },
      {
        name: "get_contact_notes",
        description: "List notes for a contact",
      },
      {
        name: "get_note_details",
        description: "Get full details of a specific note",
      },
      {
        name: "update_note",
        description: "Update an existing note",
      },
      {
        name: "deposit_whatsapp_lead",
        description:
          "High-level: search, create/update, and add note in one call",
      },
    ],
    useCases: [
      "Capture WhatsApp leads into HubSpot CRM automatically",
      "Sync WhatsApp conversations with CRM contact records",
      "Log AI assistant interactions as HubSpot notes",
    ],
  },
  {
    key: "close",
    name: "Close",
    serverUrl: "https://mcp.close.com/mcp",
    transport: "http",
    defaultAuthType: "API_KEY",
    category: "CRM",
    maintainer: "Close",
    iconUrl: "/assets/icons/mcp-providers/close.png",
    homepageUrl: "https://www.close.com",
    description:
      "Streamline sales workflows with Close CRM integration. Manage leads, track communications, log calls and emails, and monitor deal progress. Built for inside sales teams that prioritize speed and efficiency.",
    tools: [
      {
        name: "search_leads",
        description: "Find leads by name, status, or custom fields",
      },
      {
        name: "get_lead",
        description:
          "Retrieve complete lead details with contact information and activities",
      },
      {
        name: "create_lead",
        description: "Add new leads with contacts and custom properties",
      },
      {
        name: "update_lead",
        description: "Modify lead information and move through sales stages",
      },
      {
        name: "create_activity",
        description: "Log calls, emails, and notes for lead tracking",
      },
      {
        name: "get_opportunities",
        description: "View sales opportunities and pipeline status",
      },
      {
        name: "send_email",
        description: "Send emails to leads directly from your workflow",
      },
      {
        name: "create_task",
        description: "Set follow-up reminders and sales tasks",
      },
    ],
    useCases: [
      "Log sales calls and emails automatically from conversations",
      "Update lead status and track progress through sales pipeline",
      "Query lead information during customer interactions",
      "Create tasks and follow-ups based on conversation insights",
    ],
  },
  {
    key: "gohighlevel",
    name: "GoHighLevel",
    serverUrl: "https://services.leadconnectorhq.com/mcp/",
    transport: "http",
    defaultAuthType: "BEARER",
    category: "CRM",
    maintainer: "GoHighLevel",
    iconUrl: "/assets/icons/mcp-providers/gohighlevel.png",
    homepageUrl: "https://www.gohighlevel.com",
    description:
      "Connect to GoHighLevel's all-in-one marketing and CRM platform. Manage contacts, calendars, opportunities, conversations, payments, and workflows. Access 21 powerful tools for agency management, client communication, and business automation. Requires a Private Integration Token from Settings > Private Integrations in your GoHighLevel location.",
    tools: [
      {
        name: "manage_contacts",
        description: "Create, update, and search contacts in your CRM",
      },
      {
        name: "manage_calendars",
        description: "Schedule appointments and manage calendar availability",
      },
      {
        name: "manage_opportunities",
        description: "Track sales pipeline and manage opportunity stages",
      },
      {
        name: "manage_conversations",
        description: "Access and respond to conversations across channels",
      },
      {
        name: "process_payments",
        description: "Handle payment processing and subscription management",
      },
      {
        name: "trigger_workflows",
        description: "Execute automated workflows and campaigns",
      },
    ],
    useCases: [
      "Automate client onboarding and communication workflows",
      "Manage multi-channel conversations from AI assistants",
      "Sync CRM data and track sales pipeline progress",
      "Schedule appointments and manage calendar bookings",
      "Process payments and manage subscription billing",
    ],
  },
  {
    key: "intercom",
    name: "Intercom",
    serverUrl: "https://api.intercom.io/mcp",
    transport: "http",
    defaultAuthType: "BEARER",
    category: "Customer Support",
    maintainer: "Intercom",
    iconUrl: "/assets/icons/mcp-providers/intercom.png",
    oauth: true,
    oauthConfig: {
      authorizeUrl: "https://app.intercom.com/oauth",
      tokenUrl: "https://api.intercom.io/auth/eagle/token",
      clientIdEnv: "INTERCOM_MCP_CLIENT_ID",
      clientSecretEnv: "INTERCOM_MCP_CLIENT_SECRET",
      tokenStyle: "json_basic",
    },
  },

  // Automation / Integrators
  {
    key: "zapier",
    name: "Zapier",
    serverUrl: "https://mcp.zapier.com/api/mcp/mcp",
    transport: "http",
    defaultAuthType: "",
    category: "Automation",
    maintainer: "Zapier",
    iconUrl: "/assets/icons/mcp-providers/zapier.png",
    description:
      "Connect to 8,000+ apps and services through Zapier's automation platform. Trigger workflows, send data, and integrate with popular tools without writing code.",
    tools: [
      {
        name: "list_actions",
        description: "Browse available Zapier actions and integrations",
      },
      {
        name: "trigger_action",
        description: "Execute a Zapier action or workflow",
      },
      {
        name: "search_apps",
        description: "Find apps and services available in Zapier",
      },
      {
        name: "get_action_config",
        description: "Get configuration details for an action",
      },
    ],
    useCases: [
      "Connect AI assistants to thousands of apps",
      "Automate workflows across multiple services",
      "Send data to CRM, email, and productivity tools",
      "Integrate with enterprise applications",
    ],
  },
  {
    key: "pipedream",
    name: "Pipedream",
    serverUrl: "https://mcp.pipedream.com/mcp",
    transport: "http",
    defaultAuthType: "API_KEY",
    category: "Automation",
    maintainer: "Pipedream",
    iconUrl: "/assets/icons/mcp-providers/pipedream.png",
    homepageUrl: "https://pipedream.com",
    description:
      "Build and trigger automation workflows across 2,000+ apps. Execute pre-built workflows, send data to connected services, and integrate with REST APIs. Low-code automation platform for developers.",
    tools: [
      {
        name: "list_workflows",
        description: "Browse your automation workflows and pipelines",
      },
      {
        name: "trigger_workflow",
        description: "Execute workflows with custom data payloads",
      },
      {
        name: "get_workflow_status",
        description: "Check workflow execution status and logs",
      },
      {
        name: "search_apps",
        description: "Find available app integrations and actions",
      },
      {
        name: "get_workflow_runs",
        description: "Retrieve workflow execution history and results",
      },
    ],
    useCases: [
      "Trigger workflows from AI conversations",
      "Send data to external APIs and services",
      "Automate multi-step processes across apps",
      "Build event-driven integrations",
    ],
  },
  {
    key: "composio",
    name: "Composio",
    serverUrl: "https://mcp.composio.dev/mcp",
    transport: "http",
    defaultAuthType: "BEARER",
    category: "Automation",
    maintainer: "Composio",
    iconUrl: "/assets/icons/mcp-providers/composio.png",
    oauth: true,
    oauthConfig: {
      authorizeUrl: "https://composio.dev/oauth/authorize",
      tokenUrl: "https://composio.dev/oauth/token",
      clientIdEnv: "COMPOSIO_MCP_CLIENT_ID",
      clientSecretEnv: "COMPOSIO_MCP_CLIENT_SECRET",
      tokenStyle: "json_basic",
    },
  },

  // RAG-as-a-service / Data
  {
    key: "needle",
    name: "Needle",
    serverUrl: "https://mcp.needle-ai.com/mcp",
    transport: "http",
    defaultAuthType: "API_KEY",
    category: "RAG",
    maintainer: "Needle",
    iconUrl: "/assets/icons/mcp-providers/needle.png",
    homepageUrl: "https://needle-ai.com",
    description:
      "Semantic search and RAG-as-a-service for your documents. Upload files, create collections, and query your data with natural language. Built-in chunking, embedding, and vector search.",
    tools: [
      {
        name: "create_collection",
        description: "Create document collections for organizing knowledge",
      },
      {
        name: "upload_document",
        description: "Add documents to collections for semantic search",
      },
      {
        name: "search",
        description:
          "Query documents with natural language and get relevant results",
      },
      {
        name: "get_document",
        description: "Retrieve specific documents by ID",
      },
      {
        name: "delete_document",
        description: "Remove documents from collections",
      },
    ],
    useCases: [
      "Build RAG applications without infrastructure setup",
      "Query your documents with semantic search",
      "Create knowledge bases for AI assistants",
      "Implement document Q&A features",
    ],
  },
  {
    key: "dappier",
    name: "Dappier",
    serverUrl: "https://mcp.dappier.com/mcp",
    transport: "http",
    defaultAuthType: "API_KEY",
    category: "RAG",
    maintainer: "Dappier",
    iconUrl: "/assets/icons/mcp-providers/dappier.png",
    homepageUrl: "https://dappier.com",
    description:
      "Access real-time data feeds and premium content from trusted sources. Query news, research, and domain-specific information with built-in fact-checking and source attribution.",
    tools: [
      {
        name: "search_content",
        description: "Search across premium data sources and news feeds",
      },
      {
        name: "get_article",
        description: "Retrieve full articles with metadata and citations",
      },
      {
        name: "list_sources",
        description: "Browse available content sources and publishers",
      },
      {
        name: "get_realtime_data",
        description: "Access real-time information from verified sources",
      },
    ],
    useCases: [
      "Access up-to-date news and information",
      "Query trusted data sources for factual content",
      "Build AI assistants with source attribution",
      "Integrate premium content into workflows",
    ],
  },
  {
    key: "audioscrape",
    name: "Audioscrape",
    serverUrl: "https://mcp.audioscrape.com",
    transport: "http",
    defaultAuthType: "",
    category: "RAG",
    maintainer: "Audioscrape",
    iconUrl: "/assets/icons/mcp-providers/audioscrape.png",
    description:
      "Extract and transcribe audio content from podcasts and audio files. Convert spoken content into searchable text for analysis and RAG applications.",
    tools: [
      {
        name: "transcribe_audio",
        description: "Convert audio files to text transcripts",
      },
      {
        name: "extract_podcast",
        description: "Scrape and transcribe podcast episodes",
      },
      {
        name: "search_transcripts",
        description: "Search within transcribed audio content",
      },
      {
        name: "get_episode_info",
        description: "Retrieve podcast episode metadata",
      },
    ],
    useCases: [
      "Transcribe podcast episodes for searchability",
      "Extract insights from audio content",
      "Build RAG systems from audio sources",
      "Make audio content accessible to AI assistants",
    ],
  },
  {
    key: "llmtext",
    name: "LLM Text",
    serverUrl: "https://mcp.llmtxt.dev/sse",
    transport: "sse",
    defaultAuthType: "",
    category: "Data Analysis",
    maintainer: "LLM Text",
    iconUrl: "/assets/icons/mcp-providers/llmtext.png",
    description:
      "Access structured documentation through llms.txt files - a token-efficient format for website indexes. Fetch docs from any site that publishes llms.txt or llms-full.txt files.",
    tools: [
      {
        name: "fetch_llmstxt",
        description: "Retrieve llms.txt index files from websites",
      },
      {
        name: "fetch_doc",
        description: "Get detailed documentation from llms.txt links",
      },
      {
        name: "search_content",
        description: "Search within fetched documentation",
      },
      {
        name: "list_sources",
        description: "Browse available llms.txt sources",
      },
    ],
    useCases: [
      "Access documentation from any site with llms.txt",
      "Fetch context-efficient content for AI assistants",
      "Keep documentation up-to-date without embeddings",
      "Integrate website docs into AI workflows",
    ],
  },

  // Web data / scraping
  {
    key: "apify",
    name: "Apify",
    serverUrl: "https://mcp.apify.com",
    transport: "http",
    defaultAuthType: "API_KEY",
    category: "Web Data",
    maintainer: "Apify",
    iconUrl: "/assets/icons/mcp-providers/apify.png",
    homepageUrl: "https://apify.com",
    description:
      "Automate web scraping and data extraction at scale. Run pre-built scrapers for popular websites or build custom crawlers. Extract data from dynamic websites, handle JavaScript rendering, and manage proxies automatically.",
    tools: [
      {
        name: "run_actor",
        description:
          "Execute Apify actors (web scrapers) with custom configurations",
      },
      {
        name: "get_actor_run",
        description: "Check status and retrieve results from actor runs",
      },
      {
        name: "list_actors",
        description: "Browse available pre-built scrapers and tools",
      },
      {
        name: "get_dataset",
        description: "Download extracted data in JSON, CSV, or Excel format",
      },
      {
        name: "create_webhook",
        description: "Set up notifications for scraping job completion",
      },
      {
        name: "manage_proxies",
        description: "Configure proxy pools for anonymous scraping",
      },
    ],
    useCases: [
      "Scrape e-commerce sites for product data and pricing",
      "Extract leads from social media and business directories",
      "Monitor competitors' websites for changes",
      "Build datasets from multiple web sources",
    ],
  },
  {
    key: "firecrawl",
    name: "Firecrawl",
    serverUrl: "https://mcp.firecrawl.dev/sse",
    transport: "sse",
    defaultAuthType: "API_KEY",
    category: "Web Data",
    maintainer: "Firecrawl",
    iconUrl: "/assets/icons/mcp-providers/firecrawl.png",
    homepageUrl: "https://firecrawl.dev",
    description:
      "Turn any website into clean, LLM-ready markdown or structured data. Crawl entire sites, extract specific content, and get data in formats optimized for AI processing. Handles JavaScript, authentication, and dynamic content automatically.",
    tools: [
      {
        name: "scrape_url",
        description: "Convert any webpage to clean markdown or structured data",
      },
      {
        name: "crawl_site",
        description: "Recursively crawl entire websites and subpages",
      },
      {
        name: "map_site",
        description: "Get a sitemap with all discoverable URLs",
      },
      {
        name: "extract_data",
        description: "Extract structured data using custom schemas",
      },
      { name: "screenshot", description: "Capture webpage screenshots" },
    ],
    useCases: [
      "Prepare web content for RAG and AI applications",
      "Build knowledge bases from documentation sites",
      "Extract structured data from product pages",
      "Monitor website content changes",
    ],
  },

  // Payments / Commerce
  {
    key: "stripe",
    name: "Stripe",
    serverUrl: "https://mcp.stripe.com/mcp",
    transport: "http",
    defaultAuthType: "BEARER",
    category: "Payments",
    maintainer: "Stripe",
    iconUrl: "/assets/icons/mcp-providers/stripe.png",
    oauth: true,
    oauthConfig: {
      authorizeUrl: "https://connect.stripe.com/oauth/authorize",
      tokenUrl: "https://connect.stripe.com/oauth/token",
      clientIdEnv: "STRIPE_MCP_CLIENT_ID",
      clientSecretEnv: "STRIPE_MCP_CLIENT_SECRET",
      tokenStyle: "form_basic",
    },
  },
  {
    key: "shopify",
    name: "Shopify",
    serverUrl: "https://{store-domain}/api/mcp",
    transport: "http",
    defaultAuthType: "",
    category: "E-Commerce",
    maintainer: "Shopify",
    iconUrl: "/assets/icons/mcp-providers/shopify.png",
    homepageUrl: "https://shopify.dev/docs/agents",
    description:
      "Access Shopify's storefront catalog for customer-facing shopping experiences. Search products, manage shopping carts, and access store policies through the Storefront MCP server. Perfect for building AI shopping assistants.",
    urlParams: [
      {
        key: "store-domain",
        label: "Shopify Store Domain",
        placeholder: "your-store.myshopify.com",
        description:
          "Enter your Shopify store domain (e.g., your-store.myshopify.com)",
      },
    ],
    tools: [
      {
        name: "search_shop_catalog",
        description:
          "Search for products using natural language queries and filters",
      },
      {
        name: "get_product_details",
        description: "Look up a product by ID with variant options",
      },
      {
        name: "get_cart",
        description:
          "Get cart details including items, shipping options, and checkout URL",
      },
      {
        name: "update_cart",
        description:
          "Add/remove items, update quantities, apply discounts, and manage cart",
      },
      {
        name: "search_shop_policies_and_faqs",
        description:
          "Get store policies, FAQs, hours, contact info, and other store details",
      },
    ],
    useCases: [
      "Build AI shopping assistants for product discovery",
      "Help customers find products with natural language search",
      "Manage shopping carts and apply discount codes",
      "Answer questions about store policies and shipping",
    ],
  },
  {
    key: "mercadolibre",
    name: "Mercado Libre",
    serverUrl: "https://mcp.mercadolibre.com/mcp",
    transport: "http",
    defaultAuthType: "API_KEY",
    category: "E-Commerce",
    maintainer: "Mercado Libre",
    iconUrl: "/assets/icons/mcp-providers/mercadolibre.png",
    homepageUrl: "https://www.mercadolibre.com",
    description:
      "Integrate with Latin America's largest e-commerce platform. Manage listings, orders, inventory, and customer interactions. Access product catalogs, pricing data, and shipping information across 18 countries.",
    tools: [
      {
        name: "create_listing",
        description:
          "Publish new products with images, descriptions, and pricing",
      },
      {
        name: "update_inventory",
        description: "Manage stock levels and product availability",
      },
      {
        name: "get_orders",
        description: "Retrieve order details and customer information",
      },
      {
        name: "search_products",
        description: "Search marketplace for product listings and pricing",
      },
      {
        name: "manage_questions",
        description: "Respond to buyer questions on listings",
      },
      {
        name: "get_shipping_options",
        description: "Calculate shipping costs and delivery times",
      },
    ],
    useCases: [
      "Automate e-commerce operations in Latin America",
      "Sync inventory across multiple marketplaces",
      "Monitor competitor pricing and market trends",
      "Manage customer support and inquiries",
    ],
  },
  {
    key: "mercadopago",
    name: "Mercado Pago",
    serverUrl: "https://mcp.mercadopago.com/mcp",
    transport: "http",
    defaultAuthType: "API_KEY",
    category: "Payments",
    maintainer: "Mercado Pago",
    iconUrl: "/assets/icons/mcp-providers/mercadopago.png",
    homepageUrl: "https://www.mercadopago.com",
    description:
      "Process payments across Latin America with support for local payment methods, installments, and currencies. Accept credit cards, debit cards, bank transfers, and cash payments. Handle refunds, chargebacks, and subscription billing.",
    tools: [
      {
        name: "create_payment",
        description: "Process credit card and alternative payment methods",
      },
      {
        name: "get_payment",
        description: "Retrieve payment status and transaction details",
      },
      {
        name: "refund_payment",
        description: "Issue full or partial refunds to customers",
      },
      {
        name: "create_subscription",
        description: "Set up recurring billing and subscription plans",
      },
      {
        name: "get_customer",
        description: "Access customer payment history and saved cards",
      },
      {
        name: "get_payment_methods",
        description: "List available payment options by country",
      },
    ],
    useCases: [
      "Accept payments in multiple Latin American currencies",
      "Offer local payment methods to increase conversion",
      "Manage subscription billing and recurring payments",
      "Handle payment disputes and chargebacks",
    ],
  },
  {
    key: "dodopayments",
    name: "Dodo Payments",
    serverUrl: "https://mcp.dodopayments.com/sse",
    transport: "sse",
    defaultAuthType: "API_KEY",
    category: "Payments",
    maintainer: "Dodo Payments",
    iconUrl: "/assets/icons/mcp-providers/dodopayments.png",
    homepageUrl: "https://dodopayments.com",
    description:
      "Accept one-time and subscription payments with a developer-first payment API. Support for credit cards, ACH, and alternative payment methods. Built for SaaS companies with usage-based billing, metered pricing, and flexible subscription models.",
    tools: [
      {
        name: "create_payment",
        description: "Process one-time payments with credit cards or ACH",
      },
      {
        name: "create_subscription",
        description: "Set up recurring billing with flexible intervals",
      },
      {
        name: "record_usage",
        description: "Track metered usage for usage-based pricing",
      },
      {
        name: "get_customer",
        description:
          "Retrieve customer billing information and payment history",
      },
      {
        name: "manage_plans",
        description: "Create and update pricing plans and tiers",
      },
      {
        name: "handle_webhooks",
        description: "Process payment events and subscription updates",
      },
    ],
    useCases: [
      "Implement usage-based pricing for SaaS products",
      "Manage subscription billing with multiple tiers",
      "Track and bill for metered API usage",
      "Automate payment collection and renewals",
    ],
  },

  // Communications
  {
    key: "telnyx",
    name: "Telnyx",
    serverUrl: "https://api.telnyx.com/v2/mcp",
    transport: "http",
    defaultAuthType: "API_KEY",
    category: "Communication",
    maintainer: "Telnyx",
    iconUrl: "/assets/icons/mcp-providers/telnyx.png",
    homepageUrl: "https://telnyx.com",
    description:
      "Send SMS, make voice calls, and manage phone numbers programmatically. Global connectivity with carrier-grade reliability. Support for messaging, voice, video, and SIP trunking with real-time delivery tracking.",
    tools: [
      {
        name: "send_sms",
        description: "Send SMS messages globally with delivery confirmation",
      },
      {
        name: "make_call",
        description: "Initiate outbound voice calls with custom scripts",
      },
      {
        name: "get_message_status",
        description: "Track SMS delivery and read receipts",
      },
      {
        name: "list_phone_numbers",
        description: "View available and purchased phone numbers",
      },
      {
        name: "buy_phone_number",
        description: "Purchase new phone numbers in any country",
      },
      {
        name: "configure_webhooks",
        description: "Set up event notifications for calls and messages",
      },
    ],
    useCases: [
      "Send transactional SMS notifications to customers",
      "Implement two-factor authentication via SMS",
      "Make automated phone calls for alerts and reminders",
      "Build voice and messaging applications",
    ],
  },

  // Software development
  {
    key: "semgrep",
    name: "Semgrep",
    serverUrl: "https://mcp.semgrep.ai/sse",
    transport: "sse",
    defaultAuthType: "",
    category: "Software Development",
    maintainer: "Semgrep",
    iconUrl: "/assets/icons/mcp-providers/semgrep.png",
    description:
      "Scan code for security vulnerabilities and bugs using 5,000+ built-in rules. Fast, deterministic static analysis that semantically understands multiple languages to find and fix issues.",
    tools: [
      {
        name: "scan_code",
        description:
          "Analyze code for security vulnerabilities and code quality issues",
      },
      {
        name: "get_findings",
        description:
          "Retrieve detailed vulnerability reports with fix suggestions",
      },
      {
        name: "list_rules",
        description: "Browse available security rules and patterns",
      },
      {
        name: "custom_scan",
        description: "Run scans with custom rulesets and configurations",
      },
    ],
    useCases: [
      "Find security vulnerabilities in code before deployment",
      "Enforce code quality standards across your codebase",
      "Detect common bug patterns and anti-patterns",
      "Review AI-generated code for security issues",
    ],
  },
  {
    key: "gitmcp",
    name: "GitMCP",
    serverUrl: "https://gitmcp.io/docs",
    transport: "http",
    defaultAuthType: "",
    category: "Software Development",
    maintainer: "GitMCP",
    iconUrl: "/assets/icons/mcp-providers/gitmcp.png",
    description:
      "Access up-to-date documentation and code from any GitHub project. Transform repositories and GitHub Pages into AI-accessible documentation hubs without hallucination.",
    tools: [
      {
        name: "get_documentation",
        description: "Retrieve documentation from GitHub repositories",
      },
      {
        name: "search_code",
        description: "Search for specific code snippets or functions",
      },
      { name: "get_readme", description: "Access project README and overview" },
      {
        name: "get_file",
        description: "Retrieve specific file contents from repositories",
      },
    ],
    useCases: [
      "Access current documentation for any GitHub project",
      "Search code examples without leaving your workflow",
      "Keep AI assistants updated with latest library docs",
      "Eliminate code hallucinations with real documentation",
    ],
  },
  {
    key: "javadocs",
    name: "Javadocs.dev",
    serverUrl: "https://www.javadocs.dev/mcp",
    transport: "http",
    defaultAuthType: "",
    category: "Software Development",
    maintainer: "Javadocs.dev",
    iconUrl: "/assets/icons/mcp-providers/javadocs.png",
    description:
      "Search and browse Java API documentation for libraries and frameworks. Full-text search across classes, methods, and packages with instant access to JavaDoc reference material.",
    tools: [
      {
        name: "search_javadoc",
        description:
          "Search Java API documentation by class, method, or keyword",
      },
      {
        name: "get_class_doc",
        description:
          "Retrieve detailed documentation for a specific Java class",
      },
      {
        name: "get_method_doc",
        description: "Get method signatures and documentation",
      },
      {
        name: "browse_packages",
        description: "Explore available packages in Java libraries",
      },
    ],
    useCases: [
      "Look up Java API documentation while coding",
      "Find the right method or class for your use case",
      "Understand library interfaces and usage patterns",
      "Reference API documentation without leaving your IDE",
    ],
  },
  {
    key: "openzeppelin-solidity",
    name: "OpenZeppelin Solidity Contracts",
    serverUrl: "https://mcp.openzeppelin.com/contracts/solidity/mcp",
    transport: "http",
    defaultAuthType: "",
    category: "Software Development",
    maintainer: "OpenZeppelin",
    iconUrl: "/assets/icons/mcp-providers/openzeppelin-solidity.png",
    description:
      "Generate secure Solidity smart contracts using battle-tested OpenZeppelin templates. Automatic security rules, imports, and best practices for ERC-20, ERC-721, ERC-1155, and governance contracts.",
    tools: [
      {
        name: "generate_erc20",
        description: "Create ERC-20 token contracts with security features",
      },
      {
        name: "generate_erc721",
        description: "Generate ERC-721 NFT contracts with metadata support",
      },
      {
        name: "generate_erc1155",
        description: "Create multi-token ERC-1155 contracts",
      },
      {
        name: "generate_governor",
        description: "Build governance contracts for DAOs",
      },
      {
        name: "validate_contract",
        description: "Validate contracts against security best practices",
      },
    ],
    useCases: [
      "Create secure token contracts without writing boilerplate",
      "Generate NFT contracts with proper access control",
      "Build DAO governance systems with proven patterns",
      "Ensure smart contracts follow security standards",
    ],
  },
  {
    key: "openzeppelin-cairo",
    name: "OpenZeppelin Cairo Contracts",
    serverUrl: "https://mcp.openzeppelin.com/contracts/cairo/mcp",
    transport: "http",
    defaultAuthType: "",
    category: "Software Development",
    maintainer: "OpenZeppelin",
    iconUrl: "/assets/icons/mcp-providers/openzeppelin-cairo.png",
    description:
      "Generate secure Cairo smart contracts for Starknet using OpenZeppelin templates. Build tokens, multisigs, and governance with proven security patterns.",
    tools: [
      {
        name: "generate_erc20",
        description: "Create Cairo ERC-20 token contracts",
      },
      {
        name: "generate_erc721",
        description: "Generate Cairo ERC-721 NFT contracts",
      },
      {
        name: "generate_multisig",
        description: "Build Cairo multisig wallet contracts",
      },
      {
        name: "generate_governor",
        description: "Create Cairo governance contracts",
      },
    ],
    useCases: [
      "Build Starknet tokens with security guarantees",
      "Create NFT contracts for Cairo-based chains",
      "Deploy multisig wallets with proper access control",
    ],
  },
  {
    key: "openzeppelin-stellar",
    name: "OpenZeppelin Stellar Contracts",
    serverUrl: "https://mcp.openzeppelin.com/contracts/stellar/mcp",
    transport: "http",
    defaultAuthType: "",
    category: "Software Development",
    maintainer: "OpenZeppelin",
    iconUrl: "/assets/icons/mcp-providers/openzeppelin-stellar.png",
    description:
      "Generate secure Stellar smart contracts using OpenZeppelin templates. Create fungible tokens, NFTs, and stablecoins with built-in security.",
    tools: [
      {
        name: "generate_fungible_token",
        description: "Create Stellar fungible token contracts",
      },
      { name: "generate_nft", description: "Generate Stellar NFT contracts" },
      {
        name: "generate_stablecoin",
        description: "Build Stellar stablecoin contracts",
      },
    ],
    useCases: [
      "Deploy fungible tokens on Stellar network",
      "Create NFT contracts for Stellar ecosystem",
      "Build stablecoins with proper collateralization",
    ],
  },
  {
    key: "openzeppelin-stylus",
    name: "OpenZeppelin Stylus Contracts",
    serverUrl: "https://mcp.openzeppelin.com/contracts/stylus/mcp",
    transport: "http",
    defaultAuthType: "",
    category: "Software Development",
    maintainer: "OpenZeppelin",
    iconUrl: "/assets/icons/mcp-providers/openzeppelin-stylus.png",
    description:
      "Generate secure Arbitrum Stylus smart contracts in Rust using OpenZeppelin templates. High-performance contracts with security guarantees.",
    tools: [
      {
        name: "generate_token",
        description: "Create Stylus token contracts in Rust",
      },
      { name: "generate_nft", description: "Generate Stylus NFT contracts" },
      { name: "generate_defi", description: "Build DeFi protocol contracts" },
    ],
    useCases: [
      "Build high-performance contracts for Arbitrum",
      "Create Rust-based smart contracts with security",
      "Deploy gas-efficient DeFi protocols",
    ],
  },

  // AI / Model hubs
  {
    key: "huggingface",
    name: "Hugging Face",
    serverUrl: "https://hf.co/mcp",
    transport: "http",
    defaultAuthType: "",
    category: "AI Platform",
    maintainer: "Hugging Face",
    iconUrl: "/assets/icons/mcp-providers/huggingface.png",
    description:
      "Search and explore machine learning models, datasets, and AI applications. Access the Hugging Face Hub's vast collection of open-source ML resources and run community tools via Gradio apps.",
    tools: [
      {
        name: "search_models",
        description: "Find machine learning models with filters and metadata",
      },
      {
        name: "get_model_details",
        description:
          "Retrieve comprehensive information about a specific model",
      },
      {
        name: "search_datasets",
        description: "Explore datasets for training and evaluation",
      },
      {
        name: "get_dataset_details",
        description: "Get detailed information about a dataset",
      },
      {
        name: "search_spaces",
        description: "Discover Hugging Face Spaces (interactive demos)",
      },
      {
        name: "search_papers",
        description: "Semantic search across ML research papers",
      },
      {
        name: "run_gradio_tool",
        description: "Execute community tools hosted on Spaces",
      },
    ],
    useCases: [
      "Find pre-trained models for your ML tasks",
      "Explore datasets for research and development",
      "Run AI demos and tools from the community",
      "Access ML research papers and documentation",
    ],
  },

  // Service discovery / infra
  {
    key: "openmesh",
    name: "OpenMesh",
    serverUrl: "https://api.openmesh.dev/mcp",
    transport: "http",
    defaultAuthType: "",
    category: "Service Discovery",
    maintainer: "OpenMesh",
    iconUrl: "/assets/icons/mcp-providers/openmesh.png",
    description:
      "Universal MCP server discovery platform that lets AI agents find and use any MCP server or API. Dynamic service discovery with capability-based search and automatic tool enumeration.",
    tools: [
      {
        name: "discover_servers",
        description: "Find MCP servers by capability or category",
      },
      {
        name: "search_tools",
        description: "Search for specific tools across all registered servers",
      },
      {
        name: "get_server_info",
        description: "Retrieve detailed information about an MCP server",
      },
      {
        name: "proxy_tool_call",
        description: "Call tools from discovered servers through unified proxy",
      },
    ],
    useCases: [
      "Dynamically discover MCP servers without manual configuration",
      "Search for tools across the MCP ecosystem",
      "Build adaptive AI agents that find services on demand",
      "Access 30+ free services through a single endpoint",
    ],
  },

  // Forecasting / Markets
  {
    key: "manifold",
    name: "Manifold Markets",
    serverUrl: "https://api.manifold.markets/v0/mcp",
    transport: "http",
    defaultAuthType: "",
    category: "Forecasting",
    maintainer: "Manifold",
    iconUrl: "/assets/icons/mcp-providers/manifold.png",
    description:
      "Interact with prediction markets to forecast events, trade on outcomes, and track market sentiment. Create markets, place bets, manage liquidity, and access real-time forecasting data.",
    tools: [
      {
        name: "create_market",
        description:
          "Create new prediction markets (binary, multiple choice, numeric, or poll)",
      },
      {
        name: "search_markets",
        description: "Find markets with filters and search queries",
      },
      {
        name: "get_market",
        description: "Get detailed information about a specific market",
      },
      { name: "place_bet", description: "Execute trades on market outcomes" },
      { name: "cancel_bet", description: "Cancel pending limit orders" },
      { name: "sell_shares", description: "Liquidate positions in markets" },
      {
        name: "add_liquidity",
        description: "Provide liquidity to markets for trading",
      },
      { name: "remove_liquidity", description: "Withdraw provided liquidity" },
      { name: "get_user", description: "Retrieve user profile and statistics" },
      {
        name: "get_positions",
        description: "Track portfolio positions across markets",
      },
      { name: "follow_market", description: "Subscribe to market updates" },
      {
        name: "add_bounty",
        description: "Add bounties to incentivize analysis",
      },
      { name: "award_bounty", description: "Reward valuable contributions" },
      { name: "react", description: "Like or react to markets and comments" },
      {
        name: "send_mana",
        description: "Transfer platform currency between users",
      },
      { name: "close_market", description: "Close markets for trading" },
      {
        name: "unresolve_market",
        description: "Revert previously resolved markets",
      },
      {
        name: "add_answer",
        description: "Add options to multiple choice markets",
      },
    ],
    useCases: [
      "Track forecasts on political elections, tech trends, and world events",
      "Create custom prediction markets for your community",
      "Analyze market sentiment and collective intelligence",
      "Trade on outcomes to express probabilistic beliefs",
    ],
  },
];

export const AGGREGATOR_ONLY_PROVIDERS: AggregatorOnlyProvider[] = [
  {
    key: "gmail",
    name: "Gmail",
    category: "Email",
    aggregators: ["Zapier", "Pipedream", "Composio"],
    description: "Connect Gmail through automation platforms",
    iconUrl: "/assets/icons/mcp-providers/gmail.png",
  },
  {
    key: "google-calendar",
    name: "Google Calendar",
    category: "Calendar",
    aggregators: ["Zapier", "Pipedream", "Composio"],
    description: "Connect Calendar through automation platforms",
    iconUrl: "/assets/icons/mcp-providers/google-calendar.png",
  },
  {
    key: "google-ads",
    name: "Google Ads",
    category: "Advertising",
    aggregators: ["Zapier", "Pipedream", "Composio"],
    description: "Connect Google Ads through automation platforms",
    iconUrl: "/assets/icons/mcp-providers/google-ads.png",
  },
  {
    key: "google-analytics",
    name: "Google Analytics",
    category: "Analytics",
    aggregators: ["Zapier", "Pipedream", "Composio"],
    description: "Connect Google Analytics through automation platforms",
    iconUrl: "/assets/icons/mcp-providers/google-analytics.png",
  },
  {
    key: "google-drive",
    name: "Google Drive",
    category: "Storage",
    aggregators: ["Zapier", "Pipedream", "Composio"],
    description: "Connect Google Drive through automation platforms",
    iconUrl: "/assets/icons/mcp-providers/google-drive.png",
  },
  {
    key: "slack",
    name: "Slack",
    category: "Communication",
    aggregators: ["Zapier", "Pipedream", "Composio"],
    description: "Connect Slack through automation platforms",
    iconUrl: "/assets/icons/mcp-providers/slack.png",
  },
  {
    key: "github",
    name: "GitHub",
    category: "Developer Tools",
    aggregators: ["Zapier", "Pipedream", "Composio"],
    description: "Connect GitHub through automation platforms",
    iconUrl: "/assets/icons/mcp-providers/github.png",
  },
  {
    key: "salesforce",
    name: "Salesforce",
    category: "CRM",
    aggregators: ["Zapier", "Pipedream", "Composio"],
    description: "Connect Salesforce through automation platforms",
    iconUrl: "/assets/icons/mcp-providers/salesforce.svg",
  },
  {
    key: "outlook",
    name: "Microsoft Outlook",
    category: "Email",
    aggregators: ["Zapier", "Pipedream", "Composio"],
    description: "Connect Outlook through automation platforms",
    iconUrl: "/assets/icons/mcp-providers/outlook.png",
  },
  {
    key: "dropbox",
    name: "Dropbox",
    category: "Storage",
    aggregators: ["Zapier", "Pipedream", "Composio"],
    description: "Connect Dropbox through automation platforms",
    iconUrl: "/assets/icons/mcp-providers/dropbox.png",
  },
  {
    key: "trello",
    name: "Trello",
    category: "Project Management",
    aggregators: ["Zapier", "Pipedream", "Composio"],
    description: "Connect Trello through automation platforms",
    iconUrl: "/assets/icons/mcp-providers/trello.png",
  },
];

/** All unique categories from known providers */
export function getCategories(): string[] {
  const cats = new Set<string>();
  for (const p of KNOWN_MCP_PROVIDERS) {
    if (p.category) cats.add(p.category);
  }
  for (const p of AGGREGATOR_ONLY_PROVIDERS) {
    cats.add(p.category);
  }
  return Array.from(cats).sort();
}

/** Group known providers by category */
export function getProvidersByCategory(): Map<string, McpProvider[]> {
  const map = new Map<string, McpProvider[]>();
  for (const p of KNOWN_MCP_PROVIDERS) {
    const cat = p.category || "Other";
    if (!map.has(cat)) map.set(cat, []);
    map.get(cat)!.push(p);
  }
  return map;
}
