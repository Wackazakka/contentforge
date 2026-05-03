import Link from "next/link";
import LogoutButton from "./LogoutButton";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Auth is now handled by Supabase/AuthContext on client side

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      <nav className="border-b border-gray-200 bg-white px-6 py-4 flex items-center justify-between">
        <Link
          href="/dashboard"
          className="text-lg font-bold tracking-tight text-gray-900"
        >
          Content<span className="text-green-600">Forge</span>
        </Link>
        <div className="flex items-center gap-4">
          <Link
            href="/dashboard/new"
            className="rounded-full bg-green-600 hover:bg-green-500 text-white text-sm font-semibold px-5 py-2 transition-colors"
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
