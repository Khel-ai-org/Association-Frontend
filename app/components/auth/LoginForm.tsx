// "use client";

// import { useState, useEffect } from "react";
// import { Eye, EyeOff } from "lucide-react"; 
// import { GoogleLogin } from "@react-oauth/google";
// import Link from "next/link";

// interface LoginFormProps {
//   onSuccess: (isNewUser: boolean, email: string) => void;
// }

// export default function LoginForm({ onSuccess }: LoginFormProps) {
//   const [email, setEmail] = useState("");
//   const [password, setPassword] = useState("");
//   const [loading, setLoading] = useState(false);
//   const [showPassword, setShowPassword] = useState(false);
//   const [rememberMe, setRememberMe] = useState(false);

//   const [emailError, setEmailError] = useState("");
//   const [passwordError, setPasswordError] = useState("");

//   useEffect(() => {
//     const savedEmail = localStorage.getItem("rememberedEmail");
//     if (savedEmail) {
//       setEmail(savedEmail);
//       setRememberMe(true);
//     }
//   }, []);

//   const validateEmail = (email: string) => {
//     const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
//     if (!regex.test(email)) {
//       setEmailError("Enter a valid email address");
//       return false;
//     }
//     setEmailError("");
//     return true;
//   };

//   const validatePassword = (password: string) => {
//     const strongRegex = /^(?=.*[A-Z])(?=.*[0-9]).{6,}$/;
//     if (!strongRegex.test(password)) {
//       setPasswordError("Password must contain at least 6 characters, 1 uppercase letter, and 1 number");
//       return false;
//     }
//     setPasswordError("");
//     return true;
//   };

//   const handleLogin = async (e?: React.FormEvent) => {
//     if (e) e.preventDefault();
//     setEmailError("");
//     setPasswordError("");

//     if (!validateEmail(email) || !validatePassword(password)) return;

//     try {
//       setLoading(true);
//       const res = await fetch(`${process.env.NEXT_PUBLIC_Backend_URL}/auth/login`, {
//         method: "POST",
//         credentials: "include",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify({ email, password, userType: "ASSOCIATION" }),
//       });

//       const data = await res.json();
//       if (!res.ok) {
//         if (data.message === "Invalid credentials") setPasswordError("Incorrect email or password");
//         else if (data.message === "Use Google login for this account") setEmailError("This account uses Google login");
//         else alert(data.message || "Login failed");
//         return;
//       }

//       if (rememberMe) localStorage.setItem("rememberedEmail", email);
//       else localStorage.removeItem("rememberedEmail");

//       onSuccess(!data.user.name,email);
//     } catch {
//       alert("Login failed");
//     } finally {
//       setLoading(false);
//     }
//   };

//   return (
    
//     <div className="w-full max-w-md bg-[#F6F8FA] rounded-xl shadow-lg border border-gray-300 ">
//       <div className="w-full max-w-md bg-white rounded-xl shadow-lg p-8">
//         <div className="flex flex-col items-center mb-6">
//           <img src="/Logo.png" alt="logo" className="w-12 mb-3" />
//           <h2 className=" text-[#0D0D12] text-xl font-semibold">Hey there, welcome back!</h2>
//         </div>

//         <form onSubmit={handleLogin}>
//           <div className="mb-4">
//             <label className="text-sm text-gray-400">Email address</label>
//             <input
//               name="email"
//               type="email"
//               autoComplete="username"
//               placeholder="Enter your email address"
//               className="w-full text-gray-500 mt-1 p-3 border rounded-lg border-gray-300 focus:outline-none focus:border-black"
//               value={email}
//               onChange={(e) => {
//                 setEmail(e.target.value);
//                 validateEmail(e.target.value);
//               }}
//             />
//             {emailError && <p className="text-red-500 text-sm mt-1">{emailError}</p>}
//           </div>

//           <div className="mb-4">
//             <label className="text-sm text-gray-400">Password</label>
//             <div className="relative w-full">
//               <input
//                 name="password"
//                 type={showPassword ? "text" : "password"}
//                 autoComplete="current-password"
//                 placeholder="Enter your password"
//                 className="w-full text-gray-400 mt-1 p-3 border rounded-lg border-gray-300 pr-10 focus:outline-none focus:border-black"
//                 value={password}
//                 onChange={(e) => {
//                   setPassword(e.target.value);
//                   validatePassword(e.target.value);
//                 }}
//               />
//               <button
//                 type="button"
//                 onClick={() => setShowPassword(!showPassword)}
//                 className="absolute right-3 top-1/2 -translate-y-1/2 mt-0.5 text-gray-400 hover:text-gray-600"
//               >
//                 {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
//               </button>
//             </div>
//             {passwordError && <p className="text-red-500 text-sm mt-1">{passwordError}</p>}
//           </div>

