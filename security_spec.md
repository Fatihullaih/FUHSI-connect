# FUHSI Connect Firestore Security Specification

## 1. Data Invariants
1. **Default Deny Root**: Every unmatched document path under `/databases/{database}/documents` rejects all reads and writes (`allow read, write: if false;`).
2. **RBAC Privilege Non-Escalation**: Non-admin users can NEVER create or update a `/users/{userId}` document with `isAdmin: true`, `isVerified: true`, `isApproved: true` (on self-signup update), or write to `/admins/{adminId}` or `/settings/{settingId}`.
3. **Secret & PII Isolation**: Password hashes or plaintext secrets (`password`, `savedPassword`, `passwordHash`) are forbidden in `/users/{userId}`. Sensitive PII (`studentEmail`, `emergencyHomePhone`, `matricNumber`) is readable ONLY by the owning `ownerUid` user or an authenticated `isAdmin()`.
4. **Immutable Authorship & Terminal Locking**:
   - Posts, comments, verification requests, reports, and direct messages bind `ownerUid` / `senderUid` / `reporterUid` to `request.auth.uid` on create and prohibit reassigning ownership on update.
   - Resolved reports (`status == 'RESOLVED'`), approved/declined/revoked verification requests, and approved marketplace items cannot have terminal states reversed by non-admins.
5. **Private Messaging & Moderation Scope**: Direct messages (`/direct_messages`), help desk tickets (`/helpdesk_inquiries`), reports (`/reports`, `/chat_reports`), and deleted tombstones (`/deleted_users`) cannot be read via blanket list queries by uninvolved students.
6. **Path & Payload Hygiene**: Every single-document ID satisfies `^[a-zA-Z0-9_-]{1,128}$`, every string enforces `.size()` limits, and arrays are strictly size-bounded.

---

## 2. The "Dirty Dozen" Attack Payloads (Expected Result: `PERMISSION_DENIED`)

1. **Unauthenticated Global Read (`GET /users/usr_admin_modula`)**
   - Payload: Unauthenticated read (`request.auth == null`) against `/users/usr_admin_modula`.
   - Invariant Broken: Default-deny & PII isolation.
2. **Self-Registration Admin Escalation (`CREATE /users/student_attacker`)**
   - Payload: `{ "id": "student_attacker", "ownerUid": "student_uid", "nickname": "@attacker", "isAdmin": true, "isApproved": true, "isVerified": true }`
   - Invariant Broken: Prevent self-assigned roles.
3. **Password / Secret Shadow Injection (`CREATE /users/student_attacker`)**
   - Payload: `{ "id": "student_attacker", "ownerUid": "student_uid", "nickname": "@attacker", "savedPassword": "leaked", "isAdmin": false }`
   - Invariant Broken: Validation Blueprint `keys().hasOnly(...)` & secret exclusion.
4. **Profile Privilege Update-Gap (`UPDATE /users/student_uid`)**
   - Payload: `{ "isAdmin": true, "badgeType": "GREEN", "badgeTitle": "Chief Admin" }`
   - Invariant Broken: Action-based `affectedKeys().hasOnly(...)` & RBAC field lock.
5. **Another Student PII Snooping (`GET /users/victim_uid` as `student_uid`)**
   - Payload: Authenticated `student_uid` reads `victim_uid`'s user document containing `studentEmail`, `matricNumber`, and `emergencyHomePhone`.
   - Invariant Broken: PII Blanket Test.
6. **Email Spoofing Admin Bypass (`READ /admins/admin_doc`)**
   - Payload: `request.auth.token.email == "adepojufatih33@gmail.com"` with `request.auth.token.email_verified == false`.
   - Invariant Broken: Verified email enforcement inside `isAdmin()`.
7. **Post Authorship Spoofing (`CREATE /posts/post_fake`)**
   - Payload: `{ "id": "post_fake", "ownerUid": "modula_uid", "authorNickname": "@modula", "content": "Fake admin notice" }` submitted by `student_uid`.
   - Invariant Broken: Identity Integrity (`ownerUid == request.auth.uid`).
8. **Marketplace Price & Status Tampering (`UPDATE /marketplace_pending/item_1`)**
   - Payload: Seller (`ownerUid == student_uid`) updates `{ "status": "APPROVED", "approvedPrice": 1 }`.
   - Invariant Broken: Admin-only state transition & terminal lock.
9. **Unauthorized Private DM Snooping (`LIST /direct_messages` as third party)**
   - Payload: `student_c` lists `/direct_messages` without `senderUid == student_c && receiverUid == student_c` match.
   - Invariant Broken: Secure List Queries (`resource.data` scoping).
10. **Settings Verification Fee Manipulation (`UPDATE /settings/verification_settings`)**
    - Payload: `{ "verificationFee": 0 }` submitted by `student_uid`.
    - Invariant Broken: Admin-only configuration collection.
11. **Oversized ID Poisoning / Denial-of-Wallet (`CREATE /posts/<200-char-invalid-id>`)**
    - Payload: Document ID containing `..$spaces` or exceeding 128 characters.
    - Invariant Broken: Path Variable Hardening (`isValidId()`).
12. **Terminal Verification Override (`UPDATE /verification_requests/req_1`)**
    - Payload: `student_uid` attempts `{ "status": "APPROVED" }` on a previously `DECLINED` verification request.
    - Invariant Broken: Terminal State Locking.
