// ShiftSitter demo data seed (Maryland, English)
// Run: node scripts/seed_demo_users.js

const admin = require('firebase-admin');
const fs = require('fs');

const serviceAccountPath = './scripts/serviceAccountKey.json';

if (!fs.existsSync(serviceAccountPath)) {
  console.error('\nMissing scripts/serviceAccountKey.json');
  console.error('Download it from Firebase Console > Project Settings > Service accounts.\n');
  process.exit(1);
}

const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();
const auth = admin.auth();



const DEMO_USERS = [
  {
    uid: 'demo_user_001',
    email: 'olivia.nurse@shiftsitter.demo',
    password: 'Demo2024!!',
    displayName: 'Olivia M.',
    profile: {
      name: 'Olivia M.',
      age: 32,
      needs: 'Night-shift nurse and mom of one 4-year-old. Looking for reliable reciprocal care on weekdays.',
      photoURLs: ['https://i.pravatar.cc/600?img=32'],
      workplace: 'Registered Nurse - Johns Hopkins Hospital',
      location: 'Baltimore, MD',
      latitude: 39.2904,
      longitude: -76.6122,
      numberOfChildren: 1,
      childAge: 4,
      childrenAgesText: '4',
      averageRating: 4.9,
      ratingCount: 9,
      backgroundCheckStatus: 'completed',
      interests: ['Family Time', 'Reading', 'Meal Prep'],
      availability: 'Mon, Wed, Fri 6:30 AM-2:00 PM; Sat 8:00 AM-6:00 PM',
    },
  },
  {
    uid: 'demo_user_002',
    email: 'marcus.firefighter@shiftsitter.demo',
    password: 'Demo2024!!',
    displayName: 'Marcus T.',
    profile: {
      name: 'Marcus T.',
      age: 38,
      needs: '24/72 firefighter schedule. Dad of two kids and open to long reciprocal blocks.',
      photoURLs: ['https://i.pravatar.cc/600?img=12'],
      workplace: 'Baltimore City Fire Department',
      location: 'Towson, MD',
      latitude: 39.4015,
      longitude: -76.6019,
      numberOfChildren: 2,
      childAge: 5,
      childrenAgesText: '7, 5',
      averageRating: 4.8,
      ratingCount: 21,
      backgroundCheckStatus: 'completed',
      interests: ['Community', 'Sports', 'Cooking'],
      availability: 'Tue, Thu 7:00 AM-7:00 PM; Sun 10:00 AM-6:00 PM',
    },
  },
  {
    uid: 'demo_user_003',
    email: 'natalie.teacher@shiftsitter.demo',
    password: 'Demo2024!!',
    displayName: 'Natalie F.',
    profile: {
      name: 'Natalie F.',
      age: 31,
      needs: 'Elementary teacher with two kids. Needs occasional evening coverage and weekend support.',
      photoURLs: ['https://i.pravatar.cc/600?img=47'],
      workplace: 'Howard County Public Schools',
      location: 'Columbia, MD',
      latitude: 39.2037,
      longitude: -76.8610,
      numberOfChildren: 2,
      childAge: 4,
      childrenAgesText: '6, 4',
      averageRating: 5.0,
      ratingCount: 18,
      backgroundCheckStatus: 'completed',
      interests: ['Education', 'Art', 'Parks'],
      availability: 'Weekdays 2:00 PM-9:00 PM; Sat-Sun 9:00 AM-7:00 PM',
    },
  },
  {
    uid: 'demo_user_004',
    email: 'elena.pharmacist@shiftsitter.demo',
    password: 'Demo2024!!',
    displayName: 'Elena R.',
    profile: {
      name: 'Elena R.',
      age: 34,
      needs: 'Hospital pharmacist with rotating weekends. Looking for recurring reciprocal agreements.',
      photoURLs: ['https://i.pravatar.cc/600?img=5'],
      workplace: 'University of Maryland Medical Center',
      location: 'Glen Burnie, MD',
      latitude: 39.1626,
      longitude: -76.6247,
      numberOfChildren: 1,
      childAge: 3,
      childrenAgesText: '3',
      averageRating: 4.9,
      ratingCount: 7,
      backgroundCheckStatus: 'completed',
      interests: ['Science', 'Yoga', 'Coffee'],
      availability: 'Mon, Wed, Fri 8:00 AM-8:00 PM; Sat 10:00 AM-6:00 PM',
    },
  },
  {
    uid: 'demo_user_005',
    email: 'derek.security@shiftsitter.demo',
    password: 'Demo2024!!',
    displayName: 'Derek V.',
    profile: {
      name: 'Derek V.',
      age: 30,
      needs: 'Overnight security schedule. Dad of one and needs support during daytime transition hours.',
      photoURLs: ['https://i.pravatar.cc/600?img=15'],
      workplace: 'Private Security - Downtown Baltimore',
      location: 'Dundalk, MD',
      latitude: 39.2507,
      longitude: -76.5205,
      numberOfChildren: 1,
      childAge: 5,
      childrenAgesText: '5',
      averageRating: 4.6,
      ratingCount: 10,
      backgroundCheckStatus: 'completed',
      interests: ['Movies', 'Walking', 'Tech'],
      availability: 'Tue, Wed, Thu 7:00 AM-6:00 PM',
    },
  },
  {
    uid: 'demo_user_006',
    email: 'samantha.driver@shiftsitter.demo',
    password: 'Demo2024!!',
    displayName: 'Samantha G.',
    profile: {
      name: 'Samantha G.',
      age: 36,
      needs: 'School bus driver with split shifts. Can offer afternoons in exchange for early morning help.',
      photoURLs: ['https://i.pravatar.cc/600?img=31'],
      workplace: 'Baltimore County Public Schools Transportation',
      location: 'Parkville, MD',
      latitude: 39.3773,
      longitude: -76.5394,
      numberOfChildren: 2,
      childAge: 4,
      childrenAgesText: '8, 4',
      averageRating: 4.8,
      ratingCount: 12,
      backgroundCheckStatus: 'completed',
      interests: ['Cooking', 'Crafts', 'Outdoors'],
      availability: 'Mon-Fri 8:30 AM-2:00 PM; Sat-Sun 10:00 AM-8:00 PM',
    },
  },
  {
    uid: 'demo_user_007',
    email: 'jason.banker@shiftsitter.demo',
    password: 'Demo2024!!',
    displayName: 'Jason H.',
    profile: {
      name: 'Jason H.',
      age: 27,
      needs: 'Bank associate on mixed shifts. New parent looking for trusted local reciprocal care.',
      photoURLs: ['https://i.pravatar.cc/600?img=18'],
      workplace: 'M&T Bank',
      location: 'Catonsville, MD',
      latitude: 39.2721,
      longitude: -76.7319,
      numberOfChildren: 1,
      childAge: 1,
      childrenAgesText: '1',
      averageRating: 4.7,
      ratingCount: 3,
      backgroundCheckStatus: 'not_started',
      interests: ['Finance', 'Gaming', 'Fitness'],
      availability: 'Mon-Fri 7:00 AM-1:00 PM; Sun 9:00 AM-4:00 PM',
    },
  },
  {
    uid: 'demo_user_008',
    email: 'mia.dispatch@shiftsitter.demo',
    password: 'Demo2024!!',
    displayName: 'Mia C.',
    profile: {
      name: 'Mia C.',
      age: 29,
      needs: '911 dispatcher with rotating nights. Looking for dependable weekday backup.',
      photoURLs: ['https://i.pravatar.cc/600?img=48'],
      workplace: 'Baltimore County Emergency Communications',
      location: 'Owings Mills, MD',
      latitude: 39.4195,
      longitude: -76.7803,
      numberOfChildren: 1,
      childAge: 2,
      childrenAgesText: '2',
      averageRating: 4.8,
      ratingCount: 5,
      backgroundCheckStatus: 'completed',
      interests: ['Music', 'Dance', 'Family'],
      availability: 'Sat-Sun 9:00 AM-5:00 PM',
    },
  },
  {
    uid: 'demo_user_009',
    email: 'rachel.chef@shiftsitter.demo',
    password: 'Demo2024!!',
    displayName: 'Rachel P.',
    profile: {
      name: 'Rachel P.',
      age: 33,
      needs: 'Restaurant chef with heavy weekend shifts. Offers weekday coverage in return.',
      photoURLs: ['https://i.pravatar.cc/600?img=25'],
      workplace: 'Inner Harbor Restaurant Group',
      location: 'Federal Hill, Baltimore, MD',
      latitude: 39.2750,
      longitude: -76.6130,
      numberOfChildren: 1,
      childAge: 5,
      childrenAgesText: '5',
      averageRating: 4.8,
      ratingCount: 11,
      backgroundCheckStatus: 'completed',
      interests: ['Food', 'Travel', 'Community'],
      availability: 'Mon-Wed 9:00 AM-5:00 PM',
    },
  },
  {
    uid: 'demo_user_010',
    email: 'andrew.paramedic@shiftsitter.demo',
    password: 'Demo2024!!',
    displayName: 'Andrew L.',
    profile: {
      name: 'Andrew L.',
      age: 35,
      needs: 'Paramedic on 12-hour shifts. Looking for reciprocal support with another shift-based family.',
      photoURLs: ['https://i.pravatar.cc/600?img=54'],
      workplace: 'Anne Arundel EMS',
      location: 'Annapolis, MD',
      latitude: 38.9784,
      longitude: -76.4922,
      numberOfChildren: 2,
      childAge: 3,
      childrenAgesText: '6, 3',
      averageRating: 4.9,
      ratingCount: 14,
      backgroundCheckStatus: 'completed',
      interests: ['Health', 'Running', 'Family Activities'],
      availability: 'Mon, Tue, Fri, Sat 8:00 AM-8:00 PM',
    },
  },
];

