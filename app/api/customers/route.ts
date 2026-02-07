import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/utils/auth";
import { listCustomers, createCustomer } from "@/lib/services/customerService";
import { getOrCreateDefaultWorkspace } from "@/lib/services/workspaceService";

/**
 * GET /api/customers
 *
 * List all customers in the workspace.
 */
export async function GET() {
  const isAuthed = await requireAuth();
  if (!isAuthed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const workspace = await getOrCreateDefaultWorkspace();

  const customers = await listCustomers(workspace.id);

  return NextResponse.json({ customers });
}

/**
 * POST /api/customers
 *
 * Create a new customer.
 *
 * Body:
 * - name: string (required)
 * - slug: string (required) - URL-safe identifier
 * - slackChannelId: string (optional) - Slack channel ID
 * - brandColor: string (optional) - Hex color for branding
 * - logoUrl: string (optional) - URL to customer logo
 */
export async function POST(request: NextRequest) {
  const isAuthed = await requireAuth();
  if (!isAuthed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const workspace = await getOrCreateDefaultWorkspace();

  const body = await request.json();
  const { name, slug, slackChannelId, brandColor, logoUrl } = body;

  if (!name || !slug) {
    return NextResponse.json(
      { error: "Name and slug are required" },
      { status: 400 }
    );
  }

  // Validate slug format
  if (!/^[a-z0-9-]+$/.test(slug)) {
    return NextResponse.json(
      { error: "Slug must be lowercase letters, numbers, and hyphens only" },
      { status: 400 }
    );
  }

  // Validate brand color format if provided
  if (brandColor && !/^#[0-9A-Fa-f]{6}$/.test(brandColor)) {
    return NextResponse.json(
      { error: "Brand color must be a valid hex color (e.g., #5e6ad2)" },
      { status: 400 }
    );
  }

  try {
    const customer = await createCustomer({
      workspaceId: workspace.id,
      name,
      slug,
      slackChannelId,
      brandColor,
      logoUrl,
    });

    return NextResponse.json({ customer }, { status: 201 });
  } catch (error: unknown) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "P2002"
    ) {
      return NextResponse.json(
        { error: "A customer with this slug already exists" },
        { status: 409 }
      );
    }
    throw error;
  }
}
