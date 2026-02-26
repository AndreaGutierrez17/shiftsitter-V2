'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { Trash2, Upload, Loader2, FileText, AlertTriangle, BellRing, Users } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { auth, db, storage } from '@/lib/firebase/client';
import { doc, getDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { deleteUser } from 'firebase/auth';
import { UserProfile } from '@/lib/types';
import { cn } from '@/lib/utils';
import { enableWebPush } from '@/lib/firebase/push';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { AuthGuard } from '@/components/AuthGuard';

const profileSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters.'),
  age: z.coerce.number().min(18, 'You must be at least 18 years old.'),
  location: z.string().min(2, 'Location is required.'),
  workplace: z.string().optional(),
  numberOfChildren: z.coerce.number().optional(),
  childAge: z.coerce.number().optional(),
  childrenAgesText: z.string().optional(),
  availability: z.string().min(10, 'Please describe your availability.'),
  needs: z.string().min(10, 'Please describe your needs or what you offer.'),
  interests: z.string().min(3, 'Please list at least one interest.'),
});

type ProfileFormValues = z.input<typeof profileSchema>;

const compressImageFile = async (file: File): Promise<File> => {
  if (typeof window === 'undefined' || !file.type.startsWith('image/')) {
    return file;
  }

  const maxDimension = 800;
  const quality = 0.85;

  const imageUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new window.Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = imageUrl;
    });

    const scale = Math.min(1, maxDimension / Math.max(image.width, image.height));
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;

    ctx.drawImage(image, 0, 0, width, height);

    const compressedBlob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', quality);
    });

    if (!compressedBlob) return file;

    return new File(
      [compressedBlob],
      file.name.replace(/\.[^.]+$/, '.jpg'),
      { type: 'image/jpeg', lastModified: Date.now() }
    );
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
};

