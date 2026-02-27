import { Injectable } from '@angular/core';
import { CanActivate, ActivatedRouteSnapshot, RouterStateSnapshot } from
'@angular/router';
import { Router } from '@angular/router';
import { Observable, of } from 'rxjs';
import { switchMap, map, take } from 'rxjs/operators';
import { Auth, authState } from '@angular/fire/auth';
import { Firestore, doc, docData } from '@angular/fire/firestore';

@Injectable({
  providedIn: "root"
})
export class AuthGuard implements CanActivate {
  constructor(
    private auth: Auth,
    private db: Firestore,
    private myRoute: Router
  ) {}

  canActivate(
    next: ActivatedRouteSnapshot,
    state: RouterStateSnapshot
  ): Observable<boolean> {
    return authState(this.auth).pipe(
      take(1),
      switchMap(user => {
        if (!user) {
          this.myRoute.navigate(["account/dashboard"]);
          return of(false);
        }
        return docData(doc(this.db, `user/${user.uid}`)).pipe(
          take(1),
          map((userData: any) => {
            if (userData?.isDev) {
              return true;
            } else {
              this.myRoute.navigate(["account/dashboard"]);
              return false;
            }
          })
        );
      })
    );
  }
}