import { Component, inject, OnInit, OnDestroy, DestroyRef } from "@angular/core";
import { CommonModule, DatePipe } from "@angular/common";
import { RouterModule, Router } from "@angular/router";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { MatBottomSheetModule } from "@angular/material/bottom-sheet";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { UserService } from "../user.service";
import { TeamFile } from "src/app/account/files/files.component";
import { ResourceFile } from "src/app/account/support/resource-library.service";
import { Subscription } from "rxjs";

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
export class FilesComponent implements OnInit, OnDestroy {
  private readonly userService = inject(UserService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  
  private resourceSubscription: Subscription;
  resourceFiles: ResourceFile[] = [];

  ngOnInit() {
    this.userService.teamManagersObservable
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(tm => {
        if (tm != null) {
          // Team managers loaded
        }
      });
    
    // Load resource library files if team has it enabled
    this.userService.teamObservable
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(team => {
        if (team && team.showResourceLibrary !== false) {
          this.loadResourceFiles();
        } else {
          this.resourceFiles = [];
        }
      });
  }

  private loadResourceFiles(): void {
    if (this.resourceSubscription) {
      this.resourceSubscription.unsubscribe();
    }
    this.resourceSubscription = this.userService.getResourceFiles().subscribe(files => {
      this.resourceFiles = files;
    });
  }

  ngOnDestroy(): void {
    if (this.resourceSubscription) {
      this.resourceSubscription.unsubscribe();
    }
  }

  public get Files(): TeamFile[] {
    return [...(this.userService.files || [])].sort((a, b) => 
      (a.name || '').toLowerCase().localeCompare((b.name || '').toLowerCase())
    );
  }

  public get Team(): any {
    return this.userService.aTeam;
  }

  public get showResourceLibrary(): boolean {
    return this.Team?.showResourceLibrary !== false;
  }

  download(file: TeamFile | ResourceFile) {
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

  openFile(file: TeamFile) {
    window.open(file.fileUrl, '_blank');
  }

  isImageFile(file: TeamFile): boolean {
    if (!file?.type) return false;
    return file.type.startsWith('image/');
  }

  isPdfFile(file: TeamFile): boolean {
    if (!file?.type && !file?.name) return false;
    const type = file.type?.toLowerCase() || '';
    const name = file.name?.toLowerCase() || '';
    return type === 'application/pdf' || name.endsWith('.pdf');
  }

  isVideoFile(file: TeamFile): boolean {
    if (!file?.type && !file?.name) return false;
    const type = file.type?.toLowerCase() || '';
    const name = file.name?.toLowerCase() || '';
    return type.startsWith('video/') || name.endsWith('.mp4') || name.endsWith('.mov') || name.endsWith('.webm');
  }

  getFileIcon(file: TeamFile): string {
    if (!file?.type && !file?.name) return 'insert_drive_file';
    
    const type = file.type?.toLowerCase() || '';
    const name = file.name?.toLowerCase() || '';
    
    if (type === 'application/pdf' || name.endsWith('.pdf')) return 'picture_as_pdf';
    if (type.includes('spreadsheet') || type.includes('excel') || 
        name.endsWith('.xls') || name.endsWith('.xlsx') || name.endsWith('.csv')) return 'table_chart';
    if (type.includes('document') || type.includes('msword') ||
        name.endsWith('.doc') || name.endsWith('.docx')) return 'description';
    if (type.startsWith('video/')) return 'videocam';
    if (type.startsWith('image/')) return 'image';
    
    return 'insert_drive_file';
  }

  close() {
    this.router.navigate(['/user']);
  }
}
