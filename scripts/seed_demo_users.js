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

const DEMO_PASSWORD = 'Demo2026!!';

const DEMO_USERS = [
  {
    uid: 'demo_user_001',
    email: 'olivia.nurse@shiftsitter.demo',
    password: 'Demo2024!!',
    emailVerified: true,
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
    emailVerified: true,
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
    emailVerified: true,
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
    emailVerified: true,
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
    emailVerified: true,
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
    emailVerified: true,
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
    emailVerified: true,
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
    emailVerified: true,
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
    emailVerified: true,
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
    emailVerified: true,
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

const EXTRA_DEMO_USERS = [
  ['demo_user_011', 'linda.therapist', 'Linda S.', 37, 'Towson, MD', 39.4015, -76.6019, 2, 6, '9, 6', 'Pediatric therapist with rotating appointments. Looking for reciprocal weekday coverage.', 'Pediatric Therapist - Private Clinic'],
  ['demo_user_012', 'omar.cttech', 'Omar K.', 34, 'Baltimore, MD', 39.2904, -76.6122, 1, 2, '2', 'CT tech on hospital shifts. Needs early morning childcare and can offer evenings.', 'CT Technologist - UMMC'],
  ['demo_user_013', 'keisha.nurse', 'Keisha W.', 41, 'Laurel, MD', 39.0993, -76.8483, 2, 5, '10, 5', 'Charge nurse with long shifts. Looking for trustworthy exchange care with another shift family.', 'Registered Nurse - MedStar'],
  ['demo_user_014', 'brian.lineman', 'Brian D.', 39, 'Dundalk, MD', 39.2507, -76.5205, 3, 4, '11, 7, 4', 'Utility line worker, irregular emergency callouts. Needs reliable backup and can cover weekends.', 'Utility Line Worker - BGE'],
  ['demo_user_015', 'tasha.radiology', 'Tasha E.', 33, 'Columbia, MD', 39.2037, -76.8610, 1, 3, '3', 'Radiology scheduler with split shifts. Can exchange afternoon coverage for mornings.', 'Radiology Scheduler - Howard County'],
  ['demo_user_016', 'miguel.maintenance', 'Miguel A.', 36, 'Glen Burnie, MD', 39.1626, -76.6247, 2, 8, '8, 6', 'Facilities maintenance lead with rotating weekends. Interested in local reciprocal care.', 'Facilities Maintenance - BWI area'],
  ['demo_user_017', 'amber.dispatch', 'Amber J.', 30, 'Owings Mills, MD', 39.4195, -76.7803, 1, 1, '1', 'Emergency dispatch on night rotation. Needs daytime sleep-window support and can help weekends.', '911 Dispatcher - County Comms'],
  ['demo_user_018', 'noah.phlebotomy', 'Noah P.', 28, 'Catonsville, MD', 39.2721, -76.7319, 1, 4, '4', 'Phlebotomy tech on early shifts. Looking for another family to coordinate recurring swaps.', 'Phlebotomy Tech - Lab Services'],
  ['demo_user_019', 'erica.teacher', 'Erica B.', 35, 'Parkville, MD', 39.3773, -76.5394, 2, 3, '7, 3', 'Teacher and parent with after-school needs. Offers daytime care during school breaks.', 'Middle School Teacher'],
  ['demo_user_020', 'caleb.paramedic', 'Caleb N.', 32, 'Annapolis, MD', 38.9784, -76.4922, 2, 2, '5, 2', 'Paramedic on 12-hour shifts. Looking for reciprocal exchange with strong night/weekend overlap.', 'Paramedic - Anne Arundel EMS'],
].map(([uid, emailStem, displayName, age, location, latitude, longitude, numberOfChildren, childAge, childrenAgesText, needs, workplace], idx) => ({
  uid,
  email: `${emailStem}@shiftsitter.demo`,
  password: DEMO_PASSWORD,
  emailVerified: true,
  displayName,
  profile: {
    name: displayName,
    age,
    needs,
    photoURLs: [`https://i.pravatar.cc/600?img=${60 + idx}`],
    workplace,
    location,
    latitude,
    longitude,
    numberOfChildren,
    childAge,
    childrenAgesText,
    averageRating: 4.6 + ((idx % 4) * 0.1),
    ratingCount: 4 + idx,
    backgroundCheckStatus: idx % 3 === 0 ? 'not_started' : 'completed',
    interests: ['Family Time', 'Scheduling', 'Community'],
    availability: idx % 2 === 0 ? 'Mon-Fri 8:00 AM-2:00 PM; Sat 9:00 AM-3:00 PM' : 'Weekdays 4:00 PM-10:00 PM; Sun 8:00 AM-6:00 PM',
  },
}));

const ALL_DEMO_USERS = [...DEMO_USERS, ...EXTRA_DEMO_USERS];

async function seedDemoUsers() {
  console.log('\nShiftSitter - Creating Maryland demo accounts...\n');

  for (const user of ALL_DEMO_USERS) {
    try {
      console.log(`Processing: ${user.displayName} (${user.uid})`);

      try {
        await auth.createUser({
          uid: user.uid,
          email: user.email,
          password: DEMO_PASSWORD,
          displayName: user.displayName,
          photoURL: user.profile.photoURLs[0],
          emailVerified: true,
          disabled: false,
        });
      } catch (e) {
        if (e.code === 'auth/uid-already-exists' || e.code === 'auth/email-already-exists') {
          await auth.updateUser(user.uid, {
            email: user.email,
            password: DEMO_PASSWORD,
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

  console.log(`\nSeed completed. ${ALL_DEMO_USERS.length} Maryland demo accounts are ready. Password: ${DEMO_PASSWORD}\n`);
  process.exit(0);
}

async function cleanDemoUsers() {
  console.log('\nDeleting Maryland demo accounts...\n');
  for (const user of ALL_DEMO_USERS) {
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
