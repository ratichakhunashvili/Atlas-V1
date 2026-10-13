import Link from "next/link";
import { LoginForm } from "@/components/auth/login-form";
import { Alert } from "@/components/shared/alert";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; registered?: string; callbackUrl?: string }>;
}) {
  const { error, registered, callbackUrl } = await searchParams;

  return (
    <div className="space-y-6">
      {registered && <Alert variant="success">Account created. Log in to continue.</Alert>}
      <LoginForm error={error} callbackUrl={callbackUrl} />
      <p className="text-center text-sm text-slate-600">
        No account yet?{" "}
        <Link href="/signup" className="font-medium text-slate-900 underline">
          Sign up
        </Link>
      </p>
    </div>
  );
}
