import { onCall, onRequest, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import * as admin from "firebase-admin";

// Define secrets for QuickBooks OAuth
const quickbooksClientId = defineSecret("QUICKBOOKS_CLIENT_ID");
const quickbooksClientSecret = defineSecret("QUICKBOOKS_CLIENT_SECRET");

// QuickBooks OAuth endpoints
const QB_AUTH_URL = "https://appcenter.intuit.com/connect/oauth2";
const QB_TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
const QB_API_BASE_URL = "https://quickbooks.api.intuit.com";

// Redirect URI - must match what's configured in QuickBooks Developer Portal
const REDIRECT_URI = "https://us-central1-teamlog-2d74c.cloudfunctions.net/quickbooksOAuthCallback";
const DEFAULT_APP_URL = "https://compliancechimp.com";

interface QuickBooksTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  x_refresh_token_expires_in: number;
}

interface QuickBooksEmployee {
  Id: string;
  DisplayName?: string;
  GivenName?: string;
  FamilyName?: string;
  PrimaryPhone?: {
    FreeFormNumber?: string;
  };
  PrimaryEmailAddr?: {
    Address?: string;
  };
  Title?: string;
  Active?: boolean;
}

interface SyncResult {
  success: boolean;
  added: number;
  skipped: number;
  errors: string[];
}

/**
 * Generate OAuth authorization URL for QuickBooks
 * Called from frontend to initiate the OAuth flow
 */
export const getQuickBooksAuthUrl = onCall(
  { secrets: [quickbooksClientId] },
  async (request) => {
    const { teamId, returnUrl } = request.data as { teamId: string; returnUrl?: string };

    if (!teamId) {
      throw new HttpsError("invalid-argument", "Team ID is required");
    }

    // Create state parameter with teamId and returnUrl for security and to identify the team after callback
    const state = Buffer.from(JSON.stringify({ 
      teamId, 
      timestamp: Date.now(),
      returnUrl: returnUrl || DEFAULT_APP_URL
    })).toString("base64");

    const params = new URLSearchParams({
      client_id: process.env.QUICKBOOKS_CLIENT_ID || "",
      response_type: "code",
      scope: "com.intuit.quickbooks.accounting",
      redirect_uri: REDIRECT_URI,
      state: state,
    });

    const authUrl = `${QB_AUTH_URL}?${params.toString()}`;

    return { authUrl };
  }
);

/**
 * OAuth callback endpoint - handles the redirect from QuickBooks after user authorization
 */
