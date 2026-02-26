# ShiftSitter V2 - Phase 2 Plan (Next Session, aligned to Match Engine document)

## Goal (Phase 2)
Continue from the current working beta and align the product with the shared match-engine user-flow document, while preserving current auth/match/messages/calendar behavior.

Primary focus for next session:
1. Verification flow refinement (pending -> admin review -> verified/rejected)
2. Structured reciprocal onboarding (`need` / `offer`) per document
3. Hard filters + scoring alignment cleanup in match UX (without breaking swipe flow)

## What Is Already Done (Current Repo State)
- `profile/edit` uploads:
  - ID front (`idFrontUrl`)
  - selfie (`selfieUrl`)
- Files upload to Firebase Storage (`verification_docs/...`)
- Firestore profile fields added:
  - `verificationStatus`
  - `idFrontUrl`, `selfieUrl`
  - review timestamps/notes
- Match gating:
  - blocks `unverified`
  - allows verified users (and currently beta-auto-verifies after both uploads)
- Admin route + UI:
  - `/api/admin/verification`
  - `/admin/verification`
- Public profile badge (verification status)
- Compatibility engine exists and computes a real % (not placeholder), with hard filters + breakdown
- Swipe matching and messaging remain functional

## Track A - Verification (Refine Phase 1)
### Replace beta auto-verify behavior
Current beta behavior:
- both files uploaded => `verificationStatus = verified`

Phase 2 desired behavior (recommended):
- both files uploaded => `verificationStatus = pending`
- only admin can set `verified` or `rejected`

## Track A Scope (Verification)

### 1. Update Verification Status Logic in `profile/edit`
File: `src/app/families/profile/edit/page.tsx`

Change behavior:
- If only one file exists -> `unverified`
- If both files exist -> `pending` (not `verified`)
- If user re-uploads after rejection:
  - set back to `pending`
  - clear/keep admin notes based on product choice (recommended: keep notes visible)

UI copy updates:
- Replace current beta text:
  - “In beta, verification is marked automatically...”
- New text:
  - “After both files are uploaded, your verification status will be marked as Pending until reviewed by an admin.”

### 2. Match Gating Policy Refinement
File: `src/app/families/match/page.tsx`

Confirm/keep:
- block only if `verificationStatus === 'unverified'`
- allow:
  - `pending`
  - `verified`

Add UX messaging:
- if `pending`, show a subtle banner:
  - “Your verification is pending review. Matching is enabled during beta.”
- if `rejected`, block or warn with CTA to re-upload (recommended: block until re-upload)

Recommended Phase 2 behavior for `rejected`:
- treat as blocked until at least one file is re-uploaded and status returns to `pending`

### 3. Admin Verification UI Improvements
Files:
- `src/app/admin/verification/page.tsx`
- `src/app/api/admin/verification/route.ts`

Add/Improve:
- filter tabs or quick filters:
  - Pending
  - Rejected
  - Verified
- visible timestamps:
  - `verificationSubmittedAt`
  - `verificationReviewedAt`
- clearer action labels:
  - `Approve (Verified)`
  - `Reject`
  - `Reset to Pending`
- optional note rendering in the queue cards

### 4. Storage Rules for Verification Docs (Production)
Already updated in repo and deployed during current session:
- `/verification_docs/{uid}/{fileName}` owner read/write
Keep this intact.

### 5. Optional Onboarding Integration (Soft)
File: `src/app/families/onboarding/page.tsx`

Do not fully move uploads yet unless time allows.
Add a finish-step notice:
- “Before matching, upload ID front + selfie in Profile Edit.”
- CTA button to `'/families/profile/edit'` (optional)

### 6. Notifications (Optional / Nice-to-Have)
When admin changes status:
- create inbox notification:
  - `verification_approved`
  - `verification_rejected`

This is optional for Phase 2 but useful.

## Track B - Match Engine / Onboarding Alignment (from shared document)
This is the document-driven work to start after (or alongside) verification refinement.

### 1. Structured Reciprocal Onboarding (Need / Offer)
Implement guided schema in profile data:
- `need`
  - days[]
  - shifts[]
  - durationBucket
  - settingPreference
  - childrenCount
  - childrenAges[]
  - specialNeeds { has, notes? }
  - smokeFree
  - requireSmokeFree
  - petsInHome
  - okWithPets
  - zipHome
  - zipWork
  - handoffPreference
  - maxTravelMinutes
  - extrasNeeded[]
- `offer`
  - days[]
  - shifts[]
  - hoursPerMonthBucket
  - settingPreference
  - maxChildrenTotal
  - ageRanges[]
  - okWithSpecialNeeds
  - hasVehicle
  - extrasOffered[]

Notes:
- Keep existing legacy fields for compatibility (`location`, `availability`, `needs`, etc.)
- Use `merge: true`
- Keep onboarding efficient (current progress-step UX)

### 2. Hard Filters (Document-aligned)
Ensure hard filter exclusions include:
- distance/travel + handoff alignment
- schedule overlap (>=1 day + >=1 shift)
- safety requirements
- capacity
- setting preference alignment

Current engine already does much of this, but Phase 2 should:
- verify mappings against new `need/offer` schema
- remove fallback ambiguity causing weak scores when data is missing

### 3. Compatibility Scoring UX (Hybrid Option C)
Current engine exists. Phase 2 should align presentation with doc:
- keep hard filters for visibility
- weighted score for ranking
- show top strengths + weaker areas
- improve breakdown labels in UI cards/details

### 4. Match Results UI (Document style)
Add a Match Dashboard list view in addition to swipe:
- name/photo/initials
- overall %
- top strengths
- structured breakdown preview

Keep swipe intact.

### 5. Summary + Re-run Matching
Add CTA to edit onboarding preferences and re-run ranking.

### 6. Calendar as Matching Input (Document-consistent)
Use rolling availability (4-6 weeks) to improve schedule overlap quality.
Current calendar exists; Phase 2 should wire this data into scoring more strongly.

## Product Decisions To Confirm Before Phase 2 Starts (Quick)
1. Should `rejected` users be blocked from Match? (recommended: yes)
2. When re-uploading after rejection, should admin notes remain visible? (recommended: yes)
3. Do we want a separate “Verification Pending” badge on match cards, or only profile?
4. Start next session with:
   - `Track A (verification refinement)` first, then `Track B`
   - or jump directly into `Track B` onboarding/schema work

## Test Plan (Verification Refinement)
1. User uploads ID + selfie
2. Firestore becomes:
   - `verificationStatus = pending`
3. User can access Match (pending allowed)
4. Admin approves in `/admin/verification`
5. Firestore becomes `verified`
6. Badge updates in public profile
7. Admin rejects another user
8. Rejected user sees clear CTA to re-upload and cannot proceed to Match (if we enable this in Phase 2)

## What To Tell Codex Tomorrow (Copy/Paste)
`Continue from IMPLEMENTATION_VERIFICATION_PHASE2_PLAN.md using the shared match-engine document as source of truth. Start with Track A: change verification uploads to set pending (not auto-verified), improve admin review UX, and finalize rejected gating. Then begin Track B: structured need/offer onboarding schema and document-aligned hard filters without breaking swipe/messages/calendar.`
