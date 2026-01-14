import { Injectable } from "@angular/core";
import { map, take } from "rxjs/operators";
import { forkJoin } from "rxjs";
import { AppService } from "../app.service";
import { Firestore, collection, collectionData, doc, setDoc, addDoc } from "@angular/fire/firestore";
import { Auth } from "@angular/fire/auth";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { User, Team, TeamMember } from "../account/account.service";
import {
  Industry,
  Topic,
  Article,
  MyContent
} from "../account/training/training.service";
declare var gtag: Function;

@Injectable()
export class GetStartedService {
  industries: Industry[];
  name: string;
  companyName: string;
  jobTitle: string;
  selectedIndustries: string[] = [];

  constructor(
    private appService: AppService,
    private db: Firestore,
    private auth: Auth
  ) {}

  get Email(): string {
    return this.appService.email;
  }

  setIndustries(): void {
    collectionData(collection(this.db, "industry"), { idField: "id" })
      .pipe(map((industries: any[]) => industries as Industry[]))
      .subscribe(industries => (this.industries = industries));
  }

  createAuthUser(password) {
    return createUserWithEmailAndPassword(this.auth, this.Email, password)
      .catch(error => {
        console.error(error);
        throw error;
      });
  }

  createTeam(userId): Promise<string> {
    gtag("event", "account_created", {
      event_category: "newAccount",
      event_label: `${this.name} created an account`
    });
    let newTeam = new Team();
    newTeam.createdAt = new Date();
    newTeam.ownerId = userId;
    newTeam.name = this.companyName;
    newTeam.industries = this.selectedIndustries;
    newTeam.email = this.Email;
    return addDoc(collection(this.db, "team"), { ...newTeam })
      .then(team => team.id)
      .catch(error => {
        console.error(error);
        throw error;
      });
  }

  createUser(user, teamId): Promise<any> {
    let newUser = new User();
    newUser.id = user.user.uid;
    newUser.email = user.user.email;
    newUser.profileUrl = user.user.photoURL || null;
    newUser.name = this.name;
    newUser.jobTitle = this.jobTitle || null;
    newUser.isManager = false;
    newUser.teamId = teamId;
    return setDoc(doc(this.db, `user/${newUser.id}`), { ...newUser })
      .then(() => newUser)
      .catch(error => {
        console.error(error);
        throw error;
      });
  }

  // setDefaultArticles(teamId, userId): void {
  //   let indCol = this.db
  //     .collection("industry", ref => ref.where("default", "==", true))
  //     .snapshotChanges()
  //     .pipe(
  //       take(1),
  //       map(actions =>
  //         actions.map(a => {
  //           const data = a.payload.doc.data() as Industry;
  //           const id = a.payload.doc.id;
  //           return { id, ...data };
  //         })
  //       )
  //     );
  //   let topCol = this.db
  //     .collection("topic")
  //     .snapshotChanges()
  //     .pipe(
  //       take(1),
  //       map(actions =>
  //         actions.map(a => {
  //           const data = a.payload.doc.data() as Topic;
  //           const id = a.payload.doc.id;
  //           return { id, ...data };
  //         })
  //       )
  //     );
  //   forkJoin(indCol, topCol).subscribe(([industries, topics]) => {
  //     let filterTopics = topics.filter(
  //       topic =>
  //         topic.industryId == industries[0].id ||
  //         topic.industryId == this.industryId
  //     );
  //     let topicColl = [];
  //     filterTopics.forEach(topic => {
  //       topicColl.push(
  //         this.db
  //           .collection("article", ref =>
  //             ref
  //               .where("topicId", "==", topic.id)
  //               .where("isDefault", "==", true)
  //           )
  //           .snapshotChanges()
  //           .pipe(
  //             take(1),
  //             map(actions =>
  //               actions.map(a => {
  //                 const data = a.payload.doc.data() as Article;
  //                 const id = a.payload.doc.id;
  //                 return { id, ...data };
  //               })
  //             )
  //           )
  //       );
  //     });
  //     forkJoin(topicColl).subscribe(results => {
  //       let promises = [];
  //       const shouldReceiveTrainingTemplate = new Map();
  //       shouldReceiveTrainingTemplate[userId] = null;
  //       results.forEach((articleArray: any) => {
  //         articleArray.forEach(article => {
  //           const trainingMinutes =
  //             Math.ceil(article.content.length / 480 / 5) * 5;
  //           const myContent = new MyContent(
  //             article.id,
  //             { ...shouldReceiveTrainingTemplate },
  //             teamId,
  //             article.name,
  //             article.nameEs,
  //             article.topicId,
  //             trainingMinutes
  //           );
  //           promises.push(
  //             this.db
  //               .collection(`training-content/${teamId}/articles`)
  //               .doc(article.id)
  //               .set({ ...myContent })
  //           );
  //         });
  //       });
  //       Promise.all(promises).then(() =>
  //         console.log("finished defaulting articles")
  //       );
  //     });
  //   });
  // }
}
