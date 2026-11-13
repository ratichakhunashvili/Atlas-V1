import type { Metadata } from "next";
import { AtlasSignUpForm } from "@/components/atlas-ui/sign-up-form";
import { AtlasBackButton, FlowScreen } from "@/components/atlas-ui/ui";
import { callbackQuery } from "@/auth/callback";
import { isGoogleSignInConfigured } from "@/auth/google";
import { GoogleSignInForm } from "@/components/atlas-ui/google-sign-in";

/* SignUp · Create account — Figma frame 70:3586 (error states 70:3615 and 70:3654). */

export const metadata: Metadata = { title: "Create account · Atlas" };

export default async function SignUpPage({ searchParams }: { searchParams: Promise<{ callbackUrl?: string }> }) {
  const { callbackUrl } = await searchParams;
  const google = isGoogleSignInConfigured(process.env);
  return (
    <main>
      <FlowScreen compact>
        <AtlasBackButton to="SignIn" query={callbackQuery(callbackUrl)} />
        <AtlasSignUpForm callbackUrl={callbackUrl} google={google} />
        {google ? <GoogleSignInForm callbackUrl={callbackUrl} /> : null}
      </FlowScreen>
    </main>
  );
}
