import React, { useState, useEffect } from 'react';
import { Pencil, Trash2, X, AlertCircle, UserCog, ChevronLeft, ChevronRight } from 'lucide-react';

interface Operator {
  id: string;
  name: string;
  email: string;
  avatar?: string;
}

export const Operators = () => {
  const [operators, setOperators] = useState<Operator[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Modal States
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedOperator, setSelectedOperator] = useState<Operator | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Form & Error States
  const [formData, setFormData] = useState({ name: '', email: '' });
  const [errors, setErrors] = useState({ name: '', email: '' });

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const fetchOperators = async () => {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_Backend_URL}/user/operators`, { credentials: "include" });
      const result = await response.json();
      if (result.success) setOperators(result.data);
    } catch (err) {
      console.error("Failed to fetch operators", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchOperators(); }, []);

  // Pagination Logic
  const totalPages = Math.ceil(operators.length / itemsPerPage);
  const indexOfLast = currentPage * itemsPerPage;
  const indexOfFirst = indexOfLast - itemsPerPage;
  const currentOperators = operators.slice(indexOfFirst, indexOfLast);

  const paginate = (pageNumber: number) => {
    if (pageNumber >= 1 && pageNumber <= totalPages) {
      setCurrentPage(pageNumber);
    }
  };

  const validateForm = () => {
    let isValid = true;
    const newErrors = { name: '', email: '' };

    if (!formData.name.trim()) {
      newErrors.name = "Operator name is required";
      isValid = false;
    } else if (!/^[A-Za-z\s]+$/.test(formData.name)) {
      newErrors.name = "Only alphabets and spaces allowed";
      isValid = false;
    }

    if (!formData.email.trim()) {
      newErrors.email = "Email is required";
      isValid = false;
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = "Please enter a valid email address";
      isValid = false;
    }

    setErrors(newErrors);
    return isValid;
  };

  const handleUpdate = async () => {
    if (!selectedOperator || !validateForm()) return;
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_Backend_URL}/user/operators/${selectedOperator.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
        credentials: 'include'
      });
      if (response.ok) {
        fetchOperators();
        setIsEditModalOpen(false);
      }
    } catch (err) {
      console.error("Update failed", err);
    }
  };

  const handleDelete = async () => {
    if (!selectedOperator) return;
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_Backend_URL}/user/operators/${selectedOperator.id}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      if (response.ok) {
        fetchOperators();
        setIsDeleteModalOpen(false);
        // Adjust page if current page becomes empty after delete
        if (currentOperators.length === 1 && currentPage > 1) setCurrentPage(currentPage - 1);
      } else {
        // e.g. 409 when the operator has created tournaments, grounds or matches
        const data = await response.json().catch(() => null);
        setDeleteError(data?.message || "Could not delete this operator.");
      }
    } catch (err) {
      console.error("Delete failed", err);
      setDeleteError("Could not delete this operator.");
    }
  };

  const openEdit = (op: Operator) => {
    setSelectedOperator(op);
    setFormData({ name: op.name, email: op.email });
    setErrors({ name: '', email: '' });
    setIsEditModalOpen(true);
  };

  if (loading) return <div className="p-8 text-center">Loading...</div>;

  return (
    <div className="w-full bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden relative">
      <div className="p-6 border-b border-gray-100">
        <h1 className="text-xl font-bold text-gray-900">Operators Settings</h1>
        <p className="text-sm text-gray-500 mt-1">Control how Operators behave in your system</p>
      </div>

      {/* Responsive Table Wrapper with Horizontal Scroll */}
      <div className="overflow-x-auto w-full">
        <div className="min-w-[600px]"> 
          <div className="grid grid-cols-12 px-6 py-4 bg-gray-50 text-xs font-semibold text-gray-600 uppercase tracking-wider">
            <div className="col-span-5">Name</div>
            <div className="col-span-4">Email</div>
            <div className="col-span-2 text-center">Edit</div>
            <div className="col-span-1 text-center">Remove</div>
          </div>

          <div className="divide-y divide-gray-100">
            {currentOperators.map((op) => (
              <div key={op.id} className="grid grid-cols-12 px-6 py-4 items-center hover:bg-gray-50/50">
                <div className="col-span-5 flex items-center gap-3 truncate">
                  <img src={op.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${op.name}`} alt={op.name} className="w-8 h-8 rounded-full bg-gray-200 flex-shrink-0" />
                  <span className="font-medium text-gray-900 text-sm">{op.name}</span>
                </div>
                <div className="col-span-4 text-gray-500 text-sm truncate pr-2">{op.email}</div>
                <div className="col-span-2 flex justify-center">
                  <button onClick={() => openEdit(op)} className="text-gray-400 hover:text-blue-600"><Pencil size={18} /></button>
                </div>
                <div className="col-span-1 flex justify-center">
                  <button onClick={() => { setSelectedOperator(op); setDeleteError(null); setIsDeleteModalOpen(true); }} className="text-gray-400 hover:text-red-600"><Trash2 size={18} /></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-8 pt-6 pb-6 px-6 border-t border-gray-50">
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
            
            <div className="hidden md:flex items-center gap-1">
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
      )}

      {/* Edit Modal */}
      {isEditModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-gray-100 rounded-2xl pb-2 w-full max-w-md">
            <div className="bg-white rounded-2xl p-8 w-full shadow-lg text-center relative -top-2">
              <button onClick={() => setIsEditModalOpen(false)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"><X size={24} /></button>
              
              <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <UserCog size={32} />
              </div>
              
              <h2 className="text-xl font-bold mb-6 text-black">Edit Operator's Details</h2>
              
              <div className="text-left space-y-4 mb-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Operator Name</label>
                  <input 
                    type="text" value={formData.name} 
                    onChange={(e) => setFormData({...formData, name: e.target.value})} 
                    className={`w-full p-3 border rounded-lg text-sm  text-gray-700 ${errors.name ? 'border-red-500' : 'border-gray-200'} focus:outline-none focus:ring-2 focus:ring-blue-500`}
                  />
                  {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name}</p>}
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
                  <input 
                    type="email" value={formData.email} 
                    onChange={(e) => setFormData({...formData, email: e.target.value})} 
                    className={`w-full p-3 border rounded-lg text-sm text-gray-700  ${errors.email ? 'border-red-500' : 'border-gray-200'} focus:outline-none focus:ring-2 focus:ring-blue-500`}
                  />
                  {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email}</p>}
                </div>
              </div>
              
              <button onClick={handleUpdate} className="w-full bg-black text-white py-3 rounded-xl font-semibold hover:bg-gray-800 transition-colors">Done</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Modal */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-sm pb-3 bg-gray-50 rounded-2xl">
            <div className="bg-white rounded-2xl p-8 w-full max-w-sm shadow-xl text-center">
              <div className="w-16 h-16 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertCircle size={32} />
              </div>
              <h2 className="text-xl font-bold mb-2 text-black">Remove Operator</h2>
              <p className="text-gray-500 mb-8 text-sm">Are you sure you want to delete this Operator?</p>
              {deleteError && <p className="text-red-500 text-sm font-medium -mt-4 mb-6">{deleteError}</p>}
              <div className="flex gap-4">
                <button onClick={() => setIsDeleteModalOpen(false)} className="flex-1 border border-gray-200 py-3 rounded-xl font-semibold hover:bg-gray-50 text-gray-900">Cancel</button>
                <button onClick={handleDelete} className="flex-1 bg-black text-white py-3 rounded-xl font-semibold hover:bg-gray-800">Remove</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};