async function seedDemoUsers() {
  console.log('\nShiftSitter - Creating Maryland demo accounts...\n');

  for (const user of DEMO_USERS) {
    try {
      console.log(`Processing: ${user.displayName} (${user.uid})`);

      try {
        await auth.createUser({
          uid: user.uid,
          email: user.email,
          password: user.password,
          displayName: user.displayName,
          photoURL: user.profile.photoURLs[0],
          emailVerified: true,
          disabled: false,
        });
      } catch (e) {
        if (e.code === 'auth/uid-already-exists' || e.code === 'auth/email-already-exists') {
          await auth.updateUser(user.uid, {
            email: user.email,
            password: user.password,
            displayName: user.displayName,
            photoURL: user.profile.photoURLs[0],
            emailVerified: true,
          });
        } else {
          throw e;
        }
      }

      const userDoc = {
        id: user.uid,
        uid: user.uid,
        email: user.email,
        role: 'reciprocal',
        profileComplete: true,
        isDemo: true,
        isActive: true,
        fcmToken: '',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        lastSeen: admin.firestore.FieldValue.serverTimestamp(),
        ...user.profile,
      };

      await db.collection('users').doc(user.uid).set(userDoc, { merge: true });
      console.log(`OK: ${user.displayName}`);
    } catch (error) {
      console.error(`ERROR: ${user.displayName}:`, error.message);
    }
  }

  console.log('\nSeed completed. 10 Maryland demo accounts are ready.\n');
  process.exit(0);
}

async function cleanDemoUsers() {
  console.log('\nDeleting Maryland demo accounts...\n');
  for (const user of DEMO_USERS) {
    try {
      await auth.deleteUser(user.uid);
      await db.collection('users').doc(user.uid).delete();
      console.log(`Removed: ${user.displayName}`);
    } catch (e) {
      console.log(`Skip: ${user.displayName}: ${e.message}`);
    }
  }
  console.log('\nCleanup completed.\n');
  process.exit(0);
}

if (process.argv.includes('--clean')) {
  cleanDemoUsers();
} else {
  seedDemoUsers();
}
