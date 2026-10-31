import type { Metadata } from "next";
import { AtlasSignUpForm } from "@/components/atlas-ui/sign-up-form";
import { AtlasBackButton, FlowScreen } from "@/components/atlas-ui/ui";

/* SignUp · Create account — Figma frame 70:3586 (error states 70:3615 and 70:3654). */

export const metadata: Metadata = { title: "Create account · Atlas" };

export default function SignUpPage() {
  return (
    <main>
      <FlowScreen>
        <AtlasBackButton to="SignIn" />
        <AtlasSignUpForm />
      </FlowScreen>
    </main>
  );
}
