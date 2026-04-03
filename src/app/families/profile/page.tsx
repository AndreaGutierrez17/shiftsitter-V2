'use client';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { AuthGuard } from '@/components/AuthGuard';

export default function MyProfilePage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) {
      router.replace(`/families/profile/${user.uid}`);
    }
  }, [user, loading, router]);

  return (
    <AuthGuard>
        <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        </div>
    </AuthGuard>
  );
}

