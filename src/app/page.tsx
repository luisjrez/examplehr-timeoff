import Link from "next/link";
import type { ReactElement } from "react";

// Landing page: entry points to the two personas of the assignment.
// The employee/manager switch is a navigation concern, not a security boundary (TRD §12).
export default function Home(): ReactElement {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 p-8">
      <h1 className="text-3xl font-semibold">ExampleHR — Time Off</h1>
      <p className="max-w-md text-center text-sm text-gray-600">
        Balances are owned by the HCM. This UI is honest about what is
        confirmed, what is pending, and what is stale.
      </p>
      <nav className="flex gap-4">
        <Link
          href="/employee"
          className="rounded-lg bg-blue-600 px-5 py-2.5 text-white hover:bg-blue-700"
        >
          Employee view
        </Link>
        <Link
          href="/manager"
          className="rounded-lg border border-gray-300 px-5 py-2.5 hover:bg-gray-50"
        >
          Manager view
        </Link>
      </nav>
    </main>
  );
}
