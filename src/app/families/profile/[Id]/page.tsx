'use client';

import { useAuth } from '@/hooks/useAuth';
import { useRouter, useParams } from 'next/navigation';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { MapPin, Briefcase, Heart, Smile, Pencil, Star, PlusCircle, Loader2, Users, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useEffect, useState } from 'react';
import { db } from '@/lib/firebase/client';
import { doc, onSnapshot, collection, query, where, getDocs, orderBy, getDoc } from 'firebase/firestore';
import type { UserProfile, Review } from '@/lib/types';
import { AuthGuard } from '@/components/AuthGuard';
import { formatDistanceToNow } from 'date-fns';
import type { Timestamp } from 'firebase/firestore';

const ReviewCard = ({ review, reviewer }: { review: Review, reviewer?: UserProfile }) => {
  return (
    <div className="flex gap-4">
      <Avatar>
        <AvatarImage src={reviewer?.photoURLs[0]} />
        <AvatarFallback>{reviewer?.name?.charAt(0) || '?'}</AvatarFallback>
      </Avatar>
      <div className="flex-1">
        <div className="flex items-center justify-between">
          <p className="font-semibold">{reviewer?.name || 'Anonymous'}</p>
          <p className="text-xs text-muted-foreground">
            {review.createdAt ? formatDistanceToNow((review.createdAt as Timestamp).toDate(), { addSuffix: true }) : ''}
          </p>
        </div>
        <div className="flex items-center gap-1 my-1">
          {[...Array(5)].map((_, i) => (
            <Star key={i} className={`h-4 w-4 ${i < review.rating ? 'text-yellow-400 fill-yellow-400' : 'text-gray-300'}`} />
          ))}
        </div>
        <p className="text-sm text-muted-foreground">{review.comment}</p>
      </div>
    </div>
  );
};


