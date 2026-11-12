import type { Metadata } from "next";
import { AtlasSignUpForm } from "@/components/atlas-ui/sign-up-form";
import { AtlasBackButton, FlowScreen } from "@/components/atlas-ui/ui";
import { callbackQuery } from "@/auth/callback";

/* SignUp · Create account — Figma frame 70:3586 (error states 70:3615 and 70:3654). */

export const metadata: Metadata = { title: "Create account · Atlas" };

export default async function SignUpPage({ searchParams }: { searchParams: Promise<{ callbackUrl?: string }> }) {
  const { callbackUrl } = await searchParams;
  return (
    <main>
      <FlowScreen compact>
        <AtlasBackButton to="SignIn" query={callbackQuery(callbackUrl)} />
        <AtlasSignUpForm callbackUrl={callbackUrl} />
      </FlowScreen>
    </main>
  );
}
