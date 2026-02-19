'use client'

import { useState, useEffect, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Heart, X, RotateCcw, MapPin, ArrowRight, CalendarDays, Baby } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { useAuth } from '@/hooks/useAuth';
import { UserProfile } from '@/lib/types';
import { db } from '@/lib/firebase/client';
import { collection, query, where, getDocs, doc, setDoc, addDoc, serverTimestamp, getDoc, deleteDoc, onSnapshot, limit } from 'firebase/firestore';
import Link from 'next/link';
import { AuthGuard } from '@/components/AuthGuard';
import { useRouter } from 'next/navigation';
import MatchModal from '@/components/MatchModal';

type FirestoreError = { message?: string };

const isRoleCompatible = (
  currentRole: UserProfile['role'] | undefined,
  candidateRole: UserProfile['role'] | undefined
) => {
  if (!currentRole || !candidateRole) return false;
  if (currentRole === 'parent') return candidateRole === 'sitter' || candidateRole === 'reciprocal';
  if (currentRole === 'sitter') return candidateRole === 'parent' || candidateRole === 'reciprocal';
  return candidateRole === 'parent' || candidateRole === 'sitter' || candidateRole === 'reciprocal';
};

const SwipeCard = ({
  userProfile,
  onSwipe,
  onOpenProfile,
}: {
  userProfile: UserProfile,
  onSwipe: (id: string, direction: 'left' | 'right') => void,
  onOpenProfile: (id: string) => void,
}) => {
  const primaryPhoto = userProfile.photoURLs?.[0] || '';
  const fallbackPhoto = '/ShiftSitter.jpeg';
  const avatarLikePhoto = /dicebear|ui-avatars|robohash|avatar|initial|placeholder|profile-default|\\.svg/i.test(primaryPhoto);
  const preferredPhoto = primaryPhoto && !avatarLikePhoto ? primaryPhoto : fallbackPhoto;
  const [imageSrc, setImageSrc] = useState(preferredPhoto);
  const needsText = userProfile.needs || userProfile.workplace || 'Open to coordinate care schedules.';

  useEffect(() => {
    setImageSrc(preferredPhoto);
  }, [preferredPhoto]);

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
      <Card
        className="relative w-full h-full rounded-2xl overflow-hidden shadow-lg cursor-pointer"
        onClick={() => onOpenProfile(userProfile.id)}
      >
        <img
          src={imageSrc}
          alt={userProfile.name || 'Profile picture'}
          className="absolute inset-0 h-full w-full object-cover"
          onError={() => {
            if (imageSrc !== fallbackPhoto) setImageSrc(fallbackPhoto);
          }}
        />
        <div className="absolute inset-0 match-hero-overlay p-5">
            <div className="match-hero-top">
              <button type="button" className="match-hero-icon ghost" onClick={(e) => e.stopPropagation()}>
                <MapPin className="h-5 w-5" />
              </button>
              <Link
                href={`/families/profile/${userProfile.id}`}
                onClick={(e) => e.stopPropagation()}
                className="match-hero-icon"
              >
                <ArrowRight className="h-5 w-5"/>
              </Link>
            </div>
            <div className="match-hero-content">
              <h2 className="match-hero-name">{userProfile.name}, {userProfile.age}</h2>
              <p className="match-hero-location"><MapPin size={16}/> {userProfile.location}</p>
              <div className="match-hero-meta">
                {typeof userProfile.childAge === 'number' && (
                  <p><Baby size={16} /> <span>Child&apos;s Age</span> {userProfile.childAge} years old</p>
                )}
                {userProfile.availability && (
                  <p><CalendarDays size={16} /> <span>Availability</span> {userProfile.availability}</p>
                )}
                <p><Heart size={16} /> <span>Needs</span> {needsText}</p>
              </div>
              {Array.isArray(userProfile.interests) && userProfile.interests.length > 0 && (
                <div className="match-chip-row">
                  {userProfile.interests.slice(0, 3).map((interest) => (
                    <span key={interest} className="match-chip">{interest}</span>
                  ))}
                </div>
              )}
            </div>
        </div>
      </Card>
    </motion.div>
  );
};

