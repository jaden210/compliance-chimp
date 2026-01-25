import { Injectable } from "@angular/core";
import { of, Observable } from "rxjs";
import { Firestore, collection, collectionData, doc, docData, query, where, setDoc, updateDoc, deleteDoc } from "@angular/fire/firestore";
import { map, catchError, take, tap } from "rxjs/operators";
import { Article, LibraryItem, TrainingService } from "../../training.service";

@Injectable()
export class CreateEditArticleService {
  constructor(
    public db: Firestore,
    private trainingService: TrainingService
  ) {}

  /* if the article id contains the teamId, pull from team/article collection */
  public getArticle(articleId: string): Observable<LibraryItem | null> {
    return (docData(doc(this.db, `library/${articleId}`), { idField: "id" }) as Observable<LibraryItem | null>)
      .pipe(
        map(article => {
          if (!article) return null;
          return { ...article, id: articleId };
        }),
        catchError(error => {
          console.error(`Error loading article ${articleId}. ${error}`);
          alert(`Error loading article ${articleId}`);
          return of(null);
        })
      );
  }

  /* Add article to team's library */
  public createArticle(article: LibraryItem, teamId): Promise<any> {
    const ref = collection(this.db, "library");
    const docId = `${teamId}_${doc(ref).id}`;
    const cleanedArticle = Object.fromEntries(
      Object.entries({ ...article, id: docId }).filter(([_, v]) => v !== undefined)
    );
    return setDoc(doc(ref, docId), cleanedArticle)
      .then(() => {
        article.id = docId;
        return docId;
      })
      .catch(error => {
        console.error(`Error creating article ${article.name}`, article, error);
        alert(`Error creating article ${article.name}`);
      });
  }

  /* Also need to update article names in myContent */
  public updateArticle(article: LibraryItem): Promise<any> {
    const cleanedArticle = Object.fromEntries(
      Object.entries(article).filter(([_, v]) => v !== undefined)
    );
    return updateDoc(doc(this.db, `library/${article.id}`), cleanedArticle)
      .catch(error => {
        console.error(`Error updating article ${article.name}`, article, error);
        alert(
          `Error updating article ${article.name}, falling back to original.`
        );
      });
  }

  public checkSlugIsValid(article): Observable<boolean> {
    return !article.slugName ? of(true) : 
    collectionData(query(collection(this.db, "article"), where("slugName", "==", article.slugName)), { idField: "id" })
    .pipe(map((r: any[]) => {
      if (r.length) {
        return (r.length == 1 && r[0].id == article.id) ? true : false;
      } else {
        return true;
      } 
    }
    ));
  }

  /* If article is deleted, set myContent.disabled, wipe articles */
  public deleteArticle(articleId, teamId): Promise<any> {
    const docRef = doc(this.db, `library/${articleId}`);
    return deleteDoc(docRef)
      .then(() => {
        this.trainingService.wipeArticles();
        this.trainingService.getMyContent(teamId).subscribe(myContent => {
          const needsUpdate = myContent.filter(mc => mc.articleId == articleId);
          needsUpdate.forEach(nu => {
            nu.disabled = true;
          });
        });
        return articleId;
      })
      .catch(error => {
        console.error("Error deleting article", error);
        throw error;
      });
  }
}
