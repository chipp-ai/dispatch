import { redirect } from "next/navigation";
import { getSession } from "@/lib/utils/auth";

export default async function HomePage() {
  const session = await getSession();

  if (session) {
    redirect("/board");
  } else {
    redirect("/login");
  }
}
