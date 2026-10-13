import { signupAction } from "@/features/users/actions";
import { Alert } from "@/components/shared/alert";
import { Button } from "@/components/shared/button";
import { Field } from "@/components/shared/field";

export function SignupForm({ error }: { error?: string }) {
  return (
    <form action={signupAction} className="space-y-4">
      {error && <Alert>{error}</Alert>}
      <Field label="Email" name="email" type="email" required autoComplete="email" />
      <Field
        label="Password"
        name="password"
        type="password"
        required
        minLength={8}
        autoComplete="new-password"
      />
      <Button type="submit" className="w-full">
        Create account
      </Button>
    </form>
  );
}
