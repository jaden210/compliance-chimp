import { onCall, onRequest, HttpsError } from "firebase-functions/v2/https";
import { onDocumentCreated, onDocumentUpdated, onDocumentDeleted } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { defineSecret } from "firebase-functions/params";
import * as moment from "moment";
import * as admin from "firebase-admin";

admin.initializeApp();

// Define secrets for Firebase Functions V2
const stripeSecretKey = defineSecret("STRIPE_SECRET_KEY");
const stripeWebhookSecret = defineSecret("STRIPE_WEBHOOK_SECRET");
const sendgridApiKey = defineSecret("SENDGRID_API_KEY");
const twilioAccountSid = defineSecret("TWILIO_ACCOUNT_SID");
const twilioAuthToken = defineSecret("TWILIO_AUTH_TOKEN");
const xaiApiKey = defineSecret("XAI_API_KEY");

const nodemailer = require("nodemailer");
const sendgridTransport = require("nodemailer-sendgrid-transport");

// Helper to create SendGrid transport (called at runtime when secret is available)
function createSendgridClient() {
  return nodemailer.createTransport(
    sendgridTransport({
      auth: {
        api_key: process.env.SENDGRID_API_KEY,
      },
    })
  );
}

// Helper to create Stripe client (called at runtime when secret is available)
function createStripeClient() {
  return require("stripe")(process.env.STRIPE_SECRET_KEY);
}

// Re-export functions from other modules
export * from './outbound';

// Get count of industry articles that would be added to a team's library
export const getIndustryArticleCount = onCall(
  {},
  async (request) => {
    const { teamId } = request.data as any;

    if (!teamId) {
      throw new HttpsError('invalid-argument', 'Team ID is required');
    }

    const db = admin.firestore();

    // Get the team
    const teamDoc = await db.doc(`team/${teamId}`).get();
    const team = teamDoc.data();

    if (!team) {
      throw new HttpsError('not-found', 'Team not found');
    }

    if (!team.industries || team.industries.length === 0) {
      return { success: true, count: 0, message: 'No industries selected for this team' };
    }

    try {
      // Query articles that have industryIds matching the team's industries
      // Firestore array-contains-any supports up to 10 values
      const industriesToQuery = team.industries.slice(0, 10);
      
      const articlesSnapshot = await db
        .collection('article')
        .where('industryIds', 'array-contains-any', industriesToQuery)
        .get();

      if (articlesSnapshot.empty) {
        return { success: true, count: 0, message: 'No articles found for your industries' };
      }

      // Get existing library items to check for duplicates
      const existingLibrarySnapshot = await db
        .collection('library')
        .where('teamId', '==', teamId)
        .get();
      
      const existingArticleIds = new Set(
        existingLibrarySnapshot.docs
          .map(doc => doc.data().sourceArticleId)
          .filter(id => id) // Filter out undefined
      );

      // Count articles that aren't already in library
      const newArticlesCount = articlesSnapshot.docs.filter(doc => 
        !existingArticleIds.has(doc.id)
      ).length;

      return {
        success: true,
        count: newArticlesCount,
        totalAvailable: articlesSnapshot.size,
        alreadyInLibrary: articlesSnapshot.size - newArticlesCount
      };
    } catch (error: any) {
      console.error('Error getting industry article count:', error);
      throw new HttpsError('internal', error.message);
    }
  }
);

// Apply industry articles to a team's library (callable from frontend)
export const applyIndustryTemplates = onCall(
  {},
  async (request) => {
    const { teamId } = request.data as any;

    if (!teamId) {
      throw new HttpsError('invalid-argument', 'Team ID is required');
    }

    const db = admin.firestore();

    // Get the team
    const teamDoc = await db.doc(`team/${teamId}`).get();
    const team = teamDoc.data();

    if (!team) {
      throw new HttpsError('not-found', 'Team not found');
    }

    if (!team.industries || team.industries.length === 0) {
      return { success: false, message: 'No industries selected for this team', articlesAdded: 0 };
    }

    try {
      // Query articles that have industryIds matching the team's industries
      const industriesToQuery = team.industries.slice(0, 10);
      
      const articlesSnapshot = await db
        .collection('article')
        .where('industryIds', 'array-contains-any', industriesToQuery)
        .get();

      if (articlesSnapshot.empty) {
        return { success: false, message: 'No articles found for your industries', articlesAdded: 0 };
      }

      // Get existing library items to avoid duplicates
      const existingLibrarySnapshot = await db
        .collection('library')
        .where('teamId', '==', teamId)
        .get();
      
      const existingArticleIds = new Set(
        existingLibrarySnapshot.docs
          .map(doc => doc.data().sourceArticleId)
          .filter(id => id)
      );

      // Fetch topics and industries for metadata
      const [topicsSnapshot, industriesSnapshot] = await Promise.all([
        db.collection('topic').get(),
        db.collection('industry').get()
      ]);

      const topicsMap: Map<string, any> = new Map();
      topicsSnapshot.docs.forEach(doc => topicsMap.set(doc.id, doc.data()));

      const industriesMap: Map<string, any> = new Map();
      industriesSnapshot.docs.forEach(doc => industriesMap.set(doc.id, doc.data()));

      // Add articles that don't already exist in library
      const articlesToAdd = articlesSnapshot.docs.filter(doc => !existingArticleIds.has(doc.id));
      
      // Calculate scheduled dates for even distribution across the year
      // With annual cadence, spread items across 365 days starting 7 days from now
      const totalItems = articlesToAdd.length;
      const intervalDays = 365;
      const spacingDays = totalItems > 0 ? Math.floor(intervalDays / totalItems) : intervalDays;
      
      let addedCount = 0;
      const libraryPromises = articlesToAdd.map((doc, index) => {
          const article = doc.data();
          const topic = topicsMap.get(article?.topicId);
          const industry = topic ? industriesMap.get(topic.industryId) : null;

          // Calculate scheduled due date for even distribution
          const scheduledDueDate = new Date();
          scheduledDueDate.setDate(scheduledDueDate.getDate() + 7 + (index * spacingDays));

          const libraryItem = {
            name: article?.name || 'Untitled',
            content: article?.content || '',
            topic: topic?.name || 'General',
            industry: industry?.name || 'General',
            teamId: teamId,
            addedBy: 'system',
            createdAt: new Date(),
            thumbnail: article?.imageUrl || null,
            sourceArticleId: doc.id, // Track which article this came from
            isTemplateContent: true,
            trainingCadence: 'Annually',
            scheduledDueDate: scheduledDueDate
          };

          addedCount++;
          return db.collection('library').add(libraryItem);
        });

      await Promise.all(libraryPromises);

      return {
        success: true,
        message: `Successfully added ${addedCount} articles to your library`,
        articlesAdded: addedCount
      };
    } catch (error: any) {
      console.error('Error applying industry templates:', error);
      throw new HttpsError('internal', error.message);
    }
  }
);

// Auto-build compliance program for challenge flow (step 4)
// Creates inspections and training based on team's industry
export const autoBuildCompliance = onCall(
  {
    secrets: [xaiApiKey],
    timeoutSeconds: 300,
    memory: "1GiB"
  },
  async (request) => {
    const { teamId } = request.data as any;

    if (!teamId) {
      throw new HttpsError('invalid-argument', 'Team ID is required');
    }

    console.log(`[AutoBuild] Starting auto-build for team ${teamId}`);
    const db = admin.firestore();
    const teamRef = db.doc(`team/${teamId}`);

    try {
      // Get the team
      const teamDoc = await teamRef.get();
      const team = teamDoc.data();

      if (!team) {
        throw new HttpsError('not-found', 'Team not found');
      }

      // Get team members for job title and tag context
      const teamMembersSnapshot = await db
        .collection('teamMember')
        .where('teamId', '==', teamId)
        .get();
      
      const teamMembers = teamMembersSnapshot.docs.map(doc => doc.data());
      const jobTitles = [...new Set(teamMembers.map(tm => tm.jobTitle).filter(Boolean))] as string[];
      
      // Collect all unique tags from team members
      const allTags = [...new Set(
        teamMembers.flatMap(tm => tm.tags || []).filter(Boolean)
      )] as string[];

      // Get industry name - check both 'industry' (string from challenge) and 'industries' (array of IDs)
      let industryName = team.industry || 'General Business';
      if (!team.industry && team.industries && team.industries.length > 0) {
        const industryDoc = await db.doc(`industry/${team.industries[0]}`).get();
        if (industryDoc.exists) {
          industryName = industryDoc.data()?.name || industryName;
        }
      }
      
      console.log(`[AutoBuild] Team ${teamId}: industry="${industryName}", ${teamMembers.length} members, jobTitles=[${jobTitles.join(', ')}], allTags=[${allTags.join(', ')}]`);

      // ========== STEP 1: Generate inspection and training topics in parallel ==========
      await teamRef.update({
        'autoBuildProgress.inspections': {
          currentAction: 'Analyzing compliance requirements...',
          created: 0,
          complete: false
        },
        'autoBuildProgress.trainings': {
          currentAction: 'Identifying training needs...',
          created: 0,
          complete: false
        }
      });

      // Generate BOTH inspection recommendations AND training topics in parallel
      console.log(`[AutoBuild] Generating inspections and training topics in parallel for ${industryName}...`);
      console.log(`[AutoBuild] Team has ${allTags.length} tags: ${allTags.join(', ')}`);
      const [inspectionRecommendations, trainingTopics] = await Promise.all([
        generateInspectionRecommendationsForAutoBuild(industryName, jobTitles, teamMembers.length),
        generateTrainingTopicsForAutoBuild(industryName, jobTitles, allTags)
      ]);
      console.log(`[AutoBuild] Got ${inspectionRecommendations.length} inspections and ${trainingTopics.length} training topics`);

      // ========== STEP 2: Create inspections sequentially for streaming progress ==========
      let inspectionsCreated = 0;
      const totalInspections = inspectionRecommendations.length;
      
      await teamRef.update({
        'autoBuildProgress.inspections': {
          currentAction: `Creating inspection 1 of ${totalInspections}...`,
          created: 0,
          complete: false
        }
      });

      for (const rec of inspectionRecommendations) {
        let frequency = rec.frequency || 'Monthly';
        if (frequency === 'Semi-Annually') frequency = 'Semi-Anually';
        if (frequency === 'Annually') frequency = 'Anually';

        // Map to baseQuestions format expected by frontend
        const baseQuestions = (rec.customCategories || []).map((cat: any) => ({
          subject: cat.subject,
          questions: (cat.questions || []).map((q: string) => ({
            name: q
          }))
        }));

        const selfInspection = {
          title: rec.name,  // Frontend uses 'title' not 'name'
          description: rec.description || '',
          inspectionExpiration: frequency,  // Frontend uses 'inspectionExpiration' not 'frequency'
          teamId: teamId,
          createdAt: new Date(),
          baseQuestions: baseQuestions,  // Frontend uses 'baseQuestions' not 'categories'
          source: 'auto-build',
          userId: 'system'  // Required for event logging
        };

        await db.collection(`team/${teamId}/self-inspection`).add(selfInspection);
        inspectionsCreated++;
        console.log(`[AutoBuild] Created inspection ${inspectionsCreated}: ${rec.name}`);
        
        // Update progress with streaming feedback
        await teamRef.update({
          'autoBuildProgress.inspections': {
            currentAction: `Created: ${rec.name}`,
            created: inspectionsCreated,
            complete: false
          }
        });
      }

      // Mark inspections complete
      await teamRef.update({
        'autoBuildProgress.inspections': {
          currentAction: 'Inspections complete',
          created: inspectionsCreated,
          complete: true
        }
      });

      // ========== STEP 3: Generate and create trainings one at a time for streaming progress ==========
      let trainingsCreated = 0;
      const totalTrainings = trainingTopics.length;
      
      await teamRef.update({
        'autoBuildProgress.trainings': {
          currentAction: `Generating training 1 of ${totalTrainings}...`,
          created: 0,
          complete: false
        }
      });

      for (let index = 0; index < trainingTopics.length; index++) {
        const topic = trainingTopics[index];
        
        // Update progress to show which training is being generated
        await teamRef.update({
          'autoBuildProgress.trainings': {
            currentAction: `Generating: ${topic.name}...`,
            created: trainingsCreated,
            complete: false
          }
        });
        
        // Generate training content for this topic
        console.log(`[AutoBuild] Generating training ${index + 1}/${totalTrainings}: ${topic.name}`);
        const articleContent = await generateTrainingContentForAutoBuild(topic.name, topic.description, industryName);
        
        const scheduledDueDate = new Date();
        scheduledDueDate.setDate(scheduledDueDate.getDate() + 7 + (index * 60));

        const libraryItem = {
          name: articleContent.title || topic.name,
          content: articleContent.content,
          topic: topic.category || 'General Safety',
          industry: industryName,
          teamId: teamId,
          addedBy: 'system',
          teamMemberId: 'system',  // Required for event logging
          createdAt: new Date(),
          thumbnail: null,
          isTemplateContent: false,
          isAiGenerated: true,
          trainingCadence: topic.cadence || 'Annually',
          scheduledDueDate: scheduledDueDate,
          assignedTags: topic.assignedTags || []
        };

        await db.collection('library').add(libraryItem);
        trainingsCreated++;
        const tagsInfo = libraryItem.assignedTags.length > 0 
          ? `(tags: ${libraryItem.assignedTags.join(', ')})`
          : '(all team)';
        console.log(`[AutoBuild] Created training ${trainingsCreated}: ${articleContent.title || topic.name} ${tagsInfo}`);

        // Update progress with the created training
        await teamRef.update({
          'autoBuildProgress.trainings': {
            currentAction: `Created: ${articleContent.title || topic.name}`,
            created: trainingsCreated,
            complete: false
          }
        });
      }

      // Mark trainings complete (inspections already marked complete earlier)
      await teamRef.update({
        'autoBuildProgress.trainings': {
          currentAction: 'Training library complete',
          created: trainingsCreated,
          complete: true
        }
      });

      console.log(`[AutoBuild] Complete for team ${teamId}: ${inspectionsCreated} inspections, ${trainingsCreated} trainings`);

      return {
        success: true,
        inspectionsCreated,
        trainingsCreated
      };

    } catch (error: any) {
      console.error('[AutoBuild] Error:', error);
      
      // Update progress with error
      await teamRef.update({
        'autoBuildProgress.error': error.message || 'Unknown error occurred'
      }).catch(() => {});
      
      throw new HttpsError('internal', error.message);
    }
  }
);

// Helper function to generate inspection recommendations using AI (for auto-build)
async function generateInspectionRecommendationsForAutoBuild(
  industry: string,
  jobTitles: string[],
  teamSize: number
): Promise<any[]> {
  const jobTitlesText = jobTitles.length > 0
    ? `Team job titles include: ${jobTitles.join(', ')}`
    : 'No specific job titles provided';

  try {
    const response = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.XAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'grok-3-fast',
        messages: [
          {
            role: 'system',
            content: `You are an OSHA compliance and workplace safety expert. Create a COMPREHENSIVE set of 8-10 self-inspection checklists that would ensure FULL regulatory compliance for the given industry.

Your goal is to ensure this company would PASS an OSHA inspection. This is critical - missing inspections could result in fines, injuries, or deaths.

MANDATORY INSPECTIONS FOR ALL INDUSTRIES:
1. Fire Safety & Emergency Equipment (monthly)
2. General Workplace Safety & Housekeeping (weekly/monthly)
3. First Aid & Emergency Preparedness (quarterly)
4. PPE Condition & Availability (monthly)
5. Electrical Safety (quarterly)

INDUSTRY-SPECIFIC INSPECTIONS:
- Construction/Masonry/Stone: Silica dust controls, fall protection equipment, scaffold safety, power tool condition
- Healthcare: Infection control, sharps disposal, medication storage, patient safety equipment
- Manufacturing: Machine guarding, lockout/tagout verification, forklift daily checks
- Food Service: Temperature logs, sanitation, pest control, food storage
- Warehouse: Rack safety, forklift charging area, loading dock safety
- Auto/Mechanic: Lift safety, hazmat storage, ventilation systems

FREQUENCY OPTIONS (use ONLY these):
- "Weekly" - For daily operational checks
- "Monthly" - For regular safety checks
- "Quarterly" - For quarterly reviews
- "Semi-Annually" - For semi-annual reviews
- "Annually" - For annual audits

Return JSON:
{
  "recommendations": [
    {
      "name": "Inspection Name (e.g., 'Monthly Fire Safety Inspection')",
      "description": "Brief description of what this covers and why it's required",
      "frequency": "Monthly",
      "regulation": "Relevant OSHA standard if applicable",
      "customCategories": [
        {
          "subject": "Category Name",
          "questions": ["Is the emergency exit clearly marked and unobstructed?", "Are fire extinguishers accessible and inspected?"]
        }
      ]
    }
  ]
}

Generate 8-10 inspections with 2-4 categories each, 4-8 yes/no questions per category. Be thorough and specific to the industry. It's better to have more comprehensive inspections than to miss critical safety checks.`
          },
          {
            role: 'user',
            content: `Industry: ${industry}\n${jobTitlesText}\nTeam size: ${teamSize}`
          }
        ],
        temperature: 0.5
      })
    });

    if (!response.ok) {
      console.error('[AutoBuild] AI API error for inspections:', await response.text());
      return getDefaultInspections(industry);
    }

    const grokResponse: any = await response.json();
    const aiMessage = grokResponse.choices?.[0]?.message?.content || '{}';

    const jsonMatch = aiMessage.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.recommendations && parsed.recommendations.length > 0) {
        // Allow up to 10 inspections for comprehensive coverage
        return parsed.recommendations.slice(0, 10);
      }
    }

    return getDefaultInspections(industry);
  } catch (error) {
    console.error('[AutoBuild] Error generating inspection recommendations:', error);
    return getDefaultInspections(industry);
  }
}

