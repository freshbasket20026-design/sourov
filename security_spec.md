# Security Specification — Taya Auth & Cloud Sync

## 1. Data Invariants
1. **Owner-Only Private Data & Verified Email**: All reads and writes to `/users/{userId}/private/*`, `/users/{userId}/conversations/*`, and `/users/{userId}/conversations/{conversationId}/messages/*` require `request.auth != null`, `request.auth.token.email_verified == true`, and `request.auth.uid == userId`.
2. **PII Split Isolation**: Email PII is stored exclusively in `/users/{userId}/private/info` (strictly owner-only read/write). `/users/{userId}/public/profile` stores only `uid`, `displayName`, `photoURL`, `createdAt`, and `updatedAt`.
3. **Master Gate Relational Sync**: Every message in `/users/{userId}/conversations/{conversationId}/messages/{messageId}` must verify via `get()` on create that its parent conversation `/users/{userId}/conversations/{conversationId}` exists and has `ownerId == request.auth.uid`.
4. **Immutable Ownership & Timestamps**: `uid`, `ownerId`, `id`, `conversationId`, and `createdAt` cannot be modified after creation. `createdAt == request.time` on create; `updatedAt == request.time` on update.
5. **Strict Key & Type Guards**: Every entity enforces `hasAll` + `hasOnly` on create and `affectedKeys().hasOnly(...)` on update, plus regex ID validation (`^[a-zA-Z0-9_-]+$`) and string `.size()` bounds.

## 2. The "Dirty Dozen" Attack Payloads (All Must Return PERMISSION_DENIED)
1. **Unauthenticated read**: Unauthenticated client requests `get(/users/userA/conversations/conv1)`.
2. **Unverified email write**: Authenticated user with `email_verified: false` tries to create `/users/userA/conversations/conv1`.
3. **Cross-user conversation spoof**: `userB` tries to create `/users/userA/conversations/conv1` with `ownerId: "userB"`.
4. **OwnerId hijacking in own path**: `userA` tries to create `/users/userA/conversations/conv1` with `ownerId: "userB"`.
5. **Cross-user PII leak**: `userB` attempts `get(/users/userA/private/info)`.
6. **Shadow / ghost field injection**: `userA` creates `/users/userA/public/profile` including an extra `{ isAdmin: true }` field.
7. **Orphaned message injection**: `userA` tries to create a message under `/users/userA/conversations/nonexistent/messages/msg1`.
8. **Client-forged createdAt timestamp**: `userA` creates a conversation with `createdAt` set to a past timestamp instead of `request.time`.
9. **Immutable createdAt mutation**: `userA` updates `/users/userA/conversations/conv1` changing `createdAt`.
10. **Unauthorized list scraping**: `userB` attempts `list(/users/userA/conversations)`.
11. **Oversized ID poisoning**: `userA` tries to create a conversation whose `conversationId` is 500 characters or contains spaces/`/`.
12. **Oversized content payload (Denial of Wallet)**: `userA` tries to write a message with `content.size() > 40000`.
