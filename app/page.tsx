"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { userService } from "@/lib/services";
import { useUser } from "@/lib/hooks";
import type { User } from "@/lib/types";
import { CodeInput } from "@/components/features";
import { BackButton, Button, Screen, Spinner, cx } from "@/components/ui";

type Step = "welcome" | "signin" | "ready";

export default function Onboarding() {
  const router = useRouter();
  const { user, loading } = useUser();
  const [step, setStep] = useState<Step>("welcome");
  const [created, setCreated] = useState<User | null>(null);
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");

  // Returning user who didn't just sign up → straight home.
  useEffect(() => {
    if (!loading && user && !created) router.replace("/home");
  }, [loading, user, created, router]);

  if (loading || (user && !created)) return <Spinner />;

  async function getStarted() {
    setBusy(true);
    setCreated(await userService.createUser());
    setStep("ready");
    setBusy(false);
  }

  async function signIn() {
    setBusy(true);
    setError("");
    try {
      setCreated(await userService.signIn(code));
      router.replace("/home");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't sign in");
      setBusy(false);
    }
  }

  if (step === "ready" && created) {
    return (
      <Screen className="text-center">
        <div className="flex flex-1 flex-col items-center justify-center">
          <span className="animate-pop grid size-20 place-items-center rounded-full bg-ink text-white">
            <Check className="size-9" strokeWidth={3} />
          </span>
          <h1 className="animate-fade-up mt-8 text-[34px] font-semibold tracking-tight">You&apos;re ready.</h1>
          <p className="animate-fade-up mt-10 text-[15px] font-medium text-muted [animation-delay:120ms]">Your ID</p>
          <div className="animate-fade-up mt-3 flex gap-2 [animation-delay:180ms]">
            {created.code.split("").map((c, i) => (
              <span key={i} className="grid h-[76px] w-16 place-items-center rounded-[20px] bg-surface font-mono text-[36px] font-semibold">
                {c}
              </span>
            ))}
          </div>
          <p className="animate-fade-up mt-6 max-w-[240px] text-[16px] leading-snug text-muted [animation-delay:240ms]">
            Use this ID when friends invite you to pay.
          </p>
        </div>
        <Button onClick={() => router.replace("/home")}>Continue</Button>
      </Screen>
    );
  }

  if (step === "signin") {
    return (
      <Screen>
        <div className="-ml-1 h-14">
          <BackButton href="/" />
        </div>
        <div className="flex flex-1 flex-col items-center pt-12 text-center">
          <h1 className="text-[30px] font-semibold tracking-tight">Enter your ID</h1>
          <p className="mt-2 text-[16px] text-muted">The 4 characters you got when you started.</p>
          <div className="mt-10">
            <CodeInput value={code} onChange={setCode} autoFocus />
          </div>
          <p className={cx("mt-4 h-5 text-[15px]", error ? "text-chaos" : "text-muted")}>{error}</p>
        </div>
        <Button disabled={code.length !== 4} loading={busy} onClick={signIn}>
          Continue
        </Button>
      </Screen>
    );
  }

  return (
    <Screen className="text-center">
      <div className="flex flex-1 flex-col items-center justify-center">
        <Logo />
        <h1 className="animate-fade-up mt-7 text-[40px] font-semibold tracking-[-0.03em]">together.</h1>
        <p className="animate-fade-up mt-3 text-[19px] leading-snug text-muted [animation-delay:100ms]">
          Pay together.
          <br />
          Make the bill fun.
        </p>
      </div>
      <Button loading={busy} onClick={getStarted}>
        Get started
      </Button>
      <Button variant="ghost" className="mt-2" onClick={() => setStep("signin")}>
        I already have an ID
      </Button>
    </Screen>
  );
}

function Logo() {
  return (
    <span className="animate-pop relative grid size-20 place-items-center">
      <span className="absolute size-14 -translate-x-3 rounded-full bg-ink" />
      <span className="absolute size-14 translate-x-3 rounded-full bg-chaos mix-blend-multiply" />
    </span>
  );
}