export default function EditProfilePage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  
  const [photos, setPhotos] = useState<string[]>([]);
  const [cvUrl, setCvUrl] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string | undefined>(undefined);

  const [pageLoading, setPageLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [replacingPhotoUrl, setReplacingPhotoUrl] = useState<string | null>(null);
  const [isUploadingCv, setIsUploadingCv] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isHandlingNotifications, setIsHandlingNotifications] = useState(false);

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      name: '',
      age: 18,
      location: '',
      workplace: '',
      availability: '',
      needs: '',
      interests: '',
      numberOfChildren: undefined,
      childAge: undefined,
      childrenAgesText: '',
    },
  });

  useEffect(() => {
    if (!user) return;
    
    const fetchProfile = async () => {
      setPageLoading(true);
      try {
        const userDocRef = doc(db, 'users', user.uid);
        const userDoc = await getDoc(userDocRef);
        if (userDoc.exists()) {
          const profile = userDoc.data() as UserProfile;
          form.reset({
            name: profile.name,
            age: profile.age,
            location: profile.location,
            workplace: profile.workplace || '',
            availability: profile.availability || '',
            numberOfChildren: profile.numberOfChildren ?? undefined,
            childAge: profile.childAge ?? undefined,
            childrenAgesText: profile.childrenAgesText || '',
            needs: profile.needs || '',
            interests: profile.interests?.join(', ') || '',
          });
          const validPhotos = (profile.photoURLs || []).filter((url): url is string => typeof url === 'string' && url.trim().length > 0);
          setPhotos(validPhotos);
          setCvUrl(profile.cvUrl || null);
          setUserRole(profile.role);
        }
      } catch (error: any) {
        console.error("Profile fetch error:", error);
        toast({
          variant: 'destructive',
          title: 'Permission error',
          description: error?.message || 'No se pudo cargar el perfil desde Firebase.',
          duration: 9000,
        });
      }
      setPageLoading(false);
    };
    fetchProfile();
  }, [user, form]);

  const handleFileUpload = async (file: File, path: 'user_photos' | 'cvs'): Promise<string> => {
    if (!user) throw new Error("User not authenticated.");
    
    let fileToUpload = file;

    // Compress images before uploading
    if (path === 'user_photos' && file.type.startsWith('image/')) {
        try {
            const compressedFile = await compressImageFile(file);
            fileToUpload = compressedFile;
        } catch (error) {
            console.error("Image compression error:", error);
            toast({
                variant: 'destructive',
                title: 'Compression Failed',
                description: 'Could not compress image. Uploading original file instead.',
            });
        }
    } else if (file.size > 5 * 1024 * 1024) { // 5MB limit for other files like CVs
      throw new Error("File is too large. The limit is 5MB.");
    }

    const filePath = `${path}/${user.uid}/${Date.now()}_${fileToUpload.name}`;
    const storageRef = ref(storage, filePath);
    const snapshot = await uploadBytes(storageRef, fileToUpload);
    return getDownloadURL(snapshot.ref);
  };
  
  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!user || !file) return;

    setIsUploadingPhoto(true);

    try {
      const downloadURL = await handleFileUpload(file, 'user_photos');
      // New upload becomes primary so users can change profile photo immediately.
      const updatedPhotos = [downloadURL, ...photos.filter((url) => url !== downloadURL)];
      await updateDoc(doc(db, 'users', user.uid), { photoURLs: updatedPhotos });
      setPhotos(updatedPhotos);
      toast({ title: 'Photo uploaded successfully!', description: 'Your new photo is now the main profile photo.' });
    } catch (error: any) {
      console.error("Photo Upload Error:", error);
      toast({
        variant: 'destructive',
        title: 'Upload Failed',
        description: error.message || 'An unexpected error occurred while uploading the photo.',
        duration: 9000,
      });
    } finally {
      setIsUploadingPhoto(false);
      e.target.value = ''; // Reset file input
    }
  };

  const handleCvUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!user || !file) return;

    setIsUploadingCv(true);
    try {
      const downloadURL = await handleFileUpload(file, 'cvs');
      await updateDoc(doc(db, 'users', user.uid), { cvUrl: downloadURL });
      setCvUrl(downloadURL);
      toast({ title: 'CV uploaded successfully!' });
    } catch (error: any) {
       console.error("CV Upload Error:", error);
       toast({
        variant: 'destructive',
        title: 'Upload Failed',
        description: error.message || 'An unexpected error occurred while uploading the CV.',
        duration: 9000,
      });
    } finally {
      setIsUploadingCv(false);
      e.target.value = ''; // Reset file input
    }
  };

  const handlePhotoDelete = async (urlToDelete: string) => {
    if (!user) return;
    if (photos.length <= 1) {
        toast({ variant: 'destructive', title: 'Cannot delete', description: 'You must have at least one photo.' });
        return;
    }
    
    const originalPhotos = photos;
    const updatedPhotos = photos.filter(url => url !== urlToDelete);
    setPhotos(updatedPhotos);

    try {
        await updateDoc(doc(db, 'users', user.uid), {
            photoURLs: updatedPhotos
        });
        const photoRef = ref(storage, urlToDelete);
        await deleteObject(photoRef);
        toast({ title: 'Photo deleted' });
    } catch (error: any) {
        console.error("Photo delete error:", error);
        setPhotos(originalPhotos); // Revert UI on error
        toast({ variant: 'destructive', title: 'Error deleting photo', description: 'Could not delete photo from storage. Please try again.' });
    }
  }

  const handleSetPrimaryPhoto = async (urlToSetPrimary: string) => {
    if (!user || photos.length === 0) return;
    if (photos[0] === urlToSetPrimary) return;

    const reordered = [urlToSetPrimary, ...photos.filter((url) => url !== urlToSetPrimary)];
    const original = photos;
    setPhotos(reordered);

    try {
      await updateDoc(doc(db, 'users', user.uid), { photoURLs: reordered });
      toast({ title: 'Main photo updated' });
    } catch (error: any) {
      console.error('Set primary photo error:', error);
      setPhotos(original);
      toast({
        variant: 'destructive',
        title: 'Could not update main photo',
        description: error?.message || 'Please try again.',
      });
    }
  };

  const handlePhotoReplace = async (urlToReplace: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!user || !file) return;

    setIsUploadingPhoto(true);
    setReplacingPhotoUrl(urlToReplace);
    const originalPhotos = photos;

    try {
      const downloadURL = await handleFileUpload(file, 'user_photos');
      const updatedPhotos = photos.map((url) => (url === urlToReplace ? downloadURL : url));
      await updateDoc(doc(db, 'users', user.uid), { photoURLs: updatedPhotos });
      setPhotos(updatedPhotos);

      try {
        await deleteObject(ref(storage, urlToReplace));
      } catch (deleteError) {
        console.warn('Old photo cleanup failed after replace:', deleteError);
      }

      toast({ title: 'Photo replaced successfully!' });
    } catch (error: any) {
      console.error('Photo Replace Error:', error);
      setPhotos(originalPhotos);
      toast({
        variant: 'destructive',
        title: 'Replace Failed',
        description: error.message || 'An unexpected error occurred while replacing the photo.',
        duration: 9000,
      });
    } finally {
      setIsUploadingPhoto(false);
      setReplacingPhotoUrl(null);
      e.target.value = '';
    }
  };

  const handleCvDelete = async () => {
    if (!user || !cvUrl) return;
    const oldCvUrl = cvUrl;
    setCvUrl(null);
    try {
      await updateDoc(doc(db, 'users', user.uid), { cvUrl: null });
      const cvRef = ref(storage, oldCvUrl);
      await deleteObject(cvRef);
      toast({ title: 'CV deleted' });
    } catch (error) {
      console.error("CV delete error:", error);
      setCvUrl(oldCvUrl); // Revert UI on error
      toast({ variant: 'destructive', title: 'Error deleting CV' });
    }
  }

  async function onSubmit(values: ProfileFormValues) {
    if (!user) return;
    setIsSaving(true);
    
    const updatedProfileData = {
      ...values,
      interests: values.interests.split(',').map(i => i.trim()),
      numberOfChildren: values.numberOfChildren || null,
      childAge: values.childAge || null,
      childrenAgesText: values.childrenAgesText?.trim() || '',
      workplace: values.workplace || '',
    };
      
    try {
        await updateDoc(doc(db, 'users', user.uid), updatedProfileData);
        toast({
          title: "Profile Updated",
          description: "Your changes have been saved successfully.",
        });
        router.push(`/families/profile/${user.uid}`);
    } catch(error: any) {
        toast({
            variant: 'destructive',
            title: 'Error updating profile',
            description: error.message,
        });
    } finally {
        setIsSaving(false);
    }
  }

  const handleDeleteAccount = async () => {
    if (!user) return;
    setIsDeleting(true);
    
    try {
      // Delete all user-related storage files
      const photoDeletionPromises = photos.map(url => deleteObject(ref(storage, url)));
      const cvDeletionPromise = cvUrl ? deleteObject(ref(storage, cvUrl)) : Promise.resolve();
      await Promise.all([...photoDeletionPromises, cvDeletionPromise]);
      
      // Delete the user's Firestore document
      await deleteDoc(doc(db, 'users', user.uid));
      
      // Delete the user from Firebase Authentication
      const currentUser = auth.currentUser;
      if (currentUser && currentUser.uid === user.uid) {
        await deleteUser(currentUser);
      }

      toast({
        title: "Account Deleted",
        description: "Your account and all your data have been permanently deleted.",
      });

      router.push('/');

    } catch (error: any) {
      console.error("Error deleting account:", error);
       let description = 'An unexpected error occurred. Please try again.';
      if (error.code === 'auth/requires-recent-login') {
        description = 'This is a sensitive operation. Please sign out and sign back in before trying to delete your account.';
      }
      toast({
        variant: 'destructive',
        title: 'Error Deleting Account',
        description,
        duration: 9000,
      });
    } finally {
      setIsDeleting(false);
    }
  }

  const handleEnableNotifications = async () => {
    setIsHandlingNotifications(true);
    try {
      if (!user) throw new Error('You must be logged in.');
      await enableWebPush(user.uid);
      toast({
        title: 'Notifications enabled',
        description: 'Push notifications were activated successfully.',
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Could not enable notifications',
        description: error?.message || 'Please check your browser permissions and try again.',
      });
    } finally {
      setIsHandlingNotifications(false);
    }
  };

  if (pageLoading || authLoading) {
    return (
      <div className="container mx-auto max-w-4xl p-4 md:p-8">
        <Card>
          <CardHeader>
            <Skeleton className="h-9 w-1/2" />
            <Skeleton className="h-5 w-3/4" />
          </CardHeader>
          <CardContent className="space-y-8">
            <Skeleton className="h-40 w-full" />
            <Separator />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isBusy = isSaving || isUploadingPhoto || isUploadingCv || isDeleting || isHandlingNotifications;
  const isSitter = userRole === 'sitter';

  return (
    <AuthGuard>
      <div className="container mx-auto max-w-4xl p-4 md:p-8">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <fieldset disabled={isBusy} className="group">
                <Card className="group-disabled:opacity-50">
                <CardHeader>
                    <CardTitle className="font-headline text-3xl">Edit Your Profile</CardTitle>
                    <CardDescription>Keep your information up-to-date to get the best matches.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    
                    <Card className="shadow-md">
                      <CardContent className="p-5">
                      <div>
                      <h3 className="text-lg font-semibold text-foreground">Your Photos</h3>
                      <p className="text-sm text-muted-foreground mb-4">The first photo is your main profile picture. You can have up to 5 photos.</p>
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                          {photos.map((url, index) => (
                          <div key={url} className="relative group/photo aspect-square rounded-lg overflow-hidden border">
                              <Image src={url} alt={`Photo ${index + 1}`} fill className="object-cover" />
                              <div className="absolute inset-0 bg-black/45 opacity-0 group-hover/photo:opacity-100 transition-opacity flex items-center justify-center gap-2 p-2">
                              {index !== 0 ? (
                                <Button type="button" variant="secondary" size="sm" onClick={() => handleSetPrimaryPhoto(url)}>
                                  Set main
                                </Button>
                              ) : null}
                              <label className="inline-flex">
                                <span className="sr-only">Replace photo</span>
                                <input
                                  type="file"
                                  className="sr-only"
                                  onChange={(e) => handlePhotoReplace(url, e)}
                                  accept="image/png, image/jpeg, image/webp"
                                  disabled={isUploadingPhoto}
                                />
                                <Button type="button" variant="secondary" size="sm" asChild disabled={isUploadingPhoto}>
                                  <span>{replacingPhotoUrl === url ? 'Replacing...' : 'Replace'}</span>
                                </Button>
                              </label>
                              <Button type="button" variant="destructive" size="icon" onClick={() => handlePhotoDelete(url)}><Trash2 className="h-4 w-4" /></Button>
                              </div>
                              <div className="absolute top-2 right-2 flex gap-2 md:hidden">
                                {index !== 0 ? (
                                  <Button type="button" variant="secondary" size="sm" onClick={() => handleSetPrimaryPhoto(url)}>
                                    Set main
                                  </Button>
                                ) : null}
                                <label className="inline-flex">
                                  <span className="sr-only">Replace photo</span>
                                  <input
                                    type="file"
                                    className="sr-only"
                                    onChange={(e) => handlePhotoReplace(url, e)}
                                    accept="image/png, image/jpeg, image/webp"
                                    disabled={isUploadingPhoto}
                                  />
                                  <Button type="button" variant="secondary" size="sm" asChild disabled={isUploadingPhoto}>
                                    <span>{replacingPhotoUrl === url ? 'Replacing...' : 'Replace'}</span>
                                  </Button>
                                </label>
                                <Button type="button" variant="destructive" size="icon" onClick={() => handlePhotoDelete(url)}>
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                              {index === 0 && <div className="absolute bottom-1 left-1/2 -translate-x-1/2 bg-black/50 text-white text-xs px-2 py-0.5 rounded-full">Primary</div>}
                          </div>
                          ))}
                          {photos.length < 5 && (
                          <label className={cn("aspect-square rounded-lg border-2 border-dashed flex flex-col items-center justify-center hover:bg-accent relative", isUploadingPhoto ? "cursor-not-allowed" : "cursor-pointer")}>
                              {isUploadingPhoto ? <Loader2 className="h-8 w-8 text-muted-foreground animate-spin" /> : <Upload className="h-8 w-8 text-muted-foreground" />}
                              <span className="text-xs text-muted-foreground mt-1">{isUploadingPhoto ? 'Uploading...' : 'Upload'}</span>
                              <input type="file" className="sr-only" onChange={handlePhotoUpload} accept="image/png, image/jpeg" disabled={isUploadingPhoto}/>
                          </label>
                          )}
                      </div>
                    </div>
                    </CardContent>
                    </Card>

                    {isSitter && (
                      <Card className="shadow-md">
                        <CardContent className="p-5">
                      <div>
                          <h3 className="text-lg font-semibold text-foreground">Curriculum Vitae (CV)</h3>
                          <p className="text-sm text-muted-foreground mb-4">Upload your CV in PDF format for families to review your experience.</p>
                          <div className="grid grid-cols-2 gap-4">
                            {cvUrl ? (
                               <div className="relative group/cv aspect-square rounded-lg overflow-hidden border p-4 flex flex-col items-center justify-center">
                                  <FileText className="h-16 w-16 text-muted-foreground" />
                                  <p className="text-sm text-center mt-2 truncate">CV Uploaded</p>
                                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/cv:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                    <a href={cvUrl} target="_blank" rel="noopener noreferrer" className={cn(buttonVariants({variant: 'secondary'}))}>View</a>
                                    <Button type="button" variant="destructive" onClick={handleCvDelete}><Trash2 className="h-4 w-4" /></Button>
                                  </div>
                              </div>
                            ) : (
                               <label className={cn("aspect-square rounded-lg border-2 border-dashed flex flex-col items-center justify-center hover:bg-accent relative", isUploadingCv ? "cursor-not-allowed" : "cursor-pointer")}>
                                  {isUploadingCv ? <Loader2 className="h-8 w-8 text-muted-foreground animate-spin" /> : <Upload className="h-8 w-8 text-muted-foreground" />}
                                  <span className="text-xs text-muted-foreground mt-1">{isUploadingCv ? 'Uploading...' : 'Upload CV (PDF)'}</span>
                                  <input type="file" className="sr-only" onChange={handleCvUpload} accept="application/pdf" disabled={isUploadingCv}/>
                              </label>
                            )}
                          </div>
                      </div>
                      </CardContent>
                      </Card>
                    )}

                    <Card className="shadow-md">
                    <CardContent className="p-5">
                    <div className="space-y-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <FormField control={form.control} name="name" render={({ field }) => (
                          <FormItem><FormLabel>Full Name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                        )} />
                        <FormField control={form.control} name="age" render={({ field }) => (
                          <FormItem>
                            <FormLabel>Age</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                name={field.name}
                                onBlur={field.onBlur}
                                ref={field.ref}
                                value={typeof field.value === 'number' ? field.value : ''}
                                onChange={e => field.onChange(e.target.value === '' ? undefined : +e.target.value)}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )} />
                      </div>
                       <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <FormField control={form.control} name="location" render={({ field }) => (
                          <FormItem><FormLabel>Location (City, State)</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                        )} />
                        <FormField control={form.control} name="workplace" render={({ field }) => (
                          <FormItem><FormLabel>Workplace / Profession (Optional)</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                        )} />
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <FormField control={form.control} name="numberOfChildren" render={({ field }) => (
                            <FormItem>
                                <FormLabel>Number of children (Optional)</FormLabel>
                                <FormControl>
                                  <Input
                                    type="number"
                                    name={field.name}
                                    onBlur={field.onBlur}
                                    ref={field.ref}
                                    value={typeof field.value === 'number' ? field.value : ''}
                                    onChange={e => field.onChange(e.target.value === '' ? undefined : +e.target.value)}
                                  />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )} />
                         <FormField control={form.control} name="childAge" render={({ field }) => (
                            <FormItem>
                              <FormLabel>Age of youngest child (Optional)</FormLabel>
                              <FormControl>
                                <Input
                                  type="number"
                                  name={field.name}
                                  onBlur={field.onBlur}
                                  ref={field.ref}
                                  value={typeof field.value === 'number' ? field.value : ''}
                                  onChange={e => field.onChange(e.target.value === '' ? undefined : +e.target.value)}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )} />
                      </div>
                      <FormField control={form.control} name="childrenAgesText" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Ages of children (manual, optional)</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g., 2, 5, 9" {...field} value={field.value ?? ''} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={form.control} name="needs" render={({ field }) => (
                          <FormItem><FormLabel>About Me / My Needs</FormLabel><FormControl><Textarea placeholder="Describe your family's needs, or what you offer as a sitter..." rows={4} {...field} /></FormControl><FormMessage /></FormItem>
                        )} />
                      <FormField control={form.control} name="availability" render={({ field }) => (
                          <FormItem><FormLabel>Availability</FormLabel><FormControl><Input placeholder="e.g., Weekends, weekday evenings after 5 PM" {...field} /></FormControl><FormMessage /></FormItem>
                        )} />
                      <FormField control={form.control} name="interests" render={({ field }) => (
                          <FormItem><FormLabel>Interests</FormLabel><FormControl><Input placeholder="e.g., Hiking, reading, board games (comma separated)" {...field} /></FormControl><FormMessage /></FormItem>
                        )} />
                    </div>
                    </CardContent>
                    </Card>
                    </CardContent>
                    <CardFooter className="flex justify-end gap-2 pt-4">
                      <Button type="button" variant="ghost" onClick={() => router.push(`/families/profile/${user?.uid}`)}>Cancel</Button>
                      <Button type="submit">
                          {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                          {isSaving ? 'Saving...' : 'Save Changes'}
                      </Button>
                    </CardFooter>
                </Card>
            </fieldset>
          </form>
        </Form>
        
        <Separator className="my-8" />
        
        <Card>
          <CardHeader>
            <CardTitle className="font-headline text-xl flex items-center gap-2">
              <BellRing className="text-primary" />
              Notification Settings
            </CardTitle>
            <CardDescription>
              Enable push notifications to get real-time updates on matches, messages, and shifts.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Enable browser notifications to receive updates for matches, messages, and shifts.
            </p>
          </CardContent>
          <CardFooter className="bg-slate-50 pt-4 pb-4">
            <Button
              onClick={handleEnableNotifications}
              disabled={isHandlingNotifications}
            >
              {isHandlingNotifications ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Enable Notifications
            </Button>
          </CardFooter>
        </Card>

         <Separator className="my-8" />

          <Card className="border-destructive">
            <CardHeader>
              <CardTitle className="text-destructive font-headline flex items-center gap-2">
                <AlertTriangle/>
                Danger Zone
              </CardTitle>
              <CardDescription>
                  This action is permanent and cannot be undone.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p>
                  Deleting your account will permanently remove all your information, including your profile, photos, messages, and matches from our systems.
              </p>
            </CardContent>
            <CardFooter className="bg-destructive/10 pt-6">
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" disabled={isBusy}>
                    {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                    {isDeleting ? 'Deleting Account...' : 'Permanently Delete My Account'}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This action cannot be undone. This will permanently delete your account and remove all of your data from our servers.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDeleteAccount} className={cn(buttonVariants({variant: 'destructive'}))}>
                      Yes, delete my account
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </CardFooter>
          </Card>
      </div>
    </AuthGuard>
  );
}
