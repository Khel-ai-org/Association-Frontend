'use client';

import React, { useState, useEffect } from 'react';
import { SettingsSidebar } from './SettingSidebar';
import { AccountPage } from './Account';
import { ChevronLeft } from 'lucide-react';
import { AssociationPage } from './Association';
import { NotificationSettingPage } from './Notification';
import { GroundPage } from './Ground';
import { AnalyticsPage } from './Analytics';
import { PrivacyDataPage } from './Privacy';
import { Operators } from './Operators';

// Tabs only an Admin should see — grounds and operator management belong to
// the association itself, not to individual staff (operator/referee/...).
const ADMIN_ONLY_TABS = ['Grounds', 'Operators'];

export const Setting = () => {
  const [activeTab, setActiveTab] = useState('Accounts');
  const [view, setView] = useState<'menu' | 'detail'>('detail');
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    const fetchRole = async () => {
      try {
        const response = await fetch(`${process.env.NEXT_PUBLIC_Backend_URL}/user/me`, {
          method: 'GET',
          credentials: 'include',
        });
        if (response.ok) {
          const data = await response.json();
          setRole((data.role || '').toLowerCase());
        }
      } catch (error) {
        console.error('Failed to load role:', error);
      }
    };
    fetchRole();
  }, []);

  const isAdmin = role === 'admin';

  // If a non-admin somehow lands on an admin-only tab (e.g. role resolves
  // after the sidebar already rendered it), fall back to Accounts — derived
  // at render time rather than a setState-in-effect bounce.
  const effectiveTab = role !== null && !isAdmin && ADMIN_ONLY_TABS.includes(activeTab) ? 'Accounts' : activeTab;

  const handleTabChange = (id: string) => {
    setActiveTab(id);
    setView('detail');
  };

  const renderContent = () => {
    switch (effectiveTab) {
      case 'Accounts':
        return <AccountPage />;
        case 'Association':
            return <AssociationPage/>;
            case 'Notifications':
                return <NotificationSettingPage/>;
                case 'Grounds':
                    return <GroundPage/>;
                    case 'Operators':
                      return <Operators/>;
                    case 'Analytics':
                        return <AnalyticsPage/>;
                        case 'Privacy':
                            return <PrivacyDataPage/>;
      default:
        return (
          <div className="flex-1 bg-white p-8 flex flex-col items-center justify-center text-center h-full">
            <h2 className="text-xl font-bold text-gray-900">{activeTab}</h2>
            <p className="text-gray-400">This section is coming soon.</p>
          </div>
        );
    }
  };

  return (
    <div className="flex h-screen w-full  md:bg-[#FAFAFA] overflow-hidden">
      {/* SIDEBAR */}
      {/* On mobile: visible only if view is 'menu' */}
      <div className={`
        ${view === 'detail' ? 'hidden' : 'flex'} 
        md:flex w-full md:w-[380px] flex-none border-r border-gray-100 
      `}>
        <SettingsSidebar activeTab={effectiveTab} setActiveTab={handleTabChange} isAdmin={isAdmin} />
      </div>

      {/* CONTENT AREA */}
      {/* On mobile: visible only if view is 'detail' */}
      <div className={`
        ${view === 'menu' ? 'hidden' : 'flex'} 
        flex-1 flex flex-col min-w-0 bg-white md:bg-[#FAFAFA]
      `}>
        
        {/* MOBILE HEADER: Show "Back" button to return to the menu */}
        <div className="md:hidden flex items-center justify-between px-4 py-4 bg-white border-b border-gray-100">
          <button 
            onClick={() => setView('menu')}
            className="flex items-center gap-2 text-sm font-bold text-gray-900"
          >
            <ChevronLeft size={20} />
            Settings
          </button>
          <span className="text-xs font-black uppercase tracking-widest text-gray-400">
            {effectiveTab}
          </span>
        </div>

        <div className="flex-1 overflow-y-auto p-4 md:p-2 ">
          <div className="max-w-4xl mx-auto">
             {renderContent()}
          </div>
        </div>
      </div>
    </div>
  );
};