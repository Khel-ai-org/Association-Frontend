"use client";

import React, { useState, useEffect } from "react";
import {
  Pencil,
  Trash2,
  Loader2,
  X,
  CheckCircle2,
  ChevronDown,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

interface Ground {
  id: string;
  name: string;
  location: string;
  pitchType: string;
  straightBoundary?: number;
  sideBoundary?: number;
}

// --- Modals ---

const EditGroundModal = ({
  groundId,
  onClose,
  onRefresh,
}: {
  groundId: string;
  onClose: () => void;
  onRefresh: () => void;
}) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [formData, setFormData] = useState({
    groundName: "",
    location: "",
    pitchType: "",
    straightBoundary: "",
    sideBoundary: "",
  });

  // Validation Logic
  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    const alphaRegex = /^[A-Za-z\s]+$/;
    const numberRegex = /^\d+$/;

    //if (!formData.groundName.trim() || !alphaRegex.test(formData.groundName)) 
     // newErrors.groundName = "For Valid name letter, spaces is required";
    
    //if (!formData.location.trim() || !alphaRegex.test(formData.location)) 
     // newErrors.location = "For Valid location letters, spaces is required";
    
    if (!formData.pitchType) 
      newErrors.pitchType = "Pitch Type is required";
    
    if (!formData.straightBoundary || !numberRegex.test(String(formData.straightBoundary))) 
      newErrors.straightBoundary = "Numbers only";
    
    if (!formData.sideBoundary || !numberRegex.test(String(formData.sideBoundary))) 
      newErrors.sideBoundary = "Numbers only";

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  useEffect(() => {
    const fetchGround = async () => {
      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_Backend_URL}/ground/${groundId}`,
          { credentials: "include" },
        );
        if (res.ok) {
          const data = await res.json();
          setFormData({
            groundName: data.name || "",
            location: data.location || "",
            pitchType: data.pitchType || "",
            straightBoundary: data.straightBoundary || "",
            sideBoundary: data.sideBoundary || "",
          });
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchGround();
  }, [groundId]);

  const handleUpdate = async () => {
    if (!validateForm()) return; // Run validation before saving

    setSaving(true);
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_Backend_URL}/ground/update/${groundId}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(formData),
          credentials: "include",
        },
      );
      if (res.ok) {
        onRefresh();
        onClose();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-[24px] md:rounded-[32px] w-full max-w-lg p-6 md:p-8 shadow-2xl relative max-h-[90vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 md:top-6 md:right-6 text-gray-400 hover:text-black"
        >
          <X size={20} />
        </button>

        <div className="flex flex-col items-center mb-6">
          <div className="w-14 h-14 md:w-16 md:h-16 bg-indigo-50 rounded-full flex items-center justify-center mb-4">
            <svg width="30" height="30" viewBox="0 0 50 50" fill="none">
              <path
                d="M2.5 12.5V2.5L12.5 7.5L2.5 12.5ZM40 12.5V2.5L50 7.5L40 12.5ZM22.5 10V0L32.5 5L22.5 10ZM22.5 50C19.3333 49.9167 16.3854 49.6562 13.6562 49.2188C10.9271 48.7812 8.55208 48.2292 6.53125 47.5625C4.51042 46.8958 2.91667 46.125 1.75 45.25C0.583333 44.375 0 43.4583 0 42.5V20C0 18.9583 0.65625 17.9896 1.96875 17.0938C3.28125 16.1979 5.0625 15.4062 7.3125 14.7188C9.5625 14.0312 12.2083 13.4896 15.25 13.0938C18.2917 12.6979 21.5417 12.5 25 12.5C28.4583 12.5 31.7083 12.6979 34.75 13.0938C37.7917 13.4896 40.4375 14.0312 42.6875 14.7188C44.9375 15.4062 46.7188 16.1979 48.0312 17.0938C49.3438 17.9896 50 18.9583 50 20V42.5C50 43.4583 49.4167 44.375 48.25 45.25C47.0833 46.125 45.4896 46.8958 43.4688 47.5625C41.4479 48.2292 39.0729 48.7812 36.3438 49.2188C33.6146 49.6562 30.6667 49.9167 27.5 50V40H22.5V50ZM25 22.5C29.0417 22.5 32.5312 22.2604 35.4688 21.7812C38.4062 21.3021 40.75 20.75 42.5 20.125C42.5 19.9167 40.9167 19.4271 37.75 18.6562C34.5833 17.8854 30.3333 17.5 25 17.5C19.6667 17.5 15.4167 17.8854 12.25 18.6562C9.08333 19.4271 7.5 19.9167 7.5 20.125C9.25 20.75 11.5938 21.3021 14.5312 21.7812C17.4688 22.2604 20.9583 22.5 25 22.5ZM17.5 44.625V35H32.5V44.625C35.8333 44.2917 38.5625 43.8021 40.6875 43.1562C42.8125 42.5104 44.25 41.9375 45 41.4375V24.5C42.7083 25.4167 39.8333 26.1458 36.375 26.6875C32.9167 27.2292 29.125 27.5 25 27.5C20.875 27.5 17.0833 27.2292 13.625 26.6875C10.1667 26.1458 7.29167 25.4167 5 24.5V41.4375C5.75 41.9375 7.1875 42.5104 9.3125 43.1562C11.4375 43.8021 14.1667 44.2917 17.5 44.625Z"
                fill="#5D5FEF"
              />
            </svg>
          </div>
          <h2 className="text-xl md:text-2xl font-bold text-gray-900">Edit Ground</h2>
          <p className="text-gray-500 text-xs md:text-sm">
            Enter Details to Update Grounds
          </p>
        </div>


        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="animate-spin text-indigo-500" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Ground Name */}
            <div>
              <label className="text-xs font-semibold text-gray-500 ml-1">Ground Name</label>
              <input
                className={`w-full text-gray-800 border ${errors.groundName ? 'border-red-500' : 'border-gray-100'} bg-gray-50 rounded-xl p-3 text-sm mt-1 outline-none focus:border-black`}
                value={formData.groundName}
                onChange={(e) => setFormData({ ...formData, groundName: e.target.value })}
              />
              {errors.groundName && <p className="text-red-500 text-xs mt-1">{errors.groundName}</p>}
            </div>

            {/* Location */}
            <div>
              <label className="text-xs font-semibold text-gray-500 ml-1">Location</label>
              <input
                className={`w-full text-gray-800 border ${errors.location ? 'border-red-500' : 'border-gray-100'} bg-gray-50 rounded-xl p-3 text-sm mt-1 outline-none focus:border-black`}
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
              />
              {errors.location && <p className="text-red-500 text-xs mt-1">{errors.location}</p>}
            </div>

            {/* Pitch Type */}
            <div className="relative w-full">
              <label className="block text-xs font-semibold text-gray-500 ml-1 mb-1">Pitch Type</label>
              <div 
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                className={`w-full px-4 py-3 rounded-xl border ${errors.pitchType ? 'border-red-500' : 'border-gray-100'} bg-gray-50 text-sm text-gray-800 cursor-pointer flex justify-between items-center outline-none transition-all`}
              >
                <span>{formData.pitchType || "Select Pitch Type"}</span>
                <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
              </div>
              {errors.pitchType && <p className="text-red-500 text-xs mt-1">{errors.pitchType}</p>}
              
              {isDropdownOpen && (
                <div className="absolute left-0 w-full mt-2 bg-white border border-gray-100 rounded-xl shadow-xl z-[60] py-1 h-40 overflow-y-auto">
                  {["Black Soil ( Balanced )", "Hard Soil", "Green Grass", "Dusty", "Red Soil"].map((type) => (
                    <div
                      key={type}
                      className="px-4 py-3 hover:bg-gray-50 cursor-pointer text-sm text-gray-700 transition-colors"
                      onClick={() => {
                        setFormData({...formData, pitchType: type});
                        setIsDropdownOpen(false);
                      }}
                    >
                      {type}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Boundaries */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-gray-500 ml-1">Ground Boundary (Straight)</label>
                <input
                  className={`w-full text-gray-800 border ${errors.straightBoundary ? 'border-red-500' : 'border-gray-100'} bg-gray-50 rounded-xl p-3 text-sm mt-1 outline-none focus:border-black`}
                  value={formData.straightBoundary}
                  onChange={(e) => setFormData({ ...formData, straightBoundary: e.target.value })}
                />
                {errors.straightBoundary && <p className="text-red-500 text-xs mt-1">{errors.straightBoundary}</p>}
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 ml-1">Ground Boundary (Side)</label>
                <input
                  className={`w-full text-gray-800 border ${errors.sideBoundary ? 'border-red-500' : 'border-gray-100'} bg-gray-50 rounded-xl p-3 text-sm mt-1 outline-none focus:border-black`}
                  value={formData.sideBoundary}
                  onChange={(e) => setFormData({ ...formData, sideBoundary: e.target.value })}
                />
                {errors.sideBoundary && <p className="text-red-500 text-xs mt-1">{errors.sideBoundary}</p>}
              </div>
            </div>

            <button
              onClick={handleUpdate}
              disabled={saving}
              className="w-full bg-[#0D0D12] text-white py-3 md:py-4 rounded-xl font-bold mt-4 hover:bg-black transition-all disabled:opacity-50 flex justify-center items-center active:scale-95"
            >
              {saving ? <Loader2 className="animate-spin mr-2" size={20} /> : "Done"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

const DeleteModal = ({
  onClose,
  onConfirm,
}: {
  onClose: () => void;
  onConfirm: () => void;
}) => (
  <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
    <div className="bg-white rounded-[24px] md:rounded-[32px] w-full max-w-sm overflow-hidden shadow-2xl relative">
      {/* Added Close Button */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 text-gray-400 hover:text-black z-10"
      >
        <X size={20} />
      </button>

      <div className="p-8 md:p-10 flex flex-col items-center text-center">
        <div className="w-16 h-16 md:w-20 md:h-20 bg-red-100 rounded-full flex items-center justify-center mb-6 relative">
          <svg width="30" height="30" viewBox="0 0 50 50" fill="none">
            <path
              d="M2.5 12.5V2.5L12.5 7.5L2.5 12.5ZM40 12.5V2.5L50 7.5L40 12.5ZM22.5 10V0L32.5 5L22.5 10ZM22.5 50C19.3333 49.9167 16.3854 49.6562 13.6562 49.2188C10.9271 48.7812 8.55208 48.2292 6.53125 47.5625C4.51042 46.8958 2.91667 46.125 1.75 45.25C0.583333 44.375 0 43.4583 0 42.5V20C0 18.9583 0.65625 17.9896 1.96875 17.0938C3.28125 16.1979 5.0625 15.4062 7.3125 14.7188C9.5625 14.0312 12.2083 13.4896 15.25 13.0938C18.2917 12.6979 21.5417 12.5 25 12.5C28.4583 12.5 31.7083 12.6979 34.75 13.0938C37.7917 13.4896 40.4375 14.0312 42.6875 14.7188C44.9375 15.4062 46.7188 16.1979 48.0312 17.0938C49.3438 17.9896 50 18.9583 50 20V42.5C50 43.4583 49.4167 44.375 48.25 45.25C47.0833 46.125 45.4896 46.8958 43.4688 47.5625C41.4479 48.2292 39.0729 48.7812 36.3438 49.2188C33.6146 49.6562 30.6667 49.9167 27.5 50V40H22.5V50ZM25 22.5C29.0417 22.5 32.5312 22.2604 35.4688 21.7812C38.4062 21.3021 40.75 20.75 42.5 20.125C42.5 19.9167 40.9167 19.4271 37.75 18.6562C34.5833 17.8854 30.3333 17.5 25 17.5C19.6667 17.5 15.4167 17.8854 12.25 18.6562C9.08333 19.4271 7.5 19.9167 7.5 20.125C9.25 20.75 11.5938 21.3021 14.5312 21.7812C17.4688 22.2604 20.9583 22.5 25 22.5ZM17.5 44.625V35H32.5V44.625C35.8333 44.2917 38.5625 43.8021 40.6875 43.1562C42.8125 42.5104 44.25 41.9375 45 41.4375V24.5C42.7083 25.4167 39.8333 26.1458 36.375 26.6875C32.9167 27.2292 29.125 27.5 25 27.5C20.875 27.5 17.0833 27.2292 13.625 26.6875C10.1667 26.1458 7.29167 25.4167 5 24.5V41.4375C5.75 41.9375 7.1875 42.5104 9.3125 43.1562C11.4375 43.8021 14.1667 44.2917 17.5 44.625Z"
              fill="#ef4444"
            />
          </svg>
          <div className="absolute -top-1 -right-1 bg-white rounded-full p-1 border border-red-100">
            <AlertCircle size={16} className="text-red-500" />
          </div>
        </div>
        <h2 className="text-xl md:text-2xl font-bold text-gray-900 mb-2">
          Ground will be deleted
        </h2>
        <p className="text-gray-500 text-sm">
          Are you sure you want to delete this ground?
        </p>
      </div>
      <div className="bg-gray-50 p-6">
        <button
          onClick={onConfirm}
          className="w-full bg-[#0D0D12] text-white py-3 md:py-4 rounded-xl font-bold hover:bg-black transition-all active:scale-95"
        >
          Confirm
        </button>
      </div>
    </div>
  </div>
);

// --- Main Component ---

export const GroundPage: React.FC = () => {
  const [grounds, setGrounds] = useState<Ground[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedGround, setSelectedGround] = useState<string | null>(null);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);

  // Pagination States
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const fetchGrounds = async () => {
    setLoading(true);
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_Backend_URL}/ground/my-grounds`,
        {
          method: "GET",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
        },
      );
      if (response.ok) {
        setGrounds(await response.json());
      }
    } catch (error) {
      console.error("Error fetching grounds:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGrounds();
  }, []);

  const handleDelete = async () => {
    if (!selectedGround) return;
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_Backend_URL}/ground/delete/${selectedGround}`,
        {
          method: "DELETE",
          credentials: "include",
        },
      );
      if (res.ok) {
        fetchGrounds();
        setIsDeleteOpen(false);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Pagination Logic
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = grounds.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(grounds.length / itemsPerPage);

  const paginate = (pageNumber: number) => {
    if (pageNumber > 0 && pageNumber <= totalPages) {
      setCurrentPage(pageNumber);
    }
  };

  return (
    <div className="max-w-7xl mx-auto bg-white p-4 md:p-8 min-h-screen flex flex-col">
      <div className="mb-6 md:mb-10">
        <h1 className="text-xl md:text-2xl font-bold text-gray-900">Ground Settings</h1>
        <p className="text-gray-400 text-xs md:text-sm mt-1">
          Control how grounds behave in your system
        </p>
      </div>

      <div className="w-full overflow-x-auto rounded-lg border border-gray-50 md:border-none flex-grow">
        <table className="w-full text-left min-w-[600px]">
          <thead>
            <tr className="text-gray-600 text-[10px] md:text-xs uppercase tracking-wider font-semibold border-b border-gray-50">
              <th className="pb-4 px-2">Ground Name</th>
              <th className="pb-4 px-2">Location</th>
              <th className="pb-4 px-2">Pitch Type</th>
              <th className="pb-4 px-2 text-center">Remove</th>
              <th className="pb-4 px-2 text-center">Edit</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {loading ? (
              <tr>
                <td colSpan={5} className="py-10 text-center">
                  <Loader2 className="animate-spin inline text-gray-300" />
                </td>
              </tr>
            ) : currentItems.length > 0 ? (
              currentItems.map((ground) => (
                <tr
                  key={ground.id}
                  className="group hover:bg-gray-50/50 transition-colors"
                >
                  <td className="py-4 px-2">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 md:w-10 md:h-10 bg-indigo-50 rounded-full flex items-center justify-center overflow-hidden flex-shrink-0">
                         <svg width="20" height="20" viewBox="0 0 50 50" fill="none">
                          <path d="M2.5 12.5V2.5L12.5 7.5L2.5 12.5ZM40 12.5V2.5L50 7.5L40 12.5ZM22.5 10V0L32.5 5L22.5 10ZM22.5 50C19.3333 49.9167 16.3854 49.6562 13.6562 49.2188C10.9271 48.7812 8.55208 48.2292 6.53125 47.5625C4.51042 46.8958 2.91667 46.125 1.75 45.25C0.583333 44.375 0 43.4583 0 42.5V20C0 18.9583 0.65625 17.9896 1.96875 17.0938C3.28125 16.1979 5.0625 15.4062 7.3125 14.7188C9.5625 14.0312 12.2083 13.4896 15.25 13.0938C18.2917 12.6979 21.5417 12.5 25 12.5C28.4583 12.5 31.7083 12.6979 34.75 13.0938C37.7917 13.4896 40.4375 14.0312 42.6875 14.7188C44.9375 15.4062 46.7188 16.1979 48.0312 17.0938C49.3438 17.9896 50 18.9583 50 20V42.5C50 43.4583 49.4167 44.375 48.25 45.25C47.0833 46.125 45.4896 46.8958 43.4688 47.5625C41.4479 48.2292 39.0729 48.7812 36.3438 49.2188C33.6146 49.6562 30.6667 49.9167 27.5 50V40H22.5V50ZM25 22.5C29.0417 22.5 32.5312 22.2604 35.4688 21.7812C38.4062 21.3021 40.75 20.75 42.5 20.125C42.5 19.9167 40.9167 19.4271 37.75 18.6562C34.5833 17.8854 30.3333 17.5 25 17.5C19.6667 17.5 15.4167 17.8854 12.25 18.6562C9.08333 19.4271 7.5 19.9167 7.5 20.125C9.25 20.75 11.5938 21.3021 14.5312 21.7812C17.4688 22.2604 20.9583 22.5 25 22.5ZM17.5 44.625V35H32.5V44.625C35.8333 44.2917 38.5625 43.8021 40.6875 43.1562C42.8125 42.5104 44.25 41.9375 45 41.4375V24.5C42.7083 25.4167 39.8333 26.1458 36.375 26.6875C32.9167 27.2292 29.125 27.5 25 27.5C20.875 27.5 17.0833 27.2292 13.625 26.6875C10.1667 26.1458 7.29167 25.4167 5 24.5V41.4375C5.75 41.9375 7.1875 42.5104 9.3125 43.1562C11.4375 43.8021 14.1667 44.2917 17.5 44.625Z" fill="#5D5FEF" />
                        </svg>
                      </div>
                      <span className="text-gray-900 text-xs md:text-sm font-medium">
                        {ground.name}
                      </span>
                    </div>
                  </td>
                  <td className="py-4 px-2 text-gray-500 text-xs md:text-sm font-medium">
                    {ground.location}
                  </td>
                  <td className="py-4 px-2 text-gray-500 text-xs md:text-sm font-medium">
                    {ground.pitchType}
                  </td>
                  <td className="py-4 px-2">
                    <div className="flex justify-center">
                      <button
                        onClick={() => {
                          setSelectedGround(ground.id);
                          setIsDeleteOpen(true);
                        }}
                        className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                      >
                        <Trash2 size={18} className="md:w-5 md:h-5" />
                      </button>
                    </div>
                  </td>
                  <td className="py-4 px-2">
                    <div className="flex justify-center">
                      <button
                        onClick={() => {
                          setSelectedGround(ground.id);
                          setIsEditOpen(true);
                        }}
                        className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                      >
                        <Pencil size={18} className="md:w-5 md:h-5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} className="py-10 text-center text-gray-400 text-sm">
                  No grounds found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Controls */}
      
        <div className="flex items-center justify-between mt-8 pt-6 border-t border-gray-50">
          <p className="text-xs md:text-sm text-gray-400 font-medium">
            Page <span className="text-gray-900">{currentPage}</span> of <span className="text-gray-900">{totalPages}</span>
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => paginate(currentPage - 1)}
              disabled={currentPage === 1}
              className="p-2 rounded-lg border border-gray-100 text-gray-700 hover:text-black hover:bg-gray-50 disabled:opacity-30 disabled:hover:bg-transparent transition-all"
            >
              <ChevronLeft size={18} />
            </button>
            
            <div className="flex items-center gap-1">
              {[...Array(totalPages)].map((_, index) => (
                <button
                  key={index}
                  onClick={() => paginate(index + 1)}
                  className={`w-9 h-9 rounded-lg text-sm font-bold transition-all ${
                    currentPage === index + 1
                      ? "bg-black text-white"
                      : "text-gray-400 hover:text-black hover:bg-gray-50"
                  }`}
                >
                  {index + 1}
                </button>
              ))}
            </div>

            <button
              onClick={() => paginate(currentPage + 1)}
              disabled={currentPage === totalPages}
              className="p-2 rounded-lg border border-gray-100 text-gray-700 hover:text-black hover:bg-gray-50 disabled:opacity-30 disabled:hover:bg-transparent transition-all"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      

      {isEditOpen && selectedGround && (
        <EditGroundModal
          groundId={selectedGround}
          onClose={() => setIsEditOpen(false)}
          onRefresh={fetchGrounds}
        />
      )}

      {isDeleteOpen && (
        <DeleteModal
          onClose={() => setIsDeleteOpen(false)}
          onConfirm={handleDelete}
        />
      )}
    </div>
  );
};