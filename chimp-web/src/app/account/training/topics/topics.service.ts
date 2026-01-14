import { Injectable } from "@angular/core";
import { Firestore, collection, doc, setDoc, updateDoc, deleteDoc } from "@angular/fire/firestore";
import { Storage, ref, uploadBytes, getDownloadURL, deleteObject } from "@angular/fire/storage";
import { catchError, switchMap } from "rxjs/operators";
import { Topic } from "../training.service";
import { from, Observable, throwError } from "rxjs";

@Injectable({
  providedIn: "root"
})
export class TopicsService {
  constructor(
    public db: Firestore,
    private storage: Storage
  ) {}

  /* If the article is created by one of us, add to the article collection
  else add to team/article collection. This should also be favorited */
  public createTopic(topic: Topic, teamId, isGlobal): Promise<Topic> {
    const ref = isGlobal
      ? collection(this.db, "topic")
      : collection(this.db, `team/${teamId}/topic`);
    const id = isGlobal ? doc(ref).id : `${teamId}_${doc(ref).id}`;
    let sTopic = { ...topic };
    delete sTopic.id;
    return setDoc(doc(ref, id), sTopic)
      .then(() => {
        topic.id = id;
        return topic;
      })
      .catch(error => {
        console.error(`Error creating topic ${topic.name}`, topic, error);
        throw error;
      });
  }

  public updateTopic(topic: Topic, teamId): Promise<any> {
    let top = { ...topic };
    const id = top.id;
    delete top.id;
    const ref = id.includes(teamId)
      ? doc(this.db, `team/${teamId}/topic/${topic.id}`)
      : doc(this.db, `topic/${topic.id}`);
    return updateDoc(ref, { ...topic })
      .then(() => topic)
      .catch(error => {
        console.error(`Error updating topic ${topic.name}`, topic, error);
        alert(
          `Error updating article ${topic.name}, falling back to original.`
        );
      });
  }

  public deleteTopic(topic: Topic, teamId): Promise<any> {
    const ref = topic.id.includes(teamId)
      ? doc(this.db, `team/${teamId}/topic/${topic.id}`)
      : doc(this.db, `topic/${topic.id}`);
    return deleteDoc(ref)
      .catch(error => {
        console.error(`Error deleting topic ${topic.name}`, topic, error);
        throw error;
      });
  }

  public uploadImage(image, teamId): Observable<string> {
    const date = new Date().getTime();
    const filePath = `${teamId}/topicImages/${date}`;
    const storageRef = ref(this.storage, filePath);
    return from(uploadBytes(storageRef, image)).pipe(
      switchMap(() => getDownloadURL(storageRef)),
      catchError(error => {
        console.error(`Error saving image for topic`, error);
        return throwError(error);
      })
    );
  }

  public removeImage(imageUrl): void {
    deleteObject(ref(this.storage, imageUrl)).catch(() => {});
  }
}
