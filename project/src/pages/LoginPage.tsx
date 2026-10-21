import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Truck, Mail, Lock, Building2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { Button, Input } from '@/components/ui';

export function LoginPage() {
  const navigate = useNavigate();
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    if (mode === 'signin') {
      const { error } = await signIn(email, password);
      setLoading(false);
      if (error) {
        setError(error);
      } else {
        navigate('/dashboard');
      }
    } else {
      if (!businessName.trim()) {
        setError('Business name is required');
        setLoading(false);
        return;
      }
      const { error } = await signUp(email, password, businessName);
      setLoading(false);
      if (error) {
        setError(error);
      } else {
        navigate('/dashboard');
      }
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-navy-800 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-navy-600 mb-4">
            <Truck size={32} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">Gokul Cargo Movers</h1>
          <p className="text-navy-300 text-sm mt-1">Transport Management & Accounting System</p>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <div className="flex gap-1 mb-6 bg-navy-50 p-1 rounded-lg">
            <button
              onClick={() => { setMode('signin'); setError(null); }}
              className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${mode === 'signin' ? 'bg-white text-navy-800 shadow-sm' : 'text-navy-500'}`}
            >
              Sign In
            </button>
            <button
              onClick={() => { setMode('signup'); setError(null); }}
              className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${mode === 'signup' ? 'bg-white text-navy-800 shadow-sm' : 'text-navy-500'}`}
            >
              Create Account
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'signup' && (
              <div className="relative">
                <Building2 size={18} className="absolute left-3 top-[38px] text-navy-400" />
                <Input
                  label="Business Name"
                  required
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  placeholder="Gokul Cargo Movers"
                  className="pl-10"
                />
              </div>
            )}
            <div className="relative">
              <Mail size={18} className="absolute left-3 top-[38px] text-navy-400" />
              <Input
                label="Email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="owner@gokulcargo.in"
                className="pl-10"
              />
            </div>
            <div className="relative">
              <Lock size={18} className="absolute left-3 top-[38px] text-navy-400" />
              <Input
                label="Password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="pl-10"
                minLength={6}
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <Button type="submit" loading={loading} className="w-full" size="lg">
              {mode === 'signin' ? 'Sign In' : 'Create Account'}
            </Button>
          </form>

          <p className="text-xs text-navy-400 text-center mt-6">
            {mode === 'signin'
              ? 'Only authorized users can access this system.'
              : 'Creating an account makes you the business owner.'}
          </p>
        </div>

        <p className="text-center text-navy-400 text-xs mt-6">
          Indian Transport Business ERP · INR (₹)
        </p>
      </div>
    </div>
  );
}
