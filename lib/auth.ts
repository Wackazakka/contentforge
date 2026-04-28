import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const ADMIN_PASSWORD = "contentforge";
const SESSION_COOKIE = "cf_session";
const SESSION_VALUE = "authenticated";

export async function requireAuth() {
  const cookieStore = await cookies();
  const session = cookieStore.get(SESSION_COOKIE);
  if (!session || session.value !== SESSION_VALUE) {
    redirect("/login");
  }
}

export async function isAuthenticated(): Promise<boolean> {
  const cookieStore = await cookies();
  const session = cookieStore.get(SESSION_COOKIE);
  return session?.value === SESSION_VALUE;
}

export function checkPassword(password: string): boolean {
  return password === ADMIN_PASSWORD;
}

export { SESSION_COOKIE, SESSION_VALUE };
