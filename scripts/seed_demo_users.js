const admin = require('firebase-admin');
const fs = require('fs');

const serviceAccountPath = './scripts/serviceAccountKey.json';

if (!fs.existsSync(serviceAccountPath)) {
    console.error('\n❌ ¡Casi! Falta un paso manual que solo tú puedes hacer.');
    console.error('-----------------------------------------------------------------');
    console.error('Error: No se encontró el archivo `serviceAccountKey.json`.');
    console.error('\nEste archivo es una "llave" de seguridad para tu proyecto.');
    console.error('Por tu propia seguridad, yo no puedo crearlo por ti.');
    console.error('\nSigue estos pasos para generarlo:');
    console.error('  1. Abre tu proyecto en la Consola de Firebase.');
    console.error('  2. Ve a "Configuración del proyecto" > "Cuentas de servicio".');
    console.error('  3. Haz clic en "Generar nueva clave privada".');
    console.error('  4. Renombra el archivo descargado a `serviceAccountKey.json`.');
    console.error('  5. Arrástralo a la carpeta `scripts` que ves a la izquierda en el explorador de archivos.');
    console.error('-----------------------------------------------------------------');
    console.error('Una vez hecho, ejecuta `npm run seed` de nuevo.');
    process.exit(1);
}

const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const auth = admin.auth();

// ───────────────────────────────────────────
// DATOS DE LAS 10 CUENTAS DEMO
// ───────────────────────────────────────────

