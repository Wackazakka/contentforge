import { requireAuth } from "@/lib/auth";
import Link from "next/link";
import LogoutButton from "./LogoutButton";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAuth();

  return (
    <div className="flex flex-col min-h-screen">
      <nav className="border-b border-zinc-800 px-6 py-4 flex items-center justify-between">
        <Link
          href="/dashboard"
          className="text-lg font-bold tracking-tight text-white"
        >
          Content<span className="text-violet-500">Forge</span>
        </Link>
        <div className="flex items-center gap-4">
          <Link
            href="/dashboard/new"
            className="rounded-full bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold px-5 py-2 transition-colors"
          >
            + Ny kampanje
          </Link>
          <LogoutButton />
        </div>
      </nav>
      <main className="flex-1 px-6 py-8 max-w-5xl mx-auto w-full">
        {children}
      </main>
    </div>
  );
}
