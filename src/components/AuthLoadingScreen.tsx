import PinteLogo from './PinteLogo';

export default function AuthLoadingScreen() {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center font-sans">
      <div className="mb-4">
        <PinteLogo className="h-16 w-auto max-w-[120px]" variant="tile" shape="square" />
      </div>
      <div className="h-9 w-9 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
      <p className="mt-4 text-sm font-semibold text-slate-600">正在验证 StorageFoil 登录状态...</p>
    </div>
  );
}
