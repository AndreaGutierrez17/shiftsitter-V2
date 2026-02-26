import type { Timestamp } from "firebase/firestore";

export type UserRole = "parent" | "sitter" | "reciprocal";

export interface UserProfile {
  id: string;
  email: string | null;
  name: string;
  age: number;
  role: UserRole;
  location: string;
  latitude?: number;
  longitude?: number;
  numberOfChildren?: number;
  childAge?: number;
  childrenAgesText?: string;
  availability: string;
  needs: string;
  interests: string[];
  photoURLs: string[];
  workplace?: string;
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
  userId: string;
  toUid?: string;
  type: "match" | "message" | "shift" | "system" | "new_match" | "shift_cancelled" | "shift_starting_soon" | "shift_completed_review";
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
