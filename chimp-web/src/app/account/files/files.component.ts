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
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import { MatSlideToggleModule } from "@angular/material/slide-toggle";
import { MatTooltipModule } from "@angular/material/tooltip";
import { Storage, ref, uploadBytes, getDownloadURL } from "@angular/fire/storage";
import { collection, collectionData, doc, updateDoc, addDoc, deleteDoc } from "@angular/fire/firestore";
import { ResourceLibraryService, ResourceFile } from "../support/resource-library.service";

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
    MatProgressSpinnerModule,
    MatSlideToggleModule,
    MatTooltipModule
  ],
  providers: [DatePipe]
})
export class FilesComponent implements OnInit, OnDestroy {
  private subscription: Subscription;
  private resourceSubscription: Subscription;
  files: TeamFile[] = [];
  aFile: TeamFile = new TeamFile();
  loading: boolean = false;
  showContent: boolean = false;
  
  // Track pending selection after upload
  private pendingSelectId: string | null = null;
  
  // Resource Library
  resourceFiles: ResourceFile[] = [];
  showResourceLibrary: boolean = true;

  // CSV Preview
  csvData: string[][] = [];
  csvLoading: boolean = false;

  constructor(
    public accountService: AccountService,
    private storage: Storage,
    private datePipe: DatePipe,
    private resourceLibraryService: ResourceLibraryService
  ) {
    this.accountService.helper = this.accountService.helperProfiles.files;
  }

  ngOnInit(): void {
    this.subscription = this.accountService.aTeamObservable.subscribe(team => {
      if (team?.id) {
        this.loadFiles();
        // Initialize showResourceLibrary from team settings (default to true)
        this.showResourceLibrary = team.showResourceLibrary !== false;
      }
    });
    
    // Load resource library files
    this.resourceSubscription = this.resourceLibraryService.getResourceFiles().subscribe(files => {
      this.resourceFiles = files;
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
        
        // Check for pending selection (after upload)
        if (this.pendingSelectId) {
          const pendingFile = files.find(f => f.id === this.pendingSelectId);
          if (pendingFile) {
            this.selectFile(pendingFile);
            this.pendingSelectId = null;
          }
        } else if (files.length && !this.aFile?.id) {
          // Only auto-select first file if no file is currently selected
          // Use setTimeout to defer CSV loading until after initial render
          setTimeout(() => this.selectFile(files[0]), 0);
        } else if (this.aFile?.id) {
          // Keep current selection in sync with updated data
          const currentFile = files.find(f => f.id === this.aFile.id);
          if (currentFile) {
            this.aFile = currentFile;
          } else if (files.length) {
            this.aFile = files[0];
          }
        }
        
        this.showContent = true;
      });
  }

  upload(): void {
    document.getElementById("upFile").click();
  }

  async uploadFiles(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const fileList = input.files;
    if (!fileList || fileList.length === 0) {
      return;
    }

    this.loading = true;
    const files = Array.from(fileList);
    let lastUploadedId: string | null = null;

    try {
      for (const uFile of files) {
        const filePath = `${this.accountService.aTeam.id}/files/${Date.now()}_${uFile.name}`;
        const storageRef = ref(this.storage, filePath);
        
        await uploadBytes(storageRef, uFile);
        const url = await getDownloadURL(storageRef);

        const file = new TeamFile();
        file.createdAt = new Date();
        file.uploadedBy = this.accountService.user.id;
        file.fileUrl = url;
        file.name = uFile.name;
        file.type = uFile.type;

        const cleanedFile = Object.fromEntries(
          Object.entries(file).filter(([_, v]) => v !== undefined)
        );

        const snapshot = await addDoc(
          collection(this.accountService.db, `team/${this.accountService.aTeam.id}/file`),
          cleanedFile
        );
        lastUploadedId = snapshot.id;
      }

      // Select the last uploaded file
      if (lastUploadedId) {
        this.pendingSelectId = lastUploadedId;
      }
    } catch (error) {
      console.error("Error uploading files:", error);
    } finally {
      this.loading = false;
      input.value = "";
    }
  }

  save(): void {
    const cleanedFile = Object.fromEntries(
      Object.entries(this.aFile).filter(([_, v]) => v !== undefined)
    );
    updateDoc(doc(this.accountService.db, `team/${this.accountService.aTeam.id}/file/${this.aFile.id}`), cleanedFile);
  }

  delete(): void {
    if (!confirm(`Are you sure you want to delete "${this.aFile.name}"?`)) {
      return;
    }
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
    this.csvData = [];
    
    if (this.isCsvFile(file)) {
      this.loadCsvPreview(file);
    }
  }

  private async loadCsvPreview(file: TeamFile): Promise<void> {
    this.csvLoading = true;
    try {
      const response = await fetch(file.fileUrl);
      const text = await response.text();
      this.csvData = this.parseCsv(text);
    } catch (error) {
      console.error('Error loading CSV:', error);
      this.csvData = [];
    }
    this.csvLoading = false;
  }

  private parseCsv(text: string): string[][] {
    const lines = text.split('\n').filter(line => line.trim());
    return lines.slice(0, 100).map(line => {
      // Simple CSV parsing (handles basic cases)
      const result: string[] = [];
      let current = '';
      let inQuotes = false;
      
      for (const char of line) {
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          result.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      result.push(current.trim());
      return result;
    });
  }

  isImageFile(file: TeamFile | ResourceFile): boolean {
    if (!file?.type) return false;
    return file.type.startsWith('image/');
  }

  isVideoFile(file: TeamFile | ResourceFile): boolean {
    if (!file?.type && !file?.name) return false;
    const type = file.type?.toLowerCase() || '';
    const name = file.name?.toLowerCase() || '';
    return type.startsWith('video/') || name.endsWith('.mp4') || name.endsWith('.mov') || name.endsWith('.webm');
  }

  isPdfFile(file: TeamFile | ResourceFile): boolean {
    if (!file?.type && !file?.name) return false;
    const type = file.type?.toLowerCase() || '';
    const name = file.name?.toLowerCase() || '';
    return type === 'application/pdf' || name.endsWith('.pdf');
  }

  isCsvFile(file: TeamFile | ResourceFile): boolean {
    if (!file?.type && !file?.name) return false;
    const type = file.type?.toLowerCase() || '';
    const name = file.name?.toLowerCase() || '';
    return type === 'text/csv' || name.endsWith('.csv');
  }

  openFile(file: TeamFile): void {
    window.open(file.fileUrl, '_blank');
  }

  getFileIcon(file: TeamFile | ResourceFile): string {
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

  getFileTypeLabel(file: TeamFile | ResourceFile): string {
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
    if (this.resourceSubscription) {
      this.resourceSubscription.unsubscribe();
    }
  }

  toggleResourceLibrary(): void {
    this.accountService.toggleResourceLibrary(this.showResourceLibrary);
  }

  downloadResourceFile(file: ResourceFile): void {
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
}
