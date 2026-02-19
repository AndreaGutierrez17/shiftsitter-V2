'use client';

import { useAuth } from '@/hooks/useAuth';
import { useRouter, useParams } from 'next/navigation';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
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
          <Card className="mx-auto w-full max-w-5xl rounded-2xl border border-[#d8d8eb] bg-[#f2f1fd] shadow-[0_14px_40px_rgba(31,41,55,0.08)]">
            <CardContent className="p-6 md:p-8">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-4">
                  <Avatar className="h-[84px] w-[84px] border-2 border-white shadow-md">
                    <AvatarImage src={mainPhoto} />
                    <AvatarFallback>{userProfile.name?.charAt(0) || '?'}</AvatarFallback>
                  </Avatar>
                  <div>
                    <h1 className="text-5xl font-bold leading-none text-[#283456]">
                      {userProfile.name}, {userProfile.age}
                    </h1>
                    <p className="mt-2 flex items-center gap-2 text-xl text-[#6f7088]">
                      <MapPin className="h-4 w-4" />
                      {userProfile.location || 'Location not set'}
                    </p>
                  </div>
                </div>
                {isOwnProfile ? (
                  <div className="flex gap-2">
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
                    <Button
                      variant="outline"
                      className="profile-soft-btn"
                      onClick={() => router.push('/families/profile/edit')}
                    >
                      <Pencil className="mr-2 h-4 w-4" />
                      Edit
                    </Button>
                  </div>
                ) : null}
              </div>

              <div className="mt-8 grid gap-7">
                <div>
                  <h3 className="flex items-center gap-2 text-4xl font-semibold text-[#2f3047]">
                    <CalendarDays className="h-5 w-5 text-[#c8aedf]" />
                    Availability
                  </h3>
                  <p className="mt-2 text-2xl text-[#6f7088]">{userProfile.availability || 'Not provided yet.'}</p>
                </div>

                <div>
                  <h3 className="flex items-center gap-2 text-4xl font-semibold text-[#2f3047]">
                    <Smile className="h-5 w-5 text-[#c8aedf]" />
                    Childcare Needs
                  </h3>
                  <p className="mt-2 text-2xl text-[#6f7088]">{userProfile.needs || 'Not provided yet.'}</p>
                </div>

                <div>
                  <h3 className="flex items-center gap-2 text-4xl font-semibold text-[#2f3047]">
                    <Heart className="h-5 w-5 text-[#c8aedf]" />
                    Interests
                  </h3>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {(userProfile.interests || []).map((interest, index) => (
                      <span
                        key={`${interest}-${index}`}
                        className="rounded-full bg-white/70 px-3 py-1 text-sm font-medium text-[#3f3f59] border border-[#d9d8ef]"
                      >
                        {interest}
                      </span>
                    ))}
                    {(userProfile.interests || []).length === 0 ? (
                      <span className="text-sm text-[#7f8098]">No interests added yet.</span>
                    ) : null}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-4 text-base text-[#72748a]">
                  {userProfile.workplace ? (
                    <span className="inline-flex items-center gap-1"><Briefcase className="h-4 w-4" /> {userProfile.workplace}</span>
                  ) : null}
                  {userProfile.numberOfChildren ? (
                    <span className="inline-flex items-center gap-1"><Users className="h-4 w-4" /> {userProfile.numberOfChildren} {userProfile.numberOfChildren > 1 ? 'children' : 'child'}</span>
                  ) : null}
                  {userProfile.backgroundCheckStatus === 'completed' ? (
                    <span className="inline-flex items-center gap-1 text-green-700"><CheckCircle2 className="h-4 w-4" /> Verified</span>
                  ) : null}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="mx-auto mt-6 w-full max-w-5xl rounded-2xl border border-[#d9d8ef] bg-white/90">
            <CardContent className="p-4">
              <h3 className="mb-3 text-xl font-semibold text-[#2f3047]">Photo Gallery</h3>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                {gallerySlots.map((url, index) => (
                  <div key={`gallery-slot-${index}`} className="relative aspect-square overflow-hidden rounded-xl border border-[#d9d8ef] bg-[#eceaf7]">
                    {url ? (
                      <Image src={url} alt={`Photo ${index + 1}`} fill className="object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-xs text-[#888aa2]">No photo</div>
                    )}
                  </div>
                ))}
              </div>
              {isOwnProfile && photos.length < 5 ? (
                <div className="mt-3">
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
    </AuthGuard>
  );
}