//           <div className="flex justify-between items-center mb-6">
//   <label className="flex items-center gap-2 cursor-pointer">
//     <input
//       type="checkbox"
//       checked={rememberMe}
//       onChange={(e) => setRememberMe(e.target.checked)}
//       className="w-4 h-4 rounded border-gray-300 text-black focus:ring-black"
//     />
//     <span className="text-sm text-gray-400">Remember me</span>
//   </label>
//   <Link href="/forgotPassword" className="text-sm text-blue-600 hover:text-black hover:underline">
//     Forgot Password?
//   </Link>
// </div>

//           <button
//             type="submit"
//             disabled={loading}
//             className="w-full bg-[#0D0D12] text-white py-3 rounded-lg font-medium hover:bg-gray-900 transition disabled:opacity-50"
//           >
//             {loading ? "Signing in..." : "Confirm"}
//           </button>
//         </form>

//         <div className="flex items-center my-6">
//           <div className="flex-grow border-t border-gray-100"></div>
//           <span className="px-3 text-sm text-gray-400">Or</span>
//           <div className="flex-grow border-t border-gray-100"></div>
//         </div>

//         <div className="flex justify-center">
//           <GoogleLogin
//             useOneTap
//             auto_select={true}
//             use_fedcm_for_prompt={true}
//             onSuccess={async (credentialResponse) => {
//               try {
//                 const res = await fetch(`${process.env.NEXT_PUBLIC_Backend_URL}/auth/google-login`, {
//                   method: "POST",
//                   credentials: "include",
//                   headers: { "Content-Type": "application/json" },
//                   body: JSON.stringify({
//                     idToken: credentialResponse.credential,
//                     userType: "ASSOCIATION"
//                   }),
//                 });
//                 const data = await res.json();
//                 if (res.ok) onSuccess(!data.user.phone,email);
//               } catch (err) {
//                 console.error("Google login fetch error", err);
//               }
//             }}
            
//           />
//         </div>
//       </div>

//       <p className="text-sm text-gray-400 text-center mt-6 mb-5">
//         You agree to our <span className="text-black cursor-pointer underline">Terms of Use</span> and
//         <span className="text-black cursor-pointer underline"> Privacy Policy</span> by continuing.
//       </p>
//     </div>

//   );
// }

"use client";

import { useState, useEffect } from "react";
import { Eye, EyeOff } from "lucide-react"; 
import { GoogleLogin } from "@react-oauth/google";
import Link from "next/link";

interface LoginFormProps {
  // Updated: Passing user object back to handle logic in parent
  onSuccess: (user: any, email: string, isGoogle: boolean) => void;
  // A profile-complete user can still be logged back in while awaiting
  // approval — the backend returns a 403 with one of these codes instead of
  // a user object, so there's no "user" to route on here.
  onPendingApproval: (role: string | null) => void;
}

