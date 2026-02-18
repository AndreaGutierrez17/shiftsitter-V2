// =======================================================================
// SHIFTSITTER - Cloud Functions para Produccion
// functions/index.js
//
// INSTALACION:
//   npm install firebase-functions@latest firebase-admin@latest
//
// DEPLOY:
//   firebase deploy --only functions
// =======================================================================

const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();
const db = admin.firestore();

// -----------------------------------------------------------------------
// FUNCION 1: Detectar Match Reciproco
// Se dispara automaticamente cuando alguien guarda un swipe de "like"
// -----------------------------------------------------------------------

exports.checkMutualMatch = functions.firestore
  .document('swipes/{uid}/decisions/{targetUid}')
  .onCreate(async (snap, context) => {
    const { uid, targetUid } = context.params;
    const swipeData = snap.data();

    // Solo procesar si es "like" o "superlike"
    if (!['like', 'superlike'].includes(swipeData.action)) {
      console.log(`No es like: ${swipeData.action}`);
      return null;
    }

    // Verificar si el target es DEMO
    const targetDoc = await db.collection('users').doc(targetUid).get();
    if (targetDoc.exists && targetDoc.data().isDemo === true) {
      console.log(`Target es demo (${targetUid}), no crear match real`);
      return null;
    }

    // Verificar si el usuario actual es DEMO
    const currentDoc = await db.collection('users').doc(uid).get();
    if (currentDoc.exists && currentDoc.data().isDemo === true) {
      console.log(`Usuario actual es demo (${uid}), no crear match real`);
      return null;
    }

    // Verificar si el target tambien dio like
    const reciprocalSwipe = await db
      .collection('swipes')
      .doc(targetUid)
      .collection('decisions')
      .doc(uid)
      .get();

    if (!reciprocalSwipe.exists) {
      console.log(`Aun no hay like reciproco de ${targetUid} hacia ${uid}`);
      return null;
    }

    const reciprocalAction = reciprocalSwipe.data().action;
    if (!['like', 'superlike'].includes(reciprocalAction)) {
      console.log(`El like reciproco no es valido: ${reciprocalAction}`);
      return null;
    }

    // ES UN MATCH - Crear el documento de match
    console.log(`MATCH detectado entre ${uid} y ${targetUid}`);

    // Ordenar UIDs alfabeticamente para consistencia
    const matchId = [uid, targetUid].sort().join('_');

    const matchRef = db.collection('matches').doc(matchId);
    const matchDoc = await matchRef.get();

    if (matchDoc.exists) {
      console.log(`Match ya existe: ${matchId}`);
      return null;
    }

    const now = admin.firestore.Timestamp.now();

    await matchRef.set({
      uid1: uid < targetUid ? uid : targetUid,
      uid2: uid < targetUid ? targetUid : uid,
      createdAt: now,
      status: 'active',
      lastInteraction: now,
    });

    // Crear chat room automaticamente
    const chatRef = db.collection('chats').doc(matchId);
    await chatRef.set({
      matchId: matchId,
      participants: [uid, targetUid],
      createdAt: now,
      lastMessage: '',
      lastMessageAt: now,
      unreadCount: { [uid]: 0, [targetUid]: 0 },
    });

    // Mensaje de bienvenida del sistema
    await chatRef.collection('messages').add({
      senderId: 'system',
      text: 'Es un match de ShiftSitter! Ahora pueden coordinar el cuidado reciproco de sus hijos.',
      timestamp: now,
      type: 'system',
      isRead: false,
    });

    // Enviar notificaciones push a AMBOS usuarios
    await sendMatchNotifications(uid, targetUid, matchId);

    console.log(`Match creado: ${matchId}`);
    return null;
  });

// -----------------------------------------------------------------------
// FUNCION 2: Enviar Notificaciones de Match
// -----------------------------------------------------------------------

async function sendMatchNotifications(uid1, uid2, matchId) {
  try {
    const [user1Doc, user2Doc] = await Promise.all([
      db.collection('users').doc(uid1).get(),
      db.collection('users').doc(uid2).get(),
    ]);

    const user1 = user1Doc.data();
    const user2 = user2Doc.data();

    const now = admin.firestore.Timestamp.now();

    // Notificacion para usuario 1
    if (user1?.fcmToken) {
      await admin.messaging().send({
        token: user1.fcmToken,
        notification: {
          title: 'Es un Match de ShiftSitter!',
          body: `${user2?.displayName || 'Alguien'} y tu se han emparejado. Ya pueden empezar a acordar el cuidado!`,
        },
        data: {
          type: 'match',
          matchId: matchId,
          targetUid: uid2,
        },
      });

      await db
        .collection('notifications')
        .doc(uid1)
        .collection('items')
        .add({
          type: 'match',
          title: 'Es un Match!',
          body: `${user2?.displayName || 'Alguien'} y tu se han emparejado`,
          data: { matchId, targetUid: uid2 },
          isRead: false,
          createdAt: now,
        });
    }

    // Notificacion para usuario 2
    if (user2?.fcmToken) {
      await admin.messaging().send({
        token: user2.fcmToken,
        notification: {
          title: 'Es un Match de ShiftSitter!',
          body: `${user1?.displayName || 'Alguien'} y tu se han emparejado. Ya pueden empezar a acordar el cuidado!`,
        },
        data: {
          type: 'match',
          matchId: matchId,
          targetUid: uid1,
        },
      });

      await db
        .collection('notifications')
        .doc(uid2)
        .collection('items')
        .add({
          type: 'match',
          title: 'Es un Match!',
          body: `${user1?.displayName || 'Alguien'} y tu se han emparejado`,
          data: { matchId, targetUid: uid1 },
          isRead: false,
          createdAt: now,
        });
    }

    console.log('Notificaciones enviadas');
  } catch (error) {
    console.error('Error enviando notificaciones:', error);
  }
}

