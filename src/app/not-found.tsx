import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10">
      <h1 className="text-2xl font-extrabold">Page not found</h1>
      <p className="mt-2 text-sm text-muted">This page does not exist, or you do not have access to it.</p>
      <Link href="/dashboard" className="mt-4 inline-flex min-h-11 w-fit items-center rounded-[12px] bg-accent px-5 font-bold text-white hover:bg-accent-hover">Go to the dashboard</Link>
    </main>
  );
}
