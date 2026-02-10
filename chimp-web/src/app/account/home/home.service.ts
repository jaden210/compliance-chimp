import { Injectable, Component } from "@angular/core";
import { Observable } from "rxjs";
import { Firestore, collection, collectionData, doc, query, where, orderBy } from "@angular/fire/firestore";
import { map } from "rxjs/operators";
import { AccountService, InviteToTeam, TeamMember } from "../account.service";
import { SelfInspection } from "../self-inspections/self-inspections.service";
import { TeamService } from "../team/team.service";

@Injectable({
  providedIn: "root"
})
export class HomeService {
  constructor(
    public db: Firestore,
    private accountService: AccountService,
    private teamService: TeamService
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

  removeUser(user: TeamMember): Promise<any> {
    return this.teamService.removeUser(user);
  }

  getIncidentReports(): Observable<any[]> {
    if (!this.accountService.aTeam?.id) {
      return new Observable(observer => observer.next([]));
    }
    const reportCollection = collection(this.db, "incident-report");
    const reportQuery = query(
      reportCollection,
      where("teamId", "==", this.accountService.aTeam.id)
    );
    return collectionData(reportQuery, { idField: "id" });
  }

  getSurveys(): Observable<any[]> {
    if (!this.accountService.aTeam?.id) {
      return new Observable(observer => observer.next([]));
    }
    const surveyCollection = collection(this.db, "survey");
    const surveyQuery = query(
      surveyCollection,
      where("teamId", "==", this.accountService.aTeam.id)
    );
    return collectionData(surveyQuery, { idField: "id" });
  }

  getSurveyResponses(): Observable<any[]> {
    if (!this.accountService.aTeam?.id) {
      return new Observable(observer => observer.next([]));
    }
    const responseCollection = collection(this.db, "survey-response");
    const responseQuery = query(
      responseCollection,
      where("teamId", "==", this.accountService.aTeam.id)
    );
    return collectionData(responseQuery, { idField: "id" });
  }
}
