import { Injectable } from "@angular/core";
import { map, take } from "rxjs/operators";
import { forkJoin } from "rxjs";
import { AppService } from "../app.service";
import { Firestore, doc, setDoc, deleteDoc } from "@angular/fire/firestore";
import { Auth } from "@angular/fire/auth";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { User, Team } from "../account/account.service";
import {
  Industry,
  Topic,
  Article,
  MyContent
} from "../account/training/training.service";
declare var gtag: Function;

@Injectable()
export class JoinTeamService {
  constructor(
    private appService: AppService,
    private db: Firestore,
    private auth: Auth
  ) {}

  get Email(): string {
    return this.appService.email;
  }

  createAuthUser(password, email): Promise<any> {
    return createUserWithEmailAndPassword(this.auth, email, password);
  }

  createUser(user: User, userId): Promise<any> {
    const deleteId = user.id;
    user.id = userId;
    console.log(user);
    console.log(deleteId);
    
    const cleanedUser = Object.fromEntries(
      Object.entries(user).filter(([_, v]) => v !== undefined)
    );
    return setDoc(doc(this.db, `user/${userId}`), cleanedUser).then(() => 
      deleteDoc(doc(this.db, `user/${deleteId}`)).then(() => user)
    );
  }

  removeFromInvitaionCollection(id): Promise<void> {
    return deleteDoc(doc(this.db, `invitation/${id}`));
  }
}
