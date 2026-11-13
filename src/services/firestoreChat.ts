import type { User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import type { ChatMessage, Conversation } from '../types/chat';

function toSafeId(raw: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 128);
  return cleaned || `id-${Date.now()}`;
}

function toMillis(val: unknown): number {
  if (val instanceof Timestamp) return val.toMillis();
  if (typeof val === 'number') return val;
  return Date.now();
}

export async function syncUserProfile(
  user: User,
  customDisplayName?: string
): Promise<void> {
  const uid = toSafeId(user.uid);
  const displayName = (
    customDisplayName?.trim() ||
    user.displayName?.trim() ||
    user.email?.split('@')[0] ||
    'Taya User'
  ).slice(0, 80);
  const photoURL = user.photoURL ? user.photoURL.slice(0, 500) : undefined;
  const email = (user.email || '').trim().slice(0, 254);

  const publicPath = `users/${uid}/public/profile`;
  const publicRef = doc(db, 'users', uid, 'public', 'profile');

  try {
    const existingPublic = await getDoc(publicRef);
    if (!existingPublic.exists()) {
      await setDoc(publicRef, {
        uid,
        displayName,
        ...(photoURL ? { photoURL } : {}),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(publicRef, {
        displayName,
        ...(photoURL ? { photoURL } : {}),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, publicPath);
  }

  if (email.length >= 3) {
    const privatePath = `users/${uid}/private/info`;
    const privateRef = doc(db, 'users', uid, 'private', 'info');
    try {
      const existingPrivate = await getDoc(privateRef);
      if (!existingPrivate.exists()) {
        await setDoc(privateRef, {
          uid,
          email,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else {
        await updateDoc(privateRef, {
          email,
          updatedAt: serverTimestamp(),
        });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, privatePath);
    }
  }
}

export async function getUserDisplayName(uid: string): Promise<string | null> {
  const safeUid = toSafeId(uid);
  const path = `users/${safeUid}/public/profile`;
  try {
    const snap = await getDoc(doc(db, 'users', safeUid, 'public', 'profile'));
    if (!snap.exists()) return null;
    const data = snap.data() as { displayName?: string };
    return typeof data.displayName === 'string' ? data.displayName : null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function ensureConversationDoc(
  userId: string,
  conv: { id: string; title: string; model: string }
): Promise<void> {
  const uid = toSafeId(userId);
  const convId = toSafeId(conv.id);
  const title = (conv.title.trim() || 'New Conversation').slice(0, 160);
  const model = 'gemini-3.1-flash-lite';
  const path = `users/${uid}/conversations/${convId}`;
  const ref = doc(db, 'users', uid, 'conversations', convId);

  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        id: convId,
        ownerId: uid,
        title,
        model,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(ref, {
        title,
        model,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function saveMessageDoc(
  userId: string,
  conversationId: string,
  msg: ChatMessage
): Promise<void> {
  const uid = toSafeId(userId);
  const convId = toSafeId(conversationId);
  const msgId = toSafeId(msg.id);
  const role = msg.role === 'assistant' ? 'assistant' : 'user';
  const content = (msg.content || '').slice(0, 40000);
  const model = msg.model ? msg.model.slice(0, 64) : undefined;
  const totalTokens =
    typeof msg.usage?.totalTokens === 'number' && msg.usage.totalTokens >= 0
      ? Math.round(msg.usage.totalTokens)
      : undefined;

  const path = `users/${uid}/conversations/${convId}/messages/${msgId}`;
  const ref = doc(db, 'users', uid, 'conversations', convId, 'messages', msgId);

  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        id: msgId,
        ownerId: uid,
        conversationId: convId,
        role,
        content,
        ...(model ? { model } : {}),
        ...(typeof totalTokens === 'number' ? { totalTokens } : {}),
        createdAt: serverTimestamp(),
      });
    } else {
      await updateDoc(ref, {
        content,
        ...(model ? { model } : {}),
        ...(typeof totalTokens === 'number' ? { totalTokens } : {}),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function loadConversationMessages(
  userId: string,
  conversationId: string
): Promise<ChatMessage[]> {
  const uid = toSafeId(userId);
  const convId = toSafeId(conversationId);
  const path = `users/${uid}/conversations/${convId}/messages`;

  try {
    const q = query(
      collection(db, 'users', uid, 'conversations', convId, 'messages'),
      where('ownerId', '==', uid),
      orderBy('createdAt', 'asc')
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => {
      const data = d.data() as {
        id: string;
        role: 'user' | 'assistant';
        content: string;
        model?: string;
        totalTokens?: number;
        createdAt?: unknown;
      };
      return {
        id: data.id,
        role: data.role,
        content: data.content,
        createdAt: toMillis(data.createdAt),
        ...(data.model ? { model: data.model } : {}),
        ...(typeof data.totalTokens === 'number'
          ? {
              usage: {
                promptTokens: 0,
                completionTokens: 0,
                totalTokens: data.totalTokens,
              },
            }
          : {}),
      };
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export function subscribeUserConversations(
  userId: string,
  onConversations: (conversations: Conversation[]) => void,
  onError?: (err: Error) => void
): () => void {
  const uid = toSafeId(userId);
  const path = `users/${uid}/conversations`;
  const q = query(
    collection(db, 'users', uid, 'conversations'),
    where('ownerId', '==', uid),
    orderBy('updatedAt', 'desc')
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const baseConvs: Conversation[] = snapshot.docs.map((d) => {
        const data = d.data() as {
          id: string;
          title: string;
          model: string;
          createdAt?: unknown;
          updatedAt?: unknown;
        };
        return {
          id: data.id,
          title: data.title,
          model: data.model || 'gemini-3.1-flash-lite',
          createdAt: toMillis(data.createdAt),
          updatedAt: toMillis(data.updatedAt),
          messages: [],
        };
      });
      onConversations(baseConvs);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        if (onError && wrapped instanceof Error) {
          onError(wrapped);
        }
      }
    }
  );
}

export async function deleteCloudConversation(
  userId: string,
  conversationId: string
): Promise<void> {
  const uid = toSafeId(userId);
  const convId = toSafeId(conversationId);
  const messagesPath = `users/${uid}/conversations/${convId}/messages`;
  const convPath = `users/${uid}/conversations/${convId}`;

  try {
    const msgsSnap = await getDocs(
      query(
        collection(db, 'users', uid, 'conversations', convId, 'messages'),
        where('ownerId', '==', uid)
      )
    );
    if (!msgsSnap.empty) {
      const batch = writeBatch(db);
      for (const msgDoc of msgsSnap.docs) {
        batch.delete(msgDoc.ref);
      }
      await batch.commit();
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, messagesPath);
  }

  try {
    await deleteDoc(doc(db, 'users', uid, 'conversations', convId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, convPath);
  }
}

export async function clearCloudConversations(
  userId: string,
  conversationIds: string[]
): Promise<void> {
  for (const convId of conversationIds) {
    await deleteCloudConversation(userId, convId);
  }
}