// Helper function to generate training topics for auto-build
async function generateTrainingTopicsForAutoBuild(
  industry: string,
  jobTitles: string[],
  teamTags: string[] = []
): Promise<any[]> {
  console.log(`[AutoBuild] generateTrainingTopicsForAutoBuild called with industry="${industry}", jobTitles=[${jobTitles.join(', ')}], teamTags=[${teamTags.join(', ')}]`);
  
  const jobTitlesText = jobTitles.length > 0
    ? `Team job titles: ${jobTitles.join(', ')}`
    : '';
  
  const tagsContext = teamTags.length > 0
    ? `\n\nTEAM TAGS AVAILABLE FOR ASSIGNMENT: ${teamTags.join(', ')}

IMPORTANT - You MUST assign tags to role-specific trainings:
- For trainings that apply to EVERYONE (harassment prevention, emergency plans, fire safety): use assignedTags: []
- For role-specific trainings: assign the relevant tags from the list above
- ONLY use tags from this exact list: ${teamTags.join(', ')}
- Match trainings to the job roles - e.g., if there's a "Warehouse" tag and you're creating forklift training, assign ["Warehouse"]`
    : '\n\nNo team tags defined - all trainings will go to all team members.';

  try {
    const response = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.XAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'grok-3-fast',
        messages: [
          {
            role: 'system',
            content: `You are a compliance and workplace safety expert covering OSHA, HIPAA, PCI-DSS, and other regulatory frameworks. Generate a COMPREHENSIVE set of 10-12 training topics that would be required for FULL regulatory compliance for the given industry.

Your goal is to ensure this company would be FULLY PREPARED if regulators inspected them. This is critical - missing trainings could result in fines, injuries, data breaches, or worse.

MANDATORY TOPICS FOR ALL INDUSTRIES (include relevant ones):
1. Hazard Communication (HazCom/GHS) - OSHA 1910.1200
2. Emergency Action Plans - OSHA 1910.38
3. Fire Prevention - OSHA 1910.39
4. Personal Protective Equipment (PPE) - OSHA 1910.132
5. Bloodborne Pathogens (if any first aid duties) - OSHA 1910.1030
6. Workplace Violence Prevention
7. Harassment Prevention (required in many states)
8. Cybersecurity Awareness (if any computer use)
9. Data Privacy Basics (for businesses handling customer data)

INDUSTRY-SPECIFIC REQUIREMENTS:
- Construction/Masonry/Stone: Silica dust exposure (1910.1053), fall protection, scaffold safety, crane/rigging, excavation, electrical safety
- Healthcare/Medical: HIPAA privacy & security, infection control, patient handling, medication safety, PHI protection
- IT/Software/Tech: PCI-DSS (if payment data), SOC 2 awareness, secure coding practices, data breach response
- Retail/E-commerce: PCI-DSS compliance, customer data protection, fraud prevention
- Financial Services: SOX compliance, anti-money laundering (AML), data security, fraud detection
- Manufacturing: Machine guarding, lockout/tagout, powered industrial trucks
- Food Service: Food safety, allergens, proper hygiene, temperature control, FDA requirements
- Auto/Mechanic: Hazardous materials, lift safety, electrical systems
- Warehousing: Forklift certification, material handling, ergonomics
- Any with customer data: Data privacy, breach notification procedures

Return JSON:
{
  "topics": [
    {
      "name": "Training Topic Title",
      "description": "What employees will learn and why it's required",
      "category": "Category",
      "cadence": "Annually|Quarterly|Upon Hire",
      "regulation": "Relevant OSHA standard or regulation if applicable",
      "assignedTags": ["tag1", "tag2"] or [] for all team members
    }
  ]
}

CRITICAL TAG ASSIGNMENT RULES:
- General safety trainings (harassment, emergency plans, fire safety, emergency action) should have assignedTags: [] to go to everyone
- Role-specific trainings MUST be assigned to relevant tags:
  - Forklift/material handling → assign to warehouse/operations tags
  - Driving/CDL → assign to driver tags
  - Machine/equipment operation → assign to operations/technician tags
  - Office/computer/data → assign to office tags
- You MUST use the exact tags provided in the TEAM TAGS AVAILABLE list
- Do NOT make up new tags - only use tags from the provided list
- If no tags are provided, use assignedTags: [] for all trainings

Generate 10-12 training topics that provide COMPLETE compliance coverage. Be thorough - it's better to have more coverage than to leave gaps that could result in violations.`
          },
          {
            role: 'user',
            content: `Industry: ${industry}\n${jobTitlesText}${tagsContext}`
          }
        ],
        temperature: 0.5
      })
    });

    if (!response.ok) {
      console.error('[AutoBuild] AI API error for training topics:', await response.text());
      return getDefaultTrainingTopics(industry);
    }

    const grokResponse: any = await response.json();
    const aiMessage = grokResponse.choices?.[0]?.message?.content || '{}';

    const jsonMatch = aiMessage.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.topics && parsed.topics.length > 0) {
        // Allow up to 12 trainings for comprehensive coverage
        // Validate and clean assignedTags - use case-insensitive matching
        const teamTagsLower = teamTags.map(t => t.toLowerCase());
        console.log(`[AutoBuild] Available team tags: ${teamTags.join(', ')}`);
        
        return parsed.topics.slice(0, 12).map((topic: any) => {
          let matchedTags: string[] = [];
          if (Array.isArray(topic.assignedTags)) {
            // For each AI-suggested tag, find the matching team tag (case-insensitive)
            matchedTags = topic.assignedTags
              .map((aiTag: string) => {
                const lowerAiTag = aiTag.toLowerCase();
                const matchIndex = teamTagsLower.indexOf(lowerAiTag);
                if (matchIndex !== -1) {
                  return teamTags[matchIndex]; // Return the original case from team tags
                }
                return null;
              })
              .filter(Boolean) as string[];
          }
          
          if (topic.assignedTags?.length > 0 && matchedTags.length === 0) {
            console.log(`[AutoBuild] Warning: AI suggested tags [${topic.assignedTags.join(', ')}] for "${topic.name}" but none matched team tags`);
          } else if (matchedTags.length > 0) {
            console.log(`[AutoBuild] Assigned tags [${matchedTags.join(', ')}] to "${topic.name}"`);
          }
          
          return {
            ...topic,
            assignedTags: matchedTags
          };
        });
      }
    }

    return getDefaultTrainingTopics(industry);
  } catch (error) {
    console.error('[AutoBuild] Error generating training topics:', error);
    return getDefaultTrainingTopics(industry);
  }
}

// Helper function to generate training content for auto-build
async function generateTrainingContentForAutoBuild(
  topic: string,
  description: string,
  industry: string
): Promise<{ title: string; content: string }> {
  try {
    const response = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.XAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'grok-3-fast',
        messages: [
          {
            role: 'system',
            content: `You are a safety and compliance training writer. Create engaging, OSHA-compliant training articles.

Requirements:
- Write at 8th-grade reading level
- Include practical, actionable steps
- Reference relevant regulations when applicable
- Use clear HTML formatting

Return JSON:
{
  "title": "Professional article title",
  "content": "<h2>Introduction</h2><p>Why this matters...</p><h2>Key Concepts</h2>..."
}

HTML Structure:
- <h2> for main sections
- <h3> for subsections  
- <ul>/<li> for bullet lists
- <ol>/<li> for numbered procedures
- <p> for paragraphs (keep short)
- <strong> for emphasis
- <blockquote> for regulation quotes

Sections: Introduction, Key Concepts, Procedures/Steps, Summary/Takeaways`
          },
          {
            role: 'user',
            content: `Topic: ${topic}\nDescription: ${description || 'N/A'}\nIndustry: ${industry}`
          }
        ],
        temperature: 0.7
      })
    });

    if (!response.ok) {
      console.error('[AutoBuild] AI API error for training content:', await response.text());
      return { title: topic, content: `<h2>${topic}</h2><p>Training content for ${topic} in the ${industry} industry.</p>` };
    }

    const grokResponse: any = await response.json();
    const aiMessage = grokResponse.choices?.[0]?.message?.content || '{}';

    const jsonMatch = aiMessage.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        title: parsed.title || topic,
        content: parsed.content || `<h2>${topic}</h2><p>Training content for this topic.</p>`
      };
    }

    return { title: topic, content: `<h2>${topic}</h2><p>Training content for ${topic}.</p>` };
  } catch (error) {
    console.error('[AutoBuild] Error generating training content:', error);
    return { title: topic, content: `<h2>${topic}</h2><p>Training content for ${topic}.</p>` };
  }
}

// Fallback inspections if AI fails
function getDefaultInspections(industry: string): any[] {
  return [
    {
      name: 'Monthly Fire Safety Inspection',
      description: 'Fire prevention equipment and emergency exit checks per OSHA 1910.39',
      frequency: 'Monthly',
      regulation: 'OSHA 1910.39',
      customCategories: [
        {
          subject: 'Fire Extinguishers',
          questions: [
            'Are all fire extinguishers accessible and unobstructed?',
            'Are fire extinguishers fully charged (gauge in green)?',
            'Are fire extinguisher inspection tags current?',
            'Are fire extinguishers mounted at proper height?',
            'Do employees know location of nearest fire extinguisher?'
          ]
        },
        {
          subject: 'Emergency Exits',
          questions: [
            'Are all emergency exits clearly marked with illuminated signs?',
            'Are all exit paths clear and unobstructed?',
            'Do all emergency exit doors open easily?',
            'Is emergency lighting functional?'
          ]
        }
      ]
    },
    {
      name: 'Monthly Workplace Safety Walkthrough',
      description: 'General safety and housekeeping inspection',
      frequency: 'Monthly',
      customCategories: [
        {
          subject: 'Walking/Working Surfaces',
          questions: [
            'Are floors clean and free of slip/trip hazards?',
            'Are spills cleaned up immediately?',
            'Are walkways and aisles clear and unobstructed?',
            'Are floor mats in good condition and laying flat?',
            'Is proper lighting maintained in all work areas?'
          ]
        },
        {
          subject: 'General Safety',
          questions: [
            'Are safety signs and labels visible and legible?',
            'Is the first aid kit fully stocked and accessible?',
            'Are emergency contact numbers posted?',
            'Are SDS/MSDS sheets accessible for all chemicals?'
          ]
        }
      ]
    },
    {
      name: 'Monthly PPE Inspection',
      description: 'Personal protective equipment availability and condition check per OSHA 1910.132',
      frequency: 'Monthly',
      regulation: 'OSHA 1910.132',
      customCategories: [
        {
          subject: 'PPE Availability',
          questions: [
            'Is appropriate PPE available for all required tasks?',
            'Are safety glasses/goggles available and in good condition?',
            'Are work gloves available in appropriate sizes?',
            'Is hearing protection available where required?',
            'Are hard hats available and in good condition (if required)?'
          ]
        },
        {
          subject: 'PPE Condition',
          questions: [
            'Is all PPE free from damage and defects?',
            'Is PPE being properly stored when not in use?',
            'Are employees using required PPE for their tasks?',
            'Is PPE properly sized for each employee?'
          ]
        }
      ]
    },
    {
      name: 'Monthly Electrical Safety Inspection',
      description: 'Electrical hazard identification per OSHA 1910.303',
      frequency: 'Monthly',
      regulation: 'OSHA 1910.303',
      customCategories: [
        {
          subject: 'Electrical Equipment',
          questions: [
            'Are all electrical panels accessible (36" clearance)?',
            'Are electrical panel covers in place?',
            'Are extension cords in good condition (no fraying/damage)?',
            'Are GFCIs installed and functional where required?',
            'Are electrical cords kept away from water sources?'
          ]
        },
        {
          subject: 'Outlets and Wiring',
          questions: [
            'Are outlet covers in place and undamaged?',
            'Are outlets overloaded with multiple adapters?',
            'Is any exposed wiring visible?',
            'Are junction box covers in place?'
          ]
        }
      ]
    },
    {
      name: 'Quarterly First Aid & Emergency Equipment',
      description: 'Emergency preparedness equipment verification',
      frequency: 'Quarterly',
      customCategories: [
        {
          subject: 'First Aid',
          questions: [
            'Is the first aid kit fully stocked?',
            'Are first aid supplies within expiration dates?',
            'Is the AED (if present) charged and inspected?',
            'Are eyewash stations functional and flushed weekly?',
            'Is emergency shower functional (if present)?'
          ]
        },
        {
          subject: 'Emergency Preparedness',
          questions: [
            'Are evacuation maps posted and current?',
            'Has emergency drill been conducted this quarter?',
            'Are emergency phone numbers current and posted?',
            'Is weather emergency plan in place and communicated?'
          ]
        }
      ]
    },
    {
      name: 'Quarterly Hazard Communication Inspection',
      description: 'Chemical safety and HazCom compliance per OSHA 1910.1200',
      frequency: 'Quarterly',
      regulation: 'OSHA 1910.1200',
      customCategories: [
        {
          subject: 'Chemical Storage',
          questions: [
            'Are all chemical containers properly labeled?',
            'Are incompatible chemicals stored separately?',
            'Are flammable materials stored in approved cabinets?',
            'Are secondary containment measures in place?',
            'Is chemical storage area well-ventilated?'
          ]
        },
        {
          subject: 'SDS/Documentation',
          questions: [
            'Is the SDS binder accessible to all employees?',
            'Are SDS sheets available for all chemicals on site?',
            'Do employees know where to find SDS information?',
            'Is the chemical inventory list current?'
          ]
        }
      ]
    },
    {
      name: 'Quarterly Equipment & Tool Safety',
      description: 'Equipment condition and safety feature verification',
      frequency: 'Quarterly',
      customCategories: [
        {
          subject: 'Power Tools & Equipment',
          questions: [
            'Are all power tools in good working condition?',
            'Are safety guards in place and functional?',
            'Are tool cords free from damage?',
            'Are tools being used for intended purposes only?',
            'Are damaged tools removed from service?'
          ]
        },
        {
          subject: 'Ladders & Fall Protection',
          questions: [
            'Are ladders in good condition without damage?',
            'Are ladder safety labels legible?',
            'Is fall protection equipment inspected and available?',
            'Are employees trained on proper ladder use?'
          ]
        }
      ]
    },
    {
      name: 'Annual Comprehensive Safety Audit',
      description: 'Full annual safety compliance review and program assessment',
      frequency: 'Annually',
      customCategories: [
        {
          subject: 'Training & Documentation',
          questions: [
            'Have all required annual trainings been completed?',
            'Are training records properly documented?',
            'Is the written safety program current and reviewed?',
            'Are all safety certifications current?',
            'Have new employee orientations included safety training?'
          ]
        },
        {
          subject: 'Program Review',
          questions: [
            'Have all incidents been properly investigated?',
            'Have corrective actions been implemented?',
            'Has the hazard assessment been reviewed?',
            'Are all regulatory requirements being met?',
            'Have safety goals been established for next year?'
          ]
        }
      ]
    }
  ];
}

// Fallback training topics if AI fails
function getDefaultTrainingTopics(industry: string): any[] {
  return [
    {
      name: 'Hazard Communication (HazCom/GHS)',
      description: 'Understanding chemical hazards, Safety Data Sheets, and proper labeling per OSHA 1910.1200',
      category: 'OSHA Compliance',
      cadence: 'Annually',
      regulation: 'OSHA 1910.1200'
    },
    {
      name: 'Emergency Action Plans',
      description: 'Procedures for emergencies including evacuation routes, alarm systems, and emergency contacts',
      category: 'Emergency Preparedness',
      cadence: 'Annually',
      regulation: 'OSHA 1910.38'
    },
    {
      name: 'Fire Prevention and Safety',
      description: 'Fire hazards, prevention methods, fire extinguisher use, and evacuation procedures',
      category: 'Emergency Preparedness',
      cadence: 'Annually',
      regulation: 'OSHA 1910.39'
    },
    {
      name: 'Personal Protective Equipment (PPE)',
      description: 'Selection, use, and maintenance of appropriate PPE for workplace hazards',
      category: 'Safety Equipment',
      cadence: 'Annually',
      regulation: 'OSHA 1910.132'
    },
    {
      name: 'Bloodborne Pathogens',
      description: 'Protection from bloodborne diseases for employees with potential exposure',
      category: 'Health & Safety',
      cadence: 'Annually',
      regulation: 'OSHA 1910.1030'
    },
    {
      name: 'Workplace Violence Prevention',
      description: 'Recognizing warning signs, de-escalation techniques, and reporting procedures',
      category: 'Workplace Safety',
      cadence: 'Annually'
    },
    {
      name: 'Harassment Prevention',
      description: 'Understanding workplace harassment, discrimination, and creating a respectful environment',
      category: 'HR Compliance',
      cadence: 'Annually'
    },
    {
      name: 'Ergonomics and Safe Lifting',
      description: 'Proper lifting techniques, workstation setup, and preventing musculoskeletal injuries',
      category: 'Workplace Safety',
      cadence: 'Annually'
    },
    {
      name: 'Slips, Trips, and Falls Prevention',
      description: 'Identifying and eliminating slip, trip, and fall hazards in the workplace',
      category: 'Workplace Safety',
      cadence: 'Annually'
    },
    {
      name: 'Electrical Safety Awareness',
      description: 'Recognizing electrical hazards and safe work practices around electrical equipment',
      category: 'Workplace Safety',
      cadence: 'Annually',
      regulation: 'OSHA 1910.331-335'
    }
  ];
}

// Preview industry article counts per industry (admin support page)
export const previewIndustryTemplates = onCall(
  {},
  async (request) => {
    try {
      const db = admin.firestore();
      
      // Get all articles with industryIds
      const articlesSnapshot = await db.collection('article').get();
      
      // Count articles per industry
      const industryCounts: { [key: string]: { count: number; sampleArticles: any[] } } = {};
      
      articlesSnapshot.docs.forEach(doc => {
        const article = doc.data();
        const industryIds = article.industryIds || [];
        
        industryIds.forEach((industryId: string) => {
          if (!industryCounts[industryId]) {
            industryCounts[industryId] = { count: 0, sampleArticles: [] };
          }
          industryCounts[industryId].count++;
          
          // Keep first 5 as samples
          if (industryCounts[industryId].sampleArticles.length < 5) {
            industryCounts[industryId].sampleArticles.push({
              id: doc.id,
              name: article.name
            });
          }
        });
      });

      // Get industry names
      const industriesSnapshot = await db.collection('industry').get();
      const industryNames: { [key: string]: string } = {};
      industriesSnapshot.docs.forEach(doc => {
        industryNames[doc.id] = doc.data().name;
      });

      // Format response
      const templates = Object.entries(industryCounts).map(([industryId, data]) => ({
        industryId,
        industryName: industryNames[industryId] || industryId,
        totalArticles: data.count,
        sampleArticles: data.sampleArticles,
        moreArticles: Math.max(0, data.count - 5)
      }));

      // Sort by article count descending
      templates.sort((a, b) => b.totalArticles - a.totalArticles);

      return { 
        success: true, 
        templates,
        totalArticlesWithIndustries: articlesSnapshot.docs.filter(doc => 
          doc.data().industryIds?.length > 0
        ).length,
        totalArticles: articlesSnapshot.size
      };
    } catch (error: any) {
      console.error('Error previewing templates:', error);
      throw new HttpsError('internal', error.message);
    }
  }
);

