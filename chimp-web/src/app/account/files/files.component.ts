import { Component, OnInit, OnDestroy } from "@angular/core";
import { CommonModule, DatePipe } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { AccountService } from "../account.service";
import { map } from "rxjs/operators";
import { Subscription } from "rxjs";
import { MatToolbarModule } from "@angular/material/toolbar";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { MatProgressBarModule } from "@angular/material/progress-bar";
import { MatSlideToggleModule } from "@angular/material/slide-toggle";
import { Storage, ref, uploadBytes, getDownloadURL } from "@angular/fire/storage";
import { collection, collectionData, doc, updateDoc, addDoc, deleteDoc } from "@angular/fire/firestore";

export class TeamFile {
  id?: string;
  fileUrl: string;
  name: string;
  createdAt: any;
  uploadedBy: string;
  isPublic: boolean = false;
  type?: string;
}

@Component({
  standalone: true,
  selector: "app-files",
  templateUrl: "./files.component.html",
  styleUrls: ["./files.component.scss"],
  imports: [
    CommonModule,
    FormsModule,
    MatToolbarModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressBarModule,
    MatSlideToggleModule
  ],
  providers: [DatePipe]
})
export class FilesComponent implements OnInit, OnDestroy {
  private subscription: Subscription;
  files: TeamFile[] = [];
  aFile: TeamFile = new TeamFile();
  loading: boolean = false;
  showContent: boolean = false;

  constructor(
    public accountService: AccountService,
    private storage: Storage,
    private datePipe: DatePipe
  ) {
    this.accountService.helper = this.accountService.helperProfiles.files;
  }

  ngOnInit(): void {
    this.subscription = this.accountService.aTeamObservable.subscribe(team => {
      if (team?.id) {
        this.loadFiles();
      }
    });
  }

  private loadFiles(): void {
    collectionData(collection(this.accountService.db, `team/${this.accountService.aTeam.id}/file`), { idField: "id" })
      .pipe(
        map((actions: any[]) =>
          actions.map((data) => ({
            ...data,
            createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : data.createdAt
          }))
        )
      )
      .subscribe(files => {
        this.files = files as TeamFile[];
        if (files.length) {
          this.aFile = files[0];
        }
        this.showContent = true;
      });
  }

  upload(): void {
    document.getElementById("upFile").click();
  }

  uploadFile(event: Event): void {
    this.loading = true;
    const input = event.target as HTMLInputElement;
    const uFile = input.files?.[0];
    if (!uFile) {
      this.loading = false;
      return;
    }
    const filePath = `${this.accountService.aTeam.id}/files/${new Date()}`;
    const storageRef = ref(this.storage, filePath);
    uploadBytes(storageRef, uFile)
      .then(() => getDownloadURL(storageRef))
      .then((url) => {
        let file = new TeamFile();
        file.createdAt = new Date();
        file.uploadedBy = this.accountService.user.id;
        file.fileUrl = url;
        file.name = uFile.name;
        file.type = uFile.type;
        return addDoc(collection(this.accountService.db, `team/${this.accountService.aTeam.id}/file`), { ...file })
          .then(snapshot => {
            this.loading = false;
            file.id = snapshot.id;
            this.aFile = file;
          });
      })
      .catch(() => {
        this.loading = false;
      });
  }

  save(): void {
    updateDoc(doc(this.accountService.db, `team/${this.accountService.aTeam.id}/file/${this.aFile.id}`), { ...this.aFile });
  }

  delete(): void {
    const index = this.files.indexOf(this.aFile);
    deleteDoc(doc(this.accountService.db, `team/${this.accountService.aTeam.id}/file/${this.aFile.id}`))
      .then(() => {
        this.aFile = this.files[index - 1 < 0 ? 0 : index - 1] || new TeamFile();
      });
  }

  download(): void {
    const xhr = new XMLHttpRequest();
    xhr.responseType = "blob";
    xhr.onload = () => {
      const blob = new Blob([xhr.response], { type: this.aFile.type });
      const a = document.createElement("a");
      a.style.display = "none";
      document.body.appendChild(a);
      const url = window.URL.createObjectURL(blob);
      a.href = url;
      a.download = this.aFile.name;
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    };
    xhr.open("GET", this.aFile.fileUrl);
    xhr.send();
  }

  selectFile(file: TeamFile): void {
    this.aFile = file;
  }

  isImageFile(file: TeamFile): boolean {
    if (!file?.type) return false;
    return file.type.startsWith('image/');
  }

  getFileIcon(file: TeamFile): string {
    if (!file?.type && !file?.name) return 'insert_drive_file';
    
    const type = file.type?.toLowerCase() || '';
    const name = file.name?.toLowerCase() || '';
    
    // PDF
    if (type === 'application/pdf' || name.endsWith('.pdf')) {
      return 'picture_as_pdf';
    }
    
    // Spreadsheets
    if (type.includes('spreadsheet') || type.includes('excel') || 
        name.endsWith('.xls') || name.endsWith('.xlsx') || name.endsWith('.csv')) {
      return 'table_chart';
    }
    
    // Documents
    if (type.includes('document') || type.includes('msword') ||
        name.endsWith('.doc') || name.endsWith('.docx') || name.endsWith('.txt')) {
      return 'description';
    }
    
    // Videos
    if (type.startsWith('video/') || name.endsWith('.mp4') || name.endsWith('.mov')) {
      return 'videocam';
    }
    
    // Images
    if (type.startsWith('image/')) {
      return 'image';
    }
    
    // Default
    return 'insert_drive_file';
  }

  getFileTypeLabel(file: TeamFile): string {
    if (!file?.type && !file?.name) return 'File';
    
    const type = file.type?.toLowerCase() || '';
    const name = file.name?.toLowerCase() || '';
    
    if (type === 'application/pdf' || name.endsWith('.pdf')) return 'PDF Document';
    if (type.includes('spreadsheet') || type.includes('excel') || 
        name.endsWith('.xls') || name.endsWith('.xlsx')) return 'Spreadsheet';
    if (name.endsWith('.csv')) return 'CSV File';
    if (type.includes('document') || type.includes('msword') ||
        name.endsWith('.doc') || name.endsWith('.docx')) return 'Word Document';
    if (name.endsWith('.txt')) return 'Text File';
    if (type.startsWith('video/')) return 'Video';
    if (type.startsWith('image/')) return 'Image';
    
    return 'File';
  }

  ngOnDestroy(): void {
    if (this.subscription) {
      this.subscription.unsubscribe();
    }
  }
}
