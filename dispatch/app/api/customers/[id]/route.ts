import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "../../../../lib/utils/auth";
import {
  getCustomerById,
  updateCustomer,
  deleteCustomer,
  regeneratePortalToken,
} from "../../../../lib/services/customerService";

/**
 * GET /api/customers/[id]
 *
 * Get a single customer by ID (includes portal token).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const isAuthed = await requireAuth();
  if (!isAuthed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const customer = await getCustomerById(id);

  if (!customer) {
    return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  }

  return NextResponse.json({ customer });
}

/**
 * PATCH /api/customers/[id]
 *
 * Update a customer.
 *
 * Body:
 * - name: string (optional)
 * - slug: string (optional)
 * - slackChannelId: string | null (optional)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const isAuthed = await requireAuth();
  if (!isAuthed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json();
  const { name, slug, slackChannelId } = body;

  // Validate slug format if provided
  if (slug && !/^[a-z0-9-]+$/.test(slug)) {
    return NextResponse.json(
      { error: "Slug must be lowercase letters, numbers, and hyphens only" },
      { status: 400 }
    );
  }

  try {
    const customer = await updateCustomer(id, {
      name,
      slug,
      slackChannelId,
    });

    return NextResponse.json({ customer });
  } catch (error: unknown) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "P2025"
    ) {
      return NextResponse.json(
        { error: "Customer not found" },
        { status: 404 }
      );
    }
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

/**
 * DELETE /api/customers/[id]
 *
 * Delete a customer. Issues will be unlinked (not deleted).
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const isAuthed = await requireAuth();
  if (!isAuthed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    await deleteCustomer(id);
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "P2025"
    ) {
      return NextResponse.json(
        { error: "Customer not found" },
        { status: 404 }
      );
    }
    throw error;
  }
}

/**
 * POST /api/customers/[id]?action=regenerate-token
 *
 * Regenerate the portal token for a customer.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const isAuthed = await requireAuth();
  if (!isAuthed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const action = request.nextUrl.searchParams.get("action");

  if (action === "regenerate-token") {
    try {
      const newToken = await regeneratePortalToken(id);
      return NextResponse.json({ token: newToken });
    } catch (error: unknown) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "P2025"
      ) {
        return NextResponse.json(
          { error: "Customer not found" },
          { status: 404 }
        );
      }
      throw error;
    }
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
