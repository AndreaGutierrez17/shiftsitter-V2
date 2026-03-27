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
      className={`inline-flex items-center justify-center rounded-full border border-border bg-white p-2.5 text-foreground shadow-sm transition hover:bg-accent ${className}`.trim()}
    >
      <ChevronLeft className="h-4 w-4" />
    </button>
  );
}
