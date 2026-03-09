'use client';

import { ChevronLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';

type AppBackButtonProps = {
  fallbackHref: string;
  label?: string;
  className?: string;
};

export default function AppBackButton({
  fallbackHref,
  label = 'Back',
  className = '',
}: AppBackButtonProps) {
  const router = useRouter();

  const handleBack = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
      return;
    }
    router.push(fallbackHref);
  };

  return (
    <button
      type="button"
      onClick={handleBack}
      className={`inline-flex items-center gap-2 rounded-full border border-border bg-white px-4 py-2 text-sm font-medium text-foreground shadow-sm transition hover:bg-accent ${className}`.trim()}
    >
      <ChevronLeft className="h-4 w-4" />
      {label}
    </button>
  );
}
