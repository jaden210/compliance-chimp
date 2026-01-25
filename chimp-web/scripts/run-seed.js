/**
 * Run Seed Templates using Firebase Admin SDK
 * 
 * This script directly seeds the database using Firebase Admin.
 * It uses the default credentials from the Firebase CLI.
 * 
 * Usage: 
 *   cd chimp-web
 *   node scripts/run-seed.js
 */

const admin = require('firebase-admin');

// Initialize with default credentials (uses Firebase CLI login)
admin.initializeApp({
  projectId: 'teamlog-2d74c'
});

const db = admin.firestore();

// Industry template configurations (same as in seed-templates.ts)
const INDUSTRY_TEMPLATE_CONFIGS = [
  {
    industryId: 'headstone-monument',
    industryName: 'Headstone and Monument Companies',
    industryNameEs: 'Empresas de Lápidas y Monumentos',
    icon: 'account_balance',
    keywords: [
      'silica', 'crystalline', 'dust',
      'respiratory', 'respirator', 'breathing', 'lung',
      'hearing', 'noise', 'ear protection',
      'personal protective', 'ppe', 'eye protection', 'safety glasses',
      'goggles', 'face shield', 'gloves', 'hand protection',
      'safety shoes', 'steel toe',
      'lifting', 'ergonomic', 'back injury', 'material handling', 'manual handling',
      'grinder', 'grinding', 'saw', 'cutting', 'power tool', 'hand tool', 'abrasive',
      'machine guard', 'guarding', 'lockout', 'tagout', 'loto',
      'hazard communication', 'hazcom', 'chemical', 'sds', 'safety data sheet',
      'crane', 'hoist', 'rigging', 'forklift', 'powered industrial',
      'slip', 'trip', 'fall', 'housekeeping', 'walking surface', 'first aid', 'emergency'
    ],
    description: 'Safety training for stone cutting, silica exposure, respiratory protection, PPE, and monument handling'
  },
  {
    industryId: 'construction',
    industryName: 'Construction',
    industryNameEs: 'Construcción',
    icon: 'construction',
    keywords: ['fall protection', 'scaffold', 'ladder', 'excavation', 'trench', 'electrical', 'struck-by', 'caught-in', 'crane', 'rigging', 'concrete', 'masonry', 'steel erection', 'demolition'],
    description: 'Construction industry safety training'
  },
  {
    industryId: 'manufacturing',
    industryName: 'Manufacturing',
    industryNameEs: 'Manufactura',
    icon: 'precision_manufacturing',
    keywords: ['machine guard', 'lockout', 'tagout', 'conveyor', 'forklift', 'ergonomic', 'noise', 'chemical', 'welding', 'confined space'],
    description: 'Manufacturing industry safety training'
  },
  {
    industryId: 'healthcare',
    industryName: 'Healthcare',
    industryNameEs: 'Cuidado de la Salud',
    icon: 'local_hospital',
    keywords: ['bloodborne', 'pathogen', 'needle', 'sharps', 'patient handling', 'ergonomic', 'chemical', 'violence', 'infection control'],
    description: 'Healthcare industry safety training'
  },
  {
    industryId: 'agriculture',
    industryName: 'Agriculture',
    industryNameEs: 'Agricultura',
    icon: 'agriculture',
    keywords: ['tractor', 'grain', 'pesticide', 'heat', 'animal', 'machinery', 'rollover', 'pto', 'field sanitation'],
    description: 'Agriculture industry safety training'
  },
  {
    industryId: 'maritime',
    industryName: 'Maritime',
    industryNameEs: 'Marítimo',
    icon: 'directions_boat',
    keywords: ['shipyard', 'marine', 'longshoring', 'cargo', 'vessel', 'dock'],
    description: 'Maritime industry safety training'
  },
  {
    industryId: 'general',
    industryName: 'General Industry',
    industryNameEs: 'Industria General',
    icon: 'business',
    keywords: ['fire', 'emergency', 'first aid', 'evacuation', 'electrical', 'walking', 'working surface', 'exit', 'emergency action'],
    description: 'General industry safety training applicable to all workplaces'
  },
  {
    industryId: 'oil',
    industryName: 'Oil & Gas',
    industryNameEs: 'Petróleo y Gas',
    icon: 'oil_barrel',
    keywords: ['oil', 'gas', 'petroleum', 'drilling', 'refinery', 'pipeline', 'h2s', 'hydrogen sulfide', 'well control', 'blowout'],
    description: 'Oil and gas industry safety training'
  }
];

async function findArticlesForIndustry(config) {
  const articlesSnapshot = await db.collection('article').get();
  const matchingIds = new Set();
  
  articlesSnapshot.docs.forEach(doc => {
    const article = doc.data();
    const searchText = `${article.name || ''} ${article.content || ''}`.toLowerCase();
    
    for (const keyword of config.keywords) {
      if (searchText.includes(keyword.toLowerCase())) {
        matchingIds.add(doc.id);
        break;
      }
    }
  });
  
  return Array.from(matchingIds);
}

async function seedAllTemplates() {
  let industriesSeeded = 0;
  let templatesSeeded = 0;
  let totalArticlesMatched = 0;

  console.log('Starting database seeding...\n');

  for (const config of INDUSTRY_TEMPLATE_CONFIGS) {
    // 1. Seed the industry document
    await db.collection('industry').doc(config.industryId).set({
      name: config.industryName,
      nameEs: config.industryNameEs,
      icon: config.icon
    }, { merge: true });
    industriesSeeded++;
    console.log(`✓ Industry: ${config.industryName}`);

    // 2. Find matching articles by keywords
    const articleIds = await findArticlesForIndustry(config);
    totalArticlesMatched += articleIds.length;

    // 3. Seed the template with found article IDs
    await db.collection('industry-templates').doc(config.industryId).set({
      industryId: config.industryId,
      industryName: config.industryName,
      articleIds: articleIds,
      description: config.description,
      keywords: config.keywords,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    templatesSeeded++;
    console.log(`  → Template: ${articleIds.length} articles matched\n`);
  }

  return { industriesSeeded, templatesSeeded, totalArticlesMatched };
}

async function main() {
  try {
    const result = await seedAllTemplates();
    
    console.log('='.repeat(50));
    console.log('✅ Database seeding complete!\n');
    console.log(`Industries seeded: ${result.industriesSeeded}`);
    console.log(`Templates seeded: ${result.templatesSeeded}`);
    console.log(`Total articles matched: ${result.totalArticlesMatched}`);
    console.log('='.repeat(50));
    
    process.exit(0);
  } catch (error) {
    console.error('Error seeding database:', error);
    process.exit(1);
  }
}

main();
