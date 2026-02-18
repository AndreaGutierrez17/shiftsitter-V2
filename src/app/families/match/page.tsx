'use client'

import { useState, useEffect, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Heart, X, RotateCcw, MessageCircle, Info, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useAuth } from '@/hooks/useAuth';
import { UserProfile } from '@/lib/types';
import { db } from '@/lib/firebase/client';
import { collection, query, where, getDocs, doc, setDoc, addDoc, serverTimestamp, getDoc, deleteDoc, onSnapshot, limit } from 'firebase/firestore';
import Image from 'next/image';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import Link from 'next/link';
import { AuthGuard } from '@/components/AuthGuard';

const SwipeCard = ({ userProfile, onSwipe }: { userProfile: UserProfile, onSwipe: (id: string, direction: 'left' | 'right') => void }) => {
  return (
    <motion.div
      key={userProfile.id}
      drag="x"
      dragConstraints={{ left: 0, right: 0 }}
      onDragEnd={(e, { offset, velocity }) => {
        const swipe = Math.abs(offset.x) * velocity.x;
        if (swipe < -10000) {
          onSwipe(userProfile.id, 'left');
        } else if (swipe > 10000) {
          onSwipe(userProfile.id, 'right');
        }
      }}
      animate={{ x: 0, opacity: 1, scale: 1 }}
      exit={{ x: 300, opacity: 0, scale: 0.8 }}
      transition={{ ease: "easeInOut" }}
      className="absolute w-full h-full"
    >
      <Card className="relative w-full h-full rounded-2xl overflow-hidden shadow-lg">
        <Image 
          src={userProfile.photoURLs[0] || `https://picsum.photos/seed/${userProfile.id}/600/800`}
          alt={userProfile.name || 'Profile picture'} 
          fill 
          className="object-cover"
          data-ai-hint="person portrait"
        />
        <div className="absolute bottom-0 left-0 w-full h-2/5 bg-gradient-to-t from-black/90 to-transparent p-6 flex flex-col justify-end">
            <div className="flex justify-between items-end">
                <div>
                    <h2 className="text-3xl font-bold text-white font-headline">{userProfile.name}, {userProfile.age}</h2>
                    <p className="text-white/90 flex items-center gap-2"><MapPin size={16}/> {userProfile.location}</p>
                </div>
                 <Link href={`/families/profile/${userProfile.id}`} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
                    <Button variant="secondary" size="icon"><Info className="h-5 w-5"/></Button>
                </Link>
            </div>
            <p className="text-white/90 mt-2 line-clamp-2">{userProfile.needs || userProfile.workplace}</p>
        </div>
      </Card>
    </motion.div>
  );
};

const MatchModal = ({ open, onOpenChange, currentUser, matchedUser, conversationId }: { open: boolean, onOpenChange: (open: boolean) => void, currentUser: UserProfile | null, matchedUser: UserProfile | null, conversationId: string | null }) => {
    if (!currentUser || !matchedUser) return null;

    return (
        <AlertDialog open={open} onOpenChange={onOpenChange}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle className="text-center font-headline text-3xl">It's a Match!</AlertDialogTitle>
                    <AlertDialogDescription className="text-center text-base">
                        You and {matchedUser.name} liked each other!
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <div className="flex justify-center items-center gap-4 my-4">
                    <Avatar className="h-24 w-24 border-4 border-primary shadow-lg">
                        <AvatarImage src={currentUser.photoURLs[0]} />
                        <AvatarFallback>{currentUser.name?.charAt(0)}</AvatarFallback>
                    </Avatar>
                    <Avatar className="h-24 w-24 border-4 border-secondary shadow-lg">
                         <AvatarImage src={matchedUser.photoURLs[0]} />
                        <AvatarFallback>{matchedUser.name?.charAt(0)}</AvatarFallback>
                    </Avatar>
                </div>
                <div className="flex flex-col gap-4">
                    <Button asChild size="lg">
                        <Link href={`/families/messages/${conversationId}`}>
                            <MessageCircle className="mr-2" /> Send a Message
                        </Link>
                    </Button>
                    <Button variant="outline" size="lg" onClick={() => onOpenChange(false)}>
                        Keep Swiping
                    </Button>
                </div>
            </AlertDialogContent>
        </AlertDialog>
    );
};


