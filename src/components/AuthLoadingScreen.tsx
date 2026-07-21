import { Database } from 'lucide-react';

export default function AuthLoadingScreen() {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center font-sans">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-md shadow-emerald-500/15">
        <Database className="h-5 w-5" />
      </div>
      <div className="h-9 w-9 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
      <p className="mt-4 text-sm font-semibold text-slate-600">正在验证 StorageFoil 登录状态...</p>
    </div>
  );
}