const DEMO_USERS = [
  {
    uid: 'demo_user_001',
    email: 'sofia.enfermera@shiftsitter.demo',
    password: 'Demo2024!!',
    displayName: 'Sofía M.',
    profile: {
      name: 'Sofía M.',
      age: 32,
      needs: 'Enfermera en turno nocturno 🏥 Mamá de Diego (4 años). Busco intercambio de cuidado para noches y fines de semana.',
      photoURLs: ['https://api.dicebear.com/7.x/personas/svg?seed=sofia&backgroundColor=b6e3f4'],
      workplace: 'Enfermera — IMSS (Noches 10pm–6am)',
      location: 'Colonia del Valle, CDMX',
      latitude: 19.4326,
      longitude: -99.1332,
      numberOfChildren: 1,
      childAge: 4,
      averageRating: 4.9,
      ratingCount: 8,
      backgroundCheckStatus: 'completed',
      interests: ['Salud', 'Lectura', 'Familia'],
      availability: 'Lunes, Miércoles, Viernes (6:30-14:00), Sábados (8:00-18:00)',
    }
  },
  {
    uid: 'demo_user_002',
    email: 'carlos.policia@shiftsitter.demo',
    password: 'Demo2024!!',
    displayName: 'Carlos R.',
    profile: {
      name: 'Carlos R.',
      age: 35,
      needs: 'Policía federal con turnos 24x48. Papá de Valentina (6) y Mateo (3). Muy comprometido con el cuidado recíproco 💪',
      photoURLs: ['https://api.dicebear.com/7.x/personas/svg?seed=carlos&backgroundColor=ffdfbf'],
      workplace: 'Policía Federal (24 horas activo / 48 horas libre)',
      location: 'Narvarte, CDMX',
      latitude: 19.4280,
      longitude: -99.1276,
      numberOfChildren: 2,
      childAge: 3,
      averageRating: 5.0,
      ratingCount: 15,
      backgroundCheckStatus: 'completed',
      interests: ['Deporte', 'Seguridad', 'Cine'],
      availability: 'Lunes, Martes, Viernes, Sábados (8:00-20:00)',
    }
  },
  {
    uid: 'demo_user_003',
    email: 'ana.fabrica@shiftsitter.demo',
    password: 'Demo2024!!',
    displayName: 'Ana L.',
    profile: {
      name: 'Ana L.',
      age: 28,
      needs: 'Trabajo en línea de producción turno matutino 🏭 Mamá soltera de Luisa (2 años). Necesito apoyo para las mañanas entre semana.',
      photoURLs: ['https://api.dicebear.com/7.x/personas/svg?seed=ana&backgroundColor=c0aede'],
      workplace: 'Operadora de producción (Lun–Vie 5am–1pm)',
      location: 'Iztapalapa, CDMX',
      latitude: 19.4500,
      longitude: -99.1000,
      numberOfChildren: 1,
      childAge: 2,
      averageRating: 4.8,
      ratingCount: 3,
      backgroundCheckStatus: 'completed',
      interests: ['Música', 'Baile', 'Familia'],
      availability: 'Sábados y Domingos (9:00-17:00)',
    }
  },
    {
    uid: 'demo_user_004',
    email: 'miguel.bombero@shiftsitter.demo',
    password: 'Demo2024!!',
    displayName: 'Miguel T.',
    profile: {
      name: 'Miguel T.',
      age: 38,
      needs: 'Bombero 🚒 Turno 24x72. Papá de Emilio (7) y Clara (5). Mi esposa también trabaja turnos. Nos organizamos bien en grupo.',
      photoURLs: ['https://api.dicebear.com/7.x/personas/svg?seed=miguel&backgroundColor=ffd5dc'],
      workplace: 'Bombero (24 horas activo / 72 horas libre)',
      location: 'Benito Juárez, CDMX',
      latitude: 19.4100,
      longitude: -99.1600,
      numberOfChildren: 2,
      childAge: 5,
      averageRating: 4.7,
      ratingCount: 22,
      backgroundCheckStatus: 'completed',
      interests: ['Ayuda comunitaria', 'Deportes', 'Asados'],
      availability: 'Lunes, Martes, Miércoles (7:00-19:00), Domingos (10:00-18:00)',
    }
  },
  {
    uid: 'demo_user_005',
    email: 'lucia.doctora@shiftsitter.demo',
    password: 'Demo2024!!',
    displayName: 'Lucía P.',
    profile: {
      name: 'Lucía P.',
      age: 34,
      needs: 'Médica residente 👩‍⚕️ guardias de 36 horas. Mamá de Andrés (3). Busco ShiftSitter de confianza para las guardias largas.',
      photoURLs: ['https://api.dicebear.com/7.x/personas/svg?seed=lucia&backgroundColor=d1f4d1'],
      workplace: 'Médica Residente — Hospital General (Guardias 36h cada 4 días)',
      location: 'Roma Norte, CDMX',
      latitude: 19.4200,
      longitude: -99.1450,
      numberOfChildren: 1,
      childAge: 3,
      averageRating: 4.9,
      ratingCount: 5,
      backgroundCheckStatus: 'completed',
      interests: ['Medicina', 'Ciencia', 'Yoga'],
      availability: 'Lunes, Miércoles, Viernes (8:00-20:00), Sábados (10:00-18:00)',
    }
  },
  {
    uid: 'demo_user_006',
    email: 'roberto.seguridad@shiftsitter.demo',
    password: 'Demo2024!!',
    displayName: 'Roberto V.',
    profile: {
      name: 'Roberto V.',
      age: 30,
      needs: 'Guardia de seguridad turno nocturno 🔦 Papá de Jimena (5). Mi esposa trabaja en el día, juntos necesitamos apoyo en la transición de turnos.',
      photoURLs: ['https://api.dicebear.com/7.x/personas/svg?seed=roberto&backgroundColor=ffeaa7'],
      workplace: 'Guardia de Seguridad Privada (Noches Vie–Lun 10pm–6am)',
      location: 'Condesa, CDMX',
      latitude: 19.4380,
      longitude: -99.1600,
      numberOfChildren: 1,
      childAge: 5,
      averageRating: 4.6,
      ratingCount: 9,
      backgroundCheckStatus: 'completed',
      interests: ['Películas', 'Tecnología', 'Caminar'],
      availability: 'Martes, Miércoles, Jueves (7:00-18:00)',
    }
  },
    {
    uid: 'demo_user_007',
    email: 'patricia.chofer@shiftsitter.demo',
    password: 'Demo2024!!',
    displayName: 'Patricia G.',
    profile: {
      name: 'Patricia G.',
      age: 36,
      needs: 'Chofer de transporte escolar 🚌 Mamá de Rodrigo (8) y Fernanda (4). Trabajo madrugadas. Puedo cuidar en las tardes a cambio.',
      photoURLs: ['https://api.dicebear.com/7.x/personas/svg?seed=patricia&backgroundColor=fab1a0'],
      workplace: 'Chofer Transporte Escolar (Madrugada 4am–8am y 2pm–5pm)',
      location: 'Xochimilco, CDMX',
      latitude: 19.3950,
      longitude: -99.1600,
      numberOfChildren: 2,
      childAge: 4,
      averageRating: 4.8,
      ratingCount: 11,
      backgroundCheckStatus: 'completed',
      interests: ['Manualidades', 'Cocina', 'Aire libre'],
      availability: 'Lunes a Viernes (8:30-14:00), Sábados y Domingos (10:00-20:00)',
    }
  },
  {
    uid: 'demo_user_008',
    email: 'jorge.cajero@shiftsitter.demo',
    password: 'Demo2024!!',
    displayName: 'Jorge H.',
    profile: {
      name: 'Jorge H.',
      age: 27,
      needs: 'Cajero en banco, turno mixto 🏦 Papá de Tomás (1 año). Mi pareja trabaja en turno matutino. Buscamos intercambio vespertino y nocturno.',
      photoURLs: ['https://api.dicebear.com/7.x/personas/svg?seed=jorge&backgroundColor=dfe6e9'],
      workplace: 'Cajero Bancario (Mixto: 2pm–10pm variable)',
      location: 'Doctores, CDMX',
      latitude: 19.4450,
      longitude: -99.1200,
      numberOfChildren: 1,
      childAge: 1,
      averageRating: 4.7,
      ratingCount: 2,
      backgroundCheckStatus: 'not_started',
      interests: ['Videojuegos', 'Finanzas', 'Series'],
      availability: 'Lunes a Viernes (7:00-13:00), Domingos (9:00-16:00)',
    }
  },
  {
    uid: 'demo_user_009',
    email: 'daniela.maestra@shiftsitter.demo',
    password: 'Demo2024!!',
    displayName: 'Daniela F.',
    profile: {
      name: 'Daniela F.',
      age: 31,
      needs: 'Maestra de primaria 📚 Mamá de Isabella (6) y Samuel (4). Disponible tardes entre semana y fines de semana. ¡Amo cuidar niños!',
      photoURLs: ['https://api.dicebear.com/7.x/personas/svg?seed=daniela&backgroundColor=a29bfe'],
      workplace: 'Docente de Primaria (Lun–Vie 7am–1pm)',
      location: 'Tacubaya, CDMX',
      latitude: 19.4300,
      longitude: -99.1700,
      numberOfChildren: 2,
      childAge: 4,
      averageRating: 5.0,
      ratingCount: 18,
      backgroundCheckStatus: 'completed',
      interests: ['Educación', 'Arte', 'Naturaleza'],
      availability: 'Lunes a Viernes (14:00-21:00), Sábados (9:00-20:00), Domingos (9:00-18:00)',
    }
  },
  {
    uid: 'demo_user_010',
    email: 'fernando.cocinero@shiftsitter.demo',
    password: 'Demo2024!!',
    displayName: 'Fernando C.',
    profile: {
      name: 'Fernando C.',
      age: 33,
      needs: 'Chef en restaurante 👨‍🍳 Turno de noche y fines de semana. Papá de Renata (5). Busco apoyo para fines de semana. A cambio cuido entre semana.',
      photoURLs: ['https://api.dicebear.com/7.x/personas/svg?seed=fernando&backgroundColor=fdcb6e'],
      workplace: 'Chef de Cocina — Restaurante (Noches Jue–Dom 5pm–1am)',
      location: 'Polanco, CDMX',
      latitude: 19.4350,
      longitude: -99.1400,
      numberOfChildren: 1,
      childAge: 5,
      averageRating: 4.8,
      ratingCount: 10,
      backgroundCheckStatus: 'completed',
      interests: ['Gastronomía', 'Vino', 'Viajes'],
      availability: 'Lunes, Martes, Miércoles (9:00-17:00)',
    }
  }
];

