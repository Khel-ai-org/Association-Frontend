'use client';

import React, { useState, useEffect } from 'react';
import { Loader2, CheckCircle2, AlertCircle, Save } from 'lucide-react';
import PhoneInput, { isValidPhoneNumber } from 'react-phone-number-input';
import 'react-phone-number-input/style.css';

// --- Sub-components ---

const InputField: React.FC<{ 
  label: string; 
  name: string; 
  value: string; 
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; 
  readonly?: boolean;
  placeholder?: string;
  error?: string; // New error prop
}> = ({ label, name, value, onChange, readonly = false, placeholder = "", error }) => (
  <div className="flex flex-col gap-2 flex-1">
    <label className="text-xs font-medium text-gray-500">{label}</label>
    <input 
      name={name}
      value={value}
      onChange={onChange}
      readOnly={readonly}
      placeholder={placeholder}
      className={`w-full border rounded-xl p-3 text-xs outline-none transition-all ${
        error ? 'border-red-500 bg-red-50/30' : 'border-gray-100 bg-gray-50'
      } ${
        readonly ? 'text-black cursor-default' : 'text-gray-800 focus:border-indigo-500'
      }`}
    />
    {error && (
      <span className="text-[10px] text-red-500 font-medium flex items-center gap-1">
        <AlertCircle size={10} /> {error}
      </span>
    )}
  </div>
);

