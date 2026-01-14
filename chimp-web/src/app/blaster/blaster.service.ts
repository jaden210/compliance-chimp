import { Injectable, Component, Inject } from "@angular/core";
import { Firestore, collection, addDoc } from "@angular/fire/firestore";
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

  public createSurvey(item: LibraryItem, trainees: string[], userId: string = this._aService.user.id, teamId: string = this._aService.aTeam.id): Promise<any> {
    let survey = new Survey();
    survey.libraryId = item.id;
    survey.title = `Training Attendance: ${item.name}`;
    survey.trainees = trainees;
    survey.userId = userId;
    survey.teamId = teamId;
    return addDoc(collection(this.db, "survey"), { ...survey });
  }


}