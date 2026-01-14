import { Injectable } from '@angular/core';
import { CanActivate, ActivatedRouteSnapshot, RouterStateSnapshot } from 
'@angular/router';
import {Router} from '@angular/router';
import { Observable } from 'rxjs';
import { AccountService } from './account.service';
@Injectable({
    providedIn: "root"
  })
export class AuthGuard implements CanActivate {
  constructor(private accountService: AccountService,
    private myRoute: Router){
  }
  canActivate(
    next: ActivatedRouteSnapshot,
    state: RouterStateSnapshot): Observable<boolean> | Promise<boolean> | boolean {
    if(this.accountService.user['isDev']){
      return true;
    }else{
      this.myRoute.navigate(["account/dashboard"]);
      return false;
    }
  }
}