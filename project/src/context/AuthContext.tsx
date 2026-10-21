import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { Business, BusinessMember, BusinessSettings, BusinessRole } from '@/types/database';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  business: Business | null;
  businessId: string | null;
  role: BusinessRole | null;
  settings: BusinessSettings | null;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string, businessName: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshBusiness: () => Promise<void>;
  isOwner: boolean;
  isAdmin: boolean;
  canManageUsers: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [business, setBusiness] = useState<Business | null>(null);
  const [role, setRole] = useState<BusinessRole | null>(null);
  const [settings, setSettings] = useState<BusinessSettings | null>(null);

  const loadBusinessData = useCallback(async (userId: string) => {
    const { data: member } = await supabase
      .from('business_members')
      .select('*, businesses(*)')
      .eq('user_id', userId)
      .maybeSingle();

    if (member) {
      setBusiness(member.businesses as Business);
      setRole(member.role as BusinessRole);

      const { data: settingsData } = await supabase
        .from('business_settings')
        .select('*')
        .eq('business_id', member.business_id)
        .maybeSingle();

      if (settingsData) {
        setSettings(settingsData as BusinessSettings);
      } else {
        const { data: newSettings } = await supabase
          .from('business_settings')
          .insert({
            business_id: member.business_id,
            business_name: (member.businesses as Business).business_name,
            address: (member.businesses as Business).address,
            phone: (member.businesses as Business).phone,
            email: (member.businesses as Business).email,
          })
          .select('*')
          .maybeSingle();
        if (newSettings) setSettings(newSettings as BusinessSettings);
      }
    } else {
      setBusiness(null);
      setRole(null);
      setSettings(null);
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return;
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        loadBusinessData(session.user.id).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        (async () => {
          await loadBusinessData(session.user.id);
          if (mounted) setLoading(false);
        })();
      } else {
        setBusiness(null);
        setRole(null);
        setSettings(null);
        if (mounted) setLoading(false);
      }
    });

    return () => {
      mounted = false;
      authListener.subscription.unsubscribe();
    };
  }, [loadBusinessData]);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  };

  const signUp = async (email: string, password: string, businessName: string) => {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) return { error: error.message };
    if (!data.user) return { error: 'Sign up failed. Please try again.' };

    const { data: biz, error: bizError } = await supabase
      .from('businesses')
      .insert({ business_name: businessName })
      .select('*')
      .maybeSingle();

    if (bizError || !biz) return { error: bizError?.message ?? 'Failed to create business. Please try again.' };

    const { error: memberError } = await supabase.from('business_members').insert({
      business_id: biz.id,
      user_id: data.user.id,
      role: 'owner',
    });

    if (memberError) return { error: `Failed to set up your business profile: ${memberError.message}` };

    const { error: settingsError } = await supabase.from('business_settings').insert({
      business_id: biz.id,
      business_name: businessName,
    });

    if (settingsError) {
      console.warn('business_settings insert failed:', settingsError.message);
    }

    await loadBusinessData(data.user.id);

    return { error: null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setBusiness(null);
    setRole(null);
    setSettings(null);
    setUser(null);
    setSession(null);
  };

  const refreshBusiness = async () => {
    if (user) await loadBusinessData(user.id);
  };

  const businessId = business?.id ?? null;
  const isOwner = role === 'owner';
  const isAdmin = role === 'admin' || role === 'owner';
  const canManageUsers = isOwner;

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        loading,
        business,
        businessId,
        role,
        settings,
        signIn,
        signUp,
        signOut,
        refreshBusiness,
        isOwner,
        isAdmin,
        canManageUsers,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