const SwitchField: React.FC<{ label: string; sub: string; checked: boolean; onChange: () => void; disabled?: boolean }> = ({ label, sub, checked, onChange, disabled = false }) => (
  <div className="flex items-center justify-between py-2">
    <div>
      <h4 className="text-[14px] font-semibold text-gray-900">{label}</h4>
      <p className="text-sm text-gray-500 mt-0.5">{sub}</p>
    </div>
    <button
      onClick={onChange}
      type="button"
      disabled={disabled}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${checked ? 'bg-indigo-500' : 'bg-gray-200'} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${checked ? 'translate-x-5' : 'translate-x-1'}`} />
    </button>
  </div>
);

const PhoneInputField = ({ label, value, onChange, error, disabled = false }: { label: string, value: string, onChange: (val: string | undefined) => void, error?: string, disabled?: boolean }) => (
  <div className="flex flex-col gap-2 flex-1">
    <label className="text-xs font-medium text-gray-500">{label}</label>
    <div className={`w-full border rounded-xl p-1 transition-all ${error ? 'border-red-500 bg-red-50/30' : 'border-gray-100 focus-within:border-indigo-500'} ${disabled ? 'bg-gray-50/50' : 'bg-gray-50'}`}>
      <PhoneInput
        international
        defaultCountry="IN"
        value={value}
        onChange={onChange}
        disabled={disabled}
        className={`text-xs px-2 py-2 outline-none ${disabled ? 'text-black' : 'text-gray-800'}`}
      />
    </div>
    {error && <span className="text-[10px] text-red-500 font-medium flex items-center gap-1"><AlertCircle size={10} /> {error}</span>}
  </div>
);

// Main Association Page 

export const AssociationPage: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  // Staff (operator/referee/umpire/scorer/video_analyst) can view their
  // parent Association's settings but never edit them — only the Admin can.
  const [isAdmin, setIsAdmin] = useState(false);

  // Track errors for each field
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [formData, setFormData] = useState({
    cricketAssociationName: "",
    associationType: "",
    associationGoverningBody: "",
    numberOfGroundManaged: "",
    contactEmail: "",
    contactPhone: "",
    groundName: "", 
    activeGround: "", 
    liveMatchAlerts: true 
  });

  // 1. Basic Validation Logic
  const validateForm = () => {
  const newErrors: Record<string, string> = {};
  
  // Regex Patterns
  const alphaRegex = /^[a-zA-Z\s]+$/; // Alphabets and spaces only
  const numericRegex = /^\d+$/;       // Digits only
  const emailRegex = /\S+@\S+\.\S+/;
  const phoneRegex = /^\d{10}$/;

  //  Association Name (Required + Alphabets)
  if (!formData.cricketAssociationName.trim()) {
    newErrors.cricketAssociationName = "Association name is required";
  } else if (!alphaRegex.test(formData.cricketAssociationName)) {
    newErrors.cricketAssociationName = "Name should only contain alphabets";
  }

  //  Association Type (Alphabets)
  if (formData.associationType && !alphaRegex.test(formData.associationType)) {
    newErrors.associationType = "Type should only contain alphabets";
  }

  //  Governing Body (Alphabets)
  if (formData.associationGoverningBody && !alphaRegex.test(formData.associationGoverningBody)) {
    newErrors.associationGoverningBody = "Governing body should only contain alphabets";
  }

  //  Number of Grounds (Numeric)
  if (!formData.numberOfGroundManaged.trim()) {
    newErrors.numberOfGroundManaged = "Required";
  } else if (!numericRegex.test(formData.numberOfGroundManaged)) {
    newErrors.numberOfGroundManaged = "Must be a valid number";
  }

  // 5. Office Email
  if (!formData.contactEmail.trim()) {
    newErrors.contactEmail = "Email is required";
  } else if (!emailRegex.test(formData.contactEmail)) {
    newErrors.contactEmail = "Invalid email format";
  }

  // 6. Contact Phone (10 Digits)
  if (formData.contactPhone && !isValidPhoneNumber(formData.contactPhone)) {
      newErrors.contactPhone = "Invalid phone number";
    }

  // 7. Primary Ground Name (Alphabets/Spaces)
  if (formData.groundName && !alphaRegex.test(formData.groundName)) {
    newErrors.groundName = "Ground name should only contain alphabets";
  }

  // 8. Active Tournaments (Numeric - assuming you want a count/ID)
  if (formData.activeGround && !numericRegex.test(formData.activeGround)) {
    newErrors.activeGround = "Tournament value must be numeric";
  }

  setErrors(newErrors);
  return Object.keys(newErrors).length === 0;
};

  useEffect(() => {
    // GET /association/settings turns out to return the *caller's own*
    // associationSettings row — for staff that's a separate, blank record,
    // not their parent Admin's. GET /user/me, however, already carries a
    // resolved top-level `associationName` for staff (their parent's real
    // name) — confirmed from a real response: an operator's own
    // associationSettings.cricketAssociationName was "", but
    // user.associationName was "State Board Association". So fetch both and
    // let /user/me's associationName win whenever /association/settings
    // comes back blank for the name specifically.
    const fetchData = async () => {
      let resolvedAssociationName = "";
      try {
        const meResponse = await fetch(`${process.env.NEXT_PUBLIC_Backend_URL}/user/me`, {
          method: 'GET',
          credentials: 'include',
        });
        if (meResponse.ok) {
          const meData = await meResponse.json();
          setIsAdmin((meData.role || '').toLowerCase() === 'admin');
          resolvedAssociationName = meData.associationName || "";
        }
      } catch (error) {
        console.error('Failed to load role:', error);
      }

      try {
        const response = await fetch(`${process.env.NEXT_PUBLIC_Backend_URL}/association/settings`, {
          method: 'GET',
          credentials: 'include',
        });
        if (response.ok) {
          const data = await response.json();
          let phone = data.contactPhone || "";
          if (phone && !phone.startsWith('+')) phone = `+91${phone}`;
          setFormData({
            cricketAssociationName: data.cricketAssociationName || resolvedAssociationName,
            associationType: data.associationType || "",
            associationGoverningBody: data.associationGoverningBody || "",
            numberOfGroundManaged: data.numberOfGroundManaged || "",
            contactEmail: data.contactEmail || "",
            contactPhone: phone || "",
            groundName: data.groundName || "",
            activeGround: data.activeGround || "",
            liveMatchAlerts: data.liveMatchAlerts ?? true
          });
        }
      } catch (error) {
        console.error("Failed to fetch settings:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const handleSaveChanges = async () => {
    if (!validateForm()) return; 

    setSaving(true);
    setSaveSuccess(false);
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_Backend_URL}/association/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
        credentials: 'include',
      });

      if (response.ok) {
        setSaveSuccess(true);
        setErrors({}); 
        setTimeout(() => setSaveSuccess(false), 3000);
      }
    } catch (error) {
      console.error("Failed to save setting:", error);
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData({...formData, [name]: value});
    // Clear error when user starts typing
    if (errors[name]) {
        setErrors(prev => ({ ...prev, [name]: "" }));
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl h-screen mx-auto bg-white border border-gray-100 rounded-2xl p-6 shadow-xs relative">
      
      <div className="flex justify-between items-start mb-6 gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Association Settings</h1>
          <p className="text-gray-500 text-xs mt-1 font-medium">
            {isAdmin ? "Basic identity of the Cricket Association" : "Your Association's info (view only)"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {saveSuccess && (
            <span className="text-green-600 text-xs font-medium flex items-center gap-1 animate-in fade-in slide-in-from-right-2">
              <CheckCircle2 size={14} /> Saved Successfully
            </span>
          )}
          {isAdmin && (
            <button
              onClick={handleSaveChanges}
              disabled={saving}
              className="bg-[#0D0D12] text-white px-1 md:px-5 py-1 md:py-2.5 rounded-lg text-xs md:text-sm font-semibold hover:bg-black transition-all flex items-center gap-2 disabled:opacity-70 active:scale-95"
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={18} />}
              Save Changes
            </button>
          )}
        </div>
      </div>

      <div className="h-px bg-gray-50 w-full mt-2 mb-8" />

      <div className="space-y-8 max-w-4xl">
        <section className="space-y-6">
          <InputField
            label="Association Name"
            name="cricketAssociationName"
            value={formData.cricketAssociationName}
            onChange={handleChange}
            placeholder="e.g. Vidarbha Cricket Association"
            error={errors.cricketAssociationName}
            readonly={!isAdmin}
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <InputField
              label="Association Type"
              name="associationType"
              value={formData.associationType}
              onChange={handleChange}
              placeholder="e.g. State Association"
              error={errors.associationType}
              readonly={!isAdmin}
            />
            <InputField
              label="Governing Body"
              name="associationGoverningBody"
              value={formData.associationGoverningBody}
              onChange={handleChange}
              placeholder="e.g. BCCI"
              error={errors.associationGoverningBody}
              readonly={!isAdmin}
            />
          </div>

          <InputField
            label="No. of Grounds Managed"
            name="numberOfGroundManaged"
            value={formData.numberOfGroundManaged}
            onChange={handleChange}
            placeholder="0"
            error={errors.numberOfGroundManaged}
            readonly={!isAdmin}
          />
        </section>

        <div className="h-px bg-gray-100 w-full" />

        <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <InputField
            label="Office Email"
            name="contactEmail"
            value={formData.contactEmail}
            onChange={handleChange}
            placeholder="email@association.com"
            error={errors.contactEmail}
            readonly={!isAdmin}
          />
         <PhoneInputField
        label="Contact Number"
        value={formData.contactPhone}
        onChange={(val) => setFormData(prev => ({ ...prev, contactPhone: val || "" }))}
        error={errors.contactPhone}
        disabled={!isAdmin}
      />
        </section>

        <div className="h-px bg-gray-100 w-full" />

        <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <InputField
            label="Primary Ground"
            name="groundName"
            value={formData.groundName}
            onChange={handleChange}
            placeholder="e.g. Wankhede Stadium"
            error={errors.groundName}
            readonly={!isAdmin}
          />
          <InputField
            label="Active Tournaments"
            name="activeGround"
            value={formData.activeGround}
            onChange={handleChange}
            placeholder="Enter active tournament number"
            error={errors.activeGround}
            readonly={!isAdmin}
          />
        </section>

        <div className="h-px bg-gray-100 w-full" />

        <section>
          <SwitchField
            label="Enable Live Scoring Sync"
            sub="Automatically sync data from scorer application"
            checked={formData.liveMatchAlerts}
            onChange={() => setFormData({...formData, liveMatchAlerts: !formData.liveMatchAlerts})}
            disabled={!isAdmin}
          />
        </section>
      </div>
    </div>
  );
};

// 'use client';

// import React, { useState } from 'react';
// import { ChevronDown } from 'lucide-react';

// // Sub-components

// const InputField: React.FC<{ 
//   label: string; 
//   name: string; 
//   value: string; 
//   onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; 
//   readonly?: boolean 
// }> = ({ label, name, value, onChange, readonly = false }) => (
//   <div className="flex flex-col gap-2 flex-1">
//     <label className="text-xs font-medium text-gray-500">{label}</label>
//     <input 
//       name={name}
//       value={value}
//       onChange={onChange}
//       readOnly={readonly}
//       className={`w-full border border-gray-100 rounded-xl p-3 text-xs outline-none transition-all ${
//         readonly ? 'bg-gray-50/50 text-gray-400 cursor-default' : 'bg-gray-50 text-gray-800 focus:border-blue-500'
//       }`}
//     />
//   </div>
// );

// const SelectField: React.FC<{ label: string; value: string }> = ({ label, value }) => (
//   <div className="flex flex-col gap-2 flex-1">
//     <label className="text-xs font-medium text-gray-500">{label}</label>
//     <div className="relative flex items-center">
//       <div className="w-full bg-gray-50 border border-gray-100 rounded-xl p-3 text-xs text-gray-400 flex justify-between items-center cursor-default">
//         {value}
//         <ChevronDown size={20} className="text-gray-300" />
//       </div>
//     </div>
//   </div>
// );

// const SwitchField: React.FC<{ label: string; sub: string; checked: boolean; onChange: () => void }> = ({ label, sub, checked, onChange }) => (
//   <div className="flex items-center justify-between py-2">
//     <div>
//       <h4 className="text-[14px] font-semibold text-gray-900">{label}</h4>
//       <p className="text-sm text-gray-500 mt-0.5">{sub}</p>
//     </div>
//     <button 
//       onClick={onChange}
//       className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${checked ? 'bg-indigo-500' : 'bg-gray-200'}`}
//     >
//       <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${checked ? 'translate-x-5' : 'translate-x-1'}`} />
//     </button>
//   </div>
// );

// //  Main Association Page 

// export const AssociationPage: React.FC = () => {
//   const [formData, setFormData] = useState({
//     name: "Vidarbha Cricket Association",
//     type: "State Cricket Association",
//     governingBody: "Board of Control for Cricket in India (BCCI)",
//     groundsManaged: "21",
//     email: "tusharXXXpal@gmail.com",
//     phone: "+91 712 2456789",
//     primaryGround: "Wankhede Stadium",
//     tournament: "04"
//   });

//   const [scoringSync, setScoringSync] = useState(true);

//   const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
//     setFormData({...formData, [e.target.name]: e.target.value});
//   };

//   return (
    
//       <div className="max-w-7xl h-screen mx-auto bg-white border border-gray-100 rounded-2xl p-6 shadow-xs">
        
//         {/* Header Section */}
//         <div className="flex justify-between items-start mb-6">
//             <div>
//           <h1 className="text-xl font-semibold text-gray-900">Association Settings</h1>
//           <p className="text-gray-500 text-xs mt-1 font-medium">Basic identity of the Cricket Association</p>
//           </div>
//           <button 
//           //onClick={handleSaveChanges}
//           //disabled={updating}
//           className="bg-[#0D0D12] text-white px-5 py-2.5 rounded-lg text-sm font-semibold hover:bg-black transition-all flex items-center gap-2 disabled:opacity-70"
//         >
          
//           Save Changes
//         </button>
//         </div>
//         <div className="h-px bg-gray-50 w-full mt-2 mb-5" />

//         <div className="space-y-8">
//           {/* Association Name Row */}
//           <section>
//             <div className="flex flex-col gap-2">
//               <label className="text-xs font-medium text-gray-500">Association Name</label>
//               <div className="relative group">
//                 <input 
//                   readOnly 
//                   value={formData.name} 
//                   className="w-full bg-gray-50 border border-gray-100 rounded-xl p-3 text-xs text-gray-400 outline-none pr-10"
//                 />
//                 <ChevronDown size={20} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-300" />
//               </div>
//             </div>

//             {/* Grid for Types and Governing Body */}
//             <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
//               <SelectField label="Association Type" value={formData.type} />
//               <SelectField label="Governing Body" value={formData.governingBody} />
//             </div>

//             {/* Grounds Managed (Full width in its own row) */}
//             <div className="mt-6">
//               <InputField 
//                 label="No. of Grounds Managed" 
//                 name="groundsManaged" 
//                 value={formData.groundsManaged} 
//                 onChange={handleChange} 
//               />
//             </div>

//             {/* Contact Details Grid */}
//             <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
//               <InputField label="Office Email" name="email" value={formData.email} onChange={handleChange} />
//               <InputField label="Contact Number" name="phone" value={formData.phone} onChange={handleChange} />
//             </div>

//             {/* Grounds & Tournament Select Grid */}
//             <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
//               <SelectField label="Primary Ground" value={formData.primaryGround} />
//               <SelectField label="Active Tournament" value={formData.tournament} />
//             </div>
//           </section>

//           <div className="h-px bg-gray-100 w-full" />

//           {/* Scoring Sync Section */}
//           <section className="">
//             <SwitchField 
//               label="Enable Live Scoring Sync" 
//               sub="Automatically sync data from scorer application" 
//               checked={scoringSync}
//               onChange={() => setScoringSync(!scoringSync)}
//             />
//           </section>
          
//           <div className="h-px bg-gray-100 w-full" />
//         </div>
//       </div>
    
//   );
// };