export default function ProfilePage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const params = useParams<{ Id?: string; id?: string }>();
  const profileId = params.Id ?? params.id ?? '';

  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [reviewers, setReviewers] = useState<{[key: string]: UserProfile}>({});
  const [reviewsLoading, setReviewsLoading] = useState(true);

  const isOwnProfile = user?.uid === profileId;

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

   useEffect(() => {
    if (!userProfile) return;
    
    const fetchReviews = async () => {
        setReviewsLoading(true);
        const reviewsQuery = query(
            collection(db, 'reviews'),
            where('revieweeId', '==', userProfile.id),
            orderBy('createdAt', 'desc')
        );
        const reviewsSnapshot = await getDocs(reviewsQuery);
        const fetchedReviews = reviewsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Review));
        setReviews(fetchedReviews);

        if (fetchedReviews.length > 0) {
            const reviewerIds = [...new Set(fetchedReviews.map(r => r.reviewerId))];
            const newReviewers: {[key: string]: UserProfile} = {};
            for (const id of reviewerIds) {
                // Avoid re-fetching if profile is already loaded
                if (reviewers[id]) continue;
                const userDoc = await getDoc(doc(db, 'users', id));
                if (userDoc.exists()) {
                    newReviewers[id] = userDoc.data() as UserProfile;
                }
            }
            setReviewers(prev => ({...prev, ...newReviewers}));
        }
        setReviewsLoading(false);
    }

    fetchReviews();
  }, [userProfile, reviewers]);
  

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
            <Button onClick={() => router.back()} className="mt-6">Go Back</Button>
        </div>
    );
  }


  return (
    <AuthGuard>
      <div className="bg-background">
        <div className="container mx-auto p-4 md:p-8">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Left Column - Profile Details */}
            <div className="lg:col-span-2">
              <Card className="overflow-hidden">
                <div className="relative h-48 bg-primary/20">
                  {userProfile.photoURLs && userProfile.photoURLs.length > 1 && <Image src={userProfile.photoURLs[1]} alt="Profile banner" fill className="object-cover" />}
                  <div className="absolute bottom-0 left-6 transform translate-y-1/2">
                     <Avatar className="h-32 w-32 border-4 border-background shadow-lg">
                        <AvatarImage src={userProfile.photoURLs?.[0] || ''} />
                        <AvatarFallback>{userProfile.name?.charAt(0) || '?'}</AvatarFallback>
                      </Avatar>
                  </div>
                  {isOwnProfile && (
                    <div className="absolute top-4 right-4">
                        <Button variant="secondary" onClick={() => router.push('/families/profile/edit')}>
                            <Pencil className="mr-2 h-4 w-4" /> Edit Profile
                        </Button>
                    </div>
                  )}
                </div>

                <CardHeader className="pt-20 px-6">
                  <CardTitle className="text-3xl font-headline flex items-center gap-3">
                    {userProfile.name}, {userProfile.age}
                    {userProfile.backgroundCheckStatus === 'completed' && <CheckCircle2 className="h-7 w-7 text-green-500" />}
                  </CardTitle>
                  <CardDescription className="flex flex-wrap gap-x-4 gap-y-1 text-base">
                    <span className="flex items-center gap-1"><MapPin className="h-4 w-4" /> {userProfile.location}</span>
                    {userProfile.workplace && <span className="flex items-center gap-1"><Briefcase className="h-4 w-4" /> {userProfile.workplace}</span>}
                     {userProfile.numberOfChildren && <span className="flex items-center gap-1"><Users className="h-4 w-4" /> {userProfile.numberOfChildren} {userProfile.numberOfChildren > 1 ? 'children' : 'child'}</span>}
                  </CardDescription>
                   <div className="flex items-center gap-1 pt-2">
                      <Star className="w-5 h-5 text-yellow-400 fill-yellow-400" />
                      <span className="font-bold">{userProfile.averageRating?.toFixed(1) || 'New'}</span>
                      <span className="text-muted-foreground">({userProfile.ratingCount || 0} reviews)</span>
                  </div>
                </CardHeader>

                <CardContent className="px-6 pb-6">
                  <Separator className="my-4" />
                  <div>
                    <h3 className="font-semibold text-lg mb-2 flex items-center gap-2"><Smile className="h-5 w-5 text-primary" /> About Me / Needs</h3>
                    <p className="text-muted-foreground">{userProfile.needs}</p>
                  </div>
                  <Separator className="my-4" />
                  <div>
                    <h3 className="font-semibold text-lg mb-3 flex items-center gap-2"><Heart className="h-5 w-5 text-primary" /> Interests</h3>
                    <div className="flex flex-wrap gap-2">
                      {userProfile.interests?.map(interest => (
                        <Badge key={interest} variant="secondary" className="text-sm py-1 px-3">{interest}</Badge>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Reviews Section */}
               <Card className="mt-8">
                  <CardHeader>
                      <CardTitle className="font-headline">Reviews</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-6">
                      {reviewsLoading ? (
                        <div className="text-center text-muted-foreground py-8"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></div>
                      ) : reviews.length > 0 ? (
                        reviews.map(review => (
                          <ReviewCard key={review.id} review={review} reviewer={reviewers[review.reviewerId]} />
                        ))
                      ) : (
                        <div className="text-center text-muted-foreground py-8">No reviews yet.</div>
                      )}
                  </CardContent>
              </Card>
            </div>

            {/* Right Column - Photo Gallery */}
            <div className="space-y-8">
              <Card>
                <CardHeader>
                  <CardTitle className="font-headline">Photo Gallery</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-4">
                  {userProfile.photoURLs && userProfile.photoURLs.slice(1).map((url, index) => (
                    <div key={index} className="relative aspect-square rounded-lg overflow-hidden">
                      <Image src={url} alt={`Gallery image ${index + 1}`} fill className="object-cover" />
                    </div>
                  ))}
                  {isOwnProfile && (!userProfile.photoURLs || userProfile.photoURLs.length < 5) && (
                      <div className="aspect-square rounded-lg border-2 border-dashed flex items-center justify-center">
                          <Button variant="ghost" className="flex flex-col h-full w-full" onClick={() => router.push('/families/profile/edit')}>
                              <PlusCircle className="h-8 w-8 text-muted-foreground"/>
                              <span className="text-xs text-muted-foreground mt-1">Add Photo</span>
                          </Button>
                      </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </AuthGuard>
  );
}

