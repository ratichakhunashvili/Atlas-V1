import { loginAction } from "@/auth/actions";
import { Alert } from "@/components/shared/alert";
import { Button } from "@/components/shared/button";
import { Field } from "@/components/shared/field";

export function LoginForm({ error, callbackUrl }: { error?: string; callbackUrl?: string }) {
  return (
    <form action={loginAction} className="space-y-4">
      {error && <Alert>{error}</Alert>}
      <input type="hidden" name="callbackUrl" value={callbackUrl ?? "/"} />
      <Field label="Email" name="email" type="email" required autoComplete="email" />
      <Field label="Password" name="password" type="password" required autoComplete="current-password" />
      <Button type="submit" className="w-full">
        Log in
      </Button>
    </form>
  );
}
