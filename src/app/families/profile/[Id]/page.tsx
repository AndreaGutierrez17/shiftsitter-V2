'use client';

import { useAuth } from '@/hooks/useAuth';
import { useRouter, useParams } from 'next/navigation';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { MapPin, Briefcase, Heart, Smile, Pencil, Loader2, Users, AlertCircle, CheckCircle2, CalendarDays, Upload } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { db, storage } from '@/lib/firebase/client';
import { doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import type { UserProfile } from '@/lib/types';
import { AuthGuard } from '@/components/AuthGuard';
import { useToast } from '@/hooks/use-toast';


export default function ProfilePage() {
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const params = useParams<{ Id?: string; id?: string }>();
  const profileId = params.Id ?? params.id ?? '';
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isUploadingMainPhoto, setIsUploadingMainPhoto] = useState(false);

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
      if (!profileId) return;
      
      setLoading(true);
      const unsub = onSnapshot(doc(db, "users", profileId), (doc) => {
        if (doc.exists()) {
          const profileData = doc.data() as UserProfile;
          if (!profileData.profileComplete && profileData.id === user?.uid) {
            router.push('/families/onboarding');
          } else {
            setUserProfile(profileData);
          }
        } else {
          if (user?.uid === profileId) {
            router.push('/families/onboarding');
          } else {
             setUserProfile(null); // User not found
          }
        }
        setLoading(false);
      });
      return () => unsub();
  }, [profileId, user, router]);

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
                <div className="-mt-20 mb-4 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                  <div className="flex items-end gap-4">
                    <Avatar className="h-32 w-32 border-4 border-background shadow-lg">
                      <AvatarImage src={mainPhoto} />
                      <AvatarFallback>{userProfile.name?.charAt(0) || '?'}</AvatarFallback>
                    </Avatar>
                    <div className="pb-2">
                      <h1 className="font-headline text-3xl font-semibold text-foreground md:text-4xl">
                        {userProfile.name}, {userProfile.age}
                      </h1>
                      <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground md:text-base">
                        <MapPin className="h-4 w-4 text-primary" />
                        {userProfile.location || 'Location not set'}
                      </p>
                    </div>
                  </div>
                  {isOwnProfile ? (
                    <div className="flex flex-wrap gap-2">
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

                  <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                    {userProfile.workplace ? (
                      <span className="inline-flex items-center gap-1 rounded-full border bg-background px-3 py-1"><Briefcase className="h-4 w-4 text-primary" /> {userProfile.workplace}</span>
                    ) : null}
                    {userProfile.numberOfChildren ? (
                      <span className="inline-flex items-center gap-1 rounded-full border bg-background px-3 py-1"><Users className="h-4 w-4 text-primary" /> {userProfile.numberOfChildren} {userProfile.numberOfChildren > 1 ? 'children' : 'child'}</span>
                    ) : null}
                    {userProfile.backgroundCheckStatus === 'completed' ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-emerald-700"><CheckCircle2 className="h-4 w-4" /> Verified</span>
                    ) : null}
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

