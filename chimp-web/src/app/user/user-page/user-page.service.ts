import { Injectable } from "@angular/core";
import { map, take } from "rxjs/operators";
import { forkJoin } from "rxjs";
import { AppService } from "../../app.service";
import { Firestore } from "@angular/fire/firestore";
import { Auth } from "@angular/fire/auth";
import { User, Team } from "../../account/account.service";
import {
  Industry,
  Topic,
  Article,
  MyContent
} from "../../account/training/training.service";
declare var gtag: Function;

@Injectable()
export class UserPageService {
  constructor(
    private appService: AppService,
    private db: Firestore,
    private auth: Auth
  ) {}

  get Email(): string {
    return this.appService.email;
  }

}
