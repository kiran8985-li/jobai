import Link from "next/link";
import { requireUser } from "@/lib/auth";

export const metadata = { title: "Account – JobPilot AI" };

/** Account details. Export and delete my data are added with the privacy work (Prompt 10). */
export default async function AccountPage() {
  const user = await requireUser();
  return (
    <div className="max-w-2xl">
      <h1 className="text-3xl font-extrabold tracking-tight">Account</h1>
      <section className="mt-6 rounded-[18px] border border-line bg-surface p-5 sm:p-6">
        <dl className="space-y-2 text-sm">
          <div><dt className="inline text-muted">Name: </dt><dd className="inline font-semibold">{user.name ?? "Not set"}</dd></div>
          <div><dt className="inline text-muted">Email: </dt><dd className="inline break-all font-semibold">{user.email}</dd></div>
        </dl>
      </section>
      <section className="mt-4 rounded-[18px] border border-line bg-surface p-5 sm:p-6">
        <h2 className="text-lg font-bold">Your data</h2>
        <p className="mt-1 text-sm text-muted">
          Downloading all your data and deleting your account are being added next. Until then you can delete
          your CVs on <Link href="/cvs" className="font-semibold text-accent">My CVs</Link>, and read what is stored in the{" "}
          <Link href="/privacy" className="font-semibold text-accent">privacy notice</Link>.
        </p>
      </section>
    </div>
  );
}