export const quickbooksOAuthCallback = onRequest(
  { secrets: [quickbooksClientId, quickbooksClientSecret] },
  async (req, res) => {
    const { code, state, realmId, error } = req.query;

    // Decode state first to get returnUrl for error redirects
    let returnUrl = DEFAULT_APP_URL;
    let teamId: string | undefined;
    
    if (state) {
      try {
        const stateData = JSON.parse(Buffer.from(state as string, "base64").toString());
        returnUrl = stateData.returnUrl || DEFAULT_APP_URL;
        teamId = stateData.teamId;
      } catch (e) {
        // Ignore parse errors, use defaults
      }
    }

    // Handle OAuth errors
    if (error) {
      console.error("QuickBooks OAuth error:", error);
      res.redirect(`${returnUrl}/account/team?qb_error=${encodeURIComponent(error as string)}`);
      return;
    }

    if (!code || !state || !realmId) {
      console.error("Missing required OAuth parameters");
      res.redirect(`${returnUrl}/account/team?qb_error=missing_parameters`);
      return;
    }

    try {
      // Decode and validate state
      const stateData = JSON.parse(Buffer.from(state as string, "base64").toString());
      const timestamp = stateData.timestamp;
      teamId = stateData.teamId;
      returnUrl = stateData.returnUrl || DEFAULT_APP_URL;

      // Check state is not too old (15 minutes)
      if (Date.now() - timestamp > 15 * 60 * 1000) {
        throw new Error("OAuth state expired");
      }

      // Exchange authorization code for tokens
      const tokenResponse = await fetch(QB_TOKEN_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Authorization": `Basic ${Buffer.from(
            `${process.env.QUICKBOOKS_CLIENT_ID}:${process.env.QUICKBOOKS_CLIENT_SECRET}`
          ).toString("base64")}`,
          "Accept": "application/json",
        },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code: code as string,
          redirect_uri: REDIRECT_URI,
        }).toString(),
      });

      if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text();
        console.error("Token exchange failed:", errorText);
        throw new Error("Failed to exchange authorization code");
      }

      const tokens = await tokenResponse.json() as QuickBooksTokenResponse;

      // Calculate token expiration time
      const tokenExpiresAt = new Date(Date.now() + tokens.expires_in * 1000);

      // Store QuickBooks connection data on the team document
      await admin.firestore().doc(`team/${teamId}`).update({
        quickbooks: {
          realmId: realmId as string,
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          tokenExpiresAt: tokenExpiresAt,
          connectedAt: new Date(),
        },
      });

      console.log(`QuickBooks connected for team ${teamId}, realmId: ${realmId}`);

      // Redirect back to the app with success
      res.redirect(`${returnUrl}/account/team?qb_connected=true`);
    } catch (err: any) {
      console.error("OAuth callback error:", err);
      res.redirect(`${returnUrl}/account/team?qb_error=${encodeURIComponent(err.message)}`);
    }
  }
);

/**
 * Refresh QuickBooks OAuth tokens
 */
async function refreshQuickBooksToken(teamId: string): Promise<string> {
  const teamDoc = await admin.firestore().doc(`team/${teamId}`).get();
  const team = teamDoc.data();

  if (!team?.quickbooks?.refreshToken) {
    throw new Error("No QuickBooks refresh token found");
  }

  const tokenResponse = await fetch(QB_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Authorization": `Basic ${Buffer.from(
        `${process.env.QUICKBOOKS_CLIENT_ID}:${process.env.QUICKBOOKS_CLIENT_SECRET}`
      ).toString("base64")}`,
      "Accept": "application/json",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: team.quickbooks.refreshToken,
    }).toString(),
  });

  if (!tokenResponse.ok) {
    const errorText = await tokenResponse.text();
    console.error("Token refresh failed:", errorText);
    
    // If refresh fails, the connection is invalid - clear it
    await admin.firestore().doc(`team/${teamId}`).update({
      "quickbooks.accessToken": null,
      "quickbooks.refreshToken": null,
      "quickbooks.tokenExpiresAt": null,
    });
    
    throw new Error("Failed to refresh QuickBooks token - reconnection required");
  }

  const tokens = await tokenResponse.json() as QuickBooksTokenResponse;
  const tokenExpiresAt = new Date(Date.now() + tokens.expires_in * 1000);

  // Update stored tokens
  await admin.firestore().doc(`team/${teamId}`).update({
    "quickbooks.accessToken": tokens.access_token,
    "quickbooks.refreshToken": tokens.refresh_token,
    "quickbooks.tokenExpiresAt": tokenExpiresAt,
  });

  return tokens.access_token;
}

/**
 * Get a valid access token, refreshing if necessary
 */
async function getValidAccessToken(teamId: string): Promise<{ token: string; realmId: string }> {
  const teamDoc = await admin.firestore().doc(`team/${teamId}`).get();
  const team = teamDoc.data();

  if (!team?.quickbooks) {
    throw new Error("QuickBooks not connected");
  }

  const { accessToken, refreshToken, tokenExpiresAt, realmId } = team.quickbooks;

  if (!accessToken || !refreshToken) {
    throw new Error("QuickBooks connection incomplete");
  }

  // Check if token is expired or will expire in the next 5 minutes
  const expiresAt = tokenExpiresAt?.toDate ? tokenExpiresAt.toDate() : new Date(tokenExpiresAt);
  const isExpired = expiresAt.getTime() - Date.now() < 5 * 60 * 1000;

  if (isExpired) {
    const newToken = await refreshQuickBooksToken(teamId);
    return { token: newToken, realmId };
  }

  return { token: accessToken, realmId };
}

/**
 * Fetch employees from QuickBooks
 */
async function fetchQuickBooksEmployees(accessToken: string, realmId: string): Promise<QuickBooksEmployee[]> {
  const query = "SELECT * FROM Employee WHERE Active = true MAXRESULTS 1000";
  const url = `${QB_API_BASE_URL}/v3/company/${realmId}/query?query=${encodeURIComponent(query)}`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Accept": "application/json",
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("QuickBooks API error:", errorText);
    throw new Error(`Failed to fetch employees: ${response.status}`);
  }

  const data = await response.json() as { QueryResponse?: { Employee?: QuickBooksEmployee[] } };
  return data.QueryResponse?.Employee || [];
}

/**
 * Format phone number to standard format
 */
function formatPhoneNumber(phone: string | undefined): string | null {
  if (!phone) return null;
  
  // Remove all non-digits
  const cleaned = phone.replace(/\D/g, "");
  
  // Handle US phone numbers
  if (cleaned.length === 10) {
    return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
  } else if (cleaned.length === 11 && cleaned.startsWith("1")) {
    return `(${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7)}`;
  }
  
  return phone; // Return original if not standard US format
}

/**
 * Sync employees from QuickBooks to team-members collection
 */
export const syncQuickBooksEmployees = onCall(
  { 
    secrets: [quickbooksClientId, quickbooksClientSecret],
    timeoutSeconds: 120,
    memory: "512MiB"
  },
  async (request): Promise<SyncResult> => {
    const { teamId } = request.data as { teamId: string };

    if (!teamId) {
      throw new HttpsError("invalid-argument", "Team ID is required");
    }

    return await syncEmployeesForTeam(teamId);
  }
);

/**
 * Core sync logic - used by both manual and scheduled sync
 */
async function syncEmployeesForTeam(teamId: string): Promise<SyncResult> {
  const result: SyncResult = {
    success: false,
    added: 0,
    skipped: 0,
    errors: [],
  };

  try {
    // Get valid access token
    const { token, realmId } = await getValidAccessToken(teamId);

    // Fetch employees from QuickBooks
    const employees = await fetchQuickBooksEmployees(token, realmId);
    console.log(`Fetched ${employees.length} employees from QuickBooks for team ${teamId}`);

    // Get existing team members to check for duplicates
    const existingMembersSnapshot = await admin.firestore()
      .collection("team-members")
      .where("teamId", "==", teamId)
      .get();

    // Build sets for duplicate detection
    const existingQBIds = new Set<string>();
    const existingEmails = new Set<string>();

    existingMembersSnapshot.docs.forEach((doc) => {
      const member = doc.data();
      if (member.quickbooksEmployeeId) {
        existingQBIds.add(member.quickbooksEmployeeId);
      }
      if (member.email) {
        existingEmails.add(member.email.toLowerCase());
      }
    });

    // Process each employee
    for (const employee of employees) {
      try {
        // Skip if already synced by QuickBooks ID
        if (existingQBIds.has(employee.Id)) {
          result.skipped++;
          continue;
        }

        // Build name from available fields
        let name = employee.DisplayName;
        if (!name && (employee.GivenName || employee.FamilyName)) {
          name = [employee.GivenName, employee.FamilyName].filter(Boolean).join(" ");
        }

        if (!name) {
          result.errors.push(`Skipped employee ${employee.Id}: no name`);
          result.skipped++;
          continue;
        }

        const email = employee.PrimaryEmailAddr?.Address?.toLowerCase() || null;
        
        // Skip if email already exists (to avoid duplicates by email too)
        if (email && existingEmails.has(email)) {
          result.skipped++;
          continue;
        }

        const phone = formatPhoneNumber(employee.PrimaryPhone?.FreeFormNumber);

        // Create new team member
        const teamMember = {
          name,
          email,
          phone,
          jobTitle: employee.Title || null,
          teamId,
          quickbooksEmployeeId: employee.Id,
          createdAt: new Date(),
          source: "quickbooks",
        };

        // Remove null/undefined values
        const cleanedMember = Object.fromEntries(
          Object.entries(teamMember).filter(([_, v]) => v !== null && v !== undefined)
        );

        await admin.firestore().collection("team-members").add(cleanedMember);
        result.added++;

        // Add to sets to prevent duplicates in same batch
        existingQBIds.add(employee.Id);
        if (email) existingEmails.add(email);

      } catch (empError: any) {
        result.errors.push(`Error processing employee ${employee.Id}: ${empError.message}`);
      }
    }

    // Update team with sync status
    await admin.firestore().doc(`team/${teamId}`).update({
      "quickbooks.lastSyncAt": new Date(),
      "quickbooks.lastSyncCount": result.added,
    });

    result.success = true;
    console.log(`QuickBooks sync complete for team ${teamId}: added ${result.added}, skipped ${result.skipped}`);

  } catch (err: any) {
    console.error(`QuickBooks sync failed for team ${teamId}:`, err);
    result.errors.push(err.message);
  }

  return result;
}

/**
 * Disconnect QuickBooks from a team
 */
export const disconnectQuickBooks = onCall(
  {},
  async (request) => {
    const { teamId } = request.data as { teamId: string };

    if (!teamId) {
      throw new HttpsError("invalid-argument", "Team ID is required");
    }

    // Remove QuickBooks data from team document
    await admin.firestore().doc(`team/${teamId}`).update({
      quickbooks: admin.firestore.FieldValue.delete(),
    });

    console.log(`QuickBooks disconnected for team ${teamId}`);

    return { success: true };
  }
);

/**
 * Scheduled sync - runs daily to sync all connected teams
 * This function is exported and called from the main scheduler in index.ts
 */
export async function runScheduledQuickBooksSync(): Promise<void> {
  console.log("Starting scheduled QuickBooks sync for all connected teams");

  // Find all teams with QuickBooks connected
  const teamsSnapshot = await admin.firestore()
    .collection("team")
    .where("quickbooks.realmId", "!=", null)
    .get();

  console.log(`Found ${teamsSnapshot.size} teams with QuickBooks connected`);

  for (const teamDoc of teamsSnapshot.docs) {
    try {
      const result = await syncEmployeesForTeam(teamDoc.id);
      console.log(`Team ${teamDoc.id} sync result:`, result);
    } catch (err: any) {
      console.error(`Failed to sync team ${teamDoc.id}:`, err.message);
    }
  }

  console.log("Scheduled QuickBooks sync complete");
}
