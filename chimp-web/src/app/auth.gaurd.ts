import { Injectable } from '@angular/core';
import { CanActivate, ActivatedRouteSnapshot, RouterStateSnapshot } from 
'@angular/router';
import {Router} from '@angular/router';
import { Observable } from 'rxjs';
import { take, tap } from 'rxjs/operators';

import { Auth } from '@angular/fire/auth';
import { onAuthStateChanged } from 'firebase/auth';
@Injectable({
    providedIn: "root"
  })
export class AuthGuard implements CanActivate {
  constructor(private auth: Auth,
    private router: Router){
  }
  canActivate(
    next: ActivatedRouteSnapshot,
    state: RouterStateSnapshot): Observable<boolean> | Promise<boolean> | boolean {
      return new Observable<boolean>((observer) => {
        const unsubscribe = onAuthStateChanged(this.auth, (user) => {
          observer.next(!!user);
          observer.complete();
        });
        return { unsubscribe };
      }).pipe(
        take(1),
        tap(authenticated => {
          if (!authenticated) this.router.navigate(['/sign-in']);
        })
      );
  }
}