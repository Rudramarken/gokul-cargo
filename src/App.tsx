import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { ensureCashAccount } from '@/hooks/useBankAccounts';
import { ToastProvider } from '@/hooks/useToast';
import { AppLayout } from '@/components/layout/AppLayout';
import { LoadingSpinner } from '@/components/ui';
import { LoginPage } from '@/pages/LoginPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { PartiesPage, PartyDetailPage } from '@/pages/PartiesPage';
import { PartyRatesPage } from '@/pages/PartyRatesPage';
import { VehiclesPage } from '@/pages/VehiclesPage';
import { DriversPage } from '@/pages/DriversPage';
import { RoutesPage } from '@/pages/RoutesPage';
import { TripsPage, TripDetailPage } from '@/pages/TripsPage';
import { LrBiltiesPage } from '@/pages/LrBiltiesPage';
import { TripExpensesPage } from '@/pages/TripExpensesPage';
import { CustomerBillingPage, BillDetailPage } from '@/pages/CustomerBillingPage';
import { PaymentsPage } from '@/pages/PaymentsPage';
import { ThirdPartyPaymentsPage } from '@/pages/ThirdPartyPaymentsPage';
import { SettlementsPage } from '@/pages/SettlementsPage';
import { LedgerPage } from '@/pages/LedgerPage';
import { OutstandingPage } from '@/pages/OutstandingPage';
import { ReportsPage } from '@/pages/ReportsPage';
import { UserManagementPage } from '@/pages/UserManagementPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { AuditLogPage } from '@/pages/AuditLogPage';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, businessId } = useAuth();
  const location = useLocation();

  useEffect(() => {
    if (businessId) ensureCashAccount(businessId);
  }, [businessId]);

  if (loading) return <div className="flex items-center justify-center min-h-screen"><LoadingSpinner size="lg" /></div>;
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;

  return <AppLayout>{children}</AppLayout>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex items-center justify-center min-h-screen"><LoadingSpinner size="lg" /></div>;
  if (user) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <ToastProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />

          <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
          <Route path="/parties" element={<ProtectedRoute><PartiesPage /></ProtectedRoute>} />
          <Route path="/parties/:partyId" element={<ProtectedRoute><PartyDetailPageWrapper /></ProtectedRoute>} />
          <Route path="/party-rates" element={<ProtectedRoute><PartyRatesPage /></ProtectedRoute>} />
          <Route path="/vehicles" element={<ProtectedRoute><VehiclesPage /></ProtectedRoute>} />
          <Route path="/drivers" element={<ProtectedRoute><DriversPage /></ProtectedRoute>} />
          <Route path="/routes" element={<ProtectedRoute><RoutesPage /></ProtectedRoute>} />
          <Route path="/trips" element={<ProtectedRoute><TripsPage /></ProtectedRoute>} />
          <Route path="/trips/:tripId" element={<ProtectedRoute><TripDetailPageWrapper /></ProtectedRoute>} />
          <Route path="/lr-bilties" element={<ProtectedRoute><LrBiltiesPage /></ProtectedRoute>} />
          <Route path="/trip-expenses" element={<ProtectedRoute><TripExpensesPage /></ProtectedRoute>} />
          <Route path="/customer-billing" element={<ProtectedRoute><CustomerBillingPage /></ProtectedRoute>} />
          <Route path="/customer-billing/:billId" element={<ProtectedRoute><BillDetailPageWrapper /></ProtectedRoute>} />
          <Route path="/payments" element={<ProtectedRoute><PaymentsPage /></ProtectedRoute>} />
          <Route path="/third-party-payments" element={<ProtectedRoute><ThirdPartyPaymentsPage /></ProtectedRoute>} />
          <Route path="/settlements" element={<ProtectedRoute><SettlementsPage /></ProtectedRoute>} />
          <Route path="/ledger" element={<ProtectedRoute><LedgerPage /></ProtectedRoute>} />
          <Route path="/outstanding" element={<ProtectedRoute><OutstandingPage /></ProtectedRoute>} />
          <Route path="/reports" element={<ProtectedRoute><ReportsPage /></ProtectedRoute>} />
          <Route path="/users" element={<ProtectedRoute><UserManagementPage /></ProtectedRoute>} />
          <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
          <Route path="/audit-log" element={<ProtectedRoute><AuditLogPage /></ProtectedRoute>} />

          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </ToastProvider>
  );
}

function TripDetailPageWrapper() {
  const location = useLocation();
  const tripId = location.pathname.split('/').pop() ?? '';
  return <TripDetailPage tripId={tripId} />;
}

function BillDetailPageWrapper() {
  const location = useLocation();
  const billId = location.pathname.split('/').pop() ?? '';
  return <BillDetailPage billId={billId} />;
}

function PartyDetailPageWrapper() {
  const location = useLocation();
  const partyId = location.pathname.split('/').pop() ?? '';
  return <PartyDetailPage partyId={partyId} />;
}
