"use client";

import React, { useState, useRef, useEffect } from 'react';
import { Search, Bell, ChevronDown, LogOut,  Settings, Menu, X, Trophy, MapPin, User as UserIcon ,Loader2} from 'lucide-react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import Notifications from './Notification';
import { io, Socket } from 'socket.io-client';

// Define User Interface based on your backend
interface UserData {
  name: string;
  email: string;
  profileImage?: string;
}

const Navbar: React.FC = () => {
  const [user, setUser] = useState<UserData | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false); 
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false); 
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchModalRef = useRef<HTMLDivElement>(null);
  const notificationRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const pathname = usePathname();
  const [notifications, setNotifications] = useState<any[]>([]);
const [unreadCount, setUnreadCount] = useState(0);
const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const response = await fetch(`${process.env.NEXT_PUBLIC_Backend_URL}/user/me`, {
          method: 'GET',
          credentials: 'include',
        });
        if (response.ok) {
          const data = await response.json();
          console.log("Fetched user data:", data);
          setUser(data);
        }
      } catch (error) {
        console.error("Error fetching navbar user data:", error);
      }
    };
    fetchUser();
  }, []);

  useEffect(() => {
  if (!user) return; 

  
  const fetchNotifications = async () => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_Backend_URL}/notifications`, {
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        console.log("Fetched notifications:", data);
        setNotifications(data.notifications);
        setUnreadCount(data.unreadCount);
      }
    } catch (err) {
      console.error("Failed to fetch notifications", err);
    }
  };

  fetchNotifications();

  
  socketRef.current = io(process.env.NEXT_PUBLIC_Backend_URL || "http://localhost:5701");
  
  socketRef.current.emit("join", (user as any).id);

  socketRef.current.on("new_notification", (newNote) => {
    setNotifications((prev) => [newNote, ...prev]);
    setUnreadCount((prev) => prev + 1);
  });

  return () => {
    socketRef.current?.disconnect();
  };
}, [user]);

// Function to handle reading
const handleMarkAllRead = async () => {
  await fetch(`${process.env.NEXT_PUBLIC_Backend_URL}/notifications/mark-all-read`, {
    method: 'PUT',
    credentials: 'include'
  });
  setUnreadCount(0);
};
  // Close dropdown or search modal on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
      if (isSearchOpen && searchModalRef.current && !searchModalRef.current.contains(event.target as Node)) {
        setIsSearchOpen(false);
        // Close Notifications
      if (notificationRef.current && !notificationRef.current.contains(event.target as Node)) {
        setIsNotificationsOpen(false);
      }
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isSearchOpen]);

  const handleLogout = async () => {
  try {
    //  Call the backend to clear the cookie
    const response = await fetch(`${process.env.NEXT_PUBLIC_Backend_URL}/auth/logout`, {
      method: 'POST',
      credentials: 'include', 
    });

    if (response.ok) {
      //  Clear any local storage if you used it
      localStorage.removeItem('token'); 
      

      //  Redirect to login page
      window.location.href = '/'; 
    } else {
      console.error("Logout failed on server");
    }
  } catch (error) {
    console.error("Error during logout:", error);
  }
};

  const navLinks = [
    { name: "Home", path: "/admin/dashboard" },
    { name: "Tournament", path: "/admin/tournament" },
    { name: "Grounds", path: "/admin/ground" },
    {name:"Players", path:"/admin/players"},

  ];

  const profilePic = user?.profileImage || `https://api.dicebear.com/7.x/initials/svg?seed=${user?.name || 'User'}`;
  

  return (
    <>
      <nav className="w-full bg-white border-b border-gray-100 relative z-50">
        <div className="h-20 px-6 flex items-center justify-between ">
          <div className="flex items-center gap-4 min-w-fit">
            <button 
              className="lg:hidden p-2 -ml-2 text-gray-600"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            >
              {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
            
            <Link href="/admin/dashboard" className="flex items-center gap-2">
              <div className="w-10 h-10 flex items-center justify-center">
                <img src="/Logo.png" alt="Khel.ai Logo" className="w-full h-full object-contain" />
              </div>
              <span className="text-xl font-bold text-[#0D0D12]">Khel.ai</span>
            </Link>
          </div>

          <div className="hidden lg:flex items-center gap-8 h-full">
  {navLinks.map((link) => {
    
    const isActive = link.path === "/admin/dashboard" 
      ? pathname === link.path 
      : pathname.startsWith(link.path);

    return (
      <Link key={link.name} href={link.path} className="relative h-full flex items-center group">
        <span className={`text-sm transition-colors ${
          isActive 
            ? 'text-[#0D0D12] font-semibold' 
            : 'text-gray-700 font-medium group-hover:text-gray-600'
        }`}>
          {link.name}
        </span>
        {isActive && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-black rounded-t-full" />
        )}
      </Link>
    );
  })}
</div>

          <div className="flex items-center md:gap-4 gap-1">
            {/* Search Icon Button replaces the Input */}
            {/* <button 
              onClick={() => setIsSearchOpen(true)}
              className="p-2 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors shadow-xs"
            >
              <Search size={18} className="text-gray-600" />
            </button> */}

            {/* Bell Icon Trigger */}
<div className="relative" ref={notificationRef}>
  <button 
    className='p-2 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors relative shadow-xs' 
    onClick={() => {
      setIsNotificationsOpen(!isNotificationsOpen);
      if (!isNotificationsOpen && unreadCount > 0) handleMarkAllRead();
    }}
  >
    <Bell size={18} className="text-gray-600"/>
    {unreadCount > 0 && (
      <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] w-4 h-4 flex items-center justify-center rounded-full">
        {unreadCount}
      </span>
    )}
  </button>

  {isNotificationsOpen && (
    <div className="absolute right-0 mt-3 w-[400px] bg-white rounded-[32px] shadow-2xl border border-gray-100 overflow-hidden z-[60] animate-in fade-in slide-in-from-top-2 duration-200">
      {/* Pass the data directly */}
      <Notifications 
        notifications={notifications} 
        onClose={() => setIsNotificationsOpen(false)} 
      />
    </div>
  )}
</div>

            <div className="h-8 w-[1px] bg-gray-200 mx-2" />

            <div className="relative" ref={dropdownRef}>
              <div className="flex items-center gap-3 cursor-pointer group" onClick={() => setIsOpen(!isOpen)}>
                <div className="w-10 h-10 rounded-full overflow-hidden border border-gray-100">
                  {user ? (
                    <img src={profilePic} alt="Avatar" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center"><Loader2 size={16} className="animate-spin text-gray-300"/></div>
                  )}
                </div>
                <div className="hidden sm:block text-left">
                    <p className="text-sm font-bold text-[#0D0D12] leading-tight">{user?.name || 'Loading...'}</p>
                    <p className="text-[11px] text-gray-700 truncate max-w-[120px]">{user?.email || 'Please wait'}</p>
                </div>
                <ChevronDown size={16} className={`text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
              </div>

              {isOpen && (
                <div className="absolute right-0 mt-4 w-48 bg-white rounded-2xl shadow-xl border border-gray-100 py-2 z-[60]">
                  <Link href="/admin/setting">
                    <button className="w-full px-4 py-2.5 text-left text-sm text-gray-900 hover:bg-gray-50 flex items-center gap-2 transition-colors">
                      <Settings size={16} className="text-gray-900" /> Settings 
                    </button>
                  </Link>
                  <div className="h-[1px] bg-gray-100 my-1 mx-2" />
                  <button onClick={handleLogout} className="w-full px-4 py-2.5 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2 transition-colors font-medium">
                    <LogOut size={16} /> Logout 
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </nav>
      {/* MOBILE MENU OVERLAY */}
    
      <div className={`fixed inset-0 z-[100] lg:hidden transition-opacity duration-300 ${isMobileMenuOpen ? "opacity-100 visible" : "opacity-0 invisible"}`}>
        {/* Backdrop */}
        <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={() => setIsMobileMenuOpen(false)} />
        
        {/* Sidebar Panel */}
        <aside className={`absolute left-0 top-0 bottom-0 w-[280px] bg-white shadow-2xl transition-transform duration-300 ease-in-out ${isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"}`}>
          <div className="p-6 flex flex-col h-full">
            {/* Logo & Close Button */}
            <div className="flex items-center justify-between mb-8">
              <Link href="/home" className="flex items-center gap-2" onClick={() => setIsMobileMenuOpen(false)}>
                <img src="/Logo.png" alt="Logo" className="w-8 h-8 object-contain" />
                <span className="text-lg font-bold text-black">Khel.ai</span>
              </Link>
              <button onClick={() => setIsMobileMenuOpen(false)} className="p-2 text-gray-400">
                <X size={24} />
              </button>
            </div>

            {/* Navigation Links */}
            <div className="flex flex-col gap-2">
              {/* Inside Mobile Navigation Links */}
{navLinks.map((link) => {
  const isActive = link.path === "/admin/dashboard" 
    ? pathname === link.path 
    : pathname.startsWith(link.path);

  return (
    <Link 
      key={link.name} 
      href={link.path} 
      onClick={() => setIsMobileMenuOpen(false)}
      className={`px-4 py-3 rounded-xl text-sm font-semibold transition-colors ${
        isActive 
        ? 'bg-gray-900 text-white' 
        : 'text-gray-500 hover:bg-gray-50'
      }`}
    >
      {link.name}
    </Link>
  );
})}
            </div>

            {/* Bottom Section (User Info) */}
            <div className="mt-auto pt-6 border-t border-gray-100">
              <div className="flex items-center gap-3 mb-6">
                <img src={profilePic} className="w-10 h-10 rounded-full border bg-gray-50" alt="User" />
                <div>
                  <p className="text-sm font-bold text-black">{user?.name || 'Loading...'}</p>
                  <p className="text-[11px] text-gray-400">{user?.email || 'Loading...'}</p>
                </div>
              </div>
              <button 
                onClick={handleLogout}
                className="w-full flex items-center gap-2 px-4 py-3 text-red-600 font-bold text-sm bg-red-50 rounded-xl"
              >
                <LogOut size={18} /> Logout all 
              </button>
            </div>
          </div>
        </aside>
      </div>

      
      {/* Search Section */}
<div className="relative" ref={searchModalRef}>
  

  {/* SEARCH MODAL (Dropdown Style)  */}
  {isSearchOpen && (
    <div className="absolute right-0 mt-3 w-[80vw] md:w-[600px] lg:w-[800px] bg-white rounded-3xl shadow-xs border border-gray-100 overflow-hidden z-[100] animate-in fade-in slide-in-from-top-2 duration-200">
      
      {/* Modal Header/Input */}
      <div className="p-5 border-b border-gray-100">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
          <input 
            autoFocus
            type="text" 
            placeholder="Search for tournaments, players or grounds..."
            className="w-full pl-11 pr-4 py-3  border border-gray-200 rounded-2xl outline-none transition-all text-sm text-gray-800"
          />
        </div>
      </div>

      {/* Modal Body */}
      <div className="p-5 space-y-6 max-h-[70vh] overflow-y-auto">
        {/* Search For Tags */}
        <section>
          <h3 className="text-[12px] uppercase tracking-wider  font-semibold text-gray-900 mb-3">Search for</h3>
          <div className="flex flex-wrap gap-2">
            {['ICC Men\'s T20 World cup', 'ICC Men\'s Test Championship', 'IPL'].map((tag) => (
              <div key={tag} className="flex items-center gap-2 px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-semibold text-gray-700 hover:bg-gray-50 cursor-pointer transition-colors">
                {tag} <X size={14} className="text-gray-400 hover:text-red-500" />
              </div>
            ))}
            <button className="px-3 py-1.5 border border-dashed border-gray-300 rounded-lg text-xs font-bold text-gray-900 hover:border-gray-400 transition-colors">
              + Add New
            </button>
          </div>
        </section>

        {/* Recent Searches */}
        <section>
          <h3 className="text-[12px] uppercase tracking-wider font-semibold  text-gray-900 mb-3">Recent searches</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {/* Wankhede */}
            <div className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 hover:bg-gray-100 cursor-pointer transition-all border border-transparent hover:border-gray-200">
              
                <Trophy size={18} className="text-gray-400" />
              
              <div>
                <p className="text-xs text-[#0D0D12]">Wankhede Stadium</p>
                <p className="text-[11px] text-gray-400 flex items-center gap-1"><MapPin size={10}/> Mumbai</p>
              </div>
            </div>

            {/* IPL */}
            <div className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 hover:bg-gray-100 cursor-pointer transition-all border border-transparent hover:border-gray-200">
              
                <Trophy size={18} className="text-gray-400" />
              
              <div>
                <p className="text-xs text-[#0D0D12]">Indian Premier League</p>
                <p className="text-[11px] text-gray-400 flex items-center gap-1"><MapPin size={10}/> India</p>
              </div>
            </div>

            {/* Kohli */}
            <div className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 hover:bg-gray-100 cursor-pointer transition-all border border-transparent hover:border-gray-200">
              
                <UserIcon size={18} className="text-gray-400" />
              
              <div>
                <p className="text-xs text-[#0D0D12]">Virat Kohli</p>
                <p className="text-[11px] text-gray-400">Batter</p>
              </div>
            </div>

            {/* Bumrah */}
            <div className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 hover:bg-gray-100 cursor-pointer transition-all border border-transparent hover:border-gray-200">
              
                <UserIcon size={18} className="text-gray-400" />
              
              <div>
                <p className="text-xs text-[#0D0D12]">Jasprit Bumrah</p>
                <p className="text-[11px] text-gray-400">Bowler</p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  )}
</div>
    </>
  );
};

export default Navbar;