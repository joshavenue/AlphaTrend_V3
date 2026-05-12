import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  getSessionUserFromToken,
  SESSION_COOKIE_NAME,
} from "@/lib/auth/session";

export async function getCurrentUser() {
  const cookieStore = await cookies();
  return getSessionUserFromToken(cookieStore.get(SESSION_COOKIE_NAME)?.value);
}

export async function requirePageSession() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/sign-in");
  }

  return user;
}
