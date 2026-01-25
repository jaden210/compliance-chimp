import { Injectable } from "@angular/core";
import { of, Observable } from "rxjs";
import { Firestore, collection, collectionData, doc, docData, query, where, orderBy, addDoc, updateDoc, deleteDoc } from "@angular/fire/firestore";
import { map, catchError, tap } from "rxjs/operators";
import { AccountService } from "../account.service";
import { Survey, SurveyResponse } from "src/app/app.service";

@Injectable({
  providedIn: "root"
})
export class SurveyService {
  survey: Survey;

  constructor(
    public db: Firestore,
    private accountService: AccountService
  ) {}

  public getSurvey(surveyId): Observable<Survey> {
   return docData(doc(this.db, `survey/${surveyId}`), { idField: "id" }) as Observable<Survey>;
  }

  public getSurveyResponses(surveyId): Observable<SurveyResponse[]> {
    const responsesQuery = query(collection(this.db, "survey-response"), where("surveyId", "==", surveyId), orderBy("createdAt", "desc"));
    return collectionData(responsesQuery, { idField: "id" }) as Observable<SurveyResponse[]>;
  }











  public updateSurvey(survey: Survey, teamId): Promise<void> {
    const id = survey.id;
    delete survey["user"];
    delete survey.id;
    const cleanedSurvey = Object.fromEntries(
      Object.entries(survey).filter(([_, v]) => v !== undefined)
    );
    return updateDoc(doc(this.db, `team/${teamId}/survey/${id}`), cleanedSurvey)
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
    const cleanedSurvey = Object.fromEntries(
      Object.entries(survey).filter(([_, v]) => v !== undefined)
    );
    return addDoc(collection(this.db, `team/${teamId}/survey`), cleanedSurvey)
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
