import { Metadata } from "next";
import { db } from "@/lib/db";

interface IssueRow {
  id: string;
  identifier: string;
  title: string;
  description: string | null;
  priority: string;
  status_name: string;
  customer_name: string | null;
}

interface Props {
  params: Promise<{ customerSlug: string; identifier: string }>;
  children: React.ReactNode;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { identifier } = await params;

  try {
    const issue = await db.queryOne<IssueRow>(
      `SELECT i.id, i.identifier, i.title, i.description, i.priority,
              s.name as status_name,
              c.name as customer_name
       FROM chipp_issue i
       JOIN chipp_status s ON i.status_id = s.id
       LEFT JOIN chipp_customer c ON i.customer_id = c.id
       WHERE i.identifier = $1`,
      [identifier.toUpperCase()]
    );

    if (!issue) {
      return {
        title: "Issue Not Found - Chipp Issues",
      };
    }

    const priorityLabels: Record<string, string> = {
      P1: "Urgent",
      P2: "High",
      P3: "Normal",
      P4: "Low",
    };

    const priorityLabel = priorityLabels[issue.priority] || issue.priority;
    const truncatedDescription = issue.description
      ? issue.description.length > 160
        ? `${issue.description.substring(0, 160).trim()}...`
        : issue.description
      : `${priorityLabel} priority issue - ${issue.status_name}`;

    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL || "https://issues.chipp.ai";
    const ogImageUrl = `${baseUrl}/api/og/issue/${issue.identifier}`;

    return {
      title: `${issue.identifier}: ${issue.title}`,
      description: truncatedDescription,
      openGraph: {
        title: `${issue.identifier}: ${issue.title}`,
        description: truncatedDescription,
        type: "article",
        images: [
          {
            url: ogImageUrl,
            width: 1200,
            height: 630,
            alt: `${issue.identifier}: ${issue.title}`,
          },
        ],
      },
      twitter: {
        card: "summary_large_image",
        title: `${issue.identifier}: ${issue.title}`,
        description: truncatedDescription,
        images: [ogImageUrl],
      },
    };
  } catch (error) {
    console.error("Error generating metadata:", error);
    return {
      title: "Chipp Issues",
    };
  }
}

export default function IssueLayout({ children }: Props) {
  return <>{children}</>;
}