export default function LoginForm({ onSuccess, onPendingApproval }: LoginFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  const [emailError, setEmailError] = useState("");
  const [passwordError, setPasswordError] = useState("");

  useEffect(() => {
    const savedEmail = localStorage.getItem("rememberedEmail");
    if (savedEmail) {
      setEmail(savedEmail);
      setRememberMe(true);
    }
  }, []);

  const validateEmail = (email: string) => {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!regex.test(email)) {
      setEmailError("Enter a valid email address");
      return false;
    }
    setEmailError("");
    return true;
  };

  const validatePassword = (password: string) => {
    const strongRegex = /^(?=.*[A-Z])(?=.*[0-9]).{6,}$/;
    if (!strongRegex.test(password)) {
      setPasswordError("Password must contain at least 6 characters, 1 uppercase letter, and 1 number");
      return false;
    }
    setPasswordError("");
    return true;
  };

  const handleLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setEmailError("");
    setPasswordError("");

    if (!validateEmail(email) || !validatePassword(password)) return;

    try {
      setLoading(true);
      const res = await fetch(`${process.env.NEXT_PUBLIC_Backend_URL}/auth/login`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, userType: "ASSOCIATION" }),
      });

      const data = await res.json();
      if (!res.ok) {
        if (data.code === "PENDING_BUSINESS_ADMIN_APPROVAL") {
          onPendingApproval("admin");
        } else if (data.code === "PENDING_ASSOCIATION_APPROVAL") {
          onPendingApproval(null);
        } else if (data.message === "Invalid credentials") {
          setPasswordError("Incorrect email or password");
        } else if (data.message === "Use Google login for this account") {
          setEmailError("This account uses Google login");
        } else {
          alert(data.message || "Login failed");
        }
        return;
      }

      if (rememberMe) localStorage.setItem("rememberedEmail", email);
      else localStorage.removeItem("rememberedEmail");

      // Pass user object to handle routing in parent
      onSuccess(data.user, email, false); 
    } catch {
      alert("Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md bg-[#F6F8FA] rounded-xl shadow-lg border border-gray-300">
      <div className="w-full max-w-md bg-white rounded-xl shadow-lg p-8">
        <div className="flex flex-col items-center mb-6">
          <img src="/Logo.png" alt="logo" className="w-12 mb-3" />
          <h2 className=" text-[#0D0D12] text-xl font-semibold">Hey there, welcome back!</h2>
        </div>

        <form onSubmit={handleLogin}>
          <div className="mb-4">
            <label className="text-sm text-gray-400">Email address</label>
            <input
              name="email"
              type="email"
              autoComplete="username"
              placeholder="Enter your email address"
              className="w-full text-gray-500 mt-1 p-3 border rounded-lg border-gray-300 focus:outline-none focus:border-black"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                validateEmail(e.target.value);
              }}
            />
            {emailError && <p className="text-red-500 text-sm mt-1">{emailError}</p>}
          </div>

          <div className="mb-4">
            <label className="text-sm text-gray-400">Password</label>
            <div className="relative w-full">
              <input
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                placeholder="Enter your password"
                className="w-full text-gray-400 mt-1 p-3 border rounded-lg border-gray-300 pr-10 focus:outline-none focus:border-black"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  validatePassword(e.target.value);
                }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 mt-0.5 text-gray-400 hover:text-gray-600"
              >
                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
            {passwordError && <p className="text-red-500 text-sm mt-1">{passwordError}</p>}
          </div>

          <div className="flex justify-between items-center mb-6">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-black focus:ring-black"
              />
              <span className="text-sm text-gray-400">Remember me</span>
            </label>
            <Link href="/forgotPassword" className="text-sm text-blue-600 hover:text-black hover:underline">
              Forgot Password?
            </Link>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#0D0D12] text-white py-3 rounded-lg font-medium hover:bg-gray-900 transition disabled:opacity-50"
          >
            {loading ? "Signing in..." : "Confirm"}
          </button>
        </form>

        <div className="flex items-center my-6">
          <div className="flex-grow border-t border-gray-100"></div>
          <span className="px-3 text-sm text-gray-400">Or</span>
          <div className="flex-grow border-t border-gray-100"></div>
        </div>

        <div className="flex justify-center">
          <GoogleLogin
            useOneTap
            auto_select={true}
            use_fedcm_for_prompt={true}
            onSuccess={async (credentialResponse) => {
              try {
                const res = await fetch(`${process.env.NEXT_PUBLIC_Backend_URL}/auth/google-login`, {
                  method: "POST",
                  credentials: "include",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    idToken: credentialResponse.credential,
                    userType: "ASSOCIATION"
                  }),
                });
                const data = await res.json();
                if (res.ok) {
                    // Pass user data to handle routing
                    onSuccess(data.user, data.user.email, true);
                } else if (data.code === "PENDING_BUSINESS_ADMIN_APPROVAL") {
                  onPendingApproval("admin");
                } else if (data.code === "PENDING_ASSOCIATION_APPROVAL") {
                  onPendingApproval(null);
                } else {
                  alert(data.message || "Google login failed");
                }
              } catch (err) {
                console.error("Google login fetch error", err);
              }
            }}
          />
        </div>
      </div>
      <p className="text-sm text-gray-400 text-center mt-6 mb-5">
        You agree to our <span className="text-black cursor-pointer underline">Terms of Use</span> and
        <span className="text-black cursor-pointer underline"> Privacy Policy</span> by continuing.
      </p>
    </div>
  );
}