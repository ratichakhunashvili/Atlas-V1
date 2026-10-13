import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
      <h1 className="text-xl font-semibold">Not found</h1>
      <p className="text-sm text-slate-500">The page you’re looking for doesn’t exist.</p>
      <Link href="/" className="text-sm font-medium underline">
        Back home
      </Link>
    </div>
  );
}
