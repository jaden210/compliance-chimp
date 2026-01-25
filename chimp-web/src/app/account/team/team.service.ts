import { Injectable, Component } from "@angular/core";
import { combineLatest, Observable } from "rxjs";
import { Firestore, collection, collectionData, doc, updateDoc, addDoc, deleteDoc, query, where, orderBy } from "@angular/fire/firestore";
import { Functions, httpsCallable } from "@angular/fire/functions";
import { map, take, mergeMap } from "rxjs/operators";
import { AccountService, InviteToTeam, TeamMember } from "../account.service";
import { SelfInspection } from "../self-inspections/self-inspections.service";

export interface QuickBooksSyncResult {
  success: boolean;
  added: number;
  skipped: number;
  errors: string[];
}

@Injectable({
  providedIn: "root"
})
export class TeamService {
  constructor(
    public db: Firestore,
    private accountService: AccountService,
    private functions: Functions
  ) {}

  getSelfInspections(): Observable<SelfInspection[]> {
    if (!this.accountService.aTeam?.id) {
      return new Observable(observer => observer.next([]));
    }
    const path = `team/${this.accountService.aTeam.id}/self-inspection`;
    const selfInspectionCollection = collection(this.db, path);
    return collectionData(selfInspectionCollection, { idField: "id" })
      .pipe(
        map((actions: any[]) => {
          return actions.map((data) => {
            const createdAt = data.createdAt?.toDate ? data.createdAt.toDate() : data.createdAt;
            const lastCompletedAt = data.lastCompletedAt?.toDate ? data.lastCompletedAt.toDate() : null;
            return { ...data, createdAt, lastCompletedAt };
          });
        })
      );
  }

  getFiles() {
    if (!this.accountService.aTeam?.id) {
      return new Observable(observer => observer.next([]));
    }
    const path = `team/${this.accountService.aTeam.id}/file`;
    const filesCollection = collection(this.db, path);
    return collectionData(filesCollection, { idField: "id" });
  }

  public addUserGroup(group): Promise<any> {
    if (!this.accountService.aTeam?.id) {
      return Promise.reject(new Error("Team not loaded"));
    }
    group.teamId = this.accountService.aTeam.id;
    const cleanedGroup = Object.fromEntries(
      Object.entries(group).filter(([_, v]) => v !== undefined)
    );
    return addDoc(collection(this.db, "user-groups"), cleanedGroup);
  }

  public archiveGroup(groupId: string): Promise<any> {
    return updateDoc(doc(this.db, `user-groups/${groupId}`), { archivedAt: new Date() });
  }

  getSystemAchievements(): Observable<any> {
    const achievementCollection = collection(this.accountService.db, "achievement");
    const achievementQuery = query(achievementCollection, orderBy("level"));
    return collectionData(achievementQuery, { idField: "id" });
  }

  removeUser(user: TeamMember): Promise<any> {
    return deleteDoc(doc(this.db, `team-members/${user.id}`));
  }

  public getSurveysByTeamMember(memberId: string): Observable<any> {
    const surveyCollection = collection(this.db, "survey");
    const surveyQuery = query(surveyCollection, where("trainees", "array-contains", memberId));
    
    const responseCollection = collection(this.db, "survey-response");
    const responseQuery = query(responseCollection, where("teamMemberId", "==", memberId));
    
    return combineLatest([
      collectionData(surveyQuery, { idField: "id" }),
      collectionData(responseQuery, { idField: "id" }),
    ]);
  }

  // ============ QuickBooks Integration ============

  /**
   * Initiate QuickBooks OAuth connection
   * Returns the authorization URL to redirect the user to
   */
  public async initiateQuickBooksConnect(): Promise<string> {
    if (!this.accountService.aTeam?.id) {
      throw new Error("Team not loaded");
    }

    // Pass current origin so callback redirects back to correct environment (localhost or production)
    const returnUrl = window.location.origin;

    const getAuthUrl = httpsCallable(this.functions, "quickbooks-getQuickBooksAuthUrl");
    const result: any = await getAuthUrl({ 
      teamId: this.accountService.aTeam.id,
      returnUrl 
    });
    return result.data.authUrl;
  }

  /**
   * Trigger a manual sync of QuickBooks employees
   */
  public async triggerQuickBooksSync(): Promise<QuickBooksSyncResult> {
    if (!this.accountService.aTeam?.id) {
      throw new Error("Team not loaded");
    }

    const syncEmployees = httpsCallable(this.functions, "quickbooks-syncQuickBooksEmployees");
    const result: any = await syncEmployees({ teamId: this.accountService.aTeam.id });
    return result.data as QuickBooksSyncResult;
  }

  /**
   * Disconnect QuickBooks from the team
   */
  public async disconnectQuickBooks(): Promise<void> {
    if (!this.accountService.aTeam?.id) {
      throw new Error("Team not loaded");
    }

    const disconnect = httpsCallable(this.functions, "quickbooks-disconnectQuickBooks");
    await disconnect({ teamId: this.accountService.aTeam.id });
  }

  /**
   * Check if QuickBooks is connected for the current team
   */
  public isQuickBooksConnected(): boolean {
    return !!this.accountService.aTeam?.quickbooks?.realmId;
  }
}
