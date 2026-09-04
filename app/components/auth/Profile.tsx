'use client';

import React, { useEffect, useState } from 'react';
import { Camera, Pencil, ChevronDown, Loader2, AlertCircle, CheckCircle2, XCircle } from 'lucide-react';
import PhoneInput, { isValidPhoneNumber } from 'react-phone-number-input';
import 'react-phone-number-input/style.css';

// RBAC role, chosen here during profile setup (not at registration). ADMIN
// means "I'm registering my own Association" (approved by the Business
// Admin); every other value joins an existing Association via its Admin's
// email (approved by that Admin).
export enum UserRole {
  ADMIN = "admin",
  OPERATOR = "operator",
  REFEREE = "referee",
  UMPIRE = "umpire",
  SCORER = "scorer",
  VIDEO_ANALYST = "video_analyst",
}

const ROLE_LABELS: Record<UserRole, string> = {
  [UserRole.ADMIN]: "Admin",
  [UserRole.OPERATOR]: "Operator",
  [UserRole.REFEREE]: "Referee",
  [UserRole.UMPIRE]: "Umpire",
  [UserRole.SCORER]: "Scorer",
  [UserRole.VIDEO_ANALYST]: "Video Analyst",
};

interface ProfileFormProps {
  onComplete: () => void;
  // Called instead of onComplete when the submitted role/association is now
  // waiting on approval (Business Admin for Admin, the Association's Admin
  // for every other role).
  onPendingApproval: (role: string | null) => void;
}