// -----------------------------------------------------------------------
// FUNCION 3: Notificacion de Like Recibido (sin revelar identidad)
// -----------------------------------------------------------------------

exports.notifyLikeReceived = functions.firestore
  .document('swipes/{uid}/decisions/{targetUid}')
  .onCreate(async (snap, context) => {
    const { uid, targetUid } = context.params;
    const swipeData = snap.data();

    // Solo notificar en "like" o "superlike"
    if (!['like', 'superlike'].includes(swipeData.action)) {
      return null;
    }

    // No notificar si el target es demo
    const targetDoc = await db.collection('users').doc(targetUid).get();
    if (targetDoc.exists && targetDoc.data().isDemo === true) {
      return null;
    }

    // No notificar si el usuario actual es demo
    const currentDoc = await db.collection('users').doc(uid).get();
    if (currentDoc.exists && currentDoc.data().isDemo === true) {
      return null;
    }

    const targetUser = targetDoc.data();
    const now = admin.firestore.Timestamp.now();

    // Enviar notificacion SIN revelar quien dio like
    if (targetUser?.fcmToken) {
      await admin.messaging().send({
        token: targetUser.fcmToken,
        notification: {
          title: 'Alguien esta interesado en hacer ShiftSitting contigo!',
          body: 'Un padre/madre compatible reviso tu perfil. Revisa tus notificaciones!',
        },
        data: {
          type: 'like_received',
        },
      });

      await db
        .collection('notifications')
        .doc(targetUid)
        .collection('items')
        .add({
          type: 'like_received',
          title: 'Nuevo interes!',
          body: 'Alguien esta interesado en hacer ShiftSitting contigo',
          data: {},
          isRead: false,
          createdAt: now,
        });
    }

    return null;
  });

// -----------------------------------------------------------------------
// FUNCION 4: Notificacion de Nuevo Mensaje
// -----------------------------------------------------------------------

exports.notifyNewMessage = functions.firestore
  .document('chats/{matchId}/messages/{messageId}')
  .onCreate(async (snap, context) => {
    const { matchId } = context.params;
    const message = snap.data();

    // No notificar mensajes del sistema
    if (message.senderId === 'system') return null;

    // Obtener match para saber quien es el receptor
    const matchDoc = await db.collection('matches').doc(matchId).get();
    if (!matchDoc.exists) return null;

    const match = matchDoc.data();
    const receiverId = match.uid1 === message.senderId ? match.uid2 : match.uid1;

    // Obtener datos del receptor y del remitente
    const [receiverDoc, senderDoc] = await Promise.all([
      db.collection('users').doc(receiverId).get(),
      db.collection('users').doc(message.senderId).get(),
    ]);

    const receiver = receiverDoc.data();
    const sender = senderDoc.data();

    if (!receiver?.fcmToken) return null;

    const now = admin.firestore.Timestamp.now();

    await admin.messaging().send({
      token: receiver.fcmToken,
      notification: {
        title: `${sender?.displayName || 'Nuevo mensaje'}`,
        body: message.text.substring(0, 100),
      },
      data: {
        type: 'new_message',
        matchId: matchId,
        senderId: message.senderId,
      },
    });

    await db
      .collection('notifications')
      .doc(receiverId)
      .collection('items')
      .add({
        type: 'new_message',
        title: `${sender?.displayName || 'Mensaje nuevo'}`,
        body: message.text.substring(0, 100),
        data: { matchId, senderId: message.senderId },
        isRead: false,
        createdAt: now,
      });

    return null;
  });

// -----------------------------------------------------------------------
// FUNCION 5: Actualizar lastSeen del usuario
// -----------------------------------------------------------------------

exports.updateLastSeen = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }

  const uid = context.auth.uid;
  await db.collection('users').doc(uid).update({
    lastSeen: admin.firestore.Timestamp.now(),
  });

  return { success: true };
});
