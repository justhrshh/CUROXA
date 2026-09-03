import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { usePortalBranding } from '../context/PortalBrandingContext';
import Login from './Login';
import { AlertTriangle, ShieldAlert, ArrowLeft, RefreshCw } from 'lucide-react';
import curoxaLogo from '../assets/curoxa_logo_transparent.png';

const HospitalPortal = () => {
  const { hospitalId } = useParams();
  const { hospital, loading, error } = usePortalBranding();

  if (loading) {
    return (
      <div className="min-h-screen w-full flex flex-col items-center justify-center bg-slate-50 p-4">
        <div className="flex flex-col items-center max-w-sm text-center">
          <div className="w-14 h-14 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center mb-4 shadow-sm">
            <RefreshCw className="w-7 h-7 text-blue-600 animate-spin" />
          </div>
          <h2 className="text-xl font-bold text-slate-800 tracking-tight mb-1">
            Loading Hospital Portal
          </h2>
          <p className="text-sm text-slate-500 font-mono">
            Resolving {hospitalId ? hospitalId.toUpperCase() : 'portal'}...
          </p>
        </div>
      </div>
    );
  }

  if (error === 'network_error') {
    return (
      <div className="min-h-screen w-full flex flex-col items-center justify-center bg-slate-50 p-4">
        <div className="w-full max-w-md bg-white rounded-3xl border border-slate-200 shadow-xl p-8 text-center animate-fadeIn">
          <div className="w-16 h-16 rounded-2xl bg-red-50 border border-red-200 text-red-500 flex items-center justify-center mx-auto mb-5 shadow-sm">
            <RefreshCw className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight mb-2">
            Connection Error
          </h1>
          <p className="text-sm text-slate-600 mb-6 leading-relaxed">
            Unable to reach the hospital portal server. Please check your connection and try again.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="w-full h-12 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-md shadow-blue-500/20 transition"
          >
            <RefreshCw className="w-4 h-4" />
            Retry
          </button>
          <div className="mt-8 pt-6 border-t border-slate-100 flex items-center justify-center gap-2">
            <img src={curoxaLogo} alt="Curoxa" className="h-6 w-auto opacity-70" />
            <span className="text-xs text-slate-400 font-medium">Healthcare Cloud Platform</span>
          </div>
        </div>
      </div>
    );
  }

  if (error === 'not_found' || (!hospital && !loading)) {
    return (
      <div className="min-h-screen w-full flex flex-col items-center justify-center bg-slate-50 p-4">
        <div className="w-full max-w-md bg-white rounded-3xl border border-slate-200 shadow-xl p-8 text-center animate-fadeIn">
          <div className="w-16 h-16 rounded-2xl bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center mx-auto mb-5 shadow-sm">
            <AlertTriangle className="w-8 h-8" />
          </div>

          <h1 className="text-2xl font-black text-slate-900 tracking-tight mb-2">
            Hospital Portal Not Found
          </h1>

          <p className="text-sm text-slate-600 mb-6 leading-relaxed">
            The hospital identifier <span className="font-mono font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">{hospitalId || 'UNKNOWN'}</span> does not exist or may have been decommissioned.
          </p>

          <div className="space-y-3">
            <Link
              to="/login"
              className="w-full h-12 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-md shadow-blue-500/20 transition"
            >
              <ArrowLeft className="w-4 h-4" />
              Return to Curoxa Login
            </Link>
          </div>

          <div className="mt-8 pt-6 border-t border-slate-100 flex items-center justify-center gap-2">
            <img src={curoxaLogo} alt="Curoxa" className="h-6 w-auto opacity-70" />
            <span className="text-xs text-slate-400 font-medium">Healthcare Cloud Platform</span>
          </div>
        </div>
      </div>
    );
  }

  if (error === 'suspended' || hospital?.status === 'Suspended') {
    return (
      <div className="min-h-screen w-full flex flex-col items-center justify-center bg-slate-50 p-4">
        <div className="w-full max-w-md bg-white rounded-3xl border border-red-200 shadow-xl p-8 text-center animate-fadeIn">
          <div className="w-16 h-16 rounded-2xl bg-red-50 border border-red-200 text-red-600 flex items-center justify-center mx-auto mb-5 shadow-sm">
            <ShieldAlert className="w-8 h-8" />
          </div>

          <h1 className="text-2xl font-black text-slate-900 tracking-tight mb-2">
            Portal Suspended
          </h1>

          <p className="text-sm text-slate-600 mb-6 leading-relaxed">
            Access to <strong className="text-slate-900">{hospital?.name || 'this hospital portal'}</strong> has been temporarily suspended. Please contact your hospital administrator or Curoxa platform support.
          </p>

          <Link
            to="/login"
            className="w-full h-12 rounded-xl bg-slate-800 hover:bg-slate-900 text-white font-bold text-sm flex items-center justify-center gap-2 transition"
          >
            <ArrowLeft className="w-4 h-4" />
            Go to Platform Login
          </Link>
        </div>
      </div>
    );
  }

  // Active hospital portal: render Login with portal branding context
  return <Login isPortal={true} />;
};

export default HospitalPortal;
