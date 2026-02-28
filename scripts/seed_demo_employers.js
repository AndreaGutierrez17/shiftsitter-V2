// ShiftSitter employer demo seed
// Run: node scripts/seed_demo_employers.js

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

const DEMO_PASSWORD = 'Demo2026$$';

const EMPLOYER_DEMOS = [
  {
    uid: 'demo_employer_001',
    email: 'ops@andova-employer.demo',
    displayName: 'Andova HR Admin',
    employer: {
      companyName: 'Andova Digital',
      companyEmail: 'ops@andova-employer.demo',
      contactName: 'Andrea Gutierrez',
      companySize: '1-50',
      industries: ['Healthcare Staffing', 'Operations'],
      locations: [{ state: 'MD', city: 'Baltimore' }],
      demoType: 'employer',
      isDemo: true,
    },
  },
  {
    uid: 'demo_employer_002',
    email: 'benefits@harborhealth-employer.demo',
    displayName: 'Harbor Health Benefits',
    employer: {
      companyName: 'Harbor Health Systems',
      companyEmail: 'benefits@harborhealth-employer.demo',
      contactName: 'Nia Roberts',
      companySize: '51-200',
      industries: ['Hospital Operations', 'Employee Benefits'],
      locations: [{ state: 'MD', city: 'Towson' }],
      demoType: 'employer',
      isDemo: true,
    },
  },
  {
    uid: 'demo_employer_003',
    email: 'hr@chesapeakeworks-employer.demo',
    displayName: 'Chesapeake Works HR',
    employer: {
      companyName: 'Chesapeake Works Group',
      companyEmail: 'hr@chesapeakeworks-employer.demo',
      contactName: 'Luis Mendoza',
      companySize: '201-1000',
      industries: ['Utilities', 'Field Operations'],
      locations: [{ state: 'MD', city: 'Annapolis' }],
      demoType: 'employer',
      isDemo: true,
    },
  },
  {
    uid: 'demo_employer_004',
    email: 'people@northpointcare-employer.demo',
    displayName: 'NorthPoint People Ops',
    employer: {
      companyName: 'NorthPoint Care Network',
      companyEmail: 'people@northpointcare-employer.demo',
      contactName: 'Rachel Owens',
      companySize: '1000+',
      industries: ['Healthcare Network', 'Nursing'],
      locations: [{ state: 'MD', city: 'Columbia' }],
      demoType: 'employer',
      isDemo: true,
    },
  },
  {
    uid: 'demo_employer_005',
    email: 'admin@metrodispatch-employer.demo',
    displayName: 'Metro Dispatch Admin',
    employer: {
      companyName: 'Metro Dispatch Services',
      companyEmail: 'admin@metrodispatch-employer.demo',
      contactName: 'Jasmine Cole',
      companySize: '51-200',
      industries: ['Emergency Response', 'Dispatch'],
      locations: [{ state: 'MD', city: 'Owings Mills' }],
      demoType: 'employer',
      isDemo: true,
    },
  },
];

async function seedEmployerDemos() {
  console.log('\nShiftSitter - Creating employer demo accounts...\n');

  for (const item of EMPLOYER_DEMOS) {
    try {
      console.log(`Processing: ${item.displayName} (${item.uid})`);

      try {
        await auth.createUser({
          uid: item.uid,
          email: item.email,
          password: DEMO_PASSWORD,
          displayName: item.displayName,
          emailVerified: true,
          disabled: false,
        });
      } catch (error) {
        if (error.code === 'auth/uid-already-exists' || error.code === 'auth/email-already-exists') {
          await auth.updateUser(item.uid, {
            email: item.email,
            password: DEMO_PASSWORD,
            displayName: item.displayName,
            emailVerified: true,
          });
        } else {
          throw error;
        }
      }

      await db.collection('users').doc(item.uid).set(
        {
          uid: item.uid,
          id: item.uid,
          email: item.email,
          name: item.displayName,
          photoURLs: [],
          isActive: true,
          profileComplete: true,
          accountType: 'employer',
          isDemo: true,
          demoType: 'employer',
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      await db.collection('employers').doc(item.uid).set(
        {
          employerId: item.uid,
          ...item.employer,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      console.log(`OK: ${item.displayName}`);
    } catch (error) {
      console.error(`ERROR: ${item.displayName}:`, error.message);
    }
  }

  console.log(`\nEmployer seed completed. ${EMPLOYER_DEMOS.length} demo employer accounts are ready. Password: ${DEMO_PASSWORD}\n`);
  process.exit(0);
}

async function cleanEmployerDemos() {
  console.log('\nDeleting employer demo accounts...\n');
  for (const item of EMPLOYER_DEMOS) {
    try {
      await auth.deleteUser(item.uid);
    } catch (error) {
      console.log(`Skip auth delete: ${item.displayName}: ${error.message}`);
    }

    try {
      await db.collection('employers').doc(item.uid).delete();
      await db.collection('users').doc(item.uid).delete();
      console.log(`Removed: ${item.displayName}`);
    } catch (error) {
      console.log(`Skip firestore delete: ${item.displayName}: ${error.message}`);
    }
  }
  console.log('\nEmployer cleanup completed.\n');
  process.exit(0);
}

if (process.argv.includes('--clean')) {
  cleanEmployerDemos();
} else {
  seedEmployerDemos();
}
