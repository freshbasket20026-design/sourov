/**
 * Dirty Dozen Security Rule Verification Matrix for Taya Firestore Rules
 * Validates the twelve adversarial cases documented in security_spec.md.
 */
export interface AdversarialCase {
  id: number;
  name: string;
  targetPath: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  expectedOutcome: 'PERMISSION_DENIED';
  enforcedBy: string;
}

export const DIRTY_DOZEN_CASES: AdversarialCase[] = [
  {
    id: 1,
    name: 'Unauthenticated read',
    targetPath: '/users/userA/conversations/conv-1',
    operation: 'get',
    expectedOutcome: 'PERMISSION_DENIED',
    enforcedBy: 'isOwner(userId) -> isVerifiedUser() -> isSignedIn()',
  },
  {
    id: 2,
    name: 'Unverified email write',
    targetPath: '/users/userA/conversations/conv-1',
    operation: 'create',
    expectedOutcome: 'PERMISSION_DENIED',
    enforcedBy: 'isVerifiedUser() requires request.auth.token.email_verified == true',
  },
  {
    id: 3,
    name: 'Cross-user conversation spoof',
    targetPath: '/users/userA/conversations/conv-1',
    operation: 'create',
    expectedOutcome: 'PERMISSION_DENIED',
    enforcedBy: 'isOwner(userId) requires request.auth.uid == userId',
  },
  {
    id: 4,
    name: 'OwnerId hijacking in own path',
    targetPath: '/users/userA/conversations/conv-1',
    operation: 'create',
    expectedOutcome: 'PERMISSION_DENIED',
    enforcedBy: 'isValidConversation checks data.ownerId == userId',
  },
  {
    id: 5,
    name: 'Cross-user PII leak',
    targetPath: '/users/userA/private/info',
    operation: 'get',
    expectedOutcome: 'PERMISSION_DENIED',
    enforcedBy: 'isOwner(userId) blocks non-owners from private PII document',
  },
  {
    id: 6,
    name: 'Shadow / ghost field injection',
    targetPath: '/users/userA/public/profile',
    operation: 'create',
    expectedOutcome: 'PERMISSION_DENIED',
    enforcedBy: 'isValidPublicProfile enforces data.keys().hasOnly([...])',
  },
  {
    id: 7,
    name: 'Orphaned message injection',
    targetPath: '/users/userA/conversations/missing/messages/msg-1',
    operation: 'create',
    expectedOutcome: 'PERMISSION_DENIED',
    enforcedBy: 'exists(...) && get(...).data.ownerId == request.auth.uid',
  },
  {
    id: 8,
    name: 'Client-forged createdAt timestamp',
    targetPath: '/users/userA/conversations/conv-1',
    operation: 'create',
    expectedOutcome: 'PERMISSION_DENIED',
    enforcedBy: 'incoming().createdAt == request.time',
  },
  {
    id: 9,
    name: 'Immutable createdAt mutation',
    targetPath: '/users/userA/conversations/conv-1',
    operation: 'update',
    expectedOutcome: 'PERMISSION_DENIED',
    enforcedBy: 'incoming().createdAt == existing().createdAt && affectedKeys().hasOnly(...)',
  },
  {
    id: 10,
    name: 'Unauthorized list scraping',
    targetPath: '/users/userA/conversations',
    operation: 'list',
    expectedOutcome: 'PERMISSION_DENIED',
    enforcedBy: 'isOwner(userId) && resource.data.ownerId == request.auth.uid',
  },
  {
    id: 11,
    name: 'Oversized or invalid ID poisoning',
    targetPath: '/users/userA/conversations/bad id with spaces',
    operation: 'create',
    expectedOutcome: 'PERMISSION_DENIED',
    enforcedBy: 'isValidId(conversationId) size <= 128 && ^[a-zA-Z0-9_-]+$',
  },
  {
    id: 12,
    name: 'Oversized message content payload',
    targetPath: '/users/userA/conversations/conv-1/messages/msg-1',
    operation: 'create',
    expectedOutcome: 'PERMISSION_DENIED',
    enforcedBy: 'isValidMessage enforces data.content.size() <= 40000',
  },
];
