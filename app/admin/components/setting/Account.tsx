'use client';

import React, { useState, useEffect } from 'react';
import { LocateFixed,CheckCircle2, PenLine, Loader2, Save, AlertCircle } from 'lucide-react';
import PhoneInput,{ isValidPhoneNumber } from 'react-phone-number-input';
import 'react-phone-number-input/style.css';

// --- Types ---

interface InputFieldProps {
  label: string;
  name: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void;
  type?: string;
  placeholder?: string;
  icon?: React.ReactNode;
  isSelect?: boolean;
  options?: string[];
  error?: string;
  readOnly?: boolean;
}

// "video_analyst" -> "Video Analyst"
const formatRoleLabel = (role: string) =>
  role
    ? role
        .split('_')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ')
    : '';

// --- Sub-components ---

const InputField: React.FC<InputFieldProps> = ({
  label,
  name,
  value,
  onChange,
  type = "text",
  placeholder = "",
  icon,
  isSelect = false,
  options = [],
  error,
  readOnly = false
}) => (
  <div className="flex flex-col gap-2 flex-1">
    <label className="text-xs font-medium text-gray-500">{label}</label>
    <div className="relative flex flex-col w-full">
      <div className="relative flex items-center w-full">
        {isSelect ? (
          <select
            name={name}
            value={value}
            onChange={onChange}
            disabled={readOnly}
            className={`w-full border rounded-lg p-3 text-sm text-gray-700 outline-none transition-all appearance-none bg-gray-50 cursor-pointer ${
              error ? 'border-red-500 ring-1 ring-red-500/10' : 'border-gray-200 focus:border-black'
            } ${icon ? 'pr-10' : ''} ${readOnly ? 'cursor-not-allowed text-black' : ''}`} // Add padding if icon exists
          >
            {options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
          </select>
        ) : (
          <input
            type={type}
            name={name}
            value={value}
            onChange={onChange}
            placeholder={placeholder}
            readOnly={readOnly}
            className={`w-full border rounded-lg p-3 text-sm outline-none transition-all bg-gray-50 ${
              error ? 'border-red-500 ring-1 ring-red-500/10' : 'border-gray-200 focus:border-black'
            } ${icon ? 'pr-10' : ''} ${readOnly ? 'text-black cursor-not-allowed' : 'text-gray-700'}`}
          />
        )}

        {/* This renders the icon for both Input and Select */}
        {icon && (
          <div className="absolute right-3 flex items-center justify-center pointer-events-none">
            {icon}
          </div>
        )}
      </div>
      {error && (
        <span className="text-[10px] text-red-500 font-medium mt-1 flex items-center gap-1">
          <AlertCircle size={10} /> {error}
        </span>
      )}
    </div>
  </div>
);


const PhoneInputField = ({ label, value, onChange, error }: { label: string, value: string, onChange: (val: string | undefined) => void, error?: string }) => (
  <div className="flex flex-col gap-2 flex-1">
    <label className="text-xs font-medium text-gray-500">{label}</label>
    <div className={`relative flex flex-col w-full border rounded-lg bg-gray-50 ${error ? 'border-red-500' : 'border-gray-200'} focus-within:border-black transition-all`}>
      <PhoneInput
        international
        defaultCountry="IN"
        value={value}
        onChange={onChange}
        className="p-3 text-sm text-gray-700 outline-none"
      />
    </div>
    {error && <span className="text-[10px] text-red-500 font-medium mt-1 flex items-center gap-1"><AlertCircle size={10} /> {error}</span>}
  </div>
);
// --- Main Component ---

export const AccountPage: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [profilePreview, setProfilePreview] = useState<string>("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
    
  
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    role: "",
    cricketAssociationName: "",
    numberOfGroundManaged: "0",
    groundDimension: "",
    location: ""
  });

  const isAdmin = formData.role.toLowerCase() === "admin";

  // 1. Fetch User Data
  useEffect(() => {
    const fetchUser = async () => {
      try {
        const response = await fetch(`${process.env.NEXT_PUBLIC_Backend_URL}/user/me`, {
          method: 'GET',
          credentials: 'include',
        });

        if (response.ok) {
          const data = await response.json();

          let formattedPhone = data.phone || "";
        if (formattedPhone && !formattedPhone.startsWith('+')) {
            formattedPhone = `+91${formattedPhone}`;
        }

          // Cricket Association name. GET /association/settings turns out
          // to return the *caller's own* associationSettings row — for
          // staff that's a separate, blank record, not their parent
          // Admin's. /user/me, however, already carries a resolved
          // top-level `associationName` for staff (confirmed from a real
          // response: an operator's own associationSettings.
          // cricketAssociationName was "", but user.associationName was
          // "State Board Association") — so that's the reliable fallback.
          let associationName = data.associationSettings?.cricketAssociationName || "";
          try {
            const assocRes = await fetch(`${process.env.NEXT_PUBLIC_Backend_URL}/association/settings`, {
              method: 'GET',
              credentials: 'include',
            });
            if (assocRes.ok) {
              const assocData = await assocRes.json();
              if (assocData?.cricketAssociationName) associationName = assocData.cricketAssociationName;
            }
          } catch (assocError) {
            console.error("Failed to load association name:", assocError);
          }
          if (!associationName) associationName = data.associationName || "";

          setFormData({
            name: data.name || "",
            email: data.email || "",
            phone: formattedPhone,
            // Real RBAC role (admin/operator/referee/umpire/scorer/video_analyst),
            // not the legacy associationRole field — shown read-only below.
            role: data.role || "",
            cricketAssociationName: associationName,
            numberOfGroundManaged: data.associationSettings?.numberOfGroundManaged?.toString() || "0",
            groundDimension: data.associationSettings?.groundDimension || "",
            location: data.location || ""
          });

          // Set initial profile image from backend if it exists
          if (data.profileImage) {
            setProfilePreview(data.profileImage);
          } else {
            setProfilePreview("https://api.dicebear.com/7.x/initials/svg?seed=" + (data.name || "User"));
          }
        }
      } catch (error) {
        console.error("Failed to load user data:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchUser();
  }, []);

  // 2. Validation Logic
  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    const alphaRegex = /^[a-zA-Z\s]+$/;
    const emailRegex = /\S+@\S+\.\S+/;
    const phoneRegex = /^\d{10}$/;
    const numericRegex = /^\d+$/;

    if (!formData.name.trim()) {
      newErrors.name = "Name is required";
    } else if (!alphaRegex.test(formData.name)) {
      newErrors.name = "Name should only contain alphabets";
    }

    if (!formData.email.trim()) {
      newErrors.email = "Email is required";
    } else if (!emailRegex.test(formData.email)) {
      newErrors.email = "Invalid email format";
    }

    if (formData.phone && !isValidPhoneNumber(formData.phone)) {
    newErrors.phone = "Invalid phone number for selected country";
  }

    if (formData.cricketAssociationName && !alphaRegex.test(formData.cricketAssociationName)) {
      newErrors.cricketAssociationName = "Association name should be alphabetic";
    }

    if (!numericRegex.test(formData.numberOfGroundManaged)) {
      newErrors.numberOfGroundManaged = "Must be a valid number";
    }
    

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    
    if (name === "phone" || name === "numberOfGroundManaged") {
      if (value !== "" && !/^\d+$/.test(value)) return;
      if (name === "phone" && value.length > 10) return;
    }

    setFormData(prev => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: "" }));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      // Create a local preview for the newly selected file
      setProfilePreview(URL.createObjectURL(file));
    }
  };

  // 3. Update Profile Logic
  const handleSaveChanges = async () => {
    if (!validateForm()) return;

    setSaving(true);
    try {
      const data = new FormData();
      Object.entries(formData).forEach(([key, value]) => {
        // Role is fetched/displayed only, never edited from this page.
        if (key === 'role') return;
        data.append(key, value);
      });

      if (selectedFile) {
        data.append('profileImage', selectedFile);
      }

      const response = await fetch(`${process.env.NEXT_PUBLIC_Backend_URL}/user/updateprofile`, {
        method: 'PUT',
        body: data,
        credentials: 'include',
      });

      const resJson = await response.json();
      if (response.ok) {
        setSaveSuccess(true);
        setErrors({}); // Clear errors on success
        setTimeout(() => setSaveSuccess(false), 3000);
      } else {
        alert("Update failed: " + resJson.message);
      }
    } catch (error) {
      console.error("Failed to save settings:", error);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="h-screen flex items-center justify-center"><Loader2 className="animate-spin text-indigo-600" /></div>;

  return (
    <div className="h-screen flex-1 max-w-7xl bg-white border border-gray-100 shadow-xs p-8 overflow-y-auto rounded-xl relative">
      
      <div className="flex justify-between items-start mb-6">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Accounts</h2>
          <p className="text-xs text-gray-500">Manage your personal Info.</p>
        </div>
        <div className="flex items-center gap-3">
          {saveSuccess && (
            <span className="text-green-600 text-xs font-medium flex items-center gap-1 animate-in fade-in slide-in-from-right-2">
              <CheckCircle2 size={14} /> Saved Successfully
            </span>
          )}
          <button 
            onClick={handleSaveChanges}
            disabled={saving}
            className="bg-[#0D0D12] text-white px-1 md:px-5 py-1 md:py-2.5 rounded-lg text-xs md:text-sm font-semibold hover:bg-black transition-all flex items-center gap-2 disabled:opacity-70 active:scale-95"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={18} />}
            Save Changes
          </button>
        </div>
      </div>

      {/* Profile Header with Image Logic */}
      <div className="flex items-center gap-4 mb-6">
        <div className="relative">
          <img 
            src={profilePreview} 
            alt="User Profile" 
            className="w-16 h-16 rounded-full object-cover border-2 border-white shadow-sm bg-gray-100"
          />
          <label className="absolute bottom-0 right-0 bg-white p-1.5 rounded-full border border-gray-200 shadow-sm hover:bg-gray-50 transition-colors cursor-pointer">
            <PenLine size={12} className="text-black" />
            <input type="file" className="hidden" onChange={handleFileChange} accept="image/*" />
          </label>
        </div>
        <div>
          <h4 className="font-bold text-gray-900 text-sm">{formData.name || "User"}</h4>
          <p className="text-xs text-gray-400">{formData.email || "No email provided"}</p>
        </div>
      </div>

      <div className='border-b border-gray-100 mb-8'></div>

      <div className="space-y-8 max-w-3xl">
        {/* Personal Details */}
       <section>
          <h5 className="text-[13px] font-bold text-black mb-4 uppercase tracking-[0.1em]">Personal Details</h5>
          <div className="flex flex-col gap-4">
            <InputField label="Registered name" name="name" value={formData.name} onChange={handleChange} error={errors.name} />
            <div className="flex flex-col md:flex-row gap-4">
              <InputField label="Primary email" name="email" value={formData.email} onChange={handleChange} error={errors.email} />
              
              {/* Using the new Phone Component */}
              <PhoneInputField 
  label="Phone number" 
  value={formData.phone} 
  onChange={(val) => setFormData(prev => ({ ...prev, phone: val || "" }))} 
  error={errors.phone} 
/>
            </div>
          </div>
        </section>

        <div className='border-b border-gray-100'></div>

        {/* Cricket Information */}
        <section>
          <h5 className="text-[13px] font-bold text-black mb-4 uppercase tracking-[0.1em]">Cricket information</h5>
          <div className="flex flex-col md:flex-row gap-4">
            <InputField
              label="Role"
              name="role"
              value={formatRoleLabel(formData.role)}
              onChange={handleChange}
              readOnly
            />
            <InputField
              label="Cricket Association"
              name="cricketAssociationName"
              value={formData.cricketAssociationName}
              onChange={handleChange}
              error={errors.cricketAssociationName}
              readOnly={!isAdmin}
            />
          </div>
        </section>

        {isAdmin && (
          <>
            <div className='border-b border-gray-100'></div>

            {/* Ground Information — Admin only; staff have no association-level grounds settings of their own. */}
            <section>
              <h5 className="text-[13px] font-bold text-black mb-4 uppercase tracking-[0.1em]">Ground Information</h5>
              <div className="flex flex-col md:flex-row gap-4">
                <InputField label="No. of Grounds Managed" name="numberOfGroundManaged" value={formData.numberOfGroundManaged} onChange={handleChange} error={errors.numberOfGroundManaged} />
                <InputField label="Ground Dimension" name="groundDimension" value={formData.groundDimension} onChange={handleChange} placeholder="e.g. 65m Radius" />
              </div>
            </section>
          </>
        )}

        <div className='border-b border-gray-100'></div>

        {/* Location */}
        <section>
          <h5 className="text-[13px] font-bold text-black mb-4 uppercase tracking-[0.1em]">Location</h5>
          <InputField label="Location" name="location" value={formData.location} onChange={handleChange} icon={<LocateFixed size={18} className="text-gray-400" />} />
        </section>
      </div>
    </div>
  );
};