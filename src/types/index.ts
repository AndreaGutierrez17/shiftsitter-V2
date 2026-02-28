import type { Timestamp } from "firebase/firestore";

export type UserRole = "parent" | "sitter" | "reciprocal";

export type ShiftBlock = "Early" | "Day" | "Evening" | "Night";
export type HandoffPreference = "pickup" | "dropoff" | "my_workplace" | "their_workplace" | "either";
export type SettingPreference = "my_home" | "their_home" | "either";
export type PetsInHome = "none" | "dog" | "cat" | "multiple" | "unknown";

export interface MatchNeed {
  days?: string[];
  shifts?: ShiftBlock[];
  durationBucket?: string;
  settingPreference?: SettingPreference;
  childrenCount?: number;
  childrenAges?: number[];
  specialNeeds?: {
    has?: boolean;
    notes?: string;
  };
  smokeFree?: boolean;
  requireSmokeFree?: boolean;
  petsInHome?: PetsInHome;
  okWithPets?: boolean;
  zipHome?: string;
  zipWork?: string;
  handoffPreference?: HandoffPreference;
  maxTravelMinutes?: number;
  extrasNeeded?: string[];
}

export interface MatchOffer {
  days?: string[];
  shifts?: ShiftBlock[];
  hoursPerMonthBucket?: string;
  settingPreference?: SettingPreference;
  maxChildrenTotal?: number;
  ageRanges?: string[];
  okWithSpecialNeeds?: boolean;
  hasVehicle?: boolean;
  extrasOffered?: string[];
  smokeFree?: boolean;
  okWithPets?: boolean;
  zipHome?: string;
  zipWork?: string;
  handoffPreference?: HandoffPreference;
  maxTravelMinutes?: number;
}

export interface UserProfile {
  id: string;
  email: string | null;
  accountType?: 'family' | 'employer';
  name: string;
  age: number;
  role: UserRole;
  location: string;
  state?: string;
  city?: string;
  zip?: string;
  latitude?: number;
  longitude?: number;
  numberOfChildren?: number;
  childAge?: number;
  childrenAgesText?: string;
  availability: string;
  needs: string;
  offerSummary?: string;
  interests: string[];
  interestSelections?: string[];
  interestsOther?: string;
  interestsText?: string;
  photoURLs: string[];
  workplace?: string;
  daysNeeded?: string[];
  shiftsNeeded?: string[];
  smokeFree?: boolean;
  petsOk?: boolean;
  drivingLicense?: boolean;
  specialNeedsOk?: boolean;
  need?: MatchNeed;
  offer?: MatchOffer;
  references?: string;
  backgroundCheckStatus: "not_started" | "in_progress" | "completed";
  cvUrl?: string;
  verificationStatus?: "unverified" | "pending" | "verified" | "rejected";
  idFrontUrl?: string;
  selfieUrl?: string;
  verificationSubmittedAt?: Timestamp;
  verificationReviewedAt?: Timestamp;
  verificationReviewNotes?: string;
  profileComplete: boolean;
  avgRating?: number;
  reviewCount?: number;
  ratingBreakdown?: {
    1?: number;
    2?: number;
    3?: number;
    4?: number;
    5?: number;
  };
  lastReviewAt?: Timestamp;
  averageRating?: number;
  ratingCount?: number;
  fcmToken?: string;
  isDemo?: boolean;
  lastSeen?: Timestamp;
}

export interface Match {
  id: string;
  userIds: string[];
  createdAt: Timestamp;
}

export interface ConversationUserProfile {
  name: string;
  photoURLs: string[];
}

export interface Conversation {
  id: string;
  userIds: string[];
  lastMessage: string;
  lastMessageAt: Timestamp;
  lastMessageSenderId: string;
  userProfiles: Record<string, ConversationUserProfile>;
  unreadCount?: Record<string, number>;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  text: string;
  createdAt: Timestamp;
  attachmentUrl?: string;
  attachmentName?: string;
  attachmentType?: string;
  attachmentSizeBytes?: number;
}

export interface Shift {
  id: string;
  proposerId: string;
  accepterId: string;
  userIds: string[];
  date: string;
  startTime: string;
  endTime: string;
  status: "proposed" | "accepted" | "rejected" | "completed" | "swap_proposed" | "cancelled";
  createdAt: Timestamp;
  startAt?: Timestamp;
  endAt?: Timestamp;
  cancelledAt?: Timestamp;
  cancelledByUid?: string;
  cancelReasonCode?: "illness" | "emergency" | "schedule_change" | "transportation_issue" | "other";
  cancelReasonText?: string;
  cancellationWindowHours?: number;
  startReminderSent?: boolean;
  startReminderSentAt?: Timestamp;
  completedAt?: Timestamp;
  swapDetails?: {
    proposerId: string;
    newDate: string;
    newStartTime: string;
    newEndTime: string;
  };
}

export interface Review {
  id: string;
  shiftId: string;
  reviewerUid?: string;
  revieweeUid?: string;
  reviewerId: string;
  revieweeId: string;
  rating: number;
  comment: string | null;
  createdAt: Timestamp;
  roleContext?: UserRole;
  visibility?: 'public';
  metadata?: {
    startAt?: string | null;
    endAt?: string | null;
  };
  tags?: {
    kidsSafe?: boolean;
    punctual?: boolean;
    cleanAndSafe?: boolean;
    kidsHappy?: boolean;
  };
}

export interface Notification {
  id: string;
  userId?: string;
  toUid?: string;
  type:
    | "match"
    | "message"
    | "request"
    | "review"
    | "shift"
    | "system"
    | "new_match"
    | "shift_cancelled"
    | "shift_starting_soon"
    | "shift_completed_review"
    | "shift_updated";
  title: string;
  body: string;
  read: boolean;
  readAt?: Timestamp | null;
  createdAt: Timestamp;
  href?: string | null;
  deepLink?: string | null;
  data?: Record<string, string | number | boolean | null>;
  metadata?: Record<string, string | number | boolean | null>;
}