// AI-powered tag suggestions based on job title
export const suggestTagsForJobTitle = onCall(
  { 
    secrets: [xaiApiKey],
    timeoutSeconds: 30,
    memory: "256MiB"
  },
  async (request) => {
    const { jobTitle, existingTags, industry, teamMembers } = request.data as any;

    if (!jobTitle || !jobTitle.trim()) {
      return { tags: [] };
    }

    try {
      // Build context about existing tags
      const existingTagsList = existingTags && existingTags.length > 0 
        ? `\n\nExisting tags in use by this team: ${existingTags.join(', ')}`
        : '';
      
      const industryContext = industry 
        ? `\nThe company is in the ${industry} industry.`
        : '';
      
      // Build context about other team members and their roles
      let teamContext = '';
      if (teamMembers && teamMembers.length > 0) {
        const memberList = teamMembers
          .filter((m: any) => m.jobTitle && m.jobTitle.trim())
          .map((m: any) => {
            const tags = m.tags && m.tags.length > 0 ? ` → [${m.tags.join(', ')}]` : '';
            return `- ${m.jobTitle}${tags}`;
          })
          .join('\n');
        if (memberList) {
          teamContext = `\n\nOther team members and their current tags:\n${memberList}`;
        }
      }

      const response = await fetch('https://api.x.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.XAI_API_KEY}`
        },
        body: JSON.stringify({
          model: 'grok-3-fast',
          messages: [
            {
              role: 'system',
              content: `You are helping categorize employees for a safety and compliance system. Based on a job title, suggest 1-3 appropriate tags that would help group this employee with others who need similar safety trainings and compliance surveys.

Common tag categories include:
- Work environment: "Warehouse", "Office", "Field", "Remote", "Shop", "Manufacturing"
- Role type: "Driver", "Manager", "Technician", "Sales", "Production"
- Special certifications: "Forklift Operator", "CDL Driver", "First Responder", "Welder"
- Status: "New Hire" (for roles with "trainee", "intern", "new", etc.)

Rules:
1. Return 1-3 tags maximum - only the most relevant ones
2. Use title case for tags (e.g., "Warehouse" not "warehouse")
3. STRONGLY prefer existing tags when they fit - consistency is critical
4. Look at other team members' job titles and tags to understand the team structure
5. If similar roles have a tag, this role should probably have it too (e.g., if "Forklift Operator" has "Warehouse", then "Welder" probably works in the warehouse too)
6. Be specific but not overly granular
7. Return a JSON object with a "tags" array${existingTagsList}${teamContext}${industryContext}

Example responses:
- "Warehouse Manager" → {"tags": ["Warehouse", "Manager"]}
- "CDL Truck Driver" → {"tags": ["Driver", "CDL Driver"]}
- "Office Administrator" → {"tags": ["Office"]}
- "Forklift Operator" → {"tags": ["Warehouse", "Forklift Operator"]}
- "Sales Representative" → {"tags": ["Sales", "Field"]}
- "IT Support Technician" → {"tags": ["Office", "Technician"]}
- "Welder" (when team has Warehouse tags) → {"tags": ["Warehouse", "Welder"]}`
            },
            {
              role: 'user',
              content: `Suggest tags for this job title: "${jobTitle.trim()}"`
            }
          ],
          temperature: 0.3,
          max_tokens: 100
        })
      });

      if (!response.ok) {
        console.error('Grok API error:', await response.text());
        return { tags: [] };
      }

      const grokResponse: any = await response.json();
      const aiMessage = grokResponse.choices?.[0]?.message?.content || '{}';

      // Parse the AI response
      try {
        const jsonMatch = aiMessage.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          if (parsed.tags && Array.isArray(parsed.tags)) {
            // Clean and validate tags
            const cleanTags = parsed.tags
              .filter((t: any) => typeof t === 'string' && t.trim())
              .map((t: string) => t.trim())
              .slice(0, 3);
            return { tags: cleanTags };
          }
        }
      } catch (parseError) {
        console.error('Error parsing AI tag response:', aiMessage);
      }

      return { tags: [] };
    } catch (error: any) {
      console.error('Error suggesting tags:', error);
      return { tags: [] };
    }
  }
);

// AI-powered article suggestions using Grok
export const getAISuggestedArticles = onCall(
  { 
    secrets: [xaiApiKey],
    timeoutSeconds: 120,
    memory: "512MiB"
  },
  async (request) => {
    const { industry, teamId } = request.data as any;

    if (!industry) {
      throw new HttpsError('invalid-argument', 'Industry description is required');
    }

    try {
      const db = admin.firestore();
      
      // Get all OSHA articles (just names for the AI to filter)
      const articlesSnapshot = await db.collection('article').get();
      
      // Build a list of article names with IDs
      const articleList = articlesSnapshot.docs.map(doc => ({
        id: doc.id,
        name: doc.data().name || 'Untitled'
      }));

      // Get existing library items to exclude
      let existingArticleIds = new Set<string>();
      if (teamId) {
        const librarySnapshot = await db
          .collection('library')
          .where('teamId', '==', teamId)
          .get();
        existingArticleIds = new Set(
          librarySnapshot.docs
            .map(doc => doc.data().sourceArticleId)
            .filter(id => id)
        );
      }

      // Filter out articles already in library
      const availableArticles = articleList.filter(a => !existingArticleIds.has(a.id));

      if (availableArticles.length === 0) {
        return { 
          success: true, 
          articles: [],
          message: 'All articles are already in your library'
        };
      }

      // Create a numbered list for the AI
      const articleListText = availableArticles
        .map((a, i) => `${i + 1}. ${a.name}`)
        .join('\n');

      // Call Grok API to filter articles
      const response = await fetch('https://api.x.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.XAI_API_KEY}`
        },
        body: JSON.stringify({
          model: 'grok-3-fast',
          messages: [
            {
              role: 'system',
              content: `You are an OSHA safety compliance expert. Given an industry description and a list of OSHA training articles, identify which articles are most relevant and important for that specific industry.

Return ONLY a JSON array of the article numbers (not names) that are relevant. Focus on:
1. Hazards specific to that industry
2. Required OSHA standards for that industry
3. Common safety concerns for workers in that field

Be selective - only include articles that are truly relevant. A typical industry needs 15-40 articles, not hundreds.

Example response format: [1, 5, 12, 23, 45]`
            },
            {
              role: 'user',
              content: `Industry: ${industry}

Here are the available OSHA training articles:

${articleListText}

Which article numbers are most relevant for this industry? Return only the JSON array of numbers.`
            }
          ],
          temperature: 0.3
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Grok API error:', errorText);
        throw new Error(`Grok API error: ${response.status}`);
      }

      const grokResponse: any = await response.json();
      const aiMessage = grokResponse.choices?.[0]?.message?.content || '[]';

      // Parse the AI response to get article numbers
      let selectedNumbers: number[] = [];
      try {
        // Extract JSON array from the response (handle markdown code blocks)
        const jsonMatch = aiMessage.match(/\[[\d,\s]+\]/);
        if (jsonMatch) {
          selectedNumbers = JSON.parse(jsonMatch[0]);
        }
      } catch (parseError) {
        console.error('Error parsing AI response:', aiMessage);
        throw new Error('Failed to parse AI suggestions');
      }

      // Map numbers back to articles
      const suggestedArticles = selectedNumbers
        .filter(num => num >= 1 && num <= availableArticles.length)
        .map(num => {
          const article = availableArticles[num - 1];
          return { id: article.id, name: article.name };
        });

      return {
        success: true,
        articles: suggestedArticles,
        totalSuggested: suggestedArticles.length,
        industry: industry
      };
    } catch (error: any) {
      console.error('Error getting AI suggestions:', error);
      throw new HttpsError('internal', error.message);
    }
  }
);

// AI-powered self-inspection recommendations based on industry and team roles
export const getSelfInspectionRecommendations = onCall(
  { 
    secrets: [xaiApiKey],
    timeoutSeconds: 180,
    memory: "1GiB"
  },
  async (request) => {
    const { industry, teamMembers, customPrompt } = request.data as any;

    if (!industry) {
      throw new HttpsError('invalid-argument', 'Industry description is required');
    }

    try {
      // Build a list of unique job titles for more focused recommendations
      const jobTitles = teamMembers?.length > 0
        ? [...new Set(teamMembers.map((tm: { jobTitle: string }) => tm.jobTitle).filter(Boolean))]
        : [];

      const jobTitlesText = jobTitles.length > 0
        ? `Team job titles include: ${jobTitles.join(', ')}`
        : 'No specific job titles provided';

      // Build the custom prompt section if provided
      const customPromptSection = customPrompt 
        ? `\n\nSPECIFIC REQUEST FROM USER: "${customPrompt}"\nPrioritize creating inspections that address this specific request.`
        : '';

      // Call Grok API to get self-inspection recommendations
      const response = await fetch('https://api.x.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.XAI_API_KEY}`
        },
        body: JSON.stringify({
          model: 'grok-3-fast',
          messages: [
            {
              role: 'system',
              content: `You are a compliance expert who understands the regulatory requirements for different industries. Your job is to recommend self-inspection checklists that companies should regularly perform to maintain compliance and operational excellence.

Based on the industry, identify the RELEVANT compliance frameworks:
- Healthcare/Hospice/Medical → HIPAA, Joint Commission, CMS requirements
- IT/Software/Payment Processing → PCI-DSS, SOC 2, data security requirements  
- Manufacturing/Construction/Warehouse → OSHA workplace safety requirements
- Food Service/Restaurant → FDA, health department, food safety requirements
- Financial Services → SOX, regulatory compliance requirements
- Any industry → General workplace safety (OSHA applies to most employers)

Given an industry and team member roles, create specific self-inspection recommendations with custom categories and questions tailored to their specific business and compliance needs.

FREQUENCY OPTIONS - CRITICAL REQUIREMENT:
You MUST use ONLY one of these four values. No exceptions:
- "Monthly" - For items that need regular checks
- "Quarterly" - For seasonal or quarterly reviews  
- "Semi-Annually" - For semi-annual comprehensive reviews
- "Annually" - For annual compliance audits

DO NOT use "Daily" or "Weekly" - these are NOT valid options and will cause errors.
If something needs daily attention, create a Monthly inspection that verifies daily checks are happening.

Return your response as a JSON object with this exact structure:
{
  "summary": "A personalized 2-3 sentence overview addressing their specific situation and compliance needs",
  "recommendations": [
    {
      "name": "Inspection Name (e.g., 'Monthly Data Security Review')",
      "description": "Brief description of what this inspection covers",
      "frequency": "Monthly",
      "reason": "Why this is important for their specific industry/compliance requirements",
      "customCategories": [
        {
          "subject": "Category Name",
          "questions": [
            "Specific yes/no inspection question relevant to their compliance needs?",
            "Another actionable inspection item?"
          ]
        }
      ]
    }
  ]
}

Guidelines:
- Provide 4-8 of the most important and relevant self-inspections
- Identify the RIGHT compliance framework for their industry (OSHA, HIPAA, PCI-DSS, FDA, etc.)
- Create custom categories and questions specific to the industry, job roles, and compliance requirements
- Each question should be phrased as a yes/no inspection item
- Be specific and practical - avoid vague or generic questions
- Consider the team's job titles when creating questions
- Reference actual regulations/standards when relevant (OSHA 29 CFR, HIPAA rules, PCI requirements, etc.)
- ONLY use frequencies: Monthly, Quarterly, Semi-Annually, Annually`
            },
            {
              role: 'user',
              content: `Please provide self-inspection recommendations for the following company:

Industry: ${industry}

${jobTitlesText}

Team size: ${teamMembers?.length || 'Unknown'} team members${customPromptSection}

Based on this industry and team roles, what self-inspections should they be regularly conducting? Create custom categories and questions specific to their situation.`
            }
          ],
          temperature: 0.4
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Grok API error:', errorText);
        throw new Error(`Grok API error: ${response.status}`);
      }

      const grokResponse: any = await response.json();
      const aiMessage = grokResponse.choices?.[0]?.message?.content || '{}';

      // Parse the AI response
      let aiRecommendations: any = {};
      try {
        const jsonMatch = aiMessage.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          aiRecommendations = JSON.parse(jsonMatch[0]);
        }
      } catch (parseError) {
        console.error('Error parsing AI response:', aiMessage);
        throw new Error('Failed to parse AI recommendations');
      }

      // Process recommendations - all questions are custom generated by Grok
      const processedRecommendations = (aiRecommendations.recommendations || []).map((rec: any) => {
        const categories: any[] = [];
        
        // Process custom categories generated by Grok
        if (rec.customCategories && Array.isArray(rec.customCategories)) {
          rec.customCategories.forEach((customCat: any) => {
            if (customCat.subject && customCat.questions && Array.isArray(customCat.questions)) {
              const questions = customCat.questions.map((q: string) => ({
                name: q,
                selected: true
              }));
              
              if (questions.length > 0) {
                categories.push({
                  subject: customCat.subject,
                  questions: questions
                });
              }
            }
          });
        }
        
        // Map frequency to match the app's enum and validate
        let mappedFrequency = rec.frequency;
        if (rec.frequency === 'Semi-Annually') {
          mappedFrequency = 'Semi-Anually'; // Match the typo in the enum
        } else if (rec.frequency === 'Annually') {
          mappedFrequency = 'Anually'; // Match the typo in the enum
        } else if (rec.frequency === 'Daily' || rec.frequency === 'Weekly') {
          // Convert invalid frequencies to Monthly
          mappedFrequency = 'Monthly';
        }
        
        return {
          name: rec.name,
          description: rec.description,
          frequency: mappedFrequency,
          reason: rec.reason,
          baseQuestions: categories,
          questionCount: categories.reduce((sum, cat) => sum + cat.questions.length, 0)
        };
      });

      return {
        success: true,
        summary: aiRecommendations.summary || 'Based on your industry, here are the recommended self-inspections for your team.',
        recommendations: processedRecommendations,
        industry: industry,
        teamSize: teamMembers?.length || 0
      };
    } catch (error: any) {
      console.error('Error getting self-inspection recommendations:', error);
      throw new HttpsError('internal', error.message);
    }
  }
);

// AI-powered article generation from voice description
export const generateArticleFromDescription = onCall(
  { 
    secrets: [xaiApiKey],
    timeoutSeconds: 180,
    memory: "1GiB"
  },
  async (request) => {
    const { description, industry, teamTags } = request.data as any;

    if (!description) {
      throw new HttpsError('invalid-argument', 'Article description is required');
    }

    // Build the tags context for the AI
    const tagsContext = teamTags && teamTags.length > 0
      ? `\n\nAvailable team role tags: ${teamTags.join(', ')}\nAssign tags to the roles that should receive this training. For example, if this is about equipment operation, assign it to roles like "shop" or "warehouse". If it's about data security, assign it to roles like "office" or "accounting". Only assign tags that are clearly relevant. If the training applies to everyone, return an empty array.`
      : '';

    try {
      // Call Grok API to generate the article
      const response = await fetch('https://api.x.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.XAI_API_KEY}`
        },
        body: JSON.stringify({
          model: 'grok-3-fast',
          messages: [
            {
              role: 'system',
              content: `You are an expert safety and compliance writer who creates training articles. Your articles are:

1. **Compliant**: Reference relevant OSHA standards, regulations, or industry best practices where applicable
2. **Easy to Understand**: Written at an 8th-grade reading level so all employees can comprehend
3. **Actionable**: Include clear, practical steps employees can follow
4. **Well-Structured**: Use headings, bullet points, and numbered lists for easy scanning
5. **Engaging**: Keep employees interested while delivering important information
6. **Universal**: Write content that applies broadly - do NOT mention or reference the specific business, company name, or industry type in the content itself

When generating an article, return a JSON object with this exact structure:
{
  "title": "Clear, descriptive title for the training article",
  "topic": "Category name like: Cybersecurity, Fire Safety, Hazard Communication, PPE, Electrical Safety, Fall Protection, etc.",
  "cadence": "How often this training should be repeated. Options: Once, Monthly, Quarterly, Semi-Annually, Annually. Choose based on the topic - high-risk or frequently changing topics should be more frequent.",
  "assignedTags": ["array", "of", "relevant", "role", "tags"],
  "content": "Full HTML content of the article with proper formatting"
}

Cadence Guidelines:
- "Once" - One-time training for specific events, onboarding, or policy changes
- "Monthly" - High-risk activities, rapidly changing procedures, or critical safety topics
- "Quarterly" - Important safety topics that need regular reinforcement
- "Semi-Annually" - Standard compliance topics that change occasionally
- "Annually" - General awareness topics, regulatory requirements with yearly refresh

HTML Formatting Guidelines:
- Use <h2> for main section headings
- Use <h3> for subsections
- Use <ul> and <li> for bullet lists
- Use <ol> and <li> for numbered steps
- Use <p> for paragraphs
- Use <strong> for emphasis on key safety points
- Use <blockquote> for regulation or standard references
- Keep paragraphs short (2-3 sentences max)
- Include a brief introduction explaining why this topic matters
- End with a summary or key takeaways section
- Write generically - the content should work for any workplace, not just a specific industry`
            },
            {
              role: 'user',
              content: `Please create a comprehensive, compliance-focused training article based on this description:

"${description}"
${tagsContext}

Generate a well-structured, easy-to-understand training article that covers the essential information employees need to know. Include relevant standards and practical guidance where applicable. Write the content generically so it applies to any workplace. Choose an appropriate training cadence based on the topic's importance and risk level.`
            }
          ],
          temperature: 0.7
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Grok API error:', errorText);
        throw new Error(`Grok API error: ${response.status}`);
      }

      const grokResponse: any = await response.json();
      const aiMessage = grokResponse.choices?.[0]?.message?.content || '{}';

      // Parse the AI response
      let articleData: { 
        title: string; 
        topic: string; 
        cadence: string;
        assignedTags: string[];
        content: string;
      } = { title: '', topic: '', cadence: 'Annually', assignedTags: [], content: '' };
      
      try {
        const jsonMatch = aiMessage.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          articleData = JSON.parse(jsonMatch[0]);
        }
      } catch (parseError) {
        console.error('Error parsing AI response:', aiMessage);
        // If JSON parsing fails, try to extract fields manually
        const titleMatch = aiMessage.match(/"title":\s*"([^"]+)"/);
        const topicMatch = aiMessage.match(/"topic":\s*"([^"]+)"/);
        const cadenceMatch = aiMessage.match(/"cadence":\s*"([^"]+)"/);
        const contentMatch = aiMessage.match(/"content":\s*"([\s\S]+?)"\s*\}/);
        
        if (titleMatch) articleData.title = titleMatch[1];
        if (topicMatch) articleData.topic = topicMatch[1];
        if (cadenceMatch) articleData.cadence = cadenceMatch[1];
        if (contentMatch) {
          articleData.content = contentMatch[1]
            .replace(/\\n/g, '\n')
            .replace(/\\"/g, '"');
        }
        
        if (!articleData.title && !articleData.content) {
          throw new Error('Failed to parse AI response');
        }
      }
      
      // Default topic if not provided
      if (!articleData.topic) {
        articleData.topic = 'General Safety';
      }
      
      // Default cadence if not provided or invalid
      const validCadences = ['Once', 'Monthly', 'Quarterly', 'Semi-Annually', 'Annually'];
      if (!articleData.cadence || !validCadences.includes(articleData.cadence)) {
        articleData.cadence = 'Annually';
      }
      
      // Ensure assignedTags is an array
      if (!Array.isArray(articleData.assignedTags)) {
        articleData.assignedTags = [];
      }

      return {
        success: true,
        title: articleData.title,
        topic: articleData.topic,
        cadence: articleData.cadence,
        assignedTags: articleData.assignedTags,
        content: articleData.content,
        description: description
      };
    } catch (error: any) {
      console.error('Error generating article:', error);
      throw new HttpsError('internal', error.message);
    }
  }
);

