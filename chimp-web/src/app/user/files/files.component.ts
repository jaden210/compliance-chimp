import { Component, inject, OnInit, DestroyRef } from "@angular/core";
import { CommonModule, DatePipe } from "@angular/common";
import { RouterModule, Router } from "@angular/router";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { MatBottomSheetModule } from "@angular/material/bottom-sheet";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { UserService } from "../user.service";
import { TeamFile } from "src/app/account/files/files.component";

@Component({
  standalone: true,
  selector: "files",
  templateUrl: "files.component.html",
  styleUrls: ["files.component.scss"],
  imports: [
    CommonModule,
    RouterModule,
    MatBottomSheetModule,
    MatButtonModule,
    MatIconModule
  ],
  providers: [DatePipe]
})
export class FilesComponent implements OnInit {
  private readonly userService = inject(UserService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  ngOnInit() {
    this.userService.teamManagersObservable
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(tm => {
        if (tm != null) {
          // Team managers loaded
        }
      });
  }

  public get Files(): TeamFile[] {
    return this.userService.files;
  }

  public get Team(): any {
    return this.userService.aTeam;
  }

  download(file: TeamFile) {
    const xhr = new XMLHttpRequest();
    xhr.responseType = "blob";
    xhr.onload = () => {
      const blob = new Blob([xhr.response], { type: file.type });
      const a = document.createElement("a");
      a.style.display = "none";
      document.body.appendChild(a);
      const url = window.URL.createObjectURL(blob);
      a.href = url;
      a.download = file.name;
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    };
    xhr.open("GET", file.fileUrl);
    xhr.send();
  }

  close() {
    this.router.navigate(['/user']);
  }
}
