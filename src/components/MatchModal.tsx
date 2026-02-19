'use client';

import Link from 'next/link';
import { HeartHandshake, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
} from '@/components/ui/alert-dialog';
import type { UserProfile } from '@/lib/types';

type MatchModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentUser: UserProfile | null;
  matchedUser: UserProfile | null;
  conversationId: string | null;
};

export default function MatchModal({
  open,
  onOpenChange,
  currentUser,
  matchedUser,
  conversationId,
}: MatchModalProps) {
  if (!currentUser || !matchedUser || !conversationId) return null;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="w-[92vw] max-w-md rounded-3xl border border-[#d7d9f0] bg-white p-0 shadow-2xl">
        <div className="rounded-t-3xl border-b border-[#e4e6f5] bg-gradient-to-r from-[#f4f0ff] to-[#eef8ff] px-6 py-5">
          <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-white/80 px-3 py-1 text-xs font-semibold text-[#334155]">
            <HeartHandshake className="h-4 w-4 text-[#7c78f2]" />
            Childcare Connection
          </div>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-center text-3xl font-bold text-[#1e2a4a]">
              Great Match!
            </AlertDialogTitle>
            <AlertDialogDescription className="text-center text-base text-[#4b5b7d]">
              You and {matchedUser.name} are a good childcare fit based on your schedules and family needs.
            </AlertDialogDescription>
          </AlertDialogHeader>
        </div>
        <div className="px-6 pb-6 pt-5">
        <div className="my-3 flex items-center justify-center gap-4">
          <Avatar className="h-16 w-16 border-2 border-primary/40 shadow-sm">
            <AvatarImage src={currentUser.photoURLs?.[0]} />
            <AvatarFallback>{currentUser.name?.charAt(0)}</AvatarFallback>
          </Avatar>
          <Avatar className="h-16 w-16 border-2 border-secondary shadow-sm">
            <AvatarImage src={matchedUser.photoURLs?.[0]} />
            <AvatarFallback>{matchedUser.name?.charAt(0)}</AvatarFallback>
          </Avatar>
        </div>
        <div className="mt-4 flex flex-col gap-3">
          <Button asChild size="lg" className="rounded-full bg-[#2fc4b6] text-white hover:bg-[#27b0a5]">
            <Link href={`/families/messages/${conversationId}`}>
              <MessageCircle className="mr-2 h-4 w-4" /> Start chat
            </Link>
          </Button>
          <Button
            variant="outline"
            size="lg"
            className="rounded-full border-[#ccd2e8] text-[#2f3e63]"
            onClick={() => onOpenChange(false)}
          >
            Keep browsing
          </Button>
        </div>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
