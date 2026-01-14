import { Injectable, Component } from "@angular/core";
import { combineLatest, Observable } from "rxjs";
import { Firestore, collection, collectionData, doc, updateDoc, addDoc, deleteDoc, query, where, orderBy } from "@angular/fire/firestore";
import { map, take, mergeMap } from "rxjs/operators";
import { AccountService, InviteToTeam, TeamMember } from "../account.service";
import { SelfInspection } from "../self-inspections/self-inspections.service";

@Injectable({
  providedIn: "root"
})
export class TeamService {
  constructor(
    public db: Firestore,
    private accountService: AccountService
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
    return addDoc(collection(this.db, "user-groups"), group);
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
}
