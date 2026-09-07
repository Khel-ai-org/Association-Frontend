// "use client";

// import { useState } from "react";
// import { useRouter } from "next/navigation";
// import AuthLayout from "../components/auth/AuthLayout";
// import LoginForm from "../components/auth/LoginForm"; 
// import ProfileForm from "../components/auth/Profile"; 

// type AuthStep = "login" | "profile";

// export default function LoginPage() {
//   const [step, setStep] = useState<AuthStep>("login");
//   const router = useRouter();

//   const handleLoginSuccess = (isNewUser: boolean) => {
//     if (isNewUser) {
//       setStep("profile"); // Switch the inner content to Profile
//     } else {
//       router.push("/admin/dashboard");
//     }
//   };

//   return (
//     <AuthLayout>
//       {step === "login" ? (
//         <LoginForm onSuccess={handleLoginSuccess} />
//       ) : (
//         <ProfileForm onComplete={() => router.push("/admin/dashboard")} />
//       )}
//     </AuthLayout>
//   );
// }
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import AuthLayout from "../components/auth/AuthLayout";
import LoginForm from "../components/auth/LoginForm";
import ProfileForm from "../components/auth/Profile";
import OTPVerification from "../components/auth/OTPVerification";
import PendingApproval from "../components/auth/PendingApproval";

type AuthStep = "login" | "otp" | "profile" | "pending";

// Whether a user (from a login/google-login/profile response) is approved to
// use the dashboard. Business Admin has no role and no approval gate.
// Admin is gated by isApprovedByBusinessAdmin; every other role is gated by
// isApprovedByAssociation.
function isApproved(user: any): boolean {
  if (user.userType === "business_admin") return true;
  if (user.role === "admin") return !!user.isApprovedByBusinessAdmin;
  if (user.role) return !!user.isApprovedByAssociation;
  return false; // role not chosen yet — not applicable, but never "approved"
}

// A "scorer" goes to scoring-frontend's own dashboard (authenticated via this
// app's session cookie against the same backend) instead of /admin/dashboard.
// That's a different app/origin, so a hard navigation is used rather than
// Next's client-side router.
function goToDestination(router: ReturnType<typeof useRouter>, role: string | null) {
  if (role === "scorer") {
    window.location.href = `${process.env.NEXT_PUBLIC_SCORING_FRONTEND_URL}/pages/dashboard`;
  } else {
    router.push("/admin/dashboard");
  }
}

export default function LoginPage() {
  const [step, setStep] = useState<AuthStep>("login");
  const [userEmail, setUserEmail] = useState("");
  const [pendingRole, setPendingRole] = useState<string | null>(null);
  const router = useRouter();

  const handleLoginSuccess = (user: any, email: string, isGoogle: boolean) => {
    setUserEmail(email);

    // Profile setup is complete once a role has been chosen (not before —
    // `name` alone doesn't tell us whether role + association linking happened).
    const isProfileComplete = user.role != null;

    const goToDashboardOrPending = () => {
      if (isApproved(user)) {
        goToDestination(router, user.role ?? null);
      } else {
        setPendingRole(user.role ?? null);
        setStep("pending");
      }
    };

    // SCENARIO 1: Google Login (Always skip OTP)
    if (isGoogle) {
      if (!isProfileComplete) {
        setStep("profile");
      } else {
        goToDashboardOrPending();
      }
    }
    // SCENARIO 2: Email/Pass Login
    else {
      // If Email is NOT verified, force OTP
      if (user.isEmailVerified === false) {
        setStep("otp");
      }
      // If Email IS verified but profile not set
      else if (!isProfileComplete) {
        setStep("profile");
      }
      // All good
      else {
        goToDashboardOrPending();
      }
    }
  };

  // Login itself can also come back with a 403 PENDING_* error (an
  // already-profile-complete user logging back in while still awaiting
  // approval) — LoginForm surfaces that here instead of alert()ing it.
  const handleLoginPending = (role: string | null) => {
    setPendingRole(role);
    setStep("pending");
  };

  return (
    <AuthLayout>
      {step === "login" && (
        <LoginForm onSuccess={handleLoginSuccess} onPendingApproval={handleLoginPending} />
      )}
      {step === "otp" && (
        <OTPVerification
          email={userEmail}
          onSuccess={() => setStep("profile")}
          onBack={() => setStep("login")}
        />
      )}
      {step === "profile" && (
        <ProfileForm
          onComplete={(role) => goToDestination(router, role)}
          onPendingApproval={(role) => {
            setPendingRole(role);
            setStep("pending");
          }}
        />
      )}
      {step === "pending" && (
        <PendingApproval role={pendingRole} onApproved={() => goToDestination(router, pendingRole)} />
      )}
    </AuthLayout>
  );
}