export default function MatchPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSwiping, setIsSwiping] = useState(false);
  const [showMatchModal, setShowMatchModal] = useState(false);
  const [lastMatch, setLastMatch] = useState<{matchedUser: UserProfile, conversationId: string} | null>(null);
  const [currentUserProfile, setCurrentUserProfile] = useState<UserProfile | null>(null);
  const [noProfilesMessage, setNoProfilesMessage] = useState<{title: string, description: string} | null>(null);
  const [lastSwiped, setLastSwiped] = useState<{ profile: UserProfile, direction: 'left' | 'right' } | null>(null);

  const hasShownMatch = (matchId: string) => {
    if (typeof window === 'undefined') return false;
    try {
      const raw = localStorage.getItem('shownMatches');
      const parsed = raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
      return !!parsed[matchId];
    } catch {
      return false;
    }
  };

  const markMatchShown = (matchId: string) => {
    if (typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem('shownMatches');
      const parsed = raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
      parsed[matchId] = true;
      localStorage.setItem('shownMatches', JSON.stringify(parsed));
    } catch {
      // no-op for corrupted localStorage values
    }
  };

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

      try {
        const mySwipesQuery = query(collection(db, 'swipes'), where('swiperId', '==', user.uid));
        const swipesSnapshot = await getDocs(mySwipesQuery);
        const swipedIds = new Set<string>(
          swipesSnapshot.docs.map(swipeDoc => swipeDoc.data().swipedId).filter(Boolean)
        );
        swipedIds.add(user.uid);

        const activeUsersQuery = query(
          collection(db, 'users'),
          where('profileComplete', '==', true),
          limit(80)
        );
        const activeUsersSnapshot = await getDocs(activeUsersQuery);

        let fetchedProfiles = activeUsersSnapshot.docs
          .map(userDoc => {
            const data = userDoc.data() as UserProfile;
            return { ...data, id: data.id || userDoc.id };
          })
          .filter(profile => {
            if (!profile.id || swipedIds.has(profile.id)) return false;
            return isRoleCompatible(currentUserProfile.role, profile.role);
          })
          .slice(0, 10);

        if (fetchedProfiles.length === 0) {
          const demoUsersQuery = query(
            collection(db, 'users'),
            where('isDemo', '==', true),
            limit(60)
          );
          const demoUsersSnapshot = await getDocs(demoUsersQuery);
          fetchedProfiles = demoUsersSnapshot.docs
            .map(userDoc => {
              const data = userDoc.data() as UserProfile;
              return { ...data, id: data.id || userDoc.id };
            })
            .filter(profile => !!profile.id && !swipedIds.has(profile.id))
            .slice(0, 10);
        }

        if (fetchedProfiles.length === 0) {
            setNoProfilesMessage({
                title: "No more profiles for now",
                description: "You've seen everyone available that matches your role. Check back later for new people!"
            });
        }
        
        setProfiles(fetchedProfiles);
      } catch (error: unknown) {
          const firestoreError = error as FirestoreError;
          console.error("Error fetching profiles. This might be a Firestore index issue.", firestoreError.message ?? error);
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
                
                const matchState = { matchedUser: swipedProfile, conversationId: conversationRef.id };
                setLastMatch(matchState);
                if (!hasShownMatch(conversationRef.id)) {
                  setShowMatchModal(true);
                  markMatchShown(conversationRef.id);
                }
            }
        }
    } catch(error: unknown) {
        const firestoreError = error as FirestoreError;
        console.error("Error during swipe:", firestoreError.message ?? error);
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
    
     window.location.reload();
  }

  const handleOpenProfile = (profileId: string) => {
    router.push(`/families/profile/${profileId}`);
  };

  if (loading || authLoading) {
      return (
        <div className="flex items-center justify-center h-[calc(100vh-64px)]">
            <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      );
  }

  return (
    <AuthGuard>
      <div className="match-shell">
        <div className="match-inner">
        {lastMatch && (
           <MatchModal
              open={showMatchModal}
              onOpenChange={setShowMatchModal}
              currentUser={currentUserProfile}
              matchedUser={lastMatch.matchedUser}
              conversationId={lastMatch.conversationId}
          />
        )}
        <div className="match-deck-wrap">
          <AnimatePresence>
              {currentProfile ? (
                  <SwipeCard
                    key={currentProfile.id}
                    userProfile={currentProfile}
                    onSwipe={handleSwipe}
                    onOpenProfile={handleOpenProfile}
                  />
              ) : (
                  !loading && noProfilesMessage && (
                      <Card className="match-card w-full">
                      <CardContent className="match-foot text-center">
                          <h3 className="match-title">{noProfilesMessage.title}</h3>
                          <p className="text-muted-foreground mt-2">{noProfilesMessage.description}</p>
                          <button type="button" className="match-btn ghost mt-3" onClick={refreshProfiles}>
                            <RotateCcw className="h-4 w-4" />
                            Try Again
                          </button>
                      </CardContent>
                      </Card>
                  )
              )}
          </AnimatePresence>
        </div>
        <div className="match-action-row">
          <button
            type="button"
            className="match-action-btn rewind"
            onClick={handleRewind}
            disabled={loading || !lastSwiped || isSwiping}
          >
            <RotateCcw className="h-8 w-8" />
          </button>
          <button
            type="button"
            className="match-action-btn pass"
            onClick={() => currentProfile && handleSwipe(currentProfile.id, 'left')}
            disabled={!currentProfile || loading || isSwiping}
          >
            <X className="h-8 w-8" />
          </button>
          <button
            type="button"
            className="match-action-btn like"
            onClick={() => currentProfile && handleSwipe(currentProfile.id, 'right')}
            disabled={!currentProfile || loading || isSwiping}
          >
            <Heart className="h-8 w-8" />
          </button>
        </div>
        </div>
      </div>
    </AuthGuard>
  );
}
