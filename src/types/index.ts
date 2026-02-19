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
  profileComplete: boolean;
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
}

export interface Shift {
  id: string;
  proposerId: string;
  accepterId: string;
  userIds: string[];
  date: string;
  startTime: string;
  endTime: string;
  status: "proposed" | "accepted" | "rejected" | "completed" | "swap_proposed";
  createdAt: Timestamp;
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
  reviewerId: string;
  revieweeId: string;
  rating: number;
  comment: string;
  createdAt: Timestamp;
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
  type: "match" | "message" | "shift" | "system";
  title: string;
  body: string;
  read: boolean;
  createdAt: Timestamp;
  metadata?: Record<string, string | number | boolean | null>;
}
