import { useState, useEffect, ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Users, Truck, UserCircle, MapPin, Package,
  FileText, Wallet, BookOpen, AlertCircle, BarChart3,
  Settings, Shield, ScrollText, LogOut, Menu, X, ChevronRight
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { cn } from '@/lib/format';

interface NavItem {
  path: string;
  label: string;
  icon: ReactNode;
  roles?: string[];
}

const navItems: NavItem[] = [
  { path: '/dashboard', label: 'Dashboard', icon: <LayoutDashboard size={18} /> },
  { path: '/parties', label: 'Parties', icon: <Users size={18} /> },
  { path: '/vehicles', label: 'Vehicles', icon: <Truck size={18} /> },
  { path: '/drivers', label: 'Drivers', icon: <UserCircle size={18} /> },
  { path: '/routes', label: 'Routes', icon: <MapPin size={18} /> },
  { path: '/trips', label: 'Trips', icon: <Package size={18} /> },
  { path: '/lr-bilties', label: 'LR / Bilty Register', icon: <FileText size={18} /> },
  { path: '/payments', label: 'Payments & Receipts', icon: <Wallet size={18} /> },
  { path: '/third-party-payments', label: 'Third-Party Payments', icon: <Users size={18} /> },
  { path: '/settlements', label: 'Truck Owner Settlements', icon: <Wallet size={18} /> },
  { path: '/ledger', label: 'Party Ledger', icon: <BookOpen size={18} /> },
  { path: '/outstanding', label: 'Outstanding Balances', icon: <AlertCircle size={18} /> },
  { path: '/reports', label: 'Reports & Analytics', icon: <BarChart3 size={18} /> },
  { path: '/users', label: 'User Management', icon: <Shield size={18} />, roles: ['owner'] },
  { path: '/settings', label: 'Business Settings', icon: <Settings size={18} />, roles: ['owner', 'admin'] },
  { path: '/audit-log', label: 'Audit Log', icon: <ScrollText size={18} />, roles: ['owner', 'admin'] },
];

export function AppLayout({ children }: { children: ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { user, business, role, signOut } = useAuth();

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  const filteredNav = navItems.filter((item) => {
    if (!item.roles) return true;
    return item.roles.includes(role ?? '');
  });

  const currentItem = filteredNav.find((item) => location.pathname.startsWith(item.path));

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-30 bg-navy-900/40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed lg:static z-40 w-64 h-full bg-navy-800 text-navy-100 flex flex-col transition-transform duration-200 no-print',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}
      >
        <div className="px-5 py-4 border-b border-navy-700 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-navy-600 flex items-center justify-center flex-shrink-0">
            <Truck size={20} className="text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="text-sm font-bold text-white truncate">{business?.business_name ?? 'Gokul Cargo'}</h1>
            <p className="text-xs text-navy-300">Transport ERP</p>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
          {filteredNav.map((item) => {
            const active = location.pathname === item.path || (item.path !== '/dashboard' && location.pathname.startsWith(item.path));
            return (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150',
                  active
                    ? 'bg-navy-600 text-white shadow-sm'
                    : 'text-navy-200 hover:bg-navy-700 hover:text-white'
                )}
              >
                <span className="flex-shrink-0">{item.icon}</span>
                <span className="truncate">{item.label}</span>
                {active && <ChevronRight size={14} className="ml-auto" />}
              </Link>
            );
          })}
        </nav>

        <div className="px-3 py-3 border-t border-navy-700">
          <div className="flex items-center gap-2 mb-2 px-2">
            <div className="w-8 h-8 rounded-full bg-navy-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
              {user?.email?.[0]?.toUpperCase() ?? 'U'}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-white truncate">{user?.email}</p>
              <p className="text-xs text-navy-300 capitalize">{role}</p>
            </div>
          </div>
          <button
            onClick={() => signOut().then(() => navigate('/login'))}
            className="flex items-center gap-2 px-3 py-2 w-full rounded-lg text-sm text-navy-200 hover:bg-navy-700 hover:text-white transition-colors"
          >
            <LogOut size={16} />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="bg-white border-b border-navy-100 px-4 lg:px-6 py-3 flex items-center justify-between no-print">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="lg:hidden p-2 rounded-lg text-navy-600 hover:bg-navy-50"
            >
              {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
            <div className="flex items-center gap-2 text-sm text-navy-400">
              <Link to="/dashboard" className="hover:text-navy-700">Home</Link>
              {currentItem && (
                <>
                  <ChevronRight size={14} />
                  <span className="text-navy-700 font-medium">{currentItem.label}</span>
                </>
              )}
            </div>
          </div>
          <div className="text-sm text-navy-500 font-medium hidden sm:block">
            {new Date().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
          </div>
        </header>

        <main className="flex-1 overflow-y-auto px-4 lg:px-6 py-6">
          <div className="max-w-7xl mx-auto animate-fade-in">{children}</div>
        </main>
      </div>
    </div>
  );
}
