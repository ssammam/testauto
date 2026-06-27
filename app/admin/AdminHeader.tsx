'use client';

import { signOut } from "next-auth/react";
import { LogOut, ShieldCheck } from "lucide-react";

export default function AdminHeader({ email }: { email: string | null }) {
  return (
    <div className="flex justify-between items-center bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">Jeweler Dashboard</h1>
        <p className="text-gray-500 mt-1">Manage today's rates and calculate final prices for customers.</p>
      </div>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 bg-[#f0ece1] text-[#7c6a46] px-4 py-2 rounded-lg font-medium text-sm">
          <ShieldCheck className="w-4 h-4" />
          <span>Secure Mode</span>
        </div>
        
        {email && (
          <div className="flex items-center gap-4 border-l border-gray-200 pl-4">
            <span className="text-sm font-medium text-gray-600 hidden md:inline-block">{email}</span>
            <button 
              onClick={() => signOut({ callbackUrl: '/login' })}
              className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
              title="Sign Out"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