// AI-powered self-inspection coverage analysis
// Analyzes existing inspections and recommends gaps based on industry requirements
export const analyzeInspectionCoverage = onCall(
  { 
    secrets: [xaiApiKey],
    timeoutSeconds: 180,
    memory: "1GiB"
  },
  async (request) => {
    const { 
      businessName, 
      businessWebsite,
      industry, 
      teamId, 
      teamSize, 
      jobTitles, 
      teamMembers,
      existingInspections 
    } = request.data as any;

    if (!industry) {
      throw new HttpsError('invalid-argument', 'Industry is required for coverage analysis');
    }

    if (!existingInspections || !Array.isArray(existingInspections)) {
      throw new HttpsError('invalid-argument', 'Existing inspections array is required');
    }

    try {
      // Build a formatted summary of existing inspections
      const existingInspectionsSummary = existingInspections.map((inspection: any, idx: number) => {
        const categories = inspection.baseQuestions || [];
        const categoryList = categories.map((cat: any) => {
          const questionCount = cat.questions?.length || 0;
          const questionNames = cat.questions?.map((q: any) => q.name).join('; ') || 'No questions';
          return `    - ${cat.subject} (${questionCount} questions): ${questionNames}`;
        }).join('\n');
        
        return `${idx + 1}. "${inspection.title}" (Frequency: ${inspection.inspectionExpiration || 'Manual'})
${categoryList || '    - No categories defined'}`;
      }).join('\n\n');

      // Build team context
      const jobTitlesText = jobTitles?.length > 0 
        ? jobTitles.join(', ') 
        : 'Not specified';
      
      const teamMembersList = teamMembers?.length > 0
        ? teamMembers.map((tm: any) => `${tm.name}${tm.jobTitle ? ` (${tm.jobTitle})` : ''}`).join(', ')
        : 'No team members listed';

      // Determine if this is a new user or established
      const isNewUser = existingInspections.length === 0;
      const hasMinimalInspections = existingInspections.length > 0 && existingInspections.length <= 3;
      const hasEstablishedProgram = existingInspections.length > 5;

      // Call Grok API to analyze coverage
      const response = await fetch('https://api.x.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.XAI_API_KEY}`
        },
        body: JSON.stringify({
          model: 'grok-3-fast',
          messages: [
            {
              role: 'system',
              content: `You are an expert compliance consultant conducting an assessment for a client. You've been hired to evaluate their inspection program and provide actionable recommendations to achieve full regulatory compliance.

YOUR ROLE:
Think like a professional compliance consultant who understands the client's specific business context. Based on their industry, you should identify the RELEVANT compliance frameworks and regulations that apply:
- Healthcare/Hospice/Medical → HIPAA, Joint Commission, CMS requirements
- IT/Software/Payment Processing → PCI-DSS, SOC 2, data security requirements  
- Manufacturing/Construction/Warehouse → OSHA workplace safety requirements
- Food Service/Restaurant → FDA, health department, food safety requirements
- Financial Services → SOX, regulatory compliance requirements
- Any industry → General workplace safety (OSHA applies to most employers)

Your goal is to help them build a complete, practical inspection program tailored to their specific compliance needs.

CONTEXT YOU'LL RECEIVE:
1. Business name and industry - Identify which compliance frameworks apply to this type of business
2. Team size and job titles - Consider what each role does and what compliance risks they encounter
3. Their current self-inspection checklists (if any)

YOUR ANALYSIS APPROACH:

**For NEW USERS (no inspections yet):**
- Start with the 3-5 MOST CRITICAL inspections for their industry and compliance requirements
- Focus on high-risk areas that could result in violations, fines, or incidents
- Prioritize inspections that give them the biggest compliance impact first
- Think: "If I only had time to set up a few inspections, which ones would prevent the most harm?"

**For USERS WITH SOME INSPECTIONS (1-5 existing):**
- Acknowledge what they've started
- Identify the most significant gaps based on their industry's compliance requirements
- Recommend the next 2-4 most important additions
- Consider whether their existing inspection frequencies are appropriate

**For ESTABLISHED PROGRAMS (6+ inspections):**
- Look for specific gaps or blind spots in their coverage
- Check if they're missing industry-specific requirements
- Suggest refinements or consolidations if appropriate
- Only recommend new inspections if there's a clear compliance gap

SCORING GUIDELINES:
- 90-100: Comprehensive program covering all critical compliance requirements for their industry
- 75-89: Strong program with minor gaps or missing best practices
- 50-74: Basic coverage but missing important areas for their industry
- 25-49: Significant gaps that could lead to violations or incidents
- 0-24: Minimal or no coverage of essential inspection areas

FREQUENCY OPTIONS - CRITICAL REQUIREMENT:
You MUST use ONLY one of these four values. No exceptions:
- "Monthly" - For items that need regular checks
- "Quarterly" - For seasonal or quarterly reviews  
- "Semi-Annually" - For semi-annual comprehensive reviews
- "Annually" - For annual compliance audits

DO NOT use "Daily" or "Weekly" - these are NOT valid options and will cause errors.
If something needs daily attention, create a Monthly inspection that verifies daily checks are happening.

Return your response as a JSON object:
{
  "score": 45,
  "summary": "As a [industry type], [Business Name] needs [relevant compliance framework] coverage. Your current inspections are a good start, but you're missing critical areas required for your industry.",
  "strengths": ["Current coverage areas", "Regular inspection schedule established"],
  "gaps": ["Missing compliance area 1", "Missing compliance area 2", "No verification process for X"],
  "recommendations": [
    {
      "name": "Monthly [Compliance Area] Inspection",
      "description": "Comprehensive inspection covering [specific requirements]",
      "frequency": "Monthly",
      "reason": "[Specific regulation or standard] requires this. [Why it matters for their business].",
      "priority": "high",
      "customCategories": [
        {
          "subject": "Category Name",
          "questions": [
            "Specific yes/no inspection question relevant to their industry?",
            "Another actionable inspection item?"
          ]
        }
      ]
    }
  ]
}

CRITICAL GUIDELINES:
- Identify the RIGHT compliance framework for their industry (OSHA, HIPAA, PCI-DSS, FDA, etc.)
- Be specific to their industry - a hospice has different requirements than a machine shop
- Consider their team's job titles - what compliance risks does each role face?
- Reference specific regulations/standards when recommending inspections (OSHA 29 CFR, HIPAA rules, PCI requirements, etc.)
- Create custom questions that are practical and specific to their operations
- Prioritize recommendations by violation/incident risk, not just by what's "nice to have"
- ONLY use frequencies: Monthly, Quarterly, Semi-Annually, Annually (Daily and Weekly are NOT allowed)
- Keep recommendations actionable - they should be able to implement these immediately`
            },
            {
              role: 'user',
              content: `Please conduct a safety inspection program assessment for this company:

===== BUSINESS CONTEXT =====
Business Name: ${businessName || 'Not provided'}
Website: ${businessWebsite || 'Not provided'}
Industry: ${industry}
Team Size: ${teamSize || 'Unknown'} employees
Job Titles/Roles: ${jobTitlesText}
Team Members: ${teamMembersList}

===== CURRENT INSPECTION PROGRAM =====
${isNewUser ? 'STATUS: New user - NO inspections created yet. They need to build their program from scratch.' : ''}
${hasMinimalInspections ? 'STATUS: Just getting started - only ' + existingInspections.length + ' inspection(s) created so far.' : ''}
${hasEstablishedProgram ? 'STATUS: Established program with ' + existingInspections.length + ' inspections. Look for gaps and refinements.' : ''}

${existingInspectionsSummary || 'No self-inspections have been created yet.'}

Based on your expertise as a compliance consultant, analyze their inspection program coverage. Consider:
1. What compliance frameworks apply to this industry? (OSHA, HIPAA, PCI-DSS, FDA, etc.)
2. What are the biggest compliance risks for this type of business and these job roles?
3. What inspections would you prioritize if you were setting up their program?
4. Are there any critical gaps that could lead to violations, incidents, or fines?

Provide your assessment with a coverage score, analysis summary, and prioritized recommendations.`
            }
          ],
          temperature: 0.4
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Grok API error:', errorText);
        throw new Error(`Grok API error: ${response.status}`);
      }

      const grokResponse: any = await response.json();
      const aiMessage = grokResponse.choices?.[0]?.message?.content || '{}';

      // Parse the AI response
      let analysisResult: any = {};
      try {
        const jsonMatch = aiMessage.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          analysisResult = JSON.parse(jsonMatch[0]);
        }
      } catch (parseError) {
        console.error('Error parsing AI response:', aiMessage);
        throw new Error('Failed to parse AI coverage analysis');
      }

      // Process recommendations - all questions are now custom generated by Grok
      const processedRecommendations = (analysisResult.recommendations || []).map((rec: any) => {
        const categories: any[] = [];
        
        // Process custom categories generated by Grok
        if (rec.customCategories && Array.isArray(rec.customCategories)) {
          rec.customCategories.forEach((customCat: any) => {
            if (customCat.subject && customCat.questions && Array.isArray(customCat.questions)) {
              const questions = customCat.questions.map((q: string) => ({
                name: q,
                selected: true
              }));
              
              if (questions.length > 0) {
                categories.push({
                  subject: customCat.subject,
                  questions: questions
                });
              }
            }
          });
        }
        
        // Map frequency to match the app's enum and validate
        let mappedFrequency = rec.frequency;
        if (rec.frequency === 'Semi-Annually') {
          mappedFrequency = 'Semi-Anually';
        } else if (rec.frequency === 'Annually') {
          mappedFrequency = 'Anually';
        } else if (rec.frequency === 'Daily' || rec.frequency === 'Weekly') {
          // Convert invalid frequencies to Monthly
          mappedFrequency = 'Monthly';
        }
        
        return {
          name: rec.name,
          description: rec.description,
          frequency: mappedFrequency,
          reason: rec.reason,
          priority: rec.priority || 'medium',
          baseQuestions: categories,
          questionCount: categories.reduce((sum: number, cat: any) => sum + cat.questions.length, 0)
        };
      });

      const result = {
        success: true,
        score: Math.min(100, Math.max(0, analysisResult.score || 0)),
        summary: analysisResult.summary || 'Coverage analysis complete.',
        strengths: analysisResult.strengths || [],
        gaps: analysisResult.gaps || [],
        recommendations: processedRecommendations,
        industry: industry,
        existingCount: existingInspections.length,
        analyzedAt: new Date().toISOString()
      };

      // Store the analysis result in Firestore for caching
      console.log(`[Coverage] Attempting to store analysis for teamId: ${teamId}`);
      if (teamId) {
        try {
          const teamRef = admin.firestore().doc(`team/${teamId}`);
          await teamRef.update({
            coverageAnalysis: result,
            coverageAnalysisStale: false,
            coverageAnalysisUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
          });
          console.log(`[Coverage] Successfully stored coverage analysis for team ${teamId} with score ${result.score}`);
        } catch (cacheError: any) {
          // Don't fail the request if caching fails
          console.error(`[Coverage] Failed to cache coverage analysis for team ${teamId}:`, cacheError?.message || cacheError);
        }
      } else {
        console.warn('[Coverage] No teamId provided, skipping cache storage');
      }

      return result;
    } catch (error: any) {
      console.error('Error analyzing inspection coverage:', error);
      throw new HttpsError('internal', error.message);
    }
  }
);

// AI-powered training coverage analysis
// Analyzes existing trainings and recommends gaps based on industry requirements
export const analyzeTrainingCoverage = onCall(
  { 
    secrets: [xaiApiKey],
    timeoutSeconds: 180,
    memory: "1GiB"
  },
  async (request) => {
    const { 
      businessName,
      businessWebsite, 
      industry, 
      teamId, 
      teamSize, 
      jobTitles, 
      teamMembers,
      existingTrainings,
      allTags
    } = request.data as any;

    if (!industry) {
      throw new HttpsError('invalid-argument', 'Industry is required for coverage analysis');
    }

    if (!existingTrainings || !Array.isArray(existingTrainings)) {
      throw new HttpsError('invalid-argument', 'Existing trainings array is required');
    }

    try {
      // Build a formatted summary of existing trainings
      const existingTrainingsSummary = existingTrainings.map((training: any, idx: number) => {
        return `${idx + 1}. "${training.name}" (Cadence: ${training.trainingCadence || 'Annually'}, Tags: ${training.assignedTags?.join(', ') || 'All team'})`;
      }).join('\n');

      // Build team context
      const jobTitlesText = jobTitles?.length > 0 
        ? jobTitles.join(', ') 
        : 'Not specified';
      
      const teamMembersList = teamMembers?.length > 0
        ? teamMembers.map((tm: any) => `${tm.name}${tm.jobTitle ? ` (${tm.jobTitle})` : ''}${tm.tags?.length ? ` [${tm.tags.join(', ')}]` : ''}`).join(', ')
        : 'No team members listed';
      
      const websiteContext = businessWebsite ? `Website: ${businessWebsite}` : '';

      const allTagsList = allTags?.length > 0 ? allTags.join(', ') : 'No tags defined';

      // Determine if this is a new user or established
      const isNewUser = existingTrainings.length === 0;
      const hasMinimalTrainings = existingTrainings.length > 0 && existingTrainings.length <= 3;
      const hasEstablishedProgram = existingTrainings.length > 5;

      // Call Grok API to analyze coverage
      const response = await fetch('https://api.x.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.XAI_API_KEY}`
        },
        body: JSON.stringify({
          model: 'grok-3-fast',
          messages: [
            {
              role: 'system',
              content: `You are an expert compliance consultant conducting a training program assessment. You've been hired to evaluate a client's training program and recommend what training topics they need to keep their team safe and compliant.

YOUR ROLE:
Think like a professional compliance consultant who understands the client's specific business context. Based on their industry, identify the RELEVANT compliance frameworks and training requirements that apply:
- Healthcare/Hospice/Medical → HIPAA, OSHA healthcare, Joint Commission, CMS, bloodborne pathogens
- IT/Software/Payment Processing → PCI-DSS, data security, cybersecurity awareness, SOC 2
- Manufacturing/Construction/Warehouse → OSHA workplace safety, equipment operation, PPE, fall protection
- Food Service/Restaurant → FDA, food safety, health department, allergen awareness
- Financial Services → SOX, regulatory compliance, anti-money laundering
- Any industry → General workplace safety (OSHA applies to most employers), harassment prevention, emergency procedures

Your goal is to help them build a complete, practical training program tailored to their specific compliance needs and team composition.

CONTEXT YOU'LL RECEIVE:
1. Business name and industry - Identify which compliance frameworks apply
2. Team size, job titles, and member tags - Consider what each role does and what training they need
3. Available team tags - Use these to assign trainings to relevant groups
4. Their current training library (if any)

YOUR ANALYSIS APPROACH:

**For NEW USERS (no trainings yet):**
- Start with the 5-7 MOST CRITICAL training topics for their industry and compliance requirements
- Focus on high-risk areas that could result in violations, injuries, or incidents
- Prioritize trainings that give them the biggest compliance impact first
- Think: "If I only had time to set up a few trainings, which ones would prevent the most harm?"

**For USERS WITH SOME TRAININGS (1-5 existing):**
- Acknowledge what they've started
- Identify the most significant gaps based on their industry's compliance requirements
- Recommend the next 3-5 most important additions
- Consider whether their existing training frequencies are appropriate

**For ESTABLISHED PROGRAMS (6+ trainings):**
- Look for specific gaps or blind spots in their coverage
- Check if they're missing industry-specific requirements
- Suggest refinements or additions if there's a clear compliance gap
- Only recommend new trainings if there's a clear need

SCORING GUIDELINES:
- 90-100: Comprehensive program covering all critical compliance requirements for their industry
- 75-89: Strong program with minor gaps or missing best practices
- 50-74: Basic coverage but missing important areas for their industry
- 25-49: Significant gaps that could lead to violations or incidents
- 0-24: Minimal or no coverage of essential training areas

TRAINING CADENCE OPTIONS - Choose the appropriate frequency based on the training type:
- "Once" - New hire orientation, initial certifications, one-time policy acknowledgments
- "Monthly" - High-risk topics requiring constant reinforcement (safety toolbox talks, high-hazard environments)
- "Quarterly" - Seasonal hazards, role-specific skills that need regular practice, topics with regulatory quarterly requirements
- "Semi-Annually" - Most recurring safety trainings, OSHA-required refreshers, equipment certifications
- "Annually" - Standard compliance refreshers, policy updates, low-risk administrative trainings

CADENCE SELECTION TIPS:
- Higher risk = more frequent training (monthly or quarterly)
- Hands-on skills degrade faster than knowledge = more frequent
- OSHA often requires annual refreshers, but some standards require more frequent training
- New or changing procedures may need monthly reinforcement initially
- Mix cadences appropriately - NOT everything should be annual!

TAG ASSIGNMENT:
You will receive a list of existing team tags. For each recommended training:
- Assign specific tags if the training is only relevant to certain roles
- Leave assignedTags empty [] if the training should go to the whole team
- Only use tags that exist in the provided allTags list

Return your response as a JSON object:
{
  "score": 45,
  "summary": "As a [industry type], [Business Name] needs [relevant compliance framework] training. Your current library is a good start, but you're missing critical areas required for your industry.",
  "strengths": ["Current training topics that are good", "Appropriate cadences"],
  "gaps": ["Missing training area 1", "Missing training area 2", "No training for X role"],
  "recommendations": [
    {
      "name": "Training Topic Title",
      "description": "Brief description of what this training covers and why it's important",
      "cadence": "Annually",
      "priority": "high",
      "assignedTags": ["tag1", "tag2"],
      "oshaStandards": ["OSHA 29 CFR 1910.xxx", "or other relevant standards"],
      "reason": "[Specific regulation or standard] requires this. [Why it matters for their business]."
    }
  ]
}

CRITICAL GUIDELINES:
- Identify the RIGHT compliance framework for their industry (OSHA, HIPAA, PCI-DSS, FDA, etc.)
- Be specific to their industry - a hospice has different requirements than a machine shop
- Consider their team's job titles and tags - what compliance risks does each role face?
- Only assign tags that exist in the provided allTags list
- Prioritize by real-world risk - what training prevents the most harm?
- For new users, aim for 5-7 high-impact recommendations to build a solid foundation
- Training names should be clear and professional (e.g., "Bloodborne Pathogen Training" not "Blood Safety 101")`
            },
            {
              role: 'user',
              content: `Please analyze the training coverage for this team:

BUSINESS INFORMATION:
- Business Name: ${businessName || 'Not specified'}
- Website: ${businessWebsite || 'Not provided'}
- Industry: ${industry}
- Team Size: ${teamSize || 'Not specified'}
- Job Titles Present: ${jobTitlesText}
- Team Members: ${teamMembersList}
- Available Tags: ${allTagsList}

CURRENT TRAINING LIBRARY:
${existingTrainings.length > 0 ? existingTrainingsSummary : 'No trainings in library yet - this is a brand new user who needs to build their training program from scratch.'}

${isNewUser ? 'This is a NEW USER with no existing trainings. Recommend 5-7 critical training topics to build a strong compliance foundation.' : ''}
${hasMinimalTrainings ? 'This user has started their training program. Identify the most important gaps to fill.' : ''}
${hasEstablishedProgram ? 'This user has an established program. Look for specific gaps or missing requirements.' : ''}

Analyze their training coverage and provide recommendations to ensure full compliance with applicable regulations.`
            }
          ],
          temperature: 0.7
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Grok API error:', errorText);
        throw new Error(`Grok API error: ${response.status}`);
      }

      const grokResponse: any = await response.json();
      const aiMessage = grokResponse.choices?.[0]?.message?.content || '{}';

      // Parse the AI response
      let analysisResult: any = {};
      try {
        const jsonMatch = aiMessage.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          analysisResult = JSON.parse(jsonMatch[0]);
        }
      } catch (parseError) {
        console.error('Error parsing AI response:', aiMessage);
        // Try to extract key fields manually
        const scoreMatch = aiMessage.match(/"score":\s*(\d+)/);
        if (scoreMatch) {
          analysisResult.score = parseInt(scoreMatch[1], 10);
        }
        analysisResult.summary = 'Analysis complete. Please review recommendations.';
        analysisResult.recommendations = [];
      }

      // Process and validate recommendations
      // Build lowercase lookup for case-insensitive tag matching
      const allTagsLower = (allTags || []).map((t: string) => t.toLowerCase());
      console.log(`[Training Coverage] Available tags: [${allTags?.join(', ') || 'none'}]`);
      
      const processedRecommendations = (analysisResult.recommendations || []).map((rec: any) => {
        // Validate cadence
        let mappedCadence = rec.cadence;
        const validCadences = ['Once', 'Monthly', 'Quarterly', 'Semi-Annually', 'Annually'];
        if (!validCadences.includes(mappedCadence)) {
          mappedCadence = 'Annually';
        }

        // Filter assignedTags to only include tags that exist (case-insensitive matching)
        const aiSuggestedTags = rec.assignedTags || [];
        const matchedTags = aiSuggestedTags
          .map((aiTag: string) => {
            const lowerAiTag = aiTag.toLowerCase();
            const matchIndex = allTagsLower.indexOf(lowerAiTag);
            if (matchIndex !== -1) {
              return allTags[matchIndex]; // Return the original case from team tags
            }
            return null;
          })
          .filter(Boolean) as string[];
        
        // Log tag matching for debugging
        if (aiSuggestedTags.length > 0) {
          if (matchedTags.length === 0) {
            console.log(`[Training Coverage] "${rec.name}": AI suggested tags [${aiSuggestedTags.join(', ')}] but NONE matched available tags`);
          } else if (matchedTags.length < aiSuggestedTags.length) {
            console.log(`[Training Coverage] "${rec.name}": Partial match - AI suggested [${aiSuggestedTags.join(', ')}], matched [${matchedTags.join(', ')}]`);
          } else {
            console.log(`[Training Coverage] "${rec.name}": Matched tags [${matchedTags.join(', ')}]`);
          }
        } else {
          console.log(`[Training Coverage] "${rec.name}": AI assigned to whole team (no tags)`);
        }

        return {
          name: rec.name,
          description: rec.description,
          cadence: mappedCadence,
          priority: rec.priority || 'medium',
          assignedTags: matchedTags,
          oshaStandards: rec.oshaStandards || [],
          reason: rec.reason
        };
      });

      const result = {
        success: true,
        score: Math.min(100, Math.max(0, analysisResult.score || 0)),
        summary: analysisResult.summary || 'Training coverage analysis complete.',
        strengths: analysisResult.strengths || [],
        gaps: analysisResult.gaps || [],
        recommendations: processedRecommendations,
        industry: industry,
        existingCount: existingTrainings.length,
        analyzedAt: new Date().toISOString()
      };

      // Store the analysis result in Firestore for caching
      console.log(`[Training Coverage] Attempting to store analysis for teamId: ${teamId}`);
      if (teamId) {
        try {
          const teamRef = admin.firestore().doc(`team/${teamId}`);
          await teamRef.update({
            trainingCoverageAnalysis: result,
            trainingCoverageAnalysisStale: false,
            trainingCoverageAnalysisUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
          });
          console.log(`[Training Coverage] Successfully stored training coverage analysis for team ${teamId} with score ${result.score}`);
        } catch (cacheError: any) {
          console.error(`[Training Coverage] Failed to cache training coverage analysis for team ${teamId}:`, cacheError?.message || cacheError);
        }
      }

      return result;
    } catch (error: any) {
      console.error('Error analyzing training coverage:', error);
      throw new HttpsError('internal', error.message);
    }
  }
);

