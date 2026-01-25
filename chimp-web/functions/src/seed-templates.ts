/**
 * Industry Templates Seed Script
 * 
 * This module provides:
 * 1. Industry template configurations with keywords for auto-matching articles
 * 2. Functions to find relevant articles and populate templates
 * 3. Seeding functions used by Cloud Functions
 */

import * as admin from 'firebase-admin';

/**
 * Industry Template Configuration - uses keywords to find matching articles
 */
export interface IndustryTemplateConfig {
  industryId: string;
  industryName: string;
  industryNameEs: string;
  keywords: string[];
  description: string;
  icon: string;
}

/**
 * Industry Template - the actual template stored in Firestore
 */
export interface IndustryTemplate {
  industryId: string;
  industryName: string;
  articleIds: string[];
  description: string;
}

/**
 * Industry Template Configurations
 * 
 * Each industry has keywords used to automatically find relevant OSHA articles.
 * The seed function searches article names and content for these keywords.
 */
export const INDUSTRY_TEMPLATE_CONFIGS: IndustryTemplateConfig[] = [
  {
    industryId: 'headstone-monument',
    industryName: 'Headstone and Monument Companies',
    industryNameEs: 'Empresas de Lápidas y Monumentos',
    icon: 'account_balance',
    keywords: [
      // Silica & Dust - Critical for stone work
      'silica',
      'crystalline',
      'dust',
      
      // Respiratory Protection
      'respiratory',
      'respirator',
      'breathing',
      'lung',
      
      // Hearing Conservation
      'hearing',
      'noise',
      'ear protection',
      
      // PPE
      'personal protective',
      'ppe',
      'eye protection',
      'safety glasses',
      'goggles',
      'face shield',
      'gloves',
      'hand protection',
      'safety shoes',
      'steel toe',
      
      // Material Handling
      'lifting',
      'ergonomic',
      'back injury',
      'material handling',
      'manual handling',
      
      // Tools & Equipment
      'grinder',
      'grinding',
      'saw',
      'cutting',
      'power tool',
      'hand tool',
      'abrasive',
      
      // Machine Safety
      'machine guard',
      'guarding',
      'lockout',
      'tagout',
      'loto',
      
      // Chemical Safety
      'hazard communication',
      'hazcom',
      'chemical',
      'sds',
      'safety data sheet',
      
      // Heavy Equipment
      'crane',
      'hoist',
      'rigging',
      'forklift',
      'powered industrial',
      
      // General Safety
      'slip',
      'trip',
      'fall',
      'housekeeping',
      'walking surface',
      'first aid',
      'emergency'
    ],
    description: 'Safety training for stone cutting, silica exposure, respiratory protection, PPE, and monument handling'
  },
  {
    industryId: 'construction',
    industryName: 'Construction',
    industryNameEs: 'Construcción',
    icon: 'construction',
    keywords: [
      'fall protection', 'scaffold', 'ladder', 'excavation', 'trench', 
      'electrical', 'struck-by', 'caught-in', 'crane', 'rigging',
      'concrete', 'masonry', 'steel erection', 'demolition'
    ],
    description: 'Construction industry safety training'
  },
  {
    industryId: 'manufacturing',
    industryName: 'Manufacturing',
    industryNameEs: 'Manufactura',
    icon: 'precision_manufacturing',
    keywords: [
      'machine guard', 'lockout', 'tagout', 'conveyor', 'forklift',
      'ergonomic', 'noise', 'chemical', 'welding', 'confined space'
    ],
    description: 'Manufacturing industry safety training'
  },
  {
    industryId: 'healthcare',
    industryName: 'Healthcare',
    industryNameEs: 'Cuidado de la Salud',
    icon: 'local_hospital',
    keywords: [
      'bloodborne', 'pathogen', 'needle', 'sharps', 'patient handling',
      'ergonomic', 'chemical', 'violence', 'infection control'
    ],
    description: 'Healthcare industry safety training'
  },
  {
    industryId: 'agriculture',
    industryName: 'Agriculture',
    industryNameEs: 'Agricultura',
    icon: 'agriculture',
    keywords: [
      'tractor', 'grain', 'pesticide', 'heat', 'animal', 'machinery',
      'rollover', 'pto', 'field sanitation'
    ],
    description: 'Agriculture industry safety training'
  },
  {
    industryId: 'maritime',
    industryName: 'Maritime',
    industryNameEs: 'Marítimo',
    icon: 'directions_boat',
    keywords: [
      'shipyard', 'marine', 'longshoring', 'cargo', 'vessel', 'dock'
    ],
    description: 'Maritime industry safety training'
  },
  {
    industryId: 'general',
    industryName: 'General Industry',
    industryNameEs: 'Industria General',
    icon: 'business',
    keywords: [
      'fire', 'emergency', 'first aid', 'evacuation', 'electrical',
      'walking', 'working surface', 'exit', 'emergency action'
    ],
    description: 'General industry safety training applicable to all workplaces'
  },
  {
    industryId: 'oil',
    industryName: 'Oil & Gas',
    industryNameEs: 'Petróleo y Gas',
    icon: 'oil_barrel',
    keywords: [
      'oil', 'gas', 'petroleum', 'drilling', 'refinery', 'pipeline',
      'h2s', 'hydrogen sulfide', 'well control', 'blowout'
    ],
    description: 'Oil and gas industry safety training'
  }
];

