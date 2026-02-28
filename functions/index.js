const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');

admin.initializeApp();

const db = admin.firestore();
const messaging = admin.messaging();
const FieldValue = admin.firestore.FieldValue;
const Timestamp = admin.firestore.Timestamp;
const projectId = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || admin.app().options.projectId;
const functionsRuntime = projectId
  ? functions.runWith({ serviceAccount: `${projectId}@appspot.gserviceaccount.com` })
  : functions;

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function asRecord(value) {
  return value && typeof value === 'object' ? value : {};
}

function textValue(value, fallback = '') {
  return typeof value === 'string' ? value.trim() : fallback;
}

function asIsoString(value) {
  if (!value) return null;
  if (typeof value.toDate === 'function') {
    return value.toDate().toISOString();
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  return null;
}

function parseShiftDate(shift) {
  if (shift.startAt && typeof shift.startAt.toDate === 'function') {
    return shift.startAt.toDate();
  }

  const date = textValue(shift.date);
  const startTime = textValue(shift.startTime);
  if (!date || !startTime) return null;

  const parsed = new Date(`${date}T${startTime}:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseShiftEndDate(shift) {
  if (shift.endAt && typeof shift.endAt.toDate === 'function') {
    return shift.endAt.toDate();
  }

  const date = textValue(shift.date);
  const endTime = textValue(shift.endTime);
  if (!date || !endTime) return null;

  const parsed = new Date(`${date}T${endTime}:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function reasonLabel(code) {
  if (code === 'illness') return 'Illness';
  if (code === 'emergency') return 'Emergency';
  if (code === 'schedule_change') return 'Schedule change';
  if (code === 'transportation_issue') return 'Transportation issue';
  return 'Other';
}

function buildNotificationPath(uid, notificationId) {
  return db.collection('notifications').doc(uid).collection('items').doc(notificationId);
}

async function getUser(uid) {
  const snap = await db.collection('users').doc(uid).get();
  return snap.exists ? snap.data() || {} : {};
}

function extractTokensFromData(data) {
  const tokens = [];
  if (!data) return tokens;

  if (Array.isArray(data.tokens)) {
    data.tokens.forEach((token) => {
      if (typeof token === 'string' && token.trim()) tokens.push(token.trim());
    });
  }

  if (typeof data.token === 'string' && data.token.trim()) {
    tokens.push(data.token.trim());
  }

  if (typeof data.fcmToken === 'string' && data.fcmToken.trim()) {
    tokens.push(data.fcmToken.trim());
  }

  return tokens;
}

async function getUserTokens(uid) {
  const [snakeDoc, camelDoc, userDoc] = await Promise.all([
    db.collection('fcm_tokens').doc(uid).get().catch(() => null),
    db.collection('fcmTokens').doc(uid).get().catch(() => null),
    db.collection('users').doc(uid).get().catch(() => null),
  ]);

  const tokens = [
    ...extractTokensFromData(snakeDoc && snakeDoc.exists ? snakeDoc.data() : null),
    ...extractTokensFromData(camelDoc && camelDoc.exists ? camelDoc.data() : null),
    ...extractTokensFromData(userDoc && userDoc.exists ? userDoc.data() : null),
  ];

  return unique(tokens);
}

function serializeData(data) {
  const out = {};
  Object.entries(asRecord(data)).forEach(([key, value]) => {
    if (value == null) return;
    if (typeof value === 'string') out[key] = value;
    else if (typeof value === 'number' || typeof value === 'boolean') out[key] = String(value);
    else if (Array.isArray(value)) out[key] = JSON.stringify(value);
    else out[key] = JSON.stringify(value);
  });
  return out;
}

async function createInAppNotification(uid, notificationId, payload) {
  const notification = {
    type: payload.type,
    title: payload.title,
    body: payload.body,
    read: false,
    readAt: null,
    createdAt: FieldValue.serverTimestamp(),
    href: payload.href || null,
    data: payload.data || {},
  };

  await buildNotificationPath(uid, notificationId).set(notification, { merge: true });
}

async function sendPushNotification(uid, payload) {
  const tokens = await getUserTokens(uid);
  if (!tokens.length) return { successCount: 0, failureCount: 0 };

  const data = serializeData({
    type: payload.type,
    href: payload.href || '',
    notificationId: payload.notificationId,
    ...payload.data,
  });

  return messaging.sendEachForMulticast({
    tokens,
    notification: {
      title: payload.title,
      body: payload.body,
    },
    data,
    webpush: {
      fcmOptions: payload.href ? { link: payload.href } : {},
    },
  });
}

async function notifyUser(uid, notificationId, payload) {
  const fullPayload = { ...payload, notificationId };
  await createInAppNotification(uid, notificationId, fullPayload);
  await sendPushNotification(uid, fullPayload);
}

async function notifyUsers(entries) {
  await Promise.all(entries.map((entry) => notifyUser(entry.uid, entry.notificationId, entry.payload)));
}

function getConversationMembers(conversationData) {
  const userIds = Array.isArray(conversationData.userIds) ? conversationData.userIds.map(String) : [];
  return unique(userIds);
}

exports.onMatchCreated = functionsRuntime.firestore
  .document('matches/{matchId}')
  .onCreate(async (snap, context) => {
    const matchId = context.params.matchId;
    const data = snap.data() || {};
    const userIds = unique(
      (Array.isArray(data.userIds) ? data.userIds : [])
        .concat(Array.isArray(data.users) ? data.users : [])
        .concat([data.uid1, data.uid2])
        .map(String)
    ).filter((value) => value && value !== 'undefined');

    if (userIds.length < 2) return null;

    const userDocs = await Promise.all(userIds.map((uid) => getUser(uid)));
    const namesByUid = {};
    userIds.forEach((uid, index) => {
      namesByUid[uid] = textValue(userDocs[index].name) || textValue(userDocs[index].displayName) || 'A new match';
    });

    const entries = userIds.map((uid) => {
      const otherUid = userIds.find((candidate) => candidate !== uid) || '';
      return {
        uid,
        notificationId: `match_${matchId}_${uid}`,
        payload: {
          type: 'match',
          title: 'New Match!',
          body: `You matched with ${namesByUid[otherUid] || 'a new family'}.`,
          href: `/families/messages/${matchId}`,
          data: {
            matchId,
            otherUserUid: otherUid,
          },
        },
      };
    });

    await notifyUsers(entries);
    return null;
  });

exports.onConversationMessageCreated = functionsRuntime.firestore
  .document('conversations/{conversationId}/messages/{messageId}')
  .onCreate(async (snap, context) => {
    const conversationId = context.params.conversationId;
    const messageId = context.params.messageId;
    const message = snap.data() || {};
    const senderId = textValue(message.senderId);

    if (!senderId || senderId === 'system') return null;

    const conversationRef = db.collection('conversations').doc(conversationId);
    const conversationSnap = await conversationRef.get();
    if (!conversationSnap.exists) return null;

    const conversation = conversationSnap.data() || {};
    const members = getConversationMembers(conversation);
    const recipients = members.filter((uid) => uid !== senderId);
    if (!recipients.length) return null;

    const userProfiles = asRecord(conversation.userProfiles);
    const senderProfile = asRecord(userProfiles[senderId]);
    const senderName =
      textValue(senderProfile.name) ||
      textValue((await getUser(senderId)).name) ||
      'New message';

    const bodyText = textValue(message.text);
    const attachmentName = textValue(message.attachmentName);
    const preview = bodyText || (attachmentName ? `Sent an attachment: ${attachmentName}` : 'You received a new message.');

    const unreadPatch = {};
    recipients.forEach((uid) => {
      unreadPatch[`unreadCount.${uid}`] = FieldValue.increment(1);
    });

    await conversationRef.set(unreadPatch, { merge: true });

    await notifyUsers(
      recipients.map((uid) => ({
        uid,
        notificationId: `message_${conversationId}_${messageId}_${uid}`,
        payload: {
          type: 'message',
          title: senderName,
          body: preview.slice(0, 140),
          href: `/families/messages/${conversationId}`,
          data: {
            conversationId,
            senderId,
            messageId,
          },
        },
      }))
    );

    return null;
  });

exports.onShiftCreated = functionsRuntime.firestore
  .document('shifts/{shiftId}')
  .onCreate(async (snap, context) => {
    const shiftId = context.params.shiftId;
    const shift = snap.data() || {};
    const proposerId = textValue(shift.proposerId);
    const accepterId = textValue(shift.accepterId);
    if (!proposerId || !accepterId || proposerId === accepterId) return null;

    const proposer = await getUser(proposerId);
    const proposerName = textValue(proposer.name) || 'A family';

    await notifyUser(accepterId, `shift_request_${shiftId}_${accepterId}`, {
      type: 'request',
      title: 'New Shift Request',
      body: `${proposerName} sent you a shift proposal.`,
      href: '/families/calendar',
      data: {
        shiftId,
        proposerId,
      },
    });

    return null;
  });

exports.onShiftUpdated = functionsRuntime.firestore
  .document('shifts/{shiftId}')
  .onUpdate(async (change, context) => {
    const shiftId = context.params.shiftId;
    const before = change.before.data() || {};
    const after = change.after.data() || {};
    const participants = unique(
      (Array.isArray(after.userIds) ? after.userIds : [after.proposerId, after.accepterId]).map(String)
    ).filter(Boolean);

    if (participants.length < 2) return null;

    const proposerId = textValue(after.proposerId);
    const accepterId = textValue(after.accepterId);
    const statusBefore = textValue(before.status);
    const statusAfter = textValue(after.status);
    const swapDetailsBefore = asRecord(before.swapDetails);
    const swapDetailsAfter = asRecord(after.swapDetails);
    const swapRequesterId = textValue(swapDetailsAfter.proposerId);
    const priorSwapRequesterId = textValue(swapDetailsBefore.proposerId);
    const scheduleChanged =
      textValue(before.date) !== textValue(after.date) ||
      textValue(before.startTime) !== textValue(after.startTime) ||
      textValue(before.endTime) !== textValue(after.endTime);

    if (statusBefore !== statusAfter) {
      if (statusBefore === 'proposed' && statusAfter === 'accepted' && proposerId) {
        await notifyUser(proposerId, `shift_accepted_${shiftId}_${proposerId}`, {
          type: 'shift',
          title: 'Shift Accepted',
          body: 'Your shift proposal was accepted.',
          href: '/families/calendar',
          data: { shiftId, status: statusAfter },
        });
      }

      if (statusBefore === 'proposed' && statusAfter === 'rejected' && proposerId) {
        await notifyUser(proposerId, `shift_rejected_${shiftId}_${proposerId}`, {
          type: 'shift',
          title: 'Shift Declined',
          body: 'Your shift proposal was declined.',
          href: '/families/calendar',
          data: { shiftId, status: statusAfter },
        });
      }

      if (statusAfter === 'swap_proposed' && swapRequesterId) {
        const recipients = participants.filter((uid) => uid !== swapRequesterId);

        await notifyUsers(
          recipients.map((uid) => ({
            uid,
            notificationId: `shift_swap_request_${shiftId}_${uid}`,
            payload: {
              type: 'request',
              title: 'Shift Change Requested',
              body: 'A new date or time was proposed for your accepted shift.',
              href: '/families/calendar',
              data: {
                shiftId,
                status: statusAfter,
                newDate: textValue(swapDetailsAfter.newDate),
                newStartTime: textValue(swapDetailsAfter.newStartTime),
                newEndTime: textValue(swapDetailsAfter.newEndTime),
              },
            },
          }))
        );
      }

      if (statusBefore === 'swap_proposed' && statusAfter === 'accepted' && priorSwapRequesterId) {
        await notifyUser(priorSwapRequesterId, `shift_swap_result_${shiftId}_${priorSwapRequesterId}`, {
          type: 'shift',
          title: scheduleChanged ? 'Shift Change Accepted' : 'Shift Change Declined',
          body: scheduleChanged
            ? 'Your proposed shift update was accepted.'
            : 'Your proposed shift update was declined.',
          href: '/families/calendar',
          data: {
            shiftId,
            status: scheduleChanged ? 'swap_accepted' : 'swap_rejected',
          },
        });
      }

      if (statusAfter === 'cancelled') {
        const cancelledByUid = textValue(after.cancelledByUid);
        const actor = cancelledByUid ? await getUser(cancelledByUid) : {};
        const actorName = textValue(actor.name) || 'A participant';
        const recipients = participants.filter((uid) => uid !== cancelledByUid);

        await notifyUsers(
          recipients.map((uid) => ({
            uid,
            notificationId: `shift_cancelled_${shiftId}_${uid}`,
            payload: {
              type: 'shift',
              title: 'Shift Cancelled',
              body: `${actorName} cancelled a shift (${reasonLabel(textValue(after.cancelReasonCode))}).`,
              href: '/families/calendar',
              data: {
                shiftId,
                cancelledByUid,
                reasonCode: textValue(after.cancelReasonCode),
              },
            },
          }))
        );
      }

      if (statusAfter === 'completed') {
        await notifyUsers(
          participants.map((uid) => ({
            uid,
            notificationId: `shift_completed_${shiftId}_${uid}`,
            payload: {
              type: 'shift',
              title: 'Shift Completed',
              body: 'Your shift ended. You can now leave a review.',
              href: '/families/calendar',
              data: {
                shiftId,
                status: statusAfter,
              },
            },
          }))
        );
      }
    }

    if (scheduleChanged && statusAfter !== 'cancelled' && statusAfter !== 'completed') {
      await notifyUsers(
        participants.map((uid) => ({
          uid,
          notificationId: `shift_updated_${shiftId}_${uid}`,
          payload: {
            type: 'shift',
            title: 'Shift Updated',
            body: 'A shift date or time was updated.',
            href: '/families/calendar',
            data: {
              shiftId,
              date: textValue(after.date),
              startTime: textValue(after.startTime),
              endTime: textValue(after.endTime),
            },
          },
        }))
      );
    }

    return null;
  });

exports.onReviewCreated = functionsRuntime.firestore
  .document('reviews/{reviewId}')
  .onCreate(async (snap, context) => {
    const reviewId = context.params.reviewId;
    const review = snap.data() || {};
    const revieweeUid = textValue(review.revieweeUid || review.revieweeId);
    const reviewerUid = textValue(review.reviewerUid || review.reviewerId);
    const rating = Number(review.rating || 0);

    if (!revieweeUid || !reviewerUid || revieweeUid === reviewerUid) return null;

    const reviewer = await getUser(reviewerUid);
    const reviewerName = textValue(reviewer.name) || 'A family';
    const stars = rating > 0 ? `${rating} star${rating === 1 ? '' : 's'}` : 'a rating';
    const comment = textValue(review.comment);

    await notifyUser(revieweeUid, `review_${reviewId}_${revieweeUid}`, {
      type: 'review',
      title: 'New Review',
      body: comment
        ? `${reviewerName} left ${stars}: ${comment.slice(0, 100)}`
        : `${reviewerName} left ${stars} on your profile.`,
      href: `/families/profile/${revieweeUid}`,
      data: {
        reviewId,
        reviewerUid,
        rating,
      },
    });

    return null;
  });

exports.processShiftNotifications = functionsRuntime.pubsub
  .schedule('every 5 minutes')
  .onRun(async () => {
    const now = new Date();
    const in55 = Timestamp.fromDate(new Date(now.getTime() + 55 * 60 * 1000));
    const in60 = Timestamp.fromDate(new Date(now.getTime() + 60 * 60 * 1000));
    const nowTs = Timestamp.fromDate(now);

    const remindersSnap = await db
      .collection('shifts')
      .where('status', '==', 'accepted')
      .where('startAt', '>=', in55)
      .where('startAt', '<=', in60)
      .get();

    for (const doc of remindersSnap.docs) {
      const shift = doc.data() || {};
      if (shift.startReminderSent === true) continue;

      const participants = unique(
        (Array.isArray(shift.userIds) ? shift.userIds : [shift.proposerId, shift.accepterId]).map(String)
      ).filter(Boolean);
      if (!participants.length) continue;

      await notifyUsers(
        participants.map((uid) => ({
          uid,
          notificationId: `shift_starting_soon_${doc.id}_${uid}`,
          payload: {
            type: 'shift',
            title: 'Shift Starts in 1 Hour',
            body: 'Your accepted shift starts in about 1 hour.',
            href: '/families/calendar',
            data: {
              shiftId: doc.id,
              startAt: asIsoString(shift.startAt),
            },
          },
        }))
      );

      await doc.ref.set({
        startReminderSent: true,
        startReminderSentAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }

    const completedSnap = await db
      .collection('shifts')
      .where('status', '==', 'accepted')
      .where('endAt', '<=', nowTs)
      .get();

    for (const doc of completedSnap.docs) {
      const shift = doc.data() || {};
      const endAt = parseShiftEndDate(shift);
      if (!endAt || endAt.getTime() > now.getTime()) continue;

      await doc.ref.set({
        status: 'completed',
        completedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }

    return null;
  });
