"use client"
import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation"; 
import Navbar from "../admin/components/layout/topnavbar";
import { Loader2 } from "lucide-react";

export default function AdminDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isAuthorized, setIsAuthorized] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const router = useRouter();

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const response = await fetch(`${process.env.NEXT_PUBLIC_Backend_URL}/user/me`, {
          method: "GET",
          credentials: "include", 
        });

        if (response.ok) {
          const userData = await response.json();

          // Check if userType is 'association'
          if (userData.userType === "association") {
            // Role not chosen yet, or chosen but still awaiting approval
            // (Business Admin approves Admins, the Association's own Admin
            // approves every other role) — neither state gets the dashboard.
            const approved =
              userData.role === "admin"
                ? !!userData.isApprovedByBusinessAdmin
                : userData.role
                ? !!userData.isApprovedByAssociation
                : false;

            if (approved) {
              setIsAuthorized(true);
            } else {
              router.push("/login");
            }
          } else {
            // If they are logged in but NOT an association (e.g 'player')
            console.error("Access denied: Invalid user type");
            router.push("/unauthorized");
          }
        } else {
          // 401 Unauthorized or other error
          router.push("/");
        }
      } catch (error) {
        console.error("Auth check failed:", error);
        router.push("/");
      } finally {
        setIsLoading(false);
      }
    };

    checkAuth();
  }, [router]);

  // Show a loading spinner while checking credentials to prevent "flicker"
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="flex flex-col items-center gap-2">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
          <p className="text-slate-500 text-sm font-medium">Verifying Session...</p>
        </div>
      </div>
    );
  }

  // If authorized, render the dashboard
  if (!isAuthorized) return null;

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col">
      <header className="sticky top-0 z-50 w-full bg-white shadow-sm shadow-slate-100">
        <Navbar />
      </header>

      <main className="flex-1 flex flex-col w-full max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-5">
        <div className="w-full h-full">
          {children}
        </div>
      </main>
    </div>
  );
}


// import React from "react";
// import Navbar from "../admin/components/layout/topnavbar";

// export default function AdminDashboardLayout({
//   children,
// }: {
//   children: React.ReactNode;
// }) {
//   return (
//     <div className="min-h-screen bg-[#F8FAFC] flex flex-col">
//       {/* 1. Fixed Top Navbar */}
//       <header className="sticky top-0 z-50 w-full bg-white shadow-sm shadow-slate-100">
//         <Navbar />
//       </header>

//       {/* 2. Main Content Area */}
//       <main className="flex-1 flex flex-col w-full max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-5">
//         {/* This is where your Dashboard, Tournaments, or Grounds pages will render */}
//         <div className="w-full h-full">
//           {children}
//         </div>
//       </main>

//     </div>
//   );
// }

