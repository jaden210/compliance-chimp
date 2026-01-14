import { Pipe, PipeTransform } from "@angular/core";
import { User } from "./account/account.service";

@Pipe({
  standalone: true,
  name: "userName"
})
export class UserNamePipe implements PipeTransform {
  transform(userId: string, users: User[]): string {
    const user =
      users && users.length ? users.find(user => user.id == userId) : null;
    return user ? user.name : null;
  }
}
