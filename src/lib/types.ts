import type { Timestamp } from "firebase/firestore";

export type UserRole = "parent" | "sitter" | "reciprocal";

export type UserProfile = {
  id: string; // Firebase uid
  email: string | null;
  name: string;
  age: number;
  role: UserRole;
  location: string; // e.g., "Baltimore, MD"
  latitude?: number;
  longitude?: number;
  numberOfChildren?: number;
  childAge?: number; // Representing age of youngest child
  availability: string; // e.g., "Weekends, weekday evenings"
  needs: string; // e.g., "After-school care for a 7-year-old"
  interests: string[];
  photoURLs: string[]; // Max 5
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
};

export type Match = {
  id: string;
  userIds: string[];
  createdAt: Timestamp;
};

export type Conversation = {
  id: string;
  userIds: string[];
  lastMessage: string;
  lastMessageAt: Timestamp;
  lastMessageSenderId: string;
  userProfiles: { [key: string]: { name: string; photoURLs: string[] } };
};

export type Message = {
  id: string;
  conversationId: string;
  senderId: string;
  text: string;
  createdAt: Timestamp;
};

export type Shift = {
  id:string;
  proposerId: string;
  accepterId: string;
  userIds: string[]; // To easily query shifts for a user
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  status: "proposed" | "accepted" | "rejected" | "completed" | "swap_proposed";
  createdAt: Timestamp;
  swapDetails?: {
    proposerId: string;
    newDate: string;
    newStartTime: string;
    newEndTime: string;
  };
};

export type Review = {
  id: string;
  shiftId: string;
  reviewerId: string;
  revieweeId: string;
  rating: number; // 1-5
  comment: string;
  createdAt: Timestamp;
  tags?: {
    kidsSafe?: boolean;
    punctual?: boolean;
    cleanAndSafe?: boolean;
    kidsHappy?: boolean;
  }
};