// Static export for Cloud Functions (articleIds populated at runtime)
export const INDUSTRY_TEMPLATES: IndustryTemplate[] = INDUSTRY_TEMPLATE_CONFIGS.map(config => ({
  industryId: config.industryId,
  industryName: config.industryName,
  articleIds: [],
  description: config.description
}));

/**
 * Find articles matching keywords for a given industry config
 */
export async function findArticlesForIndustry(
  db: admin.firestore.Firestore,
  config: IndustryTemplateConfig
): Promise<string[]> {
  const articlesSnapshot = await db.collection('article').get();
  const matchingIds: Set<string> = new Set();
  
  articlesSnapshot.docs.forEach(doc => {
    const article = doc.data();
    const searchText = `${article.name || ''} ${article.content || ''}`.toLowerCase();
    
    for (const keyword of config.keywords) {
      if (searchText.includes(keyword.toLowerCase())) {
        matchingIds.add(doc.id);
        break; // Only need one keyword match per article
      }
    }
  });
  
  return Array.from(matchingIds);
}

/**
 * Seed industries and templates with auto-discovered article IDs
 * This is called by the seedIndustryTemplates Cloud Function
 */
export async function seedAllTemplates(db: admin.firestore.Firestore): Promise<{
  industriesSeeded: number;
  templatesSeeded: number;
  totalArticlesMatched: number;
}> {
  let industriesSeeded = 0;
  let templatesSeeded = 0;
  let totalArticlesMatched = 0;

  for (const config of INDUSTRY_TEMPLATE_CONFIGS) {
    // 1. Seed the industry document
    await db.collection('industry').doc(config.industryId).set({
      name: config.industryName,
      nameEs: config.industryNameEs,
      icon: config.icon
    }, { merge: true });
    industriesSeeded++;

    // 2. Find matching articles by keywords
    const articleIds = await findArticlesForIndustry(db, config);
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

    console.log(`✓ ${config.industryName}: ${articleIds.length} articles matched`);
  }

  return { industriesSeeded, templatesSeeded, totalArticlesMatched };
}

/**
 * Get a summary of what would be seeded (for preview/debugging)
 */
export async function previewTemplates(db: admin.firestore.Firestore): Promise<any[]> {
  const preview: any[] = [];

  for (const config of INDUSTRY_TEMPLATE_CONFIGS) {
    const articleIds = await findArticlesForIndustry(db, config);
    
    // Get article names for preview
    const articleDetails: any[] = [];
    for (const id of articleIds.slice(0, 10)) { // Limit to first 10 for preview
      const doc = await db.collection('article').doc(id).get();
      if (doc.exists) {
        articleDetails.push({ id, name: doc.data()?.name });
      }
    }

    preview.push({
      industryId: config.industryId,
      industryName: config.industryName,
      totalArticles: articleIds.length,
      sampleArticles: articleDetails,
      moreArticles: articleIds.length > 10 ? articleIds.length - 10 : 0
    });
  }

  return preview;
}
