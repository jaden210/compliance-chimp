import { Injectable } from "@angular/core";
import { of, Observable } from "rxjs";
import { Firestore, collection, collectionData, doc, docData, query, orderBy, where, addDoc, updateDoc, deleteDoc } from "@angular/fire/firestore";
import { map, catchError, tap } from "rxjs/operators";
import { Survey } from "../survey/survey";
import { AccountService } from "../account.service";
import { SurveyResponse } from "src/app/app.service";

@Injectable()
export class SurveysService {
  survey: Survey;

  constructor(
    public db: Firestore,
    private accountService: AccountService
  ) {}

  /* will automatically unsubscribe with async pipe */
  /* Should I cache these? */
  public getSurveys(teamId): Observable<Survey[]> {
    return collectionData(
        query(collection(this.db, `team/${teamId}/survey`), orderBy("createdAt", "desc")),
        { idField: "id" }
      )
      .pipe(
        map((surveys: any[]) =>
          surveys.map((data) => {
            const createdAt = data.createdAt?.toDate ? data.createdAt.toDate() : data.createdAt;
            const runOnceOnDate = data.runOnceOnDate?.toDate ? data.runOnceOnDate.toDate() : null;
            return { ...data, createdAt, runOnceOnDate };
          })
        ),
        map(actions => actions.sort(survey => (survey.active ? -1 : 1))),
        catchError(error => {
          console.error(`Error loading survey collection`, error);
          alert(`Error loading survey collection`);
          return of([]);
        })
      );
  }

  public getSurvey(surveyId): Observable<Survey> {
    return this.survey && this.survey.id == surveyId
      ? of(this.survey)
      : docData(doc(this.db, `survey/${surveyId}`), { idField: "id" }).pipe(
          map((data: any) => {
            const createdAt = data.createdAt?.toDate ? data.createdAt.toDate() : data.createdAt;
            const runOnceOnDate = data.runOnceOnDate?.toDate ? data.runOnceOnDate.toDate() : null;
            return { ...data, createdAt, runOnceOnDate };
          })
        );
  }

  public getSurveyResponses(surveyId, teamId): Observable<SurveyResponse[]> {
    return collectionData(
        query(
          collection(this.db, "survey-response"),
          where("surveyId", "==", surveyId),
          orderBy("createdAt", "desc")
        ),
        { idField: "id" }
      )
      .pipe(
        map((responses: any[]) =>
          responses.map((data) => {
            const createdAt = data.createdAt?.toDate ? data.createdAt.toDate() : data.createdAt;
            return { ...data, createdAt };
          })
        ),
        catchError(error => {
          console.error(`Error loading survey-response collection`, error);
          alert(`Error loading survey-response collection`);
          return of([]);
        })
      );
  }

  public updateSurvey(survey: Survey, teamId): Promise<void> {
    const id = survey.id;
    delete survey["user"];
    delete survey.id;
    return updateDoc(doc(this.db, `team/${teamId}/survey/${id}`), { ...survey })
      .then(data => {
        return data;
      })
      .catch(error => {
        console.error("Error updating survey.", error);
        alert("Error updating survey");
        throw error;
      });
  }

  public createSurvey(survey: Survey, teamId): Promise<any> {
    return addDoc(collection(this.db, `team/${teamId}/survey`), { ...survey })
      .then(data => {
        return data;
      })
      .catch(error => {
        console.error("Error creating survey.", error);
        alert("Error creating survey");
        throw error;
      });
  }

  public deleteSurvey(surveyId: string, teamId): Promise<void> {
    return deleteDoc(doc(this.db, `team/${teamId}/survey/${surveyId}`))
      .catch(error => {
        console.error("Error deleting survey.", error);
        alert("Error deleting survey");
        throw error;
      });
  }
}
