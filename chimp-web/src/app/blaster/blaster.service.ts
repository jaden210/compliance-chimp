import { Injectable, Component, Inject } from "@angular/core";
import { Firestore, collection, addDoc, doc, updateDoc } from "@angular/fire/firestore";
import {
  MatDialog,
} from "@angular/material/dialog";
import {
  MatSnackBar,
} from "@angular/material/snack-bar";
import { Router } from "@angular/router";
import moment from "moment";
import { Survey } from "../app.service";
import { LibraryItem } from "../account/training/training.service";
import { AccountService } from "../account/account.service";

@Injectable({
  providedIn: "root"
})
export class BlasterService {

  constructor(
    public db: Firestore,
    public dialog: MatDialog,
    public router: Router,
    public snackbar: MatSnackBar,
    private _aService: AccountService
  ) {}

  public async createSurvey(item: LibraryItem, trainees: string[], userId: string = this._aService.user.id, teamId: string = this._aService.aTeam.id): Promise<any> {
    let survey = new Survey();
    survey.libraryId = item.id;
    survey.title = `Training Attendance: ${item.name}`;
    survey.trainees = trainees;
    survey.userId = userId;
    survey.teamId = teamId;
    if (item.isInPerson) {
      survey.isInPerson = true;
    }
    // Filter out undefined values since Firestore doesn't accept them
    const cleanedSurvey = Object.fromEntries(
      Object.entries(survey).filter(([_, value]) => value !== undefined)
    );
    
    // Create the survey record
    const surveyRef = await addDoc(collection(this.db, "survey"), cleanedSurvey);
    
    // Update the library item with training completion data
    if (item.id && trainees.length > 0) {
      await this.updateLibraryItemTraining(item.id, trainees);
    }
    
    return surveyRef;
  }

  /**
   * Update library item with training completion data
   * Uses dot notation to merge individual trainee records without overwriting others
   */
  private async updateLibraryItemTraining(libraryItemId: string, trainees: string[]): Promise<void> {
    const now = new Date().toISOString();
    
    // Build update object using dot notation to merge with existing data
    const updates: { [key: string]: any } = {
      lastTrainedAt: new Date()
    };
    
    // Use dot notation for each trainee to avoid overwriting existing entries
    trainees.forEach(traineeId => {
      updates[`shouldReceiveTraining.${traineeId}`] = now;
    });
    
    try {
      const libraryItemRef = doc(this.db, `library/${libraryItemId}`);
      await updateDoc(libraryItemRef, updates);
    } catch (error) {
      console.error('Error updating library item training data:', error);
      // Don't throw - the survey was created successfully, this is a secondary update
    }
  }


}