export default function ProfileForm({ onComplete, onPendingApproval }: ProfileFormProps) {
  // State for form data
  const [formData, setFormData] = useState({
    name: '',
    role: '',
    association: '',
    associationAdminEmail: '',
    mobile: '',
    email: '',
    groundsManaged: 0
  });

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // --- Toast Logic ---
  const [toast, setToast] = useState<{ show: boolean; message: string; type: 'success' | 'error' }>({
    show: false,
    message: '',
    type: 'success'
  });

  const triggerToast = (message: string, type: 'success' | 'error') => {
    setToast({ show: true, message, type });
    setTimeout(() => {
      setToast((prev) => ({ ...prev, show: false }));
    }, 3000);
  };

  // 1. Fetch current data on mount
  useEffect(() => {
    const fetchUserData = async () => {
      try {
        const response = await fetch(`${process.env.NEXT_PUBLIC_Backend_URL}/user/me`, {
          method: 'GET',
          credentials: 'include', 
        });

        if (response.ok) {
          const res = await response.json();
          let phone = res.phone || "";
          if (phone && !phone.startsWith('+')) phone = `+91${phone}`;
          console.log("Fetched", res);
          setFormData({
            name: res.name || '',
            role: res.role || '',
            association: res.associationSettings?.cricketAssociationName || '',
            associationAdminEmail: res.requestedAssociationAdminEmail || '',
            mobile: phone,
            email: res.email || '',
            groundsManaged: res.associationSettings?.numberOfGroundManaged || 0
          });
          
          if (res.profileImage) {
            setPreviewUrl(`${process.env.NEXT_PUBLIC_Backend_URL}/${res.profileImage}`);
          }
        }
      } catch (error) {
        console.error("Failed to fetch user data:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchUserData();
  }, []);

  // 2. Validation Logic
  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    const alphaRegex = /^[a-zA-Z\s]+$/;
    const emailRegex = /\S+@\S+\.\S+/;
    const phoneRegex = /^\d{10}$/;

    if (!formData.name.trim()) {
      newErrors.name = "Name is required";
    } else if (!alphaRegex.test(formData.name)) {
      newErrors.name = "Use alphabets only";
    }

    if (!formData.role) {
      newErrors.role = "Role is required";
    }

    // Anything other than Admin joins an existing Association — the Admin's
    // email is how we resolve which one and who has to approve you.
    if (formData.role && formData.role !== UserRole.ADMIN) {
      if (!formData.associationAdminEmail.trim()) {
        newErrors.associationAdminEmail = "Association Admin's email is required";
      } else if (!emailRegex.test(formData.associationAdminEmail)) {
        newErrors.associationAdminEmail = "Invalid format";
      }
    }

    if (!formData.email.trim()) {
      newErrors.email = "Email is required";
    } else if (!emailRegex.test(formData.email)) {
      newErrors.email = "Invalid format";
    }

   if (!formData.mobile || !isValidPhoneNumber(formData.mobile)) {
      newErrors.mobile = "Invalid mobile number";
    }

    if (formData.association && !alphaRegex.test(formData.association)) {
      newErrors.association = "Use alphabets only";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;

    if (name === "mobile" || name === "groundsManaged") {
        if (value !== "" && !/^\d+$/.test(value)) return;
        if (name === "mobile" && value.length > 10) return;
    }

    setFormData(prev => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: "" }));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      setPreviewUrl(URL.createObjectURL(file));
    }
  };

  // 3. Submit Update
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) {
        triggerToast("Please correct the errors in the form.", "error");
        return;
    }

    setIsSubmitting(true);
    try {
      const data = new FormData();
      data.append('name', formData.name);
      data.append('email', formData.email);
      data.append('phone', formData.mobile);
      data.append('role', formData.role);

      if (formData.role === UserRole.ADMIN) {
        data.append('cricketAssociationName', formData.association);
        data.append('numberOfGroundManaged', formData.groundsManaged.toString());
      } else {
        data.append('associationAdminEmail', formData.associationAdminEmail);
      }

      if (selectedFile) {
        data.append('profileImage', selectedFile);
      }

      const response = await fetch(`${process.env.NEXT_PUBLIC_Backend_URL}/user/updateprofile`, {
        method: 'PUT',
        body: data,
        credentials: 'include',
      });

      const result = await response.json();

      if (result.success) {
        const savedUser = result.data;
        const approved =
          savedUser.role === UserRole.ADMIN
            ? !!savedUser.isApprovedByBusinessAdmin
            : !!savedUser.isApprovedByAssociation;

        if (approved) {
          triggerToast("Profile updated successfully!", "success");
          // Wait for user to see the success message before calling onComplete
          setTimeout(() => onComplete(), 1500);
        } else {
          onPendingApproval(savedUser.role);
        }
      } else {
        triggerToast(result.message || "Update failed", "error");
      }
    } catch (error) {
      console.error("Submit error:", error);
      triggerToast("A network error occurred. Please try again.", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) return <div className="flex justify-center p-20"><Loader2 className="animate-spin" /></div>;

  return (
    <div className="w-full max-w-md bg-[#F6F8FA] rounded-xl shadow-lg border border-gray-300 relative">
      
      {/* --- Notification Toast --- */}
      {toast.show && (
        <div className={`absolute -top-16 left-0 right-0 flex justify-center animate-in fade-in slide-in-from-top-2 duration-300 z-50`}>
          <div className={`flex items-center gap-2 px-4 py-2 rounded-lg shadow-xl border ${
            toast.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-red-50 border-red-200 text-red-700'
          }`}>
            {toast.type === 'success' ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
            <span className="text-xs font-bold">{toast.message}</span>
          </div>
        </div>
      )}

      <div className="w-full bg-white rounded-xl p-6 md:p-8 shadow-lg">
        <div className="text-center mb-6">
          <h1 className="text-xl font-bold text-slate-900 mb-1">Set Up Your Administrator Profile</h1>
          <p className="text-slate-500 text-xs">
            Complete your profile to begin managing tournaments and analyzing performance data.
          </p>
        </div>

        {/* Profile Photo */}
        <div className="flex justify-center mb-4">
          <div className="relative">
            <div className={`w-20 h-20 rounded-full border-2 flex flex-col items-center justify-center bg-slate-50 text-slate-400 overflow-hidden ${errors.profileImage ? 'border-red-500' : 'border-dashed border-slate-200'}`}>
              {previewUrl ? (
                <img src={previewUrl} alt="Preview" className="w-full h-full object-cover" />
              ) : (
                <>
                  <Camera size={24} strokeWidth={1.5} />
                  <span className="text-[10px] mt-1 font-medium">Photo</span>
                </>
              )}
            </div>
            <label className="absolute bottom-0 right-0 bg-[#6379FC] p-2 rounded-full text-white shadow-md hover:bg-indigo-700 cursor-pointer transition-all">
              <Pencil size={12} />
              <input type="file" className="hidden" accept="image/*" onChange={handleFileChange} />
            </label>
          </div>
        </div>

        <form className="space-y-3" onSubmit={handleSubmit}>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-500">Name</label>
              <input type="text" name="name" value={formData.name} onChange={handleChange}
                placeholder="Enter Full Name" 
                className={`text-gray-500 input-style text-xs ${errors.name ? 'border-red-500 ring-1 ring-red-500/10' : ''}`} 
              />
              {errors.name && <p className="text-[10px] text-red-500 flex items-center gap-1"><AlertCircle size={10}/> {errors.name}</p>}
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-500">Role</label>
              <div className="relative">
                <select name="role" value={formData.role} onChange={handleChange}
                  className={`input-style appearance-none bg-white text-xs ${errors.role ? 'border-red-500' : 'text-gray-400'}`}
                >
                  <option value="">Select Role</option>
                  {Object.values(UserRole).map(role => (
                    <option key={role} value={role}>{ROLE_LABELS[role]}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={16} />
              </div>
              {errors.role && <p className="text-[10px] text-red-500">{errors.role}</p>}
            </div>
          </div>

          {/* Admin is creating their own Association; every other role joins
              an existing one via its Admin's email. */}
          {formData.role === UserRole.ADMIN ? (
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-500">Cricket Association</label>
              <input type="text" name="association" value={formData.association} onChange={handleChange}
                placeholder="Enter Association Name"
                className={`text-gray-500 input-style text-xs ${errors.association ? 'border-red-500' : ''}`}
              />
               {errors.association && <p className="text-[10px] text-red-500">{errors.association}</p>}
            </div>
          ) : formData.role ? (
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-500">Association Admin&apos;s Email</label>
              <input type="email" name="associationAdminEmail" value={formData.associationAdminEmail} onChange={handleChange}
                placeholder="Enter your Association Admin's email"
                className={`text-gray-500 input-style text-xs ${errors.associationAdminEmail ? 'border-red-500 ring-1 ring-red-500/10' : ''}`}
              />
              {errors.associationAdminEmail && (
                <p className="text-[10px] text-red-500 flex items-center gap-1">
                  <AlertCircle size={10}/> {errors.associationAdminEmail}
                </p>
              )}
              <p className="text-[10px] text-gray-400">
                They&apos;ll need to approve you before you can access the dashboard.
              </p>
            </div>
          ) : null}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
      <label className="text-xs font-medium text-gray-500">Mobile No.</label>
      <div className={`w-full rounded-xl border bg-white transition-all ${errors.mobile ? 'border-red-500 ring-1 ring-red-500/10' : 'border-slate-200'}`}>
        <PhoneInput
          international
          defaultCountry="IN"
          value={formData.mobile}
          onChange={(val) => setFormData(prev => ({ ...prev, mobile: val || "" }))}
          className="text-xs text-gray-600 px-3 py-2.5 outline-none"
        />
      </div>
      {errors.mobile && (
        <p className="text-[10px] text-red-500 flex items-center gap-1">
          <AlertCircle size={10}/> {errors.mobile}
        </p>
      )}
    </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-500">Email</label>
              <input type="email" name="email" value={formData.email} onChange={handleChange}
                placeholder="Enter Email" 
                className={`text-gray-500 input-style text-xs ${errors.email ? 'border-red-500 ring-1 ring-red-500/10' : ''}`} 
              />
              {errors.email && <p className="text-[10px] text-red-500">{errors.email}</p>}
            </div>
          </div>

          {formData.role === UserRole.ADMIN && (
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-500">No. of Grounds Managed</label>
              <input type="number" name="groundsManaged" value={formData.groundsManaged} onChange={handleChange}
                placeholder="Enter Ground's No."
                className="input-style text-gray-500 text-xs"
              />
            </div>
          )}

          <button type="submit"
            disabled={isSubmitting} className="w-full bg-[#0D0D12] text-white font-semibold py-3.5 rounded-xl mt-4 hover:bg-black transition-all active:scale-[0.99] flex items-center justify-center">
            {isSubmitting ? <Loader2 className="animate-spin mr-2" size={18} /> : 'Confirm'}
          </button>
        </form>
      </div>
      
      <style jsx>{`
        .input-style {
          width: 100%;
          padding: 0.75rem 1rem;
          border-radius: 0.75rem;
          border: 1px solid #E2E8F0;
          font-size: 0.875rem;
          outline: none;
          transition: all 0.2s;
        }
        .input-style:focus {
          border-color: #6366F1;
          box-shadow: 0 0 0 2px #EEF2FF;
        }
      `}</style>
    </div>
  );
}





// import React, { useEffect, useState } from 'react';
// import { Camera, Pencil, ChevronDown,Loader2 } from 'lucide-react';

// // Define the Enum as requested
// export enum AssociationRole {
//   ADMIN = "admin",
//   MANAGER = "manager",
//   STAFF = "staff",
// }

// interface ProfileFormProps {
//   onComplete: () => void;
// }

// export default function ProfileForm({ onComplete }: ProfileFormProps) {
//   // State for form data
//   const [formData, setFormData] = useState({
//     name: '',
//     role: '',
//     association: '',
//     mobile: '',
//     email: '',
//     groundsManaged: 0
//   });

//   const [selectedFile, setSelectedFile] = useState<File | null>(null);
//   const [previewUrl, setPreviewUrl] = useState<string | null>(null);
//   const [loading, setLoading] = useState(true);
//   const [isSubmitting, setIsSubmitting] = useState(false);

//   // 1. Fetch current data on mount
//   useEffect(() => {
//     const fetchUserData = async () => {
//       try {
//         const response = await fetch(`${process.env.NEXT_PUBLIC_Backend_URL}/user/me`, {
//           method: 'GET',
//           credentials: 'include', 
//         });

//         if (response.ok) {
//           const res = await response.json();
//           // Map backend response to local state
//           setFormData({
//             name: res.name || '',
//             role: res.associationRole || '',
//             association: res.associationSettings?.cricketAssociationName || '',
//             mobile: res.phone || '',
//             email: res.email || '',
//             groundsManaged: res.associationSettings?.numberOfGroundManaged || 0
//           });
//           if (res.profileImage) setPreviewUrl(res.profileImage);
//         }
//       } catch (error) {
//         console.error("Failed to fetch user data:", error);
//       } finally {
//         setLoading(false);
//       }
//     };
//     fetchUserData();
//   }, []);

//   const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
//     const { name, value } = e.target;
//     setFormData(prev => ({ ...prev, [name]: value }));
//   };

//   const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
//     if (e.target.files && e.target.files[0]) {
//       const file = e.target.files[0];
//       setSelectedFile(file);
//       setPreviewUrl(URL.createObjectURL(file));
//     }
//   };

//   // 2. Submit Update
//   const handleSubmit = async (e: React.FormEvent) => {
//     e.preventDefault();
//     setIsSubmitting(true);

//     try {
//       const data = new FormData();
//       // Append text fields (mapping to backend keys)
//       data.append('name', formData.name);
//       data.append('email', formData.email);
//       data.append('phone', formData.mobile);
//       data.append('associationRole', formData.role);
//       data.append('cricketAssociationName', formData.association);
//       data.append('numberOfGroundManaged', formData.groundsManaged.toString());

//       // Append image if selected
//       if (selectedFile) {
//         data.append('profileImage', selectedFile);
//       }

//       const response = await fetch(`${process.env.NEXT_PUBLIC_Backend_URL}/user/updateprofile`, {
//         method: 'PUT',
//         body: data, // No Content-Type header; browser sets it for FormData
//         credentials: 'include',
//       });

//       const result = await response.json();

//       if (result.success) {
//         alert("Profile updated successfully!");
//         onComplete();
//       } else {
//         alert("Update failed: " + result.message);
//       }
//     } catch (error) {
//       console.error("Submit error:", error);
//       alert("An error occurred while updating.");
//     } finally {
//       setIsSubmitting(false);
//     }
//   };

//   if (loading) return <div className="flex justify-center p-20"><Loader2 className="animate-spin" /></div>;

//   return (
//     <div className="w-full max-w-md bg-[#F6F8FA] rounded-xl shadow-lg border border-gray-300 ">
//       <div className="w-full bg-white rounded-xl p-6 md:p-8 shadow-lg">
//         <div className="text-center mb-6">
//           <h1 className="text-xl font-bold text-slate-900 mb-1">Set Up Your Administrator Profile</h1>
//           <p className="text-slate-500 text-xs">
//             Complete your profile to begin managing tournaments and analyzing performance data.
//           </p>
//         </div>

//         {/* Profile Photo */}
//         <div className="flex justify-center mb-4">
//           <div className="relative">
//             <div className="w-20 h-20 rounded-full border-2 border-dashed border-slate-200 flex flex-col items-center justify-center bg-slate-50 text-slate-400 overflow-hidden">
//               {previewUrl ? (
//                 <img src={previewUrl} alt="Preview" className="w-full h-full object-cover" />
//               ) : (
//                 <>
//                   <Camera size={24} strokeWidth={1.5} />
//                   <span className="text-[10px] mt-1 font-medium">Photo</span>
//                 </>
//               )}
//             </div>
//             <label className="absolute bottom-0 right-0 bg-[#6379FC] p-2 rounded-full text-white shadow-md hover:bg-indigo-700 cursor-pointer transition-all">
//               <Pencil size={12} />
//               <input type="file" className="hidden" accept="image/*" onChange={handleFileChange} />
//             </label>
//           </div>
//         </div>

//         <form className="space-y-3" onSubmit={handleSubmit}>
//           <div className="grid grid-cols-2 gap-3">
//             <div className="space-y-1">
//               <label className="text-xs font-medium text-gray-500">Name</label>
//               <input type="text" name="name" value={formData.name} onChange={handleChange}
//                 placeholder="Enter your Full Name" 
//                 className="input-style text-gray-500 text-xs" 
//                 required
//               />
//             </div>
//             <div className="space-y-1">
//               <label className="text-xs font-medium text-gray-500">Role</label>
//               <div className="relative">
//                 <select name="role" value={formData.role} onChange={handleChange}
//                   className="input-style appearance-none bg-white text-gray-400 text-xs" required
//                 >
//                   <option value="">Select Your Role</option>
//                   {Object.values(AssociationRole).map(role => (
//                     <option key={role} value={role}>{role.toUpperCase()}</option>
//                   ))}
//                 </select>
//                 <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={16} />
//               </div>
//             </div>
//           </div>

//           <div className="space-y-1">
//             <label className="text-xs font-medium text-gray-500">Cricket Association</label>
//             <input type="text" name="association" value={formData.association} onChange={handleChange}
//               placeholder="Enter Association Name" 
//               className="input-style text-gray-500 text-xs" 
              
//             />
//           </div>

//           <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
//             <div className="space-y-1">
//               <label className="text-xs font-medium text-gray-500">Mobile No.</label>
//               <input type="tel" name="mobile" value={formData.mobile} onChange={handleChange}
//                 placeholder="Enter Your Mobile No." 
//                 className="input-style text-gray-500 text-xs" 
//                 required
//               />
//             </div>
//             <div className="space-y-1">
//               <label className="text-xs font-medium text-gray-500">Email</label>
//               <input type="email" name="email" value={formData.email} onChange={handleChange}
//                 placeholder="Enter Your Email Address" 
//                 className="input-style text-gray-500 text-xs" 
//                 required
//               />
//             </div>
//           </div>

//           <div className="space-y-1">
//             <label className="text-xs font-medium text-gray-500">No. of Grounds Managed</label>
//             <input type="number" name="groundsManaged" value={formData.groundsManaged} onChange={handleChange}
//               placeholder="Enter Ground's No." 
//               className="input-style text-gray-500 text-xs" 
//             />
//           </div>

//           <button type="submit" 
//             disabled={isSubmitting}className="w-full bg-[#0D0D12] text-white font-semibold py-3.5 rounded-xl mt-4 hover:bg-black transition-all active:scale-[0.99]">
//             {isSubmitting ? <Loader2 className="animate-spin mr-2" size={18} /> : 'Confirm'}
//           </button>
//         </form>
//       </div>
      
//       {/* CSS remains same */}
//       <style jsx>{`
//         .input-style {
//           width: 100%;
//           padding: 0.75rem 1rem;
//           border-radius: 0.75rem;
//           border: 1px solid #E2E8F0;
//           font-size: 0.875rem;
//           outline: none;
//           transition: all 0.2s;
//         }
//         .input-style:focus {
//           border-color: #6366F1;
//           box-shadow: 0 0 0 2px #EEF2FF;
//         }
//       `}</style>
//     </div>
//   );
// }