// AI-powered training article generation for auto-builder
// Generates a complete training article based on a topic and industry
export const generateTrainingArticleForAutoBuilder = onCall(
  { 
    secrets: [xaiApiKey],
    timeoutSeconds: 180,
    memory: "1GiB"
  },
  async (request) => {
    const { 
      topic, 
      description,
      industry, 
      oshaStandards,
      assignedTags,
      cadence
    } = request.data as any;

    if (!topic) {
      throw new HttpsError('invalid-argument', 'Training topic is required');
    }

    try {
      // Call Grok API to generate the article
      const response = await fetch('https://api.x.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.XAI_API_KEY}`
        },
        body: JSON.stringify({
          model: 'grok-3-fast',
          messages: [
            {
              role: 'system',
              content: `You are an expert safety and compliance training content writer. Your job is to create engaging, OSHA-compliant training articles that employees will actually read and learn from.

Your articles must be:
1. **Compliant**: Reference relevant OSHA standards, industry regulations, and best practices where applicable
2. **Easy to Understand**: Written at an 8th-grade reading level so all employees can comprehend
3. **Actionable**: Include clear, practical steps employees can follow
4. **Well-Structured**: Use headings, bullet points, and numbered lists for easy scanning
5. **Engaging**: Keep employees interested while delivering important safety information
6. **Complete**: Cover the topic thoroughly enough that the training is meaningful

When generating an article, return a JSON object with this exact structure:
{
  "title": "Clear, professional title for the training article",
  "content": "Full HTML content of the article with proper formatting"
}

HTML Formatting Guidelines:
- Use <h2> for main section headings
- Use <h3> for subsections
- Use <ul> and <li> for bullet lists
- Use <ol> and <li> for numbered steps/procedures
- Use <p> for paragraphs
- Use <strong> for emphasis on key safety points
- Use <blockquote> for regulation references or important callouts
- Keep paragraphs short (2-3 sentences max)
- Include a brief introduction explaining why this topic matters
- Include a practical "What You Need to Know" or "Key Steps" section
- End with a summary or key takeaways section

Article Structure:
1. Introduction - Why this training matters (1-2 paragraphs)
2. Key Concepts/Definitions (if applicable)
3. Main Content - Procedures, guidelines, or requirements
4. Practical Steps - What employees should actually do
5. Summary/Key Takeaways - Bullet points of the most important items`
            },
            {
              role: 'user',
              content: `Please create a comprehensive training article on the following topic:

TOPIC: ${topic}
${description ? `DESCRIPTION: ${description}` : ''}
INDUSTRY: ${industry || 'General'}
${oshaStandards?.length ? `RELEVANT STANDARDS: ${oshaStandards.join(', ')}` : ''}
${assignedTags?.length ? `AUDIENCE: Team members with tags: ${assignedTags.join(', ')}` : 'AUDIENCE: All team members'}
TRAINING CADENCE: ${cadence || 'Annually'}

Generate a well-structured, engaging training article that covers this topic thoroughly. Make sure to:
- Reference any applicable OSHA standards or regulations
- Include practical, actionable guidance
- Use clear, simple language
- Format with proper HTML structure for readability`
            }
          ],
          temperature: 0.7
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Grok API error:', errorText);
        throw new Error(`Grok API error: ${response.status}`);
      }

      const grokResponse: any = await response.json();
      const aiMessage = grokResponse.choices?.[0]?.message?.content || '{}';

      // Parse the AI response
      let articleData: { title: string; content: string } = { title: '', content: '' };
      try {
        const jsonMatch = aiMessage.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          articleData = JSON.parse(jsonMatch[0]);
        }
      } catch (parseError) {
        console.error('Error parsing AI response:', aiMessage);
        // If JSON parsing fails, try to extract title and content manually
        const titleMatch = aiMessage.match(/"title":\s*"([^"]+)"/);
        const contentMatch = aiMessage.match(/"content":\s*"([\s\S]+?)"\s*\}/);
        
        if (titleMatch) articleData.title = titleMatch[1];
        if (contentMatch) {
          articleData.content = contentMatch[1]
            .replace(/\\n/g, '\n')
            .replace(/\\"/g, '"');
        }
        
        if (!articleData.title && !articleData.content) {
          throw new Error('Failed to parse AI response');
        }
      }

      return {
        success: true,
        title: articleData.title || topic,
        content: articleData.content,
        topic: topic,
        industry: industry,
        suggestedCadence: cadence || 'Annually',
        oshaStandards: oshaStandards || []
      };
    } catch (error: any) {
      console.error('Error generating training article:', error);
      throw new HttpsError('internal', error.message);
    }
  }
);

// Webhook to handle successful Stripe checkout
export const stripeWebhook = onRequest(
  { secrets: [stripeSecretKey, stripeWebhookSecret] },
  async (req, res) => {
    const stripe = createStripeClient();
    const sig = req.headers['stripe-signature'];
    
    if (!sig) {
      console.error('No stripe-signature header found');
      res.status(400).send('Missing stripe-signature header');
      return;
    }

    let event;
    try {
      // Verify webhook signature for production security
      // Firebase Functions provides rawBody for signature verification
      event = stripe.webhooks.constructEvent(
        req.rawBody,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err: any) {
      console.error('Webhook signature verification failed:', err.message);
      res.status(400).send(`Webhook Error: ${err.message}`);
      return;
    }
    
    console.log(`Received Stripe webhook event: ${event.type}`);

    // Handle the checkout.session.completed event
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      // Support both Payment Link (client_reference_id) and Checkout Session (metadata.teamId)
      const teamId = session.client_reference_id || session.metadata?.teamId;
      const customerId = session.customer;
      const subscriptionId = session.subscription;

      if (teamId && customerId && subscriptionId) {
        try {
          await admin.firestore().doc(`team/${teamId}`).update({
            stripeCustomerId: customerId,
            stripeSubscriptionId: subscriptionId,
            stripePlanId: 'flat-rate-99',
            subscriptionStatus: 'active',
          });
          console.log(`Team ${teamId} subscription activated via ${session.client_reference_id ? 'Payment Link' : 'Checkout Session'}`);
        } catch (error) {
          console.error('Error updating team subscription:', error);
        }
      }
    }

    // Handle subscription updates
    if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
      const subscription = event.data.object;
      const customerId = subscription.customer;
      
      // Find the team by Stripe customer ID
      const teamsSnapshot = await admin.firestore()
        .collection('team')
        .where('stripeCustomerId', '==', customerId)
        .get();
      
      if (!teamsSnapshot.empty) {
        const teamDoc = teamsSnapshot.docs[0];
        const status = subscription.status === 'active' ? 'active' : subscription.status;
        
        await teamDoc.ref.update({
          subscriptionStatus: status,
          stripeSubscriptionId: subscription.id,
        });
        console.log(`Team ${teamDoc.id} subscription status updated to ${status}`);
      }
    }

    res.json({ received: true });
  }
);

/* ----- TEAM CREATED ----- */

export const teamCreated = onDocumentCreated(
  "team/{teamId}",
  async (event) => {
    const team = event.data?.data();
    const teamId = event.params.teamId;
    
    if (!team) return null;
    
    // Log team creation with industries (if any)
    if (team.industries?.length > 0) {
      console.log(`Team ${teamId} created with industries: ${team.industries.join(', ')}`);
    } else {
      console.log(`Team ${teamId} created without industries`);
    }

    // Note: Industry articles are NOT automatically applied on team creation.
    // Users can manually add recommended articles from the Library page.
    
    return null;
  }
);

/* ----- TEAM ----- */

export const updateTeam = onDocumentUpdated(
  "team/{teamId}",
  async (event) => {
    const oldTeam = event.data?.before.data();
    const newTeam = event.data?.after.data();
    
    if (!oldTeam || !newTeam) return;

    let address;
    if (!oldTeam.street && newTeam.street) {
      address = updateCompletedAchievement(
        event.params.teamId,
        "hasContactInfo",
        true
      );
    }

    /* logoUrl achievement */
    let logo;
    if (!oldTeam.logoUrl && newTeam.logoUrl) {
      logo = updateCompletedAchievement(newTeam.id, "hasCompanyLogo", true);
    }
    await Promise.all([logo, address]);
    console.log("update team complete");
  }
);

/* ----- SELF INSPECTION ----- */

export const createdSelfInspection = onDocumentCreated(
  "team/{teamId}/self-inspection/{id}",
  async (event) => {
    const selfInspection = event.data?.data();
    const teamId = event.params.teamId;
    
    if (!selfInspection) return null;

    /* Calculate next due date based on frequency */
    const nextDueDate = calculateNextDueDate(selfInspection.inspectionExpiration);
    
    // Update the document with the next due date if we calculated one
    if (nextDueDate && event.data) {
      await event.data.ref.update({ nextDueDate });
    }

    // Invalidate coverage analysis cache since inspections changed
    await invalidateCoverageAnalysisCache(teamId);

    /* total self inspections achievement */
    const achievement = updateCompletedAchievement(
      teamId,
      "startedSelfAssesments",
      1,
      true
    );
    const eventLog = logAsEvent(
      EventType.selfInspection,
      EventAction.created,
      event.params.id,
      selfInspection.userId,
      `Created self-inspection: ${selfInspection.title || 'Untitled'}`,
      teamId
    );

    await Promise.all([achievement, eventLog]);
    console.log("created self inspection complete");
    return null;
  }
);

/**
 * Calculate the next due date based on inspection frequency.
 * All inspections of the same frequency are due on the same day:
 * - Monthly: 1st of next month
 * - Quarterly: 1st of next quarter (Jan 1, Apr 1, Jul 1, Oct 1)
 * - Semi-Annually: Jan 1 or Jul 1 (whichever is next)
 * - Annually: Jan 1 of next year
 */
function calculateNextDueDate(frequency: string): Date | null {
  if (!frequency || frequency === 'Manual') {
    return null;
  }

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth(); // 0-indexed

  switch (frequency) {
    case 'Monthly': {
      // 1st of next month
      const nextMonth = currentMonth + 1;
      if (nextMonth > 11) {
        return new Date(currentYear + 1, 0, 1); // Jan 1 of next year
      }
      return new Date(currentYear, nextMonth, 1);
    }

    case 'Quarterly': {
      // 1st of next quarter (Jan=0, Apr=3, Jul=6, Oct=9)
      const quarterStarts = [0, 3, 6, 9];
      const nextQuarter = quarterStarts.find(q => q > currentMonth);
      if (nextQuarter !== undefined) {
        return new Date(currentYear, nextQuarter, 1);
      }
      // Next quarter is January of next year
      return new Date(currentYear + 1, 0, 1);
    }

    case 'Semi-Anually': {
      // Jan 1 or Jul 1 (whichever is next)
      if (currentMonth < 6) {
        return new Date(currentYear, 6, 1); // Jul 1
      }
      return new Date(currentYear + 1, 0, 1); // Jan 1 of next year
    }

    case 'Anually': {
      // Jan 1 of next year
      return new Date(currentYear + 1, 0, 1);
    }

    default:
      return null;
  }
}

/**
 * Invalidate the coverage analysis cache for a team.
 * Called when self-inspections are created, updated, or deleted.
 * Sets coverageAnalysisStale to true so the frontend knows to re-run analysis.
 */
async function invalidateCoverageAnalysisCache(teamId: string): Promise<void> {
  try {
    const teamRef = admin.firestore().doc(`team/${teamId}`);
    await teamRef.update({
      coverageAnalysisStale: true,
      coverageAnalysisInvalidatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    console.log(`Invalidated coverage analysis cache for team ${teamId}`);
  } catch (error) {
    console.error(`Failed to invalidate coverage analysis cache for team ${teamId}:`, error);
  }
}

/**
 * Invalidate the training coverage analysis cache for a team.
 * Called when library items are created, updated, or deleted.
 * Sets trainingCoverageAnalysisStale to true so the frontend knows to re-run analysis.
 */
async function invalidateTrainingCoverageAnalysisCache(teamId: string): Promise<void> {
  try {
    const teamRef = admin.firestore().doc(`team/${teamId}`);
    await teamRef.update({
      trainingCoverageAnalysisStale: true,
      trainingCoverageAnalysisInvalidatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    console.log(`Invalidated training coverage analysis cache for team ${teamId}`);
  } catch (error) {
    console.error(`Failed to invalidate training coverage analysis cache for team ${teamId}:`, error);
  }
}

// When a self-inspection is updated, recalculate next due date if frequency changed
// and invalidate coverage cache if content changed
export const updatedSelfInspection = onDocumentUpdated(
  "team/{teamId}/self-inspection/{id}",
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    const teamId = event.params.teamId;
    
    if (!before || !after) return null;

    // Only recalculate if frequency changed
    if (before.inspectionExpiration !== after.inspectionExpiration) {
      const nextDueDate = calculateNextDueDate(after.inspectionExpiration);
      if (nextDueDate && event.data) {
        await event.data.after.ref.update({ nextDueDate });
        console.log(`Updated nextDueDate for self-inspection ${event.params.id} due to frequency change`);
      } else if (after.inspectionExpiration === 'Manual' && event.data) {
        // Clear the next due date for Manual inspections
        await event.data.after.ref.update({ nextDueDate: null });
        console.log(`Cleared nextDueDate for self-inspection ${event.params.id} (now Manual)`);
      }
    }

    // Check if content changed that affects coverage analysis
    // (title, frequency, or questions)
    const contentChanged = 
      before.title !== after.title ||
      before.inspectionExpiration !== after.inspectionExpiration ||
      JSON.stringify(before.baseQuestions) !== JSON.stringify(after.baseQuestions);

    if (contentChanged) {
      await invalidateCoverageAnalysisCache(teamId);
    }

    return null;
  }
);

// When a self-inspection is deleted, invalidate the coverage analysis cache
export const deletedSelfInspection = onDocumentDeleted(
  "team/{teamId}/self-inspection/{id}",
  async (event) => {
    const teamId = event.params.teamId;
    const selfInspection = event.data?.data();

    // Invalidate coverage analysis cache since inspections changed
    await invalidateCoverageAnalysisCache(teamId);

    // Log the deletion event
    await logAsEvent(
      EventType.selfInspection,
      EventAction.deleted,
      event.params.id,
      selfInspection?.userId || 'unknown',
      `Deleted self-inspection: ${selfInspection?.title || 'Untitled'}`,
      teamId
    );
    console.log("deleted self inspection complete");
  }
);

export const modifySelfInspectionInspection = onDocumentUpdated(
  "team/{teamId}/self-inspection/{id}/inspections/{inspectionId}",
  async (event) => {
    const oldI = event.data?.before.data();
    const newI = event.data?.after.data();
    
    if (!oldI || !newI) return null;

    if (newI.completedAt && !oldI.completedAt) {
      // has been completed - fetch the parent self-inspection to get the title and frequency
      const selfInspectionRef = admin.firestore()
        .doc(`team/${event.params.teamId}/self-inspection/${event.params.id}`);
      const selfInspectionDoc = await selfInspectionRef.get();
      const selfInspection = selfInspectionDoc.data();
      const title = selfInspection?.title || 'Untitled';
      
      // Calculate and update the next due date based on frequency
      const nextDueDate = calculateNextDueDate(selfInspection?.inspectionExpiration);
      if (nextDueDate) {
        await selfInspectionRef.update({ 
          nextDueDate,
          lastCompletedAt: newI.completedAt 
        });
      } else {
        // Just update lastCompletedAt for Manual inspections
        await selfInspectionRef.update({ 
          lastCompletedAt: newI.completedAt 
        });
      }
      
      const achievement = updateCompletedAchievement(
        event.params.teamId,
        "completedSelfAssesments",
        1,
        true
      );
      const eventLog = logAsEvent(
        EventType.selfInspection,
        EventAction.completed,
        event.params.inspectionId,
        newI.completedBy,
        `Finished the self-inspection: ${title}`,
        event.params.teamId
      );

      await Promise.all([eventLog, achievement]);
      console.log("updated self inspection complete");
    }
    return null;
  }
);

/* ----- INJURY REPORT ----- */

export const createdInjuryReport = onDocumentCreated(
  "team/{teamId}/incident-report/{id}",
  async (event) => {
    const injuryReport = event.data?.data();
    
    if (!injuryReport) return null;

    /* total self inspections achievement */
    const achievement = updateCompletedAchievement(
      event.params.teamId,
      "injuryReports",
      1,
      true
    );
    const eventLog = logAsEvent(
      EventType.incidentReport,
      EventAction.created,
      event.params.id,
      injuryReport.submittedBy,
      "Created a new " + injuryReport.type,
      event.params.teamId
    );

    await Promise.all([eventLog, achievement]);
    console.log("created injury report complete");
    return null;
  }
);

/* ----- INJURY REPORT NEW ----- */

export const createdInjuryReportNew = onDocumentCreated(
  "incident-report/{id}",
  async (event) => {
    const injuryReport = event.data?.data();
    
    if (!injuryReport) return null;

    /* total self inspections achievement */
    const achievement = updateCompletedAchievement(
      injuryReport.teamId,
      "injuryReports",
      1,
      true
    );
    const eventLog = logAsEvent(
      EventType.incidentReport,
      EventAction.created,
      event.params.id,
      injuryReport.submittedBy,
      "Created a new " + injuryReport.type,
      injuryReport.teamId
    );

    await Promise.all([eventLog, achievement]);
    console.log("created injury report complete");
    return null;
  }
);

/* ----- ADD TO LIBRARY ----- */

export const addToLibrary = onDocumentCreated(
  "library/{id}",
  async (event) => {
    const libraryItem = event.data?.data();
    
    if (!libraryItem) return null;
    
    // Invalidate training coverage analysis cache since library changed
    if (libraryItem.teamId) {
      await invalidateTrainingCoverageAnalysisCache(libraryItem.teamId);
    }
    
    await logAsEvent(
      EventType.customContent,
      EventAction.created,
      event.params.id,
      libraryItem.teamMemberId,
      `A new Article was Added to the Library: ${libraryItem.name}`,
      libraryItem.teamId
    );

    console.log("Add to library complete");
    return null;
  }
);

// When a library item is updated, invalidate the training coverage cache if relevant fields changed
export const updatedLibraryItem = onDocumentUpdated(
  "library/{id}",
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    
    if (!before || !after) return null;

    const teamId = after.teamId || before.teamId;
    if (!teamId) return null;

    // Check if content changed that affects coverage analysis
    // (name, cadence, or assigned tags)
    const contentChanged = 
      before.name !== after.name ||
      before.trainingCadence !== after.trainingCadence ||
      JSON.stringify(before.assignedTags) !== JSON.stringify(after.assignedTags);

    if (contentChanged) {
      await invalidateTrainingCoverageAnalysisCache(teamId);
    }

    return null;
  }
);

// When a library item is deleted, invalidate the training coverage analysis cache
export const deletedLibraryItem = onDocumentDeleted(
  "library/{id}",
  async (event) => {
    const libraryItem = event.data?.data();
    
    if (!libraryItem) return null;

    const teamId = libraryItem.teamId;
    if (teamId) {
      // Invalidate training coverage analysis cache since library changed
      await invalidateTrainingCoverageAnalysisCache(teamId);
    }

    console.log("Deleted library item complete");
    return null;
  }
);

/* ----- SURVEY ----- */

export const createdSurvey = onDocumentCreated(
  {
    document: "survey/{id}",
    secrets: [sendgridApiKey, twilioAccountSid, twilioAuthToken]
  },
  async (event) => {
    const survey = event.data?.data();
    
    if (!survey) return null;
    
    const log = logAsEvent(
      EventType.survey,
      EventAction.created,
      event.params.id,
      survey.userId,
      survey.title,
      survey.teamId
    );
    blastSurvey({...survey, id: event.params.id});
    await log;
    console.log("created survey complete");
    return null;
  }
);

function blastSurvey(survey: any): Promise<any> {
  let teamMember: any[] = [];
  return admin.firestore().collection(`team-members`).where("teamId", "==", survey.teamId).get().then((users: any) => {
      users.forEach((userDoc: any) => {
        teamMember.push({...userDoc.data(), id: userDoc.id});
      });
      survey.trainees.forEach((tmId: string) => {
        let member = teamMember.find(tm => tm.id == tmId);
        if (member) {
          console.log('sending');
          const body = `Hi ${member.name}. A new survey is waiting for you. Click the link to answer. Please answer right away to help your employer maintain current records. Thank you! - The Compliancechimp team.\n
          https://compliancechimp.com/user?member-id=${member.id}`;
          return sendMessage(member, null, body).then(() => {
            return;
          });
        } else {
          console.log('no team member found');
          return null;
        }
      });
  });
}

export const modifiedSurvey = onDocumentUpdated(
  "survey/{surveyId}",
  async (event) => {
    const newSurvey = event.data?.after.data();
    
    if (!newSurvey) return null;
    
    await logAsEvent(
      EventType.survey,
      EventAction.updated,
      event.params.surveyId,
      newSurvey.userId,
      newSurvey.title,
      newSurvey.teamId
    );
    console.log("updated survey complete");
    return null;
  }
);

export const deletedSurvey = onDocumentDeleted(
  "survey/{logId}",
  async (event) => {
    const deletedSurveyData = event.data?.data();
    
    if (!deletedSurveyData) return null;
    
    await logAsEvent(
      EventType.log,
      EventAction.deleted,
      event.params.logId,
      deletedSurveyData.userId,
      deletedSurveyData.title,
      deletedSurveyData.teamId
    );
    console.log("deleted survey complete");
    return null;
  }
);

/* ----- SURVEY RESPONSE ----- */

export const createdSurveyResponse = onDocumentCreated(
  "survey-response/{id}",
  async (event) => {
    const surveyResponse = event.data?.data();
    
    if (!surveyResponse) return null;
    
    await logAsEvent(
      EventType.surveyResponse,
      EventAction.respond,
      surveyResponse.surveyId,
      surveyResponse.teamMemberId,
      surveyResponse.shortAnswer?.toString() ||
        "" + " " + surveyResponse.longAnswer ||
        "",
      surveyResponse.teamId
    );

    console.log("created survey response complete");
    return null;
  }
);

/* ----- CUSTOM ARTICLE ----- */

export const createdCustomTrainingArticle = onDocumentCreated(
  "team/{teamId}/article/{id}",
  async (event) => {
    await updateCompletedAchievement(
      event.params.teamId,
      "customTrainingArticleCount",
      1,
      true
    );

    console.log("created custom training article complete");
    return null;
  }
);

export const scheduledFunctionCrontab = onSchedule(
  { 
    schedule: '0 14 * * *',  // 8:00 AM Central Time (UTC-6) = 14:00 UTC
    secrets: [sendgridApiKey, twilioAccountSid, twilioAuthToken]
  },
  async (event) => {
    console.log(`Running scheduled tasks at 8 AM Central Time`);
    await Promise.all([
      findSurveys(), 
      checkSelfInspectionReminders(), 
      autoStartDueTrainings()
    ]);
  }
);

/**
 * Auto-start trainings that are due for teams with autoStartTrainings enabled.
 * Checks each team's library items and starts trainings that are due today or overdue.
 * Creates a Survey for each due training and notifies team members via SMS/email.
 */
async function autoStartDueTrainings() {
  console.log('Starting auto-start due trainings check...');
  const db = admin.firestore();
  const today = moment().startOf('day');
  
  try {
    // Get all teams (we'll filter by autoStartTrainings !== false in code)
    const teamsSnapshot = await db.collection('team').get();
    
    let trainingsStarted = 0;
    
    for (const teamDoc of teamsSnapshot.docs) {
      const team = { ...teamDoc.data(), id: teamDoc.id } as any;
      
      // Skip if team has not explicitly enabled auto-start (undefined means disabled - grandfather existing teams)
      if (team.autoStartTrainings !== true) {
        continue;
      }
      
      // Skip disabled teams
      if (team.disabled) {
        continue;
      }
      
      // Skip teams with expired free trial (no subscription and past 14-day trial period)
      if (!team.stripeSubscriptionId && team.createdAt) {
        const trialEndDate = moment(team.createdAt.toDate ? team.createdAt.toDate() : team.createdAt).add(14, 'days');
        if (today.isAfter(trialEndDate)) {
          continue;
        }
      }
      
      // Get library items for this team
      const librarySnapshot = await db
        .collection('library')
        .where('teamId', '==', team.id)
        .get();
      
      if (librarySnapshot.empty) {
        continue;
      }
      
      // Get team members for tag matching
      const teamMembersSnapshot = await db
        .collection('team-members')
        .where('teamId', '==', team.id)
        .get();
      
      const teamMembers = teamMembersSnapshot.docs.map(doc => ({
        ...doc.data(),
        id: doc.id
      }));
      
      if (teamMembers.length === 0) {
        continue;
      }
      
      // Get team managers to find a userId for the survey creator
      const managersSnapshot = await db
        .collection('user')
        .where('teamId', '==', team.id)
        .limit(1)
        .get();
      
      const creatorUserId = managersSnapshot.docs.length > 0 
        ? managersSnapshot.docs[0].id 
        : 'system';
      
      // Check each library item for due trainings
      for (const libraryDoc of librarySnapshot.docs) {
        const libraryItem = { ...libraryDoc.data(), id: libraryDoc.id } as any;
        
        // Skip if per-training auto-start is explicitly disabled
        if (libraryItem.autoStart === false) {
          continue;
        }
        
        // Skip if per-training auto-start is undefined and team auto-start would be false
        // (but we already filtered teams above, so this is just for explicit per-item override)
        
        // Calculate if training is due
        const isDue = isTrainingDue(libraryItem, today);
        
        if (!isDue) {
          continue;
        }
        
        // Get trainees based on assigned tags
        const trainees = expandTagsToMembers(libraryItem.assignedTags || [], teamMembers);
        
        if (trainees.length === 0) {
          console.log(`No trainees for ${libraryItem.name} in team ${team.id} - skipping`);
          continue;
        }
        
        // Create survey to start the training
        const survey = {
          libraryId: libraryItem.id,
          title: `Training Attendance: ${libraryItem.name}`,
          trainees: trainees,
          userId: creatorUserId,
          teamId: team.id,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          runDate: admin.firestore.FieldValue.serverTimestamp(),
          active: true,
          autoStarted: true  // Flag to indicate this was auto-started
        };
        
        await db.collection('survey').add(survey);
        
        // Update library item with lastTrainedAt
        const now = new Date().toISOString();
        const updates: { [key: string]: any } = {
          lastTrainedAt: admin.firestore.FieldValue.serverTimestamp()
        };
        trainees.forEach((traineeId: string) => {
          updates[`shouldReceiveTraining.${traineeId}`] = now;
        });
        await db.doc(`library/${libraryItem.id}`).update(updates);
        
        trainingsStarted++;
        console.log(`Auto-started training "${libraryItem.name}" for team ${team.id} with ${trainees.length} trainees`);
      }
    }
    
    console.log(`Auto-start trainings complete. Started ${trainingsStarted} trainings.`);
  } catch (error) {
    console.error('Error in autoStartDueTrainings:', error);
  }
}

/**
 * Check if a library item's training is due based on cadence and last trained date.
 */
function isTrainingDue(libraryItem: any, today: moment.Moment): boolean {
  const cadence = libraryItem.trainingCadence || 'Annually';
  
  // For "Once" trainings - only due if never trained
  if (cadence === 'Once') {
    if (libraryItem.lastTrainedAt) {
      return false; // Already completed
    }
    // Check if scheduled date is today or earlier
    if (libraryItem.scheduledDueDate) {
      const scheduledDate = moment(libraryItem.scheduledDueDate.toDate ? libraryItem.scheduledDueDate.toDate() : libraryItem.scheduledDueDate);
      return scheduledDate.isSameOrBefore(today, 'day');
    }
    return true; // No scheduled date, so it's due immediately
  }
  
  // For recurring trainings
  let nextDueDate: moment.Moment;
  
  if (libraryItem.lastTrainedAt) {
    // Calculate next due from last trained
    const lastTrained = moment(libraryItem.lastTrainedAt.toDate ? libraryItem.lastTrainedAt.toDate() : libraryItem.lastTrainedAt);
    nextDueDate = addCadenceInterval(lastTrained, cadence);
  } else if (libraryItem.scheduledDueDate) {
    // Use scheduled date if never trained
    nextDueDate = moment(libraryItem.scheduledDueDate.toDate ? libraryItem.scheduledDueDate.toDate() : libraryItem.scheduledDueDate);
  } else {
    // No training history and no scheduled date - due immediately
    return true;
  }
  
  return nextDueDate.isSameOrBefore(today, 'day');
}

/**
 * Add cadence interval to a date.
 */
function addCadenceInterval(date: moment.Moment, cadence: string): moment.Moment {
  const result = date.clone();
  switch (cadence) {
    case 'Monthly':
      return result.add(1, 'month');
    case 'Quarterly':
      return result.add(3, 'months');
    case 'Semi-Annually':
      return result.add(6, 'months');
    case 'Annually':
    default:
      return result.add(1, 'year');
  }
}

/**
 * Expand assigned tags to member IDs.
 * Returns an array of team member IDs that have any of the assigned tags.
 */
function expandTagsToMembers(assignedTags: string[], teamMembers: any[]): string[] {
  if (!assignedTags || assignedTags.length === 0) {
    // If no tags assigned, return all team members
    return teamMembers.map(tm => tm.id).filter((id: string) => id);
  }
  
  const memberIds = new Set<string>();
  for (const tag of assignedTags) {
    teamMembers
      .filter(tm => tm.tags?.includes(tag))
      .forEach(tm => {
        if (tm.id) {
          memberIds.add(tm.id);
        }
      });
  }
  return Array.from(memberIds);
}

async function checkSelfInspectionReminders() {
  const today = moment();
  const teamsSnapshot = await admin.firestore().collection("team").get();
  
  for (const teamDoc of teamsSnapshot.docs) {
    const team = { ...teamDoc.data(), id: teamDoc.id };
    const selfInspectionsSnapshot = await admin.firestore()
      .collection(`team/${team.id}/self-inspection`)
      .get();
    
    for (const siDoc of selfInspectionsSnapshot.docs) {
      const selfInspection = siDoc.data();
      
      if (!selfInspection.inspectionExpiration || !selfInspection.lastCompletedAt) {
        continue; // No interval set or never completed
      }
      
      const lastCompleted = moment(selfInspection.lastCompletedAt.toDate());
      let dueDate: moment.Moment;
      
      // Calculate when the next inspection is due based on the interval
      switch (selfInspection.inspectionExpiration) {
        case 'Monthly':
          dueDate = lastCompleted.clone().add(1, 'month');
          break;
        case 'Quarterly':
          dueDate = lastCompleted.clone().add(3, 'months');
          break;
        case 'Semi-Anually':
          dueDate = lastCompleted.clone().add(6, 'months');
          break;
        case 'Anually':
          dueDate = lastCompleted.clone().add(1, 'year');
          break;
        default:
          continue;
      }
      
      // Check if due date is within the next 7 days or past due
      const daysUntilDue = dueDate.diff(today, 'days');
      
      if (daysUntilDue <= 7 && daysUntilDue >= -30) {
        // Check if we already sent a reminder recently
        const lastReminderSent = selfInspection.lastReminderSent 
          ? moment(selfInspection.lastReminderSent.toDate()) 
          : null;
        
        if (lastReminderSent && today.diff(lastReminderSent, 'days') < 7) {
          continue; // Already sent a reminder within the last week
        }
        
        // Get team owner/managers to notify
        const managersSnapshot = await admin.firestore()
          .collection("user")
          .where("teamId", "==", team.id)
          .get();
        
        for (const managerDoc of managersSnapshot.docs) {
          const manager = managerDoc.data();
          if (manager.email) {
            const urgency = daysUntilDue < 0 
              ? `is ${Math.abs(daysUntilDue)} days overdue` 
              : daysUntilDue === 0 
                ? 'is due today'
                : `is due in ${daysUntilDue} days`;
            
            const body = `
              <h2>Self-Inspection Reminder</h2>
              <p>Hi ${manager.name || 'there'},</p>
              <p>Your self-inspection "<strong>${selfInspection.title}</strong>" ${urgency}.</p>
              <p>Last completed: ${lastCompleted.format('MMMM D, YYYY')}</p>
              <p>Frequency: ${selfInspection.inspectionExpiration}</p>
              <p><a href="https://compliancechimp.com/account/self-inspections/${siDoc.id}">Complete the inspection now</a></p>
              <p>- The ComplianceChimp Team</p>
            `;
            
            await sendMessage({ ...manager, preferEmail: true }, team, body);
          }
        }
        
        // Update the last reminder sent timestamp
        await admin.firestore()
          .doc(`team/${team.id}/self-inspection/${siDoc.id}`)
          .update({ lastReminderSent: new Date() });
      }
    }
  }
  
  console.log('Self-inspection reminders check complete');
}

function findSurveys(): Promise<any> {
  const today = moment(); 
  let teamDocs = admin.firestore().collection("team").get();
  return teamDocs.then((teams: any) => {
    const promises: Promise<any>[] = [];
    teams.forEach((teamDoc: any) => {
      const team = { ...teamDoc.data(), id: teamDoc.id };
      let surveysDocs = admin.firestore().collection(`team/${team.id}/survey`).get();
      promises.push(surveysDocs.then((surveys: any) => {
          surveys.forEach((surveyDoc: any) => {
            const survey = surveyDoc.data();
            if (!survey.notificationSent) {
              let teamMember: any[] = [];
              if (moment(survey.runDate).isSame(today, 'day')) { //do it
                if (teamMember.length == 0) {
                  admin.firestore().collection(`team/${team.id}/user`).get().then((users: any) => {
                      users.forEach((userDoc: any) => {
                        teamMember.push(userDoc.data());
                      });
                      Object.keys(survey.userSurvey).forEach((key,index) => {
                        let user = teamMember.find(u => u.id == key);
                        if (user) {
                          const body = `Hi ${user.name}. A new survey is waiting for you. Click the link to answer. Please answer right away to help your employer maintain current records. Thank you! - The Compliancechimp team.\n
                          https://compliancechimp.com/user?member-id=${user.id}`;
                          sendMessage(user, team, body).then(() => {
                            surveyDoc.ref.update({notificationSent: true});
                          });
                        }
                      });
                  });
                } else {
                  Object.keys(survey.userSurvey).forEach((key,index) => {
                    const body = ``;
                    let user = teamMember.find(u => u.id == key);
                    if (user) {
                      sendMessage(user, team, body).then(() => {
                        surveyDoc.ref.update({notificationSent: true});
                      });
                    }
                  });
                }
              }
            }
          });
      }));
    });
    return Promise.all(promises);
  });
}


export const teamMemberAdded = onDocumentCreated(
  {
    document: "team-members/{teamMemberId}",
    secrets: [sendgridApiKey, twilioAccountSid, twilioAuthToken]
  },
  async (event) => {
    const data = event.data?.data() as any;
    
    if (!data) return null;
    
    // Skip sending welcome message if welcomeSent is explicitly false
    // This happens during onboarding or CSV import when admin is still curating the list
    if (data.welcomeSent === false) {
      console.log(`Skipping welcome message for ${data.name} - welcomeSent is false (pending)`);
      return null;
    }
    
    const teamMember = { ...data, id: event.params.teamMemberId };
    const teamDoc = await admin.firestore().doc(`team/${teamMember.teamId}`).get();
    const team = teamDoc.data();
    
    let messageBody: string;
    if (teamMember.preferEmail) {
      // Use HTML email template for email
      const emailHtml = getEmail("add-team-member");
      messageBody = emailHtml
        .split("{{recipientName}}")
        .join(teamMember.name)
        .split("{{userId}}")
        .join(teamMember.id);
    } else {
      // Use plain text for SMS
      messageBody = `Hi ${teamMember.name}! You've been added to ${team?.name || 'your company'}'s Compliancechimp account. Visit your profile for training content and surveys: https://compliancechimp.com/user?member-id=${teamMember.id}`;
    }
    
    // Mark as sent and send the message
    await admin.firestore().doc(`team-members/${event.params.teamMemberId}`).update({
      welcomeSent: true,
      welcomeSentAt: new Date()
    });
    
    return await sendMessage(teamMember, team, messageBody);
  }
);

export const resendTeamMemberInvite = onCall(
  { secrets: [sendgridApiKey, twilioAccountSid, twilioAuthToken] },
  async (request) => {
    const { teamMember, team } = request.data as any;
    
    let messageBody: string;
    if (teamMember.preferEmail) {
      // Use HTML email template for email
      const emailHtml = getEmail("add-team-member");
      messageBody = emailHtml
        .split("{{recipientName}}")
        .join(teamMember.name)
        .split("{{userId}}")
        .join(teamMember.id);
    } else {
      // Use plain text for SMS
      messageBody = `Hi ${teamMember.name}! This is a reminder from ${team?.name || 'your company'}. Visit your Compliancechimp profile for training content and surveys: https://compliancechimp.com/user?member-id=${teamMember.id}`;
    }
    
    return await sendMessage(teamMember, team, messageBody);
  }
);

/**
 * Send welcome messages to all team members who haven't received one yet.
 * Called when completing onboarding Step 3 or manually from the team page.
 */
export const sendPendingWelcomeMessages = onCall(
  { secrets: [sendgridApiKey, twilioAccountSid, twilioAuthToken] },
  async (request) => {
    const { teamId } = request.data as any;
    
    if (!teamId) {
      throw new HttpsError('invalid-argument', 'Team ID is required');
    }
    
    const db = admin.firestore();
    
    // Get team info
    const teamDoc = await db.doc(`team/${teamId}`).get();
    const team = teamDoc.data();
    
    if (!team) {
      throw new HttpsError('not-found', 'Team not found');
    }
    
    // Get all team members who haven't received welcome messages
    const pendingMembersSnapshot = await db.collection('team-members')
      .where('teamId', '==', teamId)
      .where('welcomeSent', '==', false)
      .get();
    
    if (pendingMembersSnapshot.empty) {
      return { success: true, sent: 0, message: 'No pending welcome messages' };
    }
    
    let sent = 0;
    let errors: string[] = [];
    
    for (const memberDoc of pendingMembersSnapshot.docs) {
      const memberData = memberDoc.data() as any;
      const teamMember = { ...memberData, id: memberDoc.id };
      
      // Skip if no contact info
      if (!teamMember.phone && !teamMember.email) {
        errors.push(`${teamMember.name}: No contact info`);
        continue;
      }
      
      try {
        let messageBody: string;
        if (teamMember.preferEmail) {
          const emailHtml = getEmail("add-team-member");
          messageBody = emailHtml
            .split("{{recipientName}}")
            .join(teamMember.name)
            .split("{{userId}}")
            .join(teamMember.id);
        } else {
          messageBody = `Hi ${teamMember.name}! You've been added to ${team.name || 'your company'}'s Compliancechimp account. Visit your profile for training content and surveys: https://compliancechimp.com/user?member-id=${teamMember.id}`;
        }
        
        await sendMessage(teamMember, team, messageBody);
        
        // Mark as sent
        await memberDoc.ref.update({
          welcomeSent: true,
          welcomeSentAt: new Date()
        });
        
        sent++;
      } catch (err: any) {
        errors.push(`${teamMember.name}: ${err.message}`);
      }
    }
    
    console.log(`Sent ${sent} welcome messages for team ${teamId}`);
    
    return { 
      success: true, 
      sent, 
      total: pendingMembersSnapshot.size,
      errors: errors.length > 0 ? errors : undefined
    };
  }
);

export const resendSurveyNotification = onCall(
  { secrets: [sendgridApiKey, twilioAccountSid, twilioAuthToken] },
  async (request) => {
    const { teamMember, survey, team } = request.data as any;
    
    const surveyTitle = survey?.title || 'a survey';
    const teamName = team?.name || 'your company';
    
    let messageBody: string;
    if (teamMember.preferEmail) {
      // HTML email for survey reminder
      messageBody = `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #1a5a96; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
            .content { background: #f8f9fa; padding: 20px; border-radius: 0 0 8px 8px; }
            .button { display: inline-block; background: #ff9800; color: white; padding: 12px 24px; text-decoration: none; border-radius: 24px; font-weight: bold; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h2>Survey Reminder</h2>
            </div>
            <div class="content">
              <p>Hi ${teamMember.name},</p>
              <p>This is a reminder from <strong>${teamName}</strong> that you have an outstanding survey waiting for your response:</p>
              <p><strong>${surveyTitle}</strong></p>
              <p>Please take a moment to complete this survey at your earliest convenience.</p>
              <p style="text-align: center; margin: 24px 0;">
                <a href="https://compliancechimp.com/user?member-id=${teamMember.id}" class="button">Complete Survey</a>
              </p>
              <p>Thank you,<br>The Compliancechimp Team</p>
            </div>
          </div>
        </body>
        </html>
      `;
    } else {
      // Plain text for SMS
      messageBody = `Hi ${teamMember.name}. Reminder from ${teamName}: You have an outstanding survey "${surveyTitle}" waiting for your response. Please complete it here: https://compliancechimp.com/user?member-id=${teamMember.id}`;
    }
    
    return await sendMessage(teamMember, team, messageBody);
  }
);

import * as fs from "fs";
import path = require("path");

export function getEmail(location: string) {
  return fs
    .readFileSync(path.resolve(`src/email-templates/user/${location}.html`))
    .toString();
}

function sendMessage(teamMember: any, team: any, body: string) {
  if (teamMember.preferEmail) {
      const client = createSendgridClient();
      const mailOptions: any = {
        from: '"ComplianceChimp" <support@compliancechimp.com>',
        to: teamMember.email
      };
      mailOptions.subject = `Message from ComplianceChimp`;
      mailOptions.html = body || 'hi';
      return client
              .sendMail(mailOptions)
              .then(() =>
                console.log(`New tribute creation email sent to: ${teamMember.email}`)
              )
              .catch((error: any) =>
                console.error(
                  `An error occurred sending email to ${
                    teamMember.email
                  }. Error: ${JSON.stringify(error)}`
                )
              );
  } else {
    console.log('texting');
    
    // Use secrets from environment variables
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const twilioClient = require('twilio')(accountSid, authToken);
    return twilioClient.messages
    .create({
      body: body,
      from: '+12064389741',
      to: `+1${teamMember.phone}`
    })
    .then((message: any) => {
      console.log(message.sid);
    });
  }
}

/*  ---------- Achievements ----------  */

function updateCompletedAchievement(
  teamId: string,
  mapKey: string,
  value: any,
  sum?: boolean
): Promise<any> {
  return admin
    .firestore()
    .collection("completed-achievement")
    .where("teamId", "==", teamId)
    .get()
    .then(querySnapshot => {
      querySnapshot.forEach(doc => {
        // should only be one, can't think of a better way
        const docData = doc.data();
        let obj: any = {};
        obj[mapKey] = sum ? docData[mapKey] + value : value;
        return admin
          .firestore()
          .doc("completed-achievement/" + doc.id)
          .update(obj);
      });
    })
    .catch(error => {
      return console.log("Error getting documents: ", error);
    });
}

/*  ---------- EVENTS ----------  */

function logAsEvent(
  type: string,
  action: string,
  documentId: string,
  userId: string,
  description: string,
  teamId: string
): Promise<void> {
  let createdAt = new Date();
  let event: EventLog = {
    type,
    action,
    documentId,
    userId,
    description,
    createdAt
  };
  return admin
    .firestore()
    .collection(`team/${teamId}/event`)
    .add(event)
    .then(newEvent => {
      console.log(`event created: ${newEvent.id}`);
    });
}

// Import niche industries for blog generation
import { NICHE_INDUSTRIES, NicheIndustry, getRandomAvailableIndustry } from './niche-industries';

/**
 * Daily scheduled function to generate SEO-optimized blog posts
 * targeting niche OSHA compliance industries.
 * Runs at 9 AM Central Time (15:00 UTC) daily.
 */
export const generateDailyBlog = onSchedule(
  { 
    schedule: '0 15 * * *',  // 9:00 AM Central Time (UTC-6) = 15:00 UTC
    secrets: [xaiApiKey],
    timeoutSeconds: 300,
    memory: "1GiB"
  },
  async (event) => {
    console.log('Starting daily blog generation...');
    await generateDailyBlogPost();
  }
);

/**
 * Generate a blog post for a niche industry that hasn't been covered in the last 6 months.
 * Saves the generated blog to Firestore for display on the public blog page.
 */
async function generateDailyBlogPost(): Promise<void> {
  const db = admin.firestore();
  
  try {
    // Query blogs from last 6 months to avoid duplicates
    const sixMonthsAgo = moment().subtract(6, 'months').toDate();
    const recentBlogs = await db.collection('blog')
      .where('generatedAt', '>=', sixMonthsAgo)
      .get();

    const usedIndustryIds = new Set<string>(
      recentBlogs.docs.map(d => d.data().industryId).filter(id => id)
    );

    console.log(`Found ${usedIndustryIds.size} industries used in the last 6 months`);

    // Get a random available industry
    const selectedIndustry = getRandomAvailableIndustry(usedIndustryIds);

    if (!selectedIndustry) {
      console.log('All industries have been covered in the last 6 months. Selecting random industry for fresh content.');
      // If all industries have been used, pick a completely random one for fresh content
      const randomIndex = Math.floor(Math.random() * NICHE_INDUSTRIES.length);
      const industry = NICHE_INDUSTRIES[randomIndex];
      await generateAndSaveBlogPost(db, industry);
    } else {
      console.log(`Selected industry: ${selectedIndustry.name}`);
      await generateAndSaveBlogPost(db, selectedIndustry);
    }
  } catch (error) {
    console.error('Error in generateDailyBlogPost:', error);
    throw error;
  }
}

/**
 * Generate and save a blog post for the given industry using xAI.
 */
async function generateAndSaveBlogPost(
  db: admin.firestore.Firestore,
  industry: NicheIndustry
): Promise<void> {
  const today = moment().format('YYYY-MM-DD');
  const slug = `osha-compliance-${industry.id}`;

  // Check if this exact slug already exists
  const existingBlog = await db.collection('blog')
    .where('slug', '==', slug)
    .limit(1)
    .get();

  // If slug exists, append date to make it unique
  const finalSlug = existingBlog.empty ? slug : `${slug}-${today}`;

  // Generate the blog content using xAI
  const blogContent = await generateBlogContent(industry);

  if (!blogContent) {
    console.error('Failed to generate blog content for industry:', industry.name);
    return;
  }

  // Calculate read time (average reading speed is ~200 words per minute)
  const wordCount = blogContent.content.split(/\s+/).length;
  const readTime = Math.max(1, Math.ceil(wordCount / 200));

  // Save to Firestore
  const blogDoc = {
    slug: finalSlug,
    title: blogContent.title,
    description: blogContent.description,
    category: 'OSHA',
    industry: industry.name,
    industryId: industry.id,
    publishedDate: today,
    readTime: `${readTime} min read`,
    content: blogContent.content,
    keywords: [...industry.keywords, 'OSHA compliance', 'safety training', 'workplace safety'],
    generatedAt: admin.firestore.FieldValue.serverTimestamp(),
    parentCategory: industry.parentCategory,
    oshaStandards: industry.oshaStandards,
    hazards: industry.hazards,
    author: 'The Chimp'
  };

  await db.collection('blog').add(blogDoc);
  console.log(`Successfully generated and saved blog post: ${finalSlug}`);
}

/**
 * Call xAI to generate SEO-optimized landing page content for industry niches.
 */
async function generateBlogContent(
  industry: NicheIndustry
): Promise<{ title: string; description: string; content: string } | null> {
  try {
    const response = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.XAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'grok-3-fast',
        messages: [
          {
            role: 'system',
            content: `You are a direct-response copywriter creating landing pages for Compliancechimp, an OSHA compliance software for small businesses.

## YOUR GOAL
Create a landing page that ranks for "${industry.keywords[0]}" and converts visitors into users. This is NOT a blog post. It's a conversion-focused landing page disguised as helpful content.

## CRITICAL WRITING RULES (VIOLATIONS WILL BE REJECTED)
1. NEVER use em dashes (—). Not once. Use commas or periods instead.
2. NEVER use phrases like: "picture this", "imagine", "let's dive in", "here's the thing", "the reality is", "at the end of the day"
3. NEVER start with a gimmicky hook or rhetorical question
4. NEVER be cutesy, playful, or use mascot-style personality
5. Write like a knowledgeable industry peer, not a marketer
6. Every paragraph must provide concrete value or drive toward conversion
7. No filler content. If a sentence doesn't add value or push toward conversion, delete it.

## TONE
- Professional but accessible
- Confident and authoritative
- Helpful without being condescending
- Direct. Get to the point.

## PAGE STRUCTURE (follow this exactly)

### Opening (2-3 sentences max)
State what this page covers and why it matters. No fluff. Example: "OSHA requires [industry] businesses to comply with specific safety standards. Non-compliance can result in fines up to $156,259 per willful violation. Here's what you need to know and how to get compliant fast."

### OSHA Requirements for [Industry]
- List the specific OSHA standards that apply (use actual CFR numbers)
- Explain each requirement in plain language
- Be specific about what's required (training topics, documentation, inspections)

### Common Hazards and How to Address Them
For each hazard:
- What the hazard is
- The specific OSHA standard
- What compliance looks like in practice

### The Compliance Checklist
A scannable checklist of everything they need:
- Training requirements
- Documentation requirements  
- Inspection requirements
- Recordkeeping requirements

### How Compliancechimp Works for [Industry]
Position features as solutions to their specific problems:

**Training on Autopilot**: Trainings are automatically assigned and delivered to your team. You set it up once, and it runs itself. Relevant topics for [industry] include [specific examples].

**Guided Self-Inspections**: Pre-built inspection checklists for [industry-specific hazards]. Walk through them on your phone, document issues with photos, and maintain a permanent record.

**Compliance Records Forever**: Every training completion, inspection, and incident report is stored permanently. When OSHA asks for documentation, you pull it up in seconds.

**The 6-Minute Setup**: Answer a few questions about your business, and Compliancechimp builds your compliance program automatically. Most businesses are fully set up in under 6 minutes.

### Get Started
Clear CTA: "Start your 14-day free trial at [compliancechimp.com/get-started](/get-started). $99/month after. No credit card required to start."

## OUTPUT FORMAT
Return a JSON object:
{
  "title": "[Industry] OSHA Compliance: Requirements & How to Get Compliant (under 60 chars)",
  "description": "OSHA compliance requirements for [industry]. Learn what standards apply, common violations, and how to get compliant in 6 minutes. (under 155 chars)",
  "content": "Full markdown content"
}

## MARKDOWN RULES
- Use ## for H2 headings
- Use ### for H3 headings
- Use **bold** for key terms
- Use - for bullet lists
- Use ✓ for feature lists
- Use [text](/path) for links
- NO horizontal rules (---)
- Target 1000-1200 words. Quality over quantity.`
          },
          {
            role: 'user',
            content: `Create a landing page for:

INDUSTRY: ${industry.name}
HAZARDS: ${industry.hazards.join(', ')}
OSHA STANDARDS: ${industry.oshaStandards.join(', ')}
TARGET KEYWORD: ${industry.keywords[0]}

Remember:
- No em dashes
- No gimmicky phrases
- No personality or mascot voice
- Direct, useful, conversion-focused
- Every sentence must provide value or drive action`
          }
        ],
        temperature: 0.5
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Grok API error:', errorText);
      return null;
    }

    const grokResponse: any = await response.json();
    const aiMessage = grokResponse.choices?.[0]?.message?.content || '{}';

    // Parse the AI response using regex extraction (more reliable than JSON.parse for multiline content)
    const titleMatch = aiMessage.match(/"title"\s*:\s*"([^"]+)"/);
    const title = titleMatch ? titleMatch[1] : `OSHA Compliance for ${industry.name}: A Complete Guide`;
    
    const descMatch = aiMessage.match(/"description"\s*:\s*"([^"]+)"/);
    const description = descMatch ? descMatch[1] : `Learn how ${industry.name.toLowerCase()} can achieve OSHA compliance, avoid fines, and protect workers.`;
    
    // Extract content - everything after "content": " until the closing
    const contentMatch = aiMessage.match(/"content"\s*:\s*"([\s\S]*)/);
    let content = '';
    if (contentMatch) {
      content = contentMatch[1]
        .replace(/"\s*\}?\s*$/, '')  // Remove trailing "}
        .replace(/\\n/g, '\n')        // Convert \n to newlines
        .replace(/\\"/g, '"')         // Convert \" to "
        .replace(/\\\\/g, '\\')       // Convert \\ to \
        .trim();
    }
    
    if (!content) {
      console.error('Could not extract content from AI response');
      return null;
    }

    return { title, description, content };
  } catch (error) {
    console.error('Error calling xAI API:', error);
    return null;
  }
}

/**
 * Dynamic sitemap generator for SEO.
 * Generates an XML sitemap that includes all static pages and dynamic blog posts.
 * This ensures search engines can discover new blog posts automatically.
 */
export const sitemap = onRequest(
  {
    cors: true,
  },
  async (req, res) => {
    const db = admin.firestore();
    const baseUrl = 'https://compliancechimp.com';
    
    // Static pages with their priorities and change frequencies
    const staticPages = [
      { loc: '/home', changefreq: 'weekly', priority: '1.0' },
      { loc: '/plans', changefreq: 'monthly', priority: '0.9' },
      { loc: '/how-it-works', changefreq: 'monthly', priority: '0.8' },
      { loc: '/common-questions', changefreq: 'monthly', priority: '0.7' },
      { loc: '/contact', changefreq: 'monthly', priority: '0.6' },
      { loc: '/blog', changefreq: 'daily', priority: '0.8' },
      { loc: '/get-started', changefreq: 'monthly', priority: '0.8' },
      { loc: '/terms-of-service', changefreq: 'yearly', priority: '0.3' },
      { loc: '/privacy-policy', changefreq: 'yearly', priority: '0.3' },
      { loc: '/customer-agreement', changefreq: 'yearly', priority: '0.3' },
    ];

    try {
      // Fetch all published blog posts
      const blogSnapshot = await db.collection('blog').get();
      const blogPosts: Array<{ slug: string; publishedDate: string }> = [];
      
      blogSnapshot.forEach((doc) => {
        const data = doc.data();
        if (data.slug && data.title) {
          blogPosts.push({
            slug: data.slug,
            publishedDate: data.publishedDate || new Date().toISOString().split('T')[0],
          });
        }
      });

      // Build XML sitemap
      let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
      xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';

      // Add static pages
      for (const page of staticPages) {
        xml += '  <url>\n';
        xml += `    <loc>${baseUrl}${page.loc}</loc>\n`;
        xml += `    <changefreq>${page.changefreq}</changefreq>\n`;
        xml += `    <priority>${page.priority}</priority>\n`;
        xml += '  </url>\n';
      }

      // Add blog posts
      for (const post of blogPosts) {
        xml += '  <url>\n';
        xml += `    <loc>${baseUrl}/blog/${post.slug}</loc>\n`;
        xml += `    <lastmod>${post.publishedDate}</lastmod>\n`;
        xml += '    <changefreq>monthly</changefreq>\n';
        xml += '    <priority>0.7</priority>\n';
        xml += '  </url>\n';
      }

      xml += '</urlset>';

      // Set appropriate headers
      res.set('Content-Type', 'application/xml; charset=utf-8');
      res.set('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
      res.status(200).send(xml);
    } catch (error) {
      console.error('Error generating sitemap:', error);
      res.status(500).send('Error generating sitemap');
    }
  }
);

/**
 * One-time seed function to migrate the initial blog post to Firestore.
 * This can be called once to populate the blog collection with the first post.
 * After running, this function is no longer needed.
 */
export const seedInitialBlogPost = onCall(
  {},
  async (request) => {
    const db = admin.firestore();
    
    // Check if the blog already exists
    const existingBlog = await db.collection('blog')
      .where('slug', '==', 'osha-compliance-monument-headstone-makers')
      .limit(1)
      .get();
    
    if (!existingBlog.empty) {
      return { success: false, message: 'Blog post already exists' };
    }
    
    // The original hardcoded blog post content
    const initialBlogPost = {
      slug: 'osha-compliance-monument-headstone-makers',
      title: 'OSHA Compliance for Monument & Headstone Makers: A Complete Guide',
      description: 'Learn how monument and headstone makers can achieve OSHA compliance, avoid costly fines, and protect their workers from silica dust, heavy lifting injuries, and equipment hazards.',
      category: 'OSHA',
      industry: 'Monument & Headstone',
      industryId: 'headstone-monument-shops',
      publishedDate: '2026-01-19',
      readTime: '8 min read',
      content: `
## Why OSHA Compliance Matters for Monument & Headstone Makers

If you're running a monument or headstone business, you already know the work is demanding. Between sandblasting, engraving, lifting heavy stone, and operating cutting equipment—there's a lot that can go wrong. OSHA knows it too.

The monument and memorial industry falls under OSHA's general industry standards, and many shops also face requirements from the **Respirable Crystalline Silica standard (29 CFR 1926.1153)**—one of OSHA's most heavily enforced regulations in recent years.

The stakes are real:
- **First-time violations** can cost up to **$15,625 per violation**
- **Willful or repeated violations** can reach **$156,259 per violation**
- **Silica-related illnesses** like silicosis are preventable but irreversible

The good news? Compliance doesn't have to be complicated. Let's break down what you need to know.

---

## The Big Three Hazards in Monument Work

### 1. Respirable Crystalline Silica

When you cut, grind, sandblast, or polish granite, marble, or other natural stone, you release fine silica dust into the air. This dust is invisible, and when inhaled over time, causes silicosis—a serious and incurable lung disease.

**What OSHA requires:**
- Keep worker exposure below the Permissible Exposure Limit (PEL) of **50 micrograms per cubic meter** averaged over an 8-hour shift
- Use engineering controls like **wet cutting methods** or **local exhaust ventilation**
- Provide **respiratory protection** when controls aren't sufficient
- Offer **medical surveillance** for workers exposed at or above the action level
- Train workers on silica hazards and protective measures

**Practical tip:** Many shops use water-fed tools and downdraft tables to control dust at the source. This is far more effective (and comfortable for workers) than relying solely on respirators.

### 2. Heavy Lifting & Material Handling

Headstones and monuments are heavy—often hundreds or even thousands of pounds. Moving them creates risks for:
- Back injuries from improper lifting
- Crushing injuries from falling stone
- Strain injuries from repetitive motions

**What OSHA requires:**
- Train workers on **safe lifting techniques**
- Provide mechanical aids like **forklifts, cranes, hoists, or carts**
- Ensure equipment is **regularly inspected and maintained**
- Keep walkways and work areas **clear and organized**

### 3. Equipment & Machine Guarding

Saws, grinders, polishers, and sandblasting equipment all present serious hazards if not properly guarded and maintained.

**What OSHA requires:**
- **Machine guards** on all moving parts
- **Lockout/Tagout (LOTO) procedures** for equipment maintenance
- **Personal Protective Equipment (PPE)** including safety glasses, gloves, and hearing protection
- Regular **equipment inspection and maintenance logs**

---

## Building Your Compliance Program

Here's a step-by-step approach to getting your shop compliant:

### Step 1: Conduct a Hazard Assessment

Walk through your shop and identify every task that could expose workers to harm. Document:
- What hazards exist
- Who is exposed
- What controls are currently in place
- What gaps need to be addressed

### Step 2: Implement Engineering Controls

Prioritize controls that eliminate or reduce hazards at the source:
- Wet cutting and grinding
- Ventilation systems with HEPA filtration
- Enclosed sandblasting cabinets
- Mechanical lifting equipment

### Step 3: Establish Written Programs

OSHA requires written programs for:
- **Hazard Communication** (chemical safety)
- **Respiratory Protection** (if respirators are used)
- **Silica Exposure Control Plan**
- **Lockout/Tagout**

These don't need to be complicated, but they must be documented and accessible to workers.

### Step 4: Train Your Team

Training must cover:
- Specific hazards in your workplace
- How to use controls and PPE properly
- Emergency procedures
- How to report hazards or injuries

**Pro tip:** Document every training session with the date, topics covered, and attendee signatures. This creates a defensible record if OSHA comes knocking.

### Step 5: Keep Records

OSHA requires you to maintain records of:
- Workplace injuries and illnesses (OSHA 300 Log)
- Training sessions
- Equipment inspections
- Exposure monitoring results (for silica)
- Medical surveillance (for silica-exposed workers)

---

## How Compliancechimp Helps

We built Compliancechimp specifically for small businesses like monument shops—teams that need to stay compliant but don't have a full-time safety manager.

Here's what you get:

✓ **Guided self-inspections** tailored to your industry  
✓ **Training content library** with articles directly from OSHA  
✓ **Survey system** to verify workers received and understood training  
✓ **Incident reporting** for near misses and injuries  
✓ **Permanent records** stored securely forever  
✓ **Smart reminders** so nothing falls through the cracks

Everything lives in one place—your "back office"—so when an OSHA inspector shows up, you can pull up your complete compliance history in seconds.

---

## Getting Started

OSHA compliance might feel overwhelming, but it doesn't have to be. Start with the basics:

1. **Control silica dust** with wet methods or ventilation
2. **Use mechanical aids** for heavy lifting
3. **Guard your equipment** and train workers on safe operation
4. **Document everything** in a system you can actually maintain

Ready to simplify compliance for your monument shop? [Start your 14-day free trial](/get-started) and see how Compliancechimp can help you protect your workers and your business.

---

*Have questions about OSHA compliance for monument and headstone makers? [Contact us](/contact)—we're here to help.*
      `,
      keywords: [
        'headstone shop OSHA',
        'monument maker safety',
        'memorial stone compliance',
        'gravestone manufacturing regulations',
        'OSHA compliance',
        'safety training',
        'workplace safety'
      ],
      generatedAt: admin.firestore.FieldValue.serverTimestamp(),
      parentCategory: 'Manufacturing',
      oshaStandards: ['29 CFR 1926.1153', '29 CFR 1910.134', '29 CFR 1910.212', '29 CFR 1910.176'],
      hazards: ['respirable crystalline silica', 'heavy lifting', 'sandblasting hazards', 'cutting equipment', 'dust exposure'],
      author: 'The Chimp'
    };
    
    await db.collection('blog').add(initialBlogPost);
    
    return { success: true, message: 'Initial blog post seeded successfully' };
  }
);

/**
 * HTTP function to manually trigger blog generation multiple times.
 * Useful for bulk generation of blog content.
 * Usage: curl "https://us-central1-teamlog-2d74c.cloudfunctions.net/generateBlogPosts?count=10&key=chimp2024"
 */
export const generateBlogPosts = onRequest(
  {
    secrets: [xaiApiKey],
    timeoutSeconds: 540,
    memory: "1GiB"
  },
  async (req, res) => {
    // Simple API key check to prevent abuse
    const apiKey = req.query.key;
    if (apiKey !== 'chimp2024') {
      res.status(403).json({ error: 'Invalid API key' });
      return;
    }
    
    const count = parseInt(req.query.count as string) || 1;
    const maxCount = Math.min(count, 20); // Cap at 20 to prevent abuse
    
    console.log(`Starting bulk blog generation for ${maxCount} posts...`);
    
    const results: Array<{ success: boolean; message: string }> = [];
    
    for (let i = 0; i < maxCount; i++) {
      try {
        console.log(`Generating blog post ${i + 1} of ${maxCount}...`);
        await generateDailyBlogPost();
        results.push({ success: true, message: `Post ${i + 1} generated successfully` });
        
        // Small delay between generations to avoid rate limiting
        if (i < maxCount - 1) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      } catch (error: any) {
        console.error(`Error generating post ${i + 1}:`, error);
        results.push({ success: false, message: `Post ${i + 1} failed: ${error.message}` });
      }
    }
    
    const successCount = results.filter(r => r.success).length;
    res.json({ 
      success: successCount > 0,
      message: `Generated ${successCount} of ${maxCount} blog posts`,
      results 
    });
  }
);

// Contact form submission handler
export const sendContactMessage = onCall(
  {
    secrets: [sendgridApiKey]
  },
  async (request) => {
    const { name, email, phone, company, message } = request.data as {
      name: string;
      email: string;
      phone?: string;
      company?: string;
      message: string;
    };

    // Validate required fields
    if (!name || !email || !message) {
      throw new HttpsError('invalid-argument', 'Name, email, and message are required');
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw new HttpsError('invalid-argument', 'Invalid email address');
    }

    const client = createSendgridClient();
    const timestamp = new Date().toLocaleString('en-US', { 
      timeZone: 'America/Denver',
      dateStyle: 'full',
      timeStyle: 'long'
    });

    const mailOptions = {
      from: '"Compliancechimp Contact Form" <support@compliancechimp.com>',
      to: 'support@compliancechimp.com',
      replyTo: email,
      subject: `Contact Form: ${name}${company ? ` from ${company}` : ''}`,
      html: `
        <h2>New Contact Form Submission</h2>
        <p><strong>Date:</strong> ${timestamp}</p>
        <hr>
        <p><strong>Name:</strong> ${name}</p>
        <p><strong>Email:</strong> <a href="mailto:${email}">${email}</a></p>
        ${phone ? `<p><strong>Phone:</strong> <a href="tel:${phone}">${phone}</a></p>` : ''}
        ${company ? `<p><strong>Company:</strong> ${company}</p>` : ''}
        <hr>
        <h3>Message:</h3>
        <p style="white-space: pre-wrap;">${message}</p>
      `
    };

    try {
      await client.sendMail(mailOptions);
      console.log(`Contact form submission from ${email} sent successfully`);
      
      // Store the contact submission in Firestore for record-keeping
      const db = admin.firestore();
      await db.collection('contactSubmissions').add({
        name,
        email,
        phone: phone || null,
        company: company || null,
        message,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        status: 'new'
      });
      
      return { success: true, message: 'Contact message sent successfully' };
    } catch (error: any) {
      console.error('Error sending contact form email:', error);
      throw new HttpsError('internal', 'Failed to send contact message');
    }
  }
);

export class EventLog {
  type!: string;
  action!: string;
  createdAt!: Date;
  userId!: string;
  description!: string;
  documentId!: string;
}

enum EventType {
  log = "Log",
  timeclock = "Timeclock",
  incidentReport = "Incident Report",
  survey = "Survey",
  surveyResponse = "Survey",
  selfInspection = "Self Inspection",
  training = "Training",
  member = "New Member",
  customContent = "Custom training article"
}

enum EventAction {
  created = "created",
  updated = "updated",
  deleted = "deleted",
  respond = "responded to",
  completed = "completed"
}

// Delete a team completely including all related data and authentication users
export const deleteTeamCompletely = onCall(
  {
    timeoutSeconds: 300,
    memory: "512MiB"
  },
  async (request) => {
    const { teamId } = request.data as any;

    if (!teamId) {
      throw new HttpsError('invalid-argument', 'Team ID is required');
    }

    const db = admin.firestore();
    const batch = db.batch();
    const deletionResults = {
      teamMembers: 0,
      users: 0,
      logs: 0,
      files: 0,
      surveys: 0,
      selfInspections: 0,
      topics: 0,
      articles: 0,
      events: 0,
      library: 0,
      authUsers: 0,
      trainingContent: 0
    };

    try {
      // Get the team document first
      const teamDoc = await db.doc(`team/${teamId}`).get();
      if (!teamDoc.exists) {
        throw new HttpsError('not-found', 'Team not found');
      }
      const teamData = teamDoc.data();

      // Helper function to delete all documents in a collection
      async function deleteCollection(collectionRef: FirebaseFirestore.CollectionReference, batchLimit = 100): Promise<number> {
        let deleted = 0;
        let snapshot = await collectionRef.limit(batchLimit).get();
        
        while (!snapshot.empty) {
          const localBatch = db.batch();
          snapshot.docs.forEach(doc => {
            localBatch.delete(doc.ref);
            deleted++;
          });
          await localBatch.commit();
          snapshot = await collectionRef.limit(batchLimit).get();
        }
        
        return deleted;
      }

      // Helper function to delete a subcollection with nested subcollections
      async function deleteSubcollectionWithNested(
        parentPath: string, 
        subcollectionName: string, 
        nestedSubcollections: string[] = []
      ): Promise<number> {
        let deleted = 0;
        const subcollectionRef = db.collection(`${parentPath}/${subcollectionName}`);
        const snapshot = await subcollectionRef.get();
        
        for (const doc of snapshot.docs) {
          // Delete nested subcollections first
          for (const nestedName of nestedSubcollections) {
            const nestedRef = db.collection(`${doc.ref.path}/${nestedName}`);
            await deleteCollection(nestedRef);
          }
          await doc.ref.delete();
          deleted++;
        }
        
        return deleted;
      }

      // 1. Delete team members (from team-members collection where teamId matches)
      const teamMembersSnapshot = await db.collection('team-members').where('teamId', '==', teamId).get();
      for (const doc of teamMembersSnapshot.docs) {
        await doc.ref.delete();
        deletionResults.teamMembers++;
      }

      // 2. Delete users (managers) and their authentication accounts
      const usersSnapshot = await db.collection('user').where('teamId', '==', teamId).get();
      for (const userDoc of usersSnapshot.docs) {
        const userData = userDoc.data();
        
        // Try to delete from Firebase Authentication
        if (userData.email) {
          try {
            const userRecord = await admin.auth().getUserByEmail(userData.email);
            await admin.auth().deleteUser(userRecord.uid);
            deletionResults.authUsers++;
            console.log(`Deleted auth user: ${userData.email}`);
          } catch (authError: any) {
            // User might not exist in auth, log but continue
            console.log(`Could not delete auth user ${userData.email}: ${authError.message}`);
          }
        }
        
        await userDoc.ref.delete();
        deletionResults.users++;
      }

      // 3. Delete team owner's auth account if different from users
      if (teamData?.ownerId) {
        try {
          await admin.auth().deleteUser(teamData.ownerId);
          deletionResults.authUsers++;
          console.log(`Deleted team owner auth: ${teamData.ownerId}`);
        } catch (authError: any) {
          console.log(`Could not delete team owner ${teamData.ownerId}: ${authError.message}`);
        }
      }

      // 4. Delete library items for this team
      const librarySnapshot = await db.collection('library').where('teamId', '==', teamId).get();
      for (const doc of librarySnapshot.docs) {
        await doc.ref.delete();
        deletionResults.library++;
      }

      // 5. Delete team subcollections
      const teamPath = `team/${teamId}`;

      // Delete logs
      deletionResults.logs = await deleteCollection(db.collection(`${teamPath}/log`));

      // Delete files
      deletionResults.files = await deleteCollection(db.collection(`${teamPath}/file`));

      // Delete surveys
      deletionResults.surveys = await deleteCollection(db.collection(`${teamPath}/survey`));

      // Delete self-inspections (with nested inspections subcollection)
      deletionResults.selfInspections = await deleteSubcollectionWithNested(
        teamPath, 
        'self-inspection', 
        ['inspections']
      );

      // Delete topics
      deletionResults.topics = await deleteCollection(db.collection(`${teamPath}/topic`));

      // Delete articles
      deletionResults.articles = await deleteCollection(db.collection(`${teamPath}/article`));

      // Delete my-training-content
      deletionResults.trainingContent = await deleteCollection(db.collection(`${teamPath}/my-training-content`));

      // Delete events
      deletionResults.events = await deleteCollection(db.collection(`${teamPath}/event`));

      // 6. Finally, delete the team document itself
      await db.doc(teamPath).delete();

      console.log(`Team ${teamId} deleted completely:`, deletionResults);

      return {
        success: true,
        message: 'Team deleted successfully',
        deletionResults
      };
    } catch (error: any) {
      console.error('Error deleting team:', error);
      throw new HttpsError('internal', `Failed to delete team: ${error.message}`);
    }
  }
);