export default function MatchPage() {
  const { user, loading: authLoading } = useAuth();
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSwiping, setIsSwiping] = useState(false);
  const [showMatchModal, setShowMatchModal] = useState(false);
  const [lastMatch, setLastMatch] = useState<{matchedUser: UserProfile, conversationId: string} | null>(null);
  const [currentUserProfile, setCurrentUserProfile] = useState<UserProfile | null>(null);
  const [noProfilesMessage, setNoProfilesMessage] = useState<{title: string, description: string} | null>(null);
  const [lastSwiped, setLastSwiped] = useState<{ profile: UserProfile, direction: 'left' | 'right' } | null>(null);

  useEffect(() => {
    if (!user) return;

    const unsubProfile = onSnapshot(doc(db, "users", user.uid), (doc) => {
        if (doc.exists()) {
            setCurrentUserProfile(doc.data() as UserProfile);
        }
    });

    return () => unsubProfile();
  }, [user]);

  useEffect(() => {
    if (!user || !currentUserProfile?.profileComplete) return;

    const fetchProfiles = async () => {
      setLoading(true);
      setNoProfilesMessage(null);
      
      const mySwipesQuery = query(collection(db, 'swipes'), where('swiperId', '==', user.uid));
      const swipesSnapshot = await getDocs(mySwipesQuery);
      const swipedUserIds = swipesSnapshot.docs.map(doc => doc.data().swipedId);
      swipedUserIds.push(user.uid); // Also exclude self

      let roleToShow: 'parent' | 'sitter' | 'reciprocal';
      if (currentUserProfile.role === 'parent') {
          roleToShow = 'sitter';
      } else if (currentUserProfile.role === 'sitter') {
          roleToShow = 'parent';
      } else {
          roleToShow = 'reciprocal';
      }

      let usersQuery;
      // Firestore 'not-in' queries are limited to 30 elements. 
      // If you expect more swipes, this logic needs pagination or a different approach.
      const queryableSwipedIds = swipedUserIds.length > 0 ? swipedUserIds.slice(0, 30) : [' ']; // 'not-in' requires a non-empty array

       usersQuery = query(
          collection(db, 'users'),
          where('profileComplete', '==', true),
          where('role', '==', roleToShow),
          where('id', 'not-in', queryableSwipedIds),
          limit(10)
      );
      
      try {
        const usersSnapshot = await getDocs(usersQuery);
        const fetchedProfiles = usersSnapshot.docs.map(doc => doc.data() as UserProfile);

        if (fetchedProfiles.length === 0) {
            setNoProfilesMessage({
                title: "No more profiles for now",
                description: "You've seen everyone available that matches your role. Check back later for new people!"
            });
        }
        
        setProfiles(fetchedProfiles);
      } catch (error) {
          console.error("Error fetching profiles. This might be a Firestore index issue.", error);
          setNoProfilesMessage({
              title: "Error loading profiles",
              description: "We couldn't load new profiles. This might be due to a database configuration issue. Check the developer console for a link to create a Firestore index."
          });
      } finally {
        setLoading(false);
      }
    };

    fetchProfiles();
  }, [user, currentUserProfile]);

  const removeProfileFromStack = (id: string) => {
    setProfiles(prev => prev.filter(p => p.id !== id));
  };

  const handleSwipe = async (swipedUserId: string, direction: 'left' | 'right') => {
    if (!user || !currentUserProfile || !profiles.length || isSwiping) return;

    setIsSwiping(true);
    const swipedProfile = profiles[profiles.length - 1];
    if (swipedProfile.id !== swipedUserId) {
      setIsSwiping(false);
      return;
    }

    try {
        removeProfileFromStack(swipedUserId);
        setLastSwiped({ profile: swipedProfile, direction });

        const swipeDocRef = doc(db, 'swipes', `${user.uid}_${swipedUserId}`);
        await setDoc(swipeDocRef, {
        swiperId: user.uid,
        swipedId: swipedUserId,
        direction,
        timestamp: serverTimestamp(),
        });

        if (direction === 'right') {
            const checkForMatch = async () => {
                // For demo users, always create a match to allow flow testing.
                if (swipedProfile.isDemo) return true;

                // For real users, check for a mutual like.
                const otherUserSwipeDocRef = doc(db, 'swipes', `${swipedUserId}_${user.uid}`);
                const otherUserSwipeDoc = await getDoc(otherUserSwipeDocRef);
                return otherUserSwipeDoc.exists() && otherUserSwipeDoc.data().direction === 'right';
            }

            const isMatch = await checkForMatch();

            if (isMatch) {
                const conversationRef = await addDoc(collection(db, 'conversations'), {
                    userIds: [user.uid, swipedUserId],
                    createdAt: serverTimestamp(),
                    lastMessage: '',
                    lastMessageAt: serverTimestamp(),
                    lastMessageSenderId: '',
                    userProfiles: {
                        [user.uid]: {
                            name: currentUserProfile.name,
                            photoURLs: currentUserProfile.photoURLs,
                        },
                        [swipedUserId]: {
                            name: swipedProfile.name,
                            photoURLs: swipedProfile.photoURLs,
                        }
                    }
                });
                
                setLastMatch({ matchedUser: swipedProfile, conversationId: conversationRef.id });
                setShowMatchModal(true);
            }
        }
    } catch(err) {
        console.error("Error during swipe:", err);
    } finally {
        setIsSwiping(false);
    }
  };

  const handleRewind = async () => {
    if (!user || !lastSwiped || isSwiping) return;

    const { profile } = lastSwiped;
    const swipeDocRef = doc(db, 'swipes', `${user.uid}_${profile.id}`);

    try {
      await deleteDoc(swipeDocRef);
      setProfiles(prev => [...prev, profile]);
      setLastSwiped(null);
    } catch (error) {
      console.error("Could not rewind swipe:", error);
    }
  };
  
  const currentProfile = useMemo(() => profiles[profiles.length - 1], [profiles]);
  
  const refreshProfiles = () => {
     // A simple page reload is a blunt but effective way to re-trigger the fetch logic.
     // A more sophisticated approach might involve a dedicated state management solution.
     window.location.reload();
  }

  if (loading || authLoading) {
      return (
        <div className="flex items-center justify-center h-[calc(100vh-64px)]">
            <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      );
  }

  return (
    <AuthGuard>
      <div className="container mx-auto p-4 flex flex-col h-[calc(100vh-64px)] max-w-lg">
        {lastMatch && (
           <MatchModal
              open={showMatchModal}
              onOpenChange={setShowMatchModal}
              currentUser={currentUserProfile}
              matchedUser={lastMatch.matchedUser}
              conversationId={lastMatch.conversationId}
          />
        )}
        <div className="flex-grow relative flex items-center justify-center">
          <AnimatePresence>
              {currentProfile ? (
                  <SwipeCard key={currentProfile.id} userProfile={currentProfile} onSwipe={handleSwipe} />
              ) : (
                  !loading && noProfilesMessage && (
                      <Card className="w-full h-full flex flex-col items-center justify-center bg-card">
                      <CardContent className="text-center">
                          <h3 className="text-xl font-semibold text-foreground">{noProfilesMessage.title}</h3>
                          <p className="text-muted-foreground mt-2">{noProfilesMessage.description}</p>
                          <Button variant="secondary" className="mt-6" onClick={refreshProfiles}>
                          <RotateCcw className="mr-2 h-4 w-4" />
                          Try Again
                          </Button>
                      </CardContent>
                      </Card>
                  )
              )}
          </AnimatePresence>
        </div>
        <div className="flex justify-center items-center gap-4 py-6">
          <Button 
            variant="outline" 
            size="icon" 
            className="w-16 h-16 rounded-full bg-white shadow-lg border-2 border-red-200 hover:bg-red-50"
            onClick={() => currentProfile && handleSwipe(currentProfile.id, 'left')}
            disabled={!currentProfile || loading || isSwiping}
          >
            <X className="h-8 w-8 text-red-500" />
          </Button>
          <Button 
            variant="outline" 
            size="icon" 
            className="w-16 h-16 rounded-full bg-white shadow-lg border-2 border-amber-300 hover:bg-amber-50"
            onClick={handleRewind}
            disabled={loading || !lastSwiped || isSwiping}
          >
            <RotateCcw className="h-8 w-8 text-amber-500" />
          </Button>
          <Button 
            variant="outline" 
            size="icon" 
            className="w-16 h-16 rounded-full bg-white shadow-lg border-2 border-green-200 hover:bg-green-50"
            onClick={() => currentProfile && handleSwipe(currentProfile.id, 'right')}
            disabled={!currentProfile || loading || isSwiping}
          >
            <Heart className="h-8 w-8 text-green-500" fill="currentColor" />
          </Button>
        </div>
      </div>
    </AuthGuard>
  );
}
