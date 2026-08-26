"use client";

import React, { useState, useEffect } from 'react';
import { Search, PlusSquare, X, ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

interface Ground {
  id: string;
  name: string;
  location: string;
  pitchType?: string;
  straightBoundary?: string;
  sideBoundary?: string;
  tournaments?: any[];
}

interface CricketGroundProps {
  selectedGroundId?: string | null;
}

export default function CricketGround({ selectedGroundId }: CricketGroundProps) {
  const params = useParams();
  const [grounds, setGrounds] = useState<Ground[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 12; // 3 rows of 4

  const activeId = selectedGroundId || params.groundId;

  const [formData, setFormData] = useState({
    name: '',
    location: '',
    pitchType: '',
    straightBoundary: '',
    sideBoundary: ''
  });

  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    const alphaRegex = /^[A-Za-z\s]+$/;
    const numberRegex = /^\d+$/;

    //if (!formData.name.trim() || !alphaRegex.test(formData.name)) newErrors.name = "For Valid name letters,spaces is required";
    //if (!formData.location.trim() || !alphaRegex.test(formData.location)) newErrors.location = "Valid location letters, spaces is required";
    if (!formData.pitchType) newErrors.pitchType = "Pitch Type is required";
    if (!formData.straightBoundary || !numberRegex.test(formData.straightBoundary)) newErrors.straightBoundary = "Numbers only";
    if (!formData.sideBoundary || !numberRegex.test(formData.sideBoundary)) newErrors.sideBoundary = "Numbers only";

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const fetchGrounds = async () => {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_Backend_URL}/ground/my-grounds`, {
        method: 'GET',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });

      if (response.ok) {
        const data: Ground[] = await response.json();
        setGrounds(data);
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

  const handleCreateGround = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_Backend_URL}/ground`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        setIsModalOpen(false);
        setFormData({ name: '', location: '', pitchType: '', straightBoundary: '', sideBoundary: '' });
        fetchGrounds();
      }
    } catch (error) {
      console.error("Error creating ground:", error);
    }
  };

  const filteredGrounds = grounds.filter(g => 
    g.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    g.location.toLowerCase().includes(searchQuery.toLowerCase()) ||
    g.pitchType?.toLowerCase().includes(searchQuery.toLocaleLowerCase())
  );

  // Pagination Logic
  const totalPages = Math.ceil(filteredGrounds.length / itemsPerPage);
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = filteredGrounds.slice(indexOfFirstItem, indexOfLastItem);

  if (loading) {
    return (
      <div className="bg-white p-6 rounded-[24px] border border-gray-200 shadow-xs w-full">
        <div className="animate-pulse flex space-x-4">
          <div className="flex-1 space-y-4 py-1">
            <div className="h-4 bg-slate-200 rounded w-1/4"></div>
            <div className="grid grid-cols-4 gap-4">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="h-40 bg-slate-200 rounded-[24px]"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className='flex justify-between mb-3'>
        <Link href={"/admin/dashboard"}>
        <button 
        
        className="mb-4 text-3xl font-medium text-gray-500 cursor-pointer"
      >
        ← 
      </button>
      </Link>
      <button 
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-2 bg-[#0F1117] text-white px-4 py-2.5 rounded-xl font-semibold text-sm hover:bg-slate-800 transition-colors"
          >
            <PlusSquare className="w-5 h-5" />
            Create Ground
          </button>
          </div>
    <div className="bg-white p-6 md:p-4 rounded-[24px] border border-gray-200 shadow-xs flex-grow w-full relative">
      <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
        <h1 className='font-bold text-2xl text-slate-900'>Cricket Grounds</h1>
        
        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="relative flex-grow md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
            <input 
              type="text" 
              placeholder="Search here" 
              className="w-full pl-10 pr-4 py-2 bg-[#F4F7FE] border-none rounded-xl text-sm focus:ring-1 focus:ring-blue-500 outline-none text-gray-500"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
            />
          </div>

          
        </div>
      </div>

      {/* Grid Layout replacing the slider */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 mb-8">
        {currentItems.length > 0 ? (
          currentItems.map((g, i) => {
            const isActive = activeId === g.id;
            
            return (
              <Link 
                key={g.id || i} 
                href={`/admin/ground/${g.id}`}
                className={`p-4 rounded-[24px] transition-all cursor-pointer relative overflow-hidden block ${
                  isActive 
                    ? 'border-blue-600 bg-blue-50/50 shadow-sm border-l-2' 
                    : 'border-slate-200 border bg-white hover:border-blue-300'
                }`}
              >
                <div className="flex justify-between items-start mb-4">
                  <span className={`z-10 text-[10px] font-bold px-2 py-1 rounded-md ${
                    isActive ? 'bg-[#CEA700] text-white' : 'bg-[#A3E9D2] text-[#1E7F64]'
                  }`}>
                    {isActive ? 'ACTIVE VENUE' : 'UPCOMING'}
                  </span>
                  
                  <div className='absolute top-6 right-6 opacity-20'>
                    <svg width="40" height="40" viewBox="0 0 50 50" fill="none">
                      <path d="M2.5 12.5V2.5L12.5 7.5L2.5 12.5ZM40 12.5V2.5L50 7.5L40 12.5ZM22.5 10V0L32.5 5L22.5 10ZM22.5 50C19.3333 49.9167 16.3854 49.6562 13.6562 49.2188C10.9271 48.7812 8.55208 48.2292 6.53125 47.5625C4.51042 46.8958 2.91667 46.125 1.75 45.25C0.583333 44.375 0 43.4583 0 42.5V20C0 18.9583 0.65625 17.9896 1.96875 17.0938C3.28125 16.1979 5.0625 15.4062 7.3125 14.7188C9.5625 14.0312 12.2083 13.4896 15.25 13.0938C18.2917 12.6979 21.5417 12.5 25 12.5C28.4583 12.5 31.7083 12.6979 34.75 13.0938C37.7917 13.4896 40.4375 14.0312 42.6875 14.7188C44.9375 15.4062 46.7188 16.1979 48.0312 17.0938C49.3438 17.9896 50 18.9583 50 20V42.5C50 43.4583 49.4167 44.375 48.25 45.25C47.0833 46.125 45.4896 46.8958 43.4688 47.5625C41.4479 48.2292 39.0729 48.7812 36.3438 49.2188C33.6146 49.6562 30.6667 49.9167 27.5 50V40H22.5V50ZM25 22.5C29.0417 22.5 32.5312 22.2604 35.4688 21.7812C38.4062 21.3021 40.75 20.75 42.5 20.125C42.5 19.9167 40.9167 19.4271 37.75 18.6562C34.5833 17.8854 30.3333 17.5 25 17.5C19.6667 17.5 15.4167 17.8854 12.25 18.6562C9.08333 19.4271 7.5 19.9167 7.5 20.125C9.25 20.75 11.5938 21.3021 14.5312 21.7812C17.4688 22.2604 20.9583 22.5 25 22.5ZM17.5 44.625V35H32.5V44.625C35.8333 44.2917 38.5625 43.8021 40.6875 43.1562C42.8125 42.5104 44.25 41.9375 45 41.4375V24.5C42.7083 25.4167 39.8333 26.1458 36.375 26.6875C32.9167 27.2292 29.125 27.5 25 27.5C20.875 27.5 17.0833 27.2292 13.625 26.6875C10.1667 26.1458 7.29167 25.4167 5 24.5V41.4375C5.75 41.9375 7.1875 42.5104 9.3125 43.1562C11.4375 43.8021 14.1667 44.2917 17.5 44.625Z" fill="#83878D"/>
                    </svg>
                  </div>
                </div>

                <h3 className='text-2xl font-bold tracking-tight relative z-10 text-slate-900'>{g.name}</h3>
                <p className="text-slate-700 text-sm mb-4 flex items-center gap-1 relative z-10">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
                  {g.location}
                </p>

                <div className="grid grid-cols-2 gap-4 mb-4 relative z-10">
                  <div>
                    <p className="text-[11px] text-slate-700 uppercase font-bold tracking-wider mb-1">Straight Boundary</p>
                    <p className='text-xl font-bold text-slate-900'>{g.straightBoundary}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-slate-700 uppercase font-bold tracking-wider mb-1">Side Boundary</p>
                    <p className="text-xl font-bold text-slate-900">{g.sideBoundary}</p>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-50 relative z-10">
                  <p className="text-[12px] text-slate-700 mb-2">Primary Pitch Type</p>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-[#8B5CF6]"></div>
                    <span className="text-sm font-bold text-slate-800">{g.pitchType || "Black Soil (Balanced)"}</span>
                  </div>
                </div>
              </Link>
            );
          })
        ) : (
          <p className="text-slate-400 p-4 col-span-full">No venues registered yet.</p>
        )}
      </div>
       </div>

      {/* PAGINATION SECTION (Matches Screenshot 2026-05-04 at 1.46.34 PM.png) */}
      
        <div className="flex items-center justify-center    pt-6 gap-3">
          <button 
            disabled={currentPage === 1}
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            className="flex items-center gap-1 px-3 py-2 text-sm font-medium text-slate-500 hover:text-slate-900  bg-white border border-gray-200 rounded-md"
          >
            <ChevronLeft className="w-4 h-4 " /> Back
          </button>
          
          <div className="flex gap-1">
            {[...Array(totalPages)].map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrentPage(i + 1)}
                className={`w-8 h-8 rounded-md text-sm font-semibold transition-all ${
                  currentPage === i + 1 
                    ? 'bg-[#0F1117] text-white shadow-md' 
                    : 'text-slate-500 hover:bg-slate-100'
                }`}
              >
                {i + 1}
              </button>
            ))}
          </div>

          <button 
            disabled={currentPage === totalPages}
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            className="flex items-center gap-1 px-3 py-2 text-sm font-medium text-slate-500 hover:text-slate-900  bg-white border border-gray-200 rounded-md "
          >
            Next <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      

      {/* Modal */}
      {isModalOpen && (

<div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">

<div className="bg-white w-full max-w-[500px] rounded-[32px] shadow-2xl animate-in fade-in zoom-in duration-200 relative">


{/*

CLOSE BUTTON

Positioned absolute to the top-right of the modal card

*/}

<button

onClick={() => setIsModalOpen(false)}

className="absolute top-6 right-6 p-2 rounded-full hover:bg-slate-100 transition-colors z-50"

aria-label="Close modal"

>

<X className="w-6 h-6 text-slate-400 hover:text-slate-900" />

</button>



<div className="p-8">

{/* Header Icon and Title */}

<div className="flex flex-col items-center mb-6">

<div className="w-16 h-16 bg-[#F4F7FE] rounded-full flex items-center justify-center mb-4">

<svg width="30" height="30" viewBox="0 0 50 50" fill="none">

<path d="M2.5 12.5V2.5L12.5 7.5L2.5 12.5ZM40 12.5V2.5L50 7.5L40 12.5ZM22.5 10V0L32.5 5L22.5 10ZM22.5 50C19.3333 49.9167 16.3854 49.6562 13.6562 49.2188C10.9271 48.7812 8.55208 48.2292 6.53125 47.5625C4.51042 46.8958 2.91667 46.125 1.75 45.25C0.583333 44.375 0 43.4583 0 42.5V20C0 18.9583 0.65625 17.9896 1.96875 17.0938C3.28125 16.1979 5.0625 15.4062 7.3125 14.7188C9.5625 14.0312 12.2083 13.4896 15.25 13.0938C18.2917 12.6979 21.5417 12.5 25 12.5C28.4583 12.5 31.7083 12.6979 34.75 13.0938C37.7917 13.4896 40.4375 14.0312 42.6875 14.7188C44.9375 15.4062 46.7188 16.1979 48.0312 17.0938C49.3438 17.9896 50 18.9583 50 20V42.5C50 43.4583 49.4167 44.375 48.25 45.25C47.0833 46.125 45.4896 46.8958 43.4688 47.5625C41.4479 48.2292 39.0729 48.7812 36.3438 49.2188C33.6146 49.6562 30.6667 49.9167 27.5 50V40H22.5V50ZM25 22.5C29.0417 22.5 32.5312 22.2604 35.4688 21.7812C38.4062 21.3021 40.75 20.75 42.5 20.125C42.5 19.9167 40.9167 19.4271 37.75 18.6562C34.5833 17.8854 30.3333 17.5 25 17.5C19.6667 17.5 15.4167 17.8854 12.25 18.6562C9.08333 19.4271 7.5 19.9167 7.5 20.125C9.25 20.75 11.5938 21.3021 14.5312 21.7812C17.4688 22.2604 20.9583 22.5 25 22.5ZM17.5 44.625V35H32.5V44.625C35.8333 44.2917 38.5625 43.8021 40.6875 43.1562C42.8125 42.5104 44.25 41.9375 45 41.4375V24.5C42.7083 25.4167 39.8333 26.1458 36.375 26.6875C32.9167 27.2292 29.125 27.5 25 27.5C20.875 27.5 17.0833 27.2292 13.625 26.6875C10.1667 26.1458 7.29167 25.4167 5 24.5V41.4375C5.75 41.9375 7.1875 42.5104 9.3125 43.1562C11.4375 43.8021 14.1667 44.2917 17.5 44.625Z" fill="#5D5FEF"/>

</svg>

</div>

<h2 className="text-2xl font-bold text-slate-900">Create Ground</h2>

<p className="text-slate-500 text-sm mt-1">Enter Details to Create Grounds</p>

</div>



<form onSubmit={handleCreateGround} className="space-y-4">

<div>
                <label className="block text-sm font-semibold text-slate-500 mb-1.5">Ground Name</label>
                <input type="text" placeholder="Enter Ground Name" className={`w-full px-4 py-3 rounded-xl border ${errors.name ? 'border-red-500' : 'border-slate-200'} focus:border-blue-500 outline-none text-sm text-gray-500`} value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} />
                {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name}</p>}
              </div>



<div>
                <label className="block text-sm font-semibold text-slate-500 mb-1.5">Location</label>
                <input type="text" placeholder="Enter Location of Ground" className={`w-full px-4 py-3 rounded-xl border ${errors.location ? 'border-red-500' : 'border-slate-200'} focus:border-blue-500 outline-none text-sm text-gray-500`} value={formData.location} onChange={(e) => setFormData({...formData, location: e.target.value})} />
                {errors.location && <p className="text-red-500 text-xs mt-1">{errors.location}</p>}
              </div>



<div className="relative w-full">
  <label className="block text-sm font-semibold text-slate-500 mb-1.5">Pitch Type</label>
  
  {/* The Custom Trigger */}
  <div 
    onClick={() => setIsDropdownOpen(!isDropdownOpen)}
    className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-sm text-gray-400 cursor-pointer flex justify-between items-center outline-none focus:border-blue-500  transition-all"
  >
    <span>{formData.pitchType || "Select Pitch Type"}</span>
    {/* The Chevron Icon */}
    <svg 
      className={`w-4 h-4 text-gray-400 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`}
      fill="none" 
      stroke="currentColor" 
      viewBox="0 0 24 24"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
    </svg>
  </div>
  {errors.pitchType && <p className="text-red-500 text-xs mt-1">{errors.pitchType}</p>}

  {/* The Custom Options Menu */}
  {isDropdownOpen && (
    <div className="absolute left-0 w-full mt-2 bg-white border border-slate-100 rounded-xl shadow-xl z-50 py-1">
      {["Black Soil", "Red Soil", "Grass"].map((type) => (
        <div
          key={type}
          className="px-4 py-3 hover:bg-slate-50 cursor-pointer text-sm text-gray-700 transition-colors"
          onClick={() => {
            setFormData({...formData, pitchType: type});
            setIsDropdownOpen(false);
          }}
        >
          {type === "Black Soil" ? "Black Soil (Balanced)" : 
           type === "Red Soil" ? "Red Soil (Batting)" : "Grass (Bowling)"}
        </div>
      ))}
    </div>
  )}
</div>


<div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[13px] font-semibold text-slate-500 mb-1.5">Straight Boundary (m)</label>
                  <input type="text" placeholder="e.g. 70" className={`w-full px-4 py-3 rounded-xl border ${errors.straightBoundary ? 'border-red-500' : 'border-slate-200'} focus:border-blue-500 outline-none text-sm text-gray-500`} value={formData.straightBoundary} onChange={(e) => setFormData({...formData, straightBoundary: e.target.value})} />
                  {errors.straightBoundary && <p className="text-red-500 text-xs mt-1">{errors.straightBoundary}</p>}
                </div>
                <div>
                  <label className="block text-[13px] font-semibold text-slate-500 mb-1.5">Side Boundary (m)</label>
                  <input type="text" placeholder="e.g. 65" className={`w-full px-4 py-3 rounded-xl border ${errors.sideBoundary ? 'border-red-500' : 'border-slate-200'} focus:border-blue-500 outline-none text-sm text-gray-500`} value={formData.sideBoundary} onChange={(e) => setFormData({...formData, sideBoundary: e.target.value})} />
                  {errors.sideBoundary && <p className="text-red-500 text-xs mt-1">{errors.sideBoundary}</p>}
                </div>
              </div>



<button

type="submit"

className="w-full bg-[#0F1117] text-white py-4 rounded-2xl font-bold text-lg mt-4 hover:bg-slate-800 transition-all"

>

Done

</button>

</form>

</div>

</div>

</div>

)}
   
    </div>
  );
}


