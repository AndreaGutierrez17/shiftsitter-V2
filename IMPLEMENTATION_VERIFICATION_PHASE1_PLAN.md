# ShiftSitter V2 - Verification Phase 1 Plan (Next Session)

## Goal
Implement a lightweight verification gate for beta (not full KYC), without breaking auth, matching, messaging, calendar, or profile editing.

## Scope For Phase 1 (Next Session)
- Real uploads to Firebase Storage:
  - `government ID (front only)`
  - `selfie`
  - (CV already exists in `profile/edit`; decide if onboarding should require it by role)
- Firestore profile fields:
  - `verificationStatus: 'unverified' | 'pending' | 'verified' | 'rejected'`
  - `idFrontUrl?: string`
  - `selfieUrl?: string`
  - `verificationSubmittedAt?: Timestamp`
  - `verificationReviewedAt?: Timestamp`
  - `verificationReviewNotes?: string`
- Matching gate:
  - block if `verificationStatus === 'unverified'`
  - allow if `pending` or `verified`
- UI badges:
  - `Pending Verification`
  - `Verified`
  - `Rejected`
- Admin-only review route (simple):
  - list users with verification docs
  - preview docs
  - set status to `verified` / `rejected`

## Constraints (Do Not Break)
- Do not change existing routes for auth/messages/match/profile.
- Do not refactor core Firebase access layers.
- Keep current chat and calendar features working.
- Keep `setDoc(..., { merge: true })` compatibility where already used.

## Current State (Already Implemented)
- Match, messaging, calendar, cancellations, reviews, inbox notifications.
- CV upload exists in `src/app/families/profile/edit/page.tsx` (`cvUrl`).
- No ID/selfie upload yet.
- No `verificationStatus` persisted yet.
- No admin verification route yet.

## Implementation Order (Recommended)

### 1. Types and Profile Schema
Update `src/types/index.ts` `UserProfile` with:
- `verificationStatus`
- `idFrontUrl`
- `selfieUrl`
- review timestamps/notes fields (optional)

Default behavior:
- Existing users with missing field should be treated as `unverified`.

### 2. Profile Edit: Upload UI (Real Storage Uploads)
File: `src/app/families/profile/edit/page.tsx`

Add section:
- `Identity Verification`
  - upload ID front
  - upload selfie
  - status badge

Requirements:
- uploads go to Storage (new folder e.g. `verification_docs/{uid}/...`)
- save URLs in `users/{uid}`
- when both files exist and status is `unverified`, set `verificationStatus = 'pending'`

Important:
- docs must not be rendered in public profile
- keep visible only in profile/edit + future admin route

### 3. Match Gate (Beta Rule)
File: `src/app/families/match/page.tsx`

Before loading swipe candidates:
- if `verificationStatus === 'unverified'`
  - show blocked state / card
  - CTA to `/families/profile/edit`
  - clear explanation

Allow:
- `pending`
- `verified`

### 4. Badge UI
Files:
- `src/app/families/profile/[Id]/page.tsx` (public profile card)
- `src/app/families/profile/edit/page.tsx` (own profile)
- optional: match card

Display:
- `Pending Verification` (neutral/amber)
- `Verified` (green)
- `Rejected` (destructive)

### 5. Admin-Only Route (Simple)
Create route/page:
- `src/app/admin/verification/page.tsx` (or `/families/admin/verification` if preferred)

Phase 1 simple protection:
- allowlist of admin emails in code/env
- if not admin -> block/redirect

Admin actions:
- list submitted users (`idFrontUrl` + `selfieUrl`)
- open docs
- set `verificationStatus`
- optional review note

### 6. Optional (If Time)
- Add required verification callout in onboarding finish step (not full upload there yet)
- Add small helper copy explaining why verification is required

## Open Product Decisions To Confirm Next Session
- Is CV required for all roles or only sitters?
- Should verification docs upload be in onboarding, profile/edit, or both?
- Do we want to auto-set `pending` immediately after both uploads? (recommended: yes)
- Admin route path preference:
  - `/admin/verification`
  - `/families/admin/verification`

## Quick Test Plan (After Implementation)
1. User uploads ID front + selfie in `profile/edit`
2. Firestore updates:
   - `idFrontUrl`
   - `selfieUrl`
   - `verificationStatus = pending`
3. User can enter Match with `pending`
4. Admin opens verification route, marks `verified`
5. User profile shows `Verified` badge
6. Public users cannot see the raw docs

## What To Tell Codex Tomorrow (Copy/Paste)
Use this exact message:

`Continue ShiftSitter verification Phase 1 from IMPLEMENTATION_VERIFICATION_PHASE1_PLAN.md. Start with types + profile/edit uploads (ID front + selfie), then add match gating (block unverified, allow pending/verified), then admin review route. Keep current backend and messages working.`

