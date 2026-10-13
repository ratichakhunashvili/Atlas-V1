import Link from "next/link";
import { Card } from "@/components/shared/card";

export default function AdminHomePage() {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Link href="/admin/places">
        <Card>
          <p className="font-medium">Places</p>
          <p className="text-sm text-slate-500">Create, edit, and delete Places.</p>
        </Card>
      </Link>
      <Link href="/admin/hotels">
        <Card>
          <p className="font-medium">Hotels</p>
          <p className="text-sm text-slate-500">Create, edit, and delete Hotels.</p>
        </Card>
      </Link>
    </div>
  );
}