// ───────────────────────────────────────────
// FUNCIÓN PRINCIPAL — Crea las cuentas demo
// ───────────────────────────────────────────

async function seedDemoUsers() {
  console.log('\n🍼  ShiftSitter — Creando usuarios de demostración...\n');
  console.log('═══════════════════════════════════════════════════════');

  for (const user of DEMO_USERS) {
    try {
      console.log(`\n▶ Procesando: ${user.displayName} (${user.uid})`);

      // 1. Crear o actualizar cuenta en Firebase Auth
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
        console.log(`   ✅ Auth creado: ${user.uid}`);
      } catch (e) {
        if (e.code === 'auth/uid-already-exists' || e.code === 'auth/email-already-exists') {
          console.log(`   ℹ️  Auth ya existe, actualizando...`);
          await auth.updateUser(user.uid, {
            email: user.email,
            password: user.password,
            displayName: user.displayName,
            photoURL: user.profile.photoURLs[0],
          });
        } else throw e;
      }

      // 2. Preparar el documento de perfil para Firestore
      // Este documento ahora es compatible con la estructura de la app Next.js
      const userDoc = {
        id: user.uid,
        email: user.email,
        role: 'reciprocal', // Asumimos 'reciprocal' para todos los demos.
        profileComplete: true,
        isDemo: true,
        lastSeen: admin.firestore.FieldValue.serverTimestamp(),
        // Mapeo de campos del script original a la estructura de la app
        name: user.profile.name,
        age: user.profile.age,
        needs: user.profile.needs,
        photoURLs: user.profile.photoURLs,
        workplace: user.profile.workplace,
        location: user.profile.location,
        latitude: user.profile.latitude,
        longitude: user.profile.longitude,
        numberOfChildren: user.profile.numberOfChildren,
        childAge: user.profile.childAge,
        averageRating: user.profile.averageRating,
        ratingCount: user.profile.ratingCount,
        backgroundCheckStatus: user.profile.backgroundCheckStatus,
        interests: user.profile.interests,
        availability: user.profile.availability,
      };
      
      // 3. Escribir el documento en Firestore
      const userRef = db.collection('users').doc(user.uid);
      await userRef.set(userDoc, { merge: true });
      
      console.log(`   ✅ Perfil de Firestore escrito para ${user.displayName}`);

    } catch (error) {
      console.error(`   ❌ Error con ${user.displayName}:`, error.message);
    }
  }

  console.log('\n═══════════════════════════════════════════════════════');
  console.log('✅  ¡Seed completado! 10 usuarios de demostración están listos.');
  console.log('\n📋  Resumen de cuentas creadas:');
  DEMO_USERS.forEach(u => {
    console.log(`   • ${u.displayName.padEnd(15)} ${u.email}`);
  });
  console.log('\n');

  process.exit(0);
}

// ───────────────────────────────────────────
// FUNCIÓN DE LIMPIEZA — Elimina cuentas demo
// Úsala solo si quieres resetear el seed
// node seed_demo_users.js --clean
// ───────────────────────────────────────────

async function cleanDemoUsers() {
  console.log('\n🗑️   Eliminando cuentas demo...\n');
  for (const user of DEMO_USERS) {
    try {
      await auth.deleteUser(user.uid);
      await db.collection('users').doc(user.uid).delete();
      console.log(`   ✅ Eliminado Auth y Firestore para: ${user.displayName}`);
    } catch (e) {
      console.log(`   ℹ️  ${user.displayName}: ${e.message}`);
    }
  }
  console.log('\n✅  Limpieza completada.\n');
  process.exit(0);
}


if (process.argv.includes('--clean')) {
  cleanDemoUsers();
} else {
  seedDemoUsers();
}
