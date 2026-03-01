'use client';

import { useAuth } from '@/hooks/useAuth';
import { useRouter, useParams } from 'next/navigation';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { MapPin, Briefcase, Heart, Smile, Pencil, Loader2, Users, AlertCircle, CheckCircle2, CalendarDays, Upload, Star } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { db, storage } from '@/lib/firebase/client';
import { collection, doc, getDoc, getDocs, query, updateDoc, where } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import type { Review, UserProfile } from '@/lib/types';
import { AuthGuard } from '@/components/AuthGuard';
import { useToast } from '@/hooks/use-toast';
import { calculateCompatibility } from '@/lib/match/calculateCompatibility';


export default function ProfilePage() {
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const params = useParams<{ Id?: string; id?: string }>();
  const profileId = params.Id ?? params.id ?? '';
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [viewerProfile, setViewerProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isUploadingMainPhoto, setIsUploadingMainPhoto] = useState(false);
  const [recentReviews, setRecentReviews] = useState<Review[]>([]);

  const isOwnProfile = user?.uid === profileId;

  const handlePickMainPhoto = () => {
    fileInputRef.current?.click();
  };

  const handleMainPhotoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !user || !isOwnProfile) return;

    setIsUploadingMainPhoto(true);
    try {
      const filePath = `user_photos/${user.uid}/${Date.now()}_${file.name}`;
      const storageRef = ref(storage, filePath);
      const snapshot = await uploadBytes(storageRef, file);
      const downloadURL = await getDownloadURL(snapshot.ref);

      const currentPhotos = (userProfile?.photoURLs || []).filter(Boolean);
      const updatedPhotos = [downloadURL, ...currentPhotos.filter((url) => url !== downloadURL)].slice(0, 5);
      await updateDoc(doc(db, 'users', user.uid), { photoURLs: updatedPhotos });

      toast({
        title: 'Foto actualizada',
        description: 'Tu nueva foto ya es la principal.',
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'No se pudo cambiar la foto',
        description: error?.message || 'Intenta de nuevo.',
      });
    } finally {
      setIsUploadingMainPhoto(false);
      event.target.value = '';
    }
  };
  const handleBack = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
      return;
    }
    router.push('/families/match');
  };

  useEffect(() => {
    if (!user?.uid) {
      setViewerProfile(null);
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const snapshot = await getDoc(doc(db, 'users', user.uid));
        if (cancelled) return;
        setViewerProfile(snapshot.exists() ? (snapshot.data() as UserProfile) : null);
      } catch {
        if (!cancelled) setViewerProfile(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.uid]);

  useEffect(() => {
      if (!profileId) return;
      
      setLoading(true);
      let cancelled = false;

      void (async () => {
        try {
          const profileDoc = await getDoc(doc(db, "users", profileId));
          if (cancelled) return;
          if (profileDoc.exists()) {
            const profileData = profileDoc.data() as UserProfile;
            if (!profileData.profileComplete && profileData.id === user?.uid) {
              router.push('/families/onboarding');
            } else {
              setUserProfile(profileData);
            }
          } else {
            if (user?.uid === profileId) {
              router.push('/families/onboarding');
            } else {
              setUserProfile(null);
            }
          }
        } catch {
          if (!cancelled) setUserProfile(null);
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();

      return () => {
        cancelled = true;
      };
  }, [profileId, user, router]);

  useEffect(() => {
    if (!profileId) return;
    let cancelled = false;
    const reviewsQuery = query(collection(db, 'reviews'), where('revieweeId', '==', profileId));

    void (async () => {
      try {
        const snapshot = await getDocs(reviewsQuery);
        if (cancelled) return;
        const reviews = snapshot.docs
          .map((snap) => ({ id: snap.id, ...snap.data() } as Review))
          .sort((a, b) => {
            const aMs = typeof a.createdAt?.toMillis === 'function' ? a.createdAt.toMillis() : 0;
            const bMs = typeof b.createdAt?.toMillis === 'function' ? b.createdAt.toMillis() : 0;
            return bMs - aMs;
          })
          .slice(0, 3);
        setRecentReviews(reviews);
      } catch {
        if (!cancelled) setRecentReviews([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [profileId]);

  if (loading || authLoading) {
    return (
        <div className="flex items-center justify-center h-screen">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
        </div>
    );
  }
  
  if (!userProfile) {
       return (
        <div className="flex flex-col items-center justify-center h-screen text-center p-4">
            <AlertCircle className="h-12 w-12 text-destructive mb-4" />
            <h1 className="text-2xl font-bold">Profile Not Found</h1>
            <p className="text-muted-foreground">This user either doesn't exist or hasn't completed their profile yet.</p>
            <Button onClick={handleBack} className="mt-6">Go Back</Button>
        </div>
    );
  }


  const photos = (userProfile.photoURLs || []).filter(Boolean);
  const mainPhoto = photos[0] || '/ShiftSitter.jpeg';
  const gallerySlots = Array.from({ length: 5 }, (_, index) => photos[index] || null);
  const avgRating = userProfile.avgRating ?? userProfile.averageRating ?? 0;
  const reviewCount = userProfile.reviewCount ?? userProfile.ratingCount ?? 0;
  const compatibility = !isOwnProfile ? calculateCompatibility(viewerProfile ?? undefined, userProfile) : null;
  const strongestAreas = compatibility?.strengths?.slice(0, 3) ?? [];
  const headlineFacts = [
    userProfile.workplace ? {
      key: 'workplace',
      label: userProfile.workplace,
      icon: Briefcase,
      tone: 'border-slate-200 bg-white text-slate-700',
    } : null,
    userProfile.numberOfChildren ? {
      key: 'children',
      label: `${userProfile.numberOfChildren} ${userProfile.numberOfChildren > 1 ? 'children' : 'child'}`,
      icon: Users,
      tone: 'border-slate-200 bg-white text-slate-700',
    } : null,
    userProfile.verificationStatus === 'verified' ? {
      key: 'id-verified',
      label: 'ID Verified',
      icon: CheckCircle2,
      tone: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    } : userProfile.verificationStatus === 'pending' ? {
      key: 'id-pending',
      label: 'Verification Pending',
      icon: AlertCircle,
      tone: 'border-amber-200 bg-amber-50 text-amber-700',
    } : {
      key: 'id-unverified',
      label: 'Unverified',
      icon: AlertCircle,
      tone: 'border-slate-200 bg-slate-50 text-slate-600',
    },
    userProfile.backgroundCheckStatus === 'completed' ? {
      key: 'background',
      label: 'Background Checked',
      icon: CheckCircle2,
      tone: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    } : null,
  ].filter(Boolean) as Array<{ key: string; label: string; icon: typeof Briefcase; tone: string }>;
  const quickNeedSummary = userProfile.needs?.trim() || 'Needs not provided yet.';
  const expectationSummary = userProfile.offerSummary?.trim() || 'Open to coordinate a fair reciprocal exchange.';
  const careSnapshotItems = [
    {
      label: 'Preferred schedule',
      value:
        userProfile.availability?.trim() ||
        [
          ...(userProfile.need?.days || []),
          ...(userProfile.need?.shifts || []),
        ].filter(Boolean).join(' • ') ||
        'Not specified',
    },
    {
      label: 'Handoff',
      value:
        userProfile.need?.handoffPreference
          ? userProfile.need.handoffPreference.replaceAll('_', ' ')
          : 'Not specified',
    },
    {
      label: 'Travel range',
      value:
        typeof userProfile.need?.maxTravelMinutes === 'number'
          ? `Up to ${userProfile.need.maxTravelMinutes} min`
          : 'Not specified',
    },
    {
      label: 'Children ages',
      value:
        userProfile.childrenAgesText?.trim() ||
        (Array.isArray(userProfile.need?.childrenAges) && userProfile.need?.childrenAges.length > 0
          ? userProfile.need.childrenAges.join(', ')
          : typeof userProfile.childAge === 'number'
            ? `${userProfile.childAge}`
            : 'Not specified'),
    },
    {
      label: 'Home environment',
      value:
        [
          userProfile.need?.smokeFree ? 'Smoke-free' : null,
          userProfile.need?.petsInHome && userProfile.need.petsInHome !== 'none'
            ? `Pets: ${userProfile.need.petsInHome}`
            : userProfile.need?.petsInHome === 'none'
              ? 'No pets'
              : null,
        ].filter(Boolean).join(' • ') || 'Not specified',
    },
    {
      label: 'Special notes',
      value:
        userProfile.need?.specialNeeds?.has
          ? userProfile.need.specialNeeds.notes?.trim() || 'Special support requested'
          : 'None noted',
    },
  ];
  const renderStars = (value: number) => (
    <div className="flex items-center gap-1">
      {Array.from({ length: 5 }, (_, idx) => {
        const active = idx + 1 <= Math.round(value);
        return (
          <Star key={idx} className={`h-4 w-4 ${active ? 'fill-amber-400 text-amber-500' : 'text-slate-300'}`} />
        );
      })}
    </div>
  );

  return (
    <AuthGuard>
      <div className="ss-page-shell profile-premium-shell">
        <div className="ss-page-inner max-w-6xl">
          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="overflow-hidden shadow-lg">
              <div className="relative h-40 bg-gradient-to-r from-primary/20 via-accent to-primary/10">
                {photos[1] ? (
                  <Image src={photos[1]} alt="Profile banner" fill className="object-cover opacity-70" />
                ) : null}
              </div>
              <CardContent className="relative p-6">
                <div className="-mt-20 mb-4 profile-hero-wrap">
                  <div className="profile-hero-main">
                    <Avatar className="profile-hero-avatar h-32 w-32 border-4 border-background shadow-lg">
                      <AvatarImage src={mainPhoto} />
                      <AvatarFallback>{userProfile.name?.charAt(0) || '?'}</AvatarFallback>
                    </Avatar>
                    <div className="profile-hero-copy">
                      <h1 className="profile-hero-name font-headline text-3xl font-semibold text-foreground md:text-4xl">
                        {userProfile.name}, {userProfile.age}
                      </h1>
                      <p className="profile-hero-location mt-1 flex items-center gap-2 text-sm text-muted-foreground md:text-base">
                        <MapPin className="h-4 w-4 text-primary" />
                        {userProfile.location || 'Location not set'}
                      </p>
                      <div className="profile-hero-badges mt-3 flex flex-wrap items-center gap-2 text-sm">
                        {headlineFacts.map((fact) => {
                          const Icon = fact.icon;
                          return (
                            <span key={fact.key} className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 ${fact.tone}`}>
                              <Icon className="h-4 w-4" />
                              {fact.label}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                  {isOwnProfile ? (
                    <div className="profile-hero-actions flex flex-wrap gap-2">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        className="hidden"
                        onChange={handleMainPhotoUpload}
                        disabled={isUploadingMainPhoto}
                      />
                      <Button variant="outline" className="profile-soft-btn" onClick={handlePickMainPhoto} disabled={isUploadingMainPhoto}>
                        {isUploadingMainPhoto ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                        Change photo
                      </Button>
                      <Button variant="outline" className="profile-soft-btn" onClick={() => router.push('/families/profile/edit')}>
                        <Pencil className="mr-2 h-4 w-4" />
                        Edit
                      </Button>
                    </div>
                  ) : null}
                </div>

                <div className="mt-4 space-y-5">
                  {!isOwnProfile && compatibility ? (
                    <div className="rounded-xl border bg-white p-4 shadow-sm">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Match Snapshot</p>
                          <div className="mt-1 flex items-end gap-2">
                            <p className="text-4xl font-semibold text-foreground">{compatibility.totalScore}%</p>
                            <p className="pb-1 text-sm text-muted-foreground">
                              {compatibility.totalScore >= 85 ? 'Ideal Match' : compatibility.totalScore >= 65 ? 'Good Match' : 'Maybe Match'}
                            </p>
                          </div>
                        </div>
                        {typeof compatibility.distanceKm === 'number' ? (
                          <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm font-medium text-slate-700">
                            <MapPin className="h-4 w-4 text-primary" />
                            {compatibility.distanceKm} km away
                          </div>
                        ) : null}
                      </div>

                      <div className="mt-4 rounded-lg border border-slate-100 bg-slate-50 p-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">What they expect in return</p>
                        <p className="mt-2 text-sm leading-6 text-slate-700">{expectationSummary}</p>
                      </div>

                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        {[
                          ['Schedule', compatibility.breakdown.schedule],
                          ['Distance', compatibility.breakdown.distance],
                          ['Safety', compatibility.breakdown.safety],
                          ['Kids', compatibility.breakdown.kids],
                        ].map(([label, value]) => (
                          <div key={String(label)}>
                            <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                              <span>{label}</span>
                              <span>{value}%</span>
                            </div>
                            <div className="h-2 rounded-full bg-slate-100">
                              <div className="h-2 rounded-full bg-primary" style={{ width: `${Math.max(0, Math.min(100, Number(value)))}%` }} />
                            </div>
                          </div>
                        ))}
                      </div>

                      {strongestAreas.length > 0 ? (
                        <div className="mt-4">
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Strongest areas</p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {strongestAreas.map((item) => (
                              <Badge key={item} variant="secondary">{item}</Badge>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  <div className="rounded-xl border bg-white p-4 shadow-sm">
                    <h3 className="font-headline flex items-center gap-2 text-lg font-semibold text-foreground">
                      <CalendarDays className="h-4 w-4 text-primary" />
                      Availability
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">{userProfile.availability || 'Not provided yet.'}</p>
                  </div>

                  <div className="rounded-xl border bg-white p-4 shadow-sm">
                    <h3 className="font-headline flex items-center gap-2 text-lg font-semibold text-foreground">
                      <Smile className="h-4 w-4 text-primary" />
                      Childcare Needs
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">{userProfile.needs || 'Not provided yet.'}</p>
                  </div>

                  <div className="rounded-xl border bg-white p-4 shadow-sm">
                    <h3 className="font-headline flex items-center gap-2 text-lg font-semibold text-foreground">
                      <Briefcase className="h-4 w-4 text-primary" />
                      What They Expect In Return
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">{expectationSummary}</p>
                  </div>

                  <div className="rounded-xl border bg-white p-4 shadow-sm">
                    <h3 className="font-headline flex items-center gap-2 text-lg font-semibold text-foreground">
                      <CalendarDays className="h-4 w-4 text-primary" />
                      Care Snapshot
                    </h3>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      {careSnapshotItems.map((item) => (
                        <div key={item.label} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{item.label}</p>
                          <p className="mt-2 text-sm leading-6 text-slate-700">{item.value}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="space-y-6">
              <Card className="shadow-md">
                <CardContent className="p-5">
                  <h3 className="font-headline mb-3 flex items-center gap-2 text-lg font-semibold text-foreground">
                    <Heart className="h-4 w-4 text-primary" />
                    Interests
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {(userProfile.interests || []).map((interest, index) => (
                      <Badge key={`${interest}-${index}`} variant="secondary">
                        {interest}
                      </Badge>
                    ))}
                    {(userProfile.interests || []).length === 0 ? (
                      <span className="text-sm text-muted-foreground">No interests added yet.</span>
                    ) : null}
                  </div>
                </CardContent>
              </Card>

              <Card className="shadow-md">
                <CardContent className="p-5">
                  <h3 className="font-headline mb-3 flex items-center gap-2 text-lg font-semibold text-foreground">
                    <Star className="h-4 w-4 text-primary" />
                    Reviews
                  </h3>
                  {reviewCount > 0 ? (
                    <div className="mb-4 rounded-xl border bg-white p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-2xl font-semibold text-foreground">{avgRating.toFixed(1)}</p>
                          <p className="text-xs text-muted-foreground">{reviewCount} review{reviewCount === 1 ? '' : 's'}</p>
                        </div>
                        {renderStars(avgRating)}
                      </div>
                    </div>
                  ) : (
                    <p className="mb-4 text-sm text-muted-foreground">No reviews yet.</p>
                  )}

                  <div className="space-y-3">
                    {recentReviews.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Recent reviews will appear here.</p>
                    ) : (
                      recentReviews.map((review) => (
                        <div key={review.id} className="rounded-xl border bg-white p-3">
                          <div className="flex items-center justify-between gap-2">
                            {renderStars(review.rating)}
                            <span className="text-xs text-muted-foreground">
                              {typeof review.createdAt?.toDate === 'function'
                                ? review.createdAt.toDate().toLocaleDateString()
                                : ''}
                            </span>
                          </div>
                          {review.comment ? (
                            <p className="mt-2 text-sm text-muted-foreground">{review.comment}</p>
                          ) : null}
                        </div>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card className="shadow-md">
                <CardContent className="p-5">
                  <h3 className="font-headline mb-3 text-lg font-semibold text-foreground">Photo Gallery</h3>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {gallerySlots.map((url, index) => (
                      <div key={`gallery-slot-${index}`} className="relative aspect-square overflow-hidden rounded-xl border bg-card">
                        {url ? (
                          <Image src={url} alt={`Photo ${index + 1}`} fill className="object-cover" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">No photo</div>
                        )}
                      </div>
                    ))}
                  </div>
                  {isOwnProfile && photos.length < 5 ? (
                    <div className="mt-4">
                      <Button variant="outline" className="profile-soft-btn" onClick={() => router.push('/families/profile/edit')}>
                        <Pencil className="mr-2 h-4 w-4" />
                        Edit photos
                      </Button>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </AuthGuard>
  );
}

