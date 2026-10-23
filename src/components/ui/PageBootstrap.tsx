import { Loader2 } from 'lucide-react';

type Props = {
  label: string;
  skeletonCount?: number;
};

export default function PageBootstrap({ label, skeletonCount = 4 }: Props) {
  return (
    <div className="flex flex-col gap-6 py-6">
      <div className="flex items-center justify-center gap-3 text-[var(--text-muted)]">
        <Loader2 size={24} className="animate-spin text-brand" aria-hidden />
        <p className="text-[10px] font-black uppercase tracking-widest">{label}</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {Array.from({ length: skeletonCount }, (_, i) => (
          <div
            key={i}
            className="h-32 rounded-[2rem] bg-[var(--card-bg)] border border-[var(--border-muted)] animate-pulse"
          />
        ))}
      </div>
    </div>
  );
}
