import { Component, OnInit, OnDestroy, inject } from "@angular/core";
import { DatePipe } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { Subscription } from "rxjs";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { MatProgressBarModule } from "@angular/material/progress-bar";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import { MatTooltipModule } from "@angular/material/tooltip";
import { ResourceLibraryService, ResourceFile } from "../resource-library.service";
import { AccountService } from "../../account.service";

@Component({
  standalone: true,
  selector: "resource-library",
  templateUrl: "./resource-library.component.html",
  styleUrls: ["./resource-library.component.css"],
  imports: [
    DatePipe,
    FormsModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressBarModule,
    MatProgressSpinnerModule,
    MatTooltipModule
  ]
})
export class ResourceLibraryComponent implements OnInit, OnDestroy {
  private readonly resourceService = inject(ResourceLibraryService);
  private readonly accountService = inject(AccountService);

  private subscription: Subscription;
  files: ResourceFile[] = [];
  selectedFile: ResourceFile | null = null;
  loading = false;
  showContent = false;
  saving = false;

  ngOnInit(): void {
    this.loadFiles();
  }

  private loadFiles(): void {
    this.subscription = this.resourceService.getResourceFiles().subscribe(files => {
      this.files = files;
      if (files.length && !this.selectedFile) {
        this.selectedFile = files[0];
      }
      this.showContent = true;
    });
  }

  upload(): void {
    document.getElementById("resourceUpFile")?.click();
  }

  async uploadFile(event: Event): Promise<void> {
    this.loading = true;
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      this.loading = false;
      return;
    }

    try {
      const uploadedFile = await this.resourceService.uploadResourceFile(
        file,
        this.accountService.user.id || "admin"
      );
      this.selectedFile = uploadedFile;
      this.loading = false;
      // Clear the input so the same file can be uploaded again if needed
      input.value = "";
    } catch (error) {
      console.error("Error uploading file:", error);
      this.loading = false;
    }
  }

  selectFile(file: ResourceFile): void {
    this.selectedFile = file;
  }

  async save(): Promise<void> {
    if (!this.selectedFile) return;
    this.saving = true;
    try {
      await this.resourceService.updateResourceFile(this.selectedFile);
    } catch (error) {
      console.error("Error saving file:", error);
    }
    this.saving = false;
  }

  async delete(): Promise<void> {
    if (!this.selectedFile) return;
    
    const index = this.files.indexOf(this.selectedFile);
    try {
      await this.resourceService.deleteResourceFile(this.selectedFile);
      // Select adjacent file after delete
      if (this.files.length > 1) {
        this.selectedFile = this.files[index - 1 < 0 ? 0 : index - 1] || null;
      } else {
        this.selectedFile = null;
      }
    } catch (error) {
      console.error("Error deleting file:", error);
    }
  }

  download(): void {
    if (!this.selectedFile) return;
    
    const xhr = new XMLHttpRequest();
    xhr.responseType = "blob";
    xhr.onload = () => {
      const blob = new Blob([xhr.response], { type: this.selectedFile!.type });
      const a = document.createElement("a");
      a.style.display = "none";
      document.body.appendChild(a);
      const url = window.URL.createObjectURL(blob);
      a.href = url;
      a.download = this.selectedFile!.name;
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    };
    xhr.open("GET", this.selectedFile.fileUrl);
    xhr.send();
  }

  openSource(): void {
    if (this.selectedFile?.sourceUrl) {
      window.open(this.selectedFile.sourceUrl, "_blank");
    }
  }

  isImageFile(file: ResourceFile): boolean {
    if (!file?.type) return false;
    return file.type.startsWith("image/");
  }

  getFileIcon(file: ResourceFile): string {
    if (!file?.type && !file?.name) return "insert_drive_file";

    const type = file.type?.toLowerCase() || "";
    const name = file.name?.toLowerCase() || "";

    if (type === "application/pdf" || name.endsWith(".pdf")) {
      return "picture_as_pdf";
    }
    if (type.includes("spreadsheet") || type.includes("excel") ||
        name.endsWith(".xls") || name.endsWith(".xlsx") || name.endsWith(".csv")) {
      return "table_chart";
    }
    if (type.includes("document") || type.includes("msword") ||
        name.endsWith(".doc") || name.endsWith(".docx") || name.endsWith(".txt")) {
      return "description";
    }
    if (type.startsWith("video/") || name.endsWith(".mp4") || name.endsWith(".mov")) {
      return "videocam";
    }
    if (type.startsWith("image/")) {
      return "image";
    }
    return "insert_drive_file";
  }

  getFileTypeLabel(file: ResourceFile): string {
    if (!file?.type && !file?.name) return "File";

    const type = file.type?.toLowerCase() || "";
    const name = file.name?.toLowerCase() || "";

    if (type === "application/pdf" || name.endsWith(".pdf")) return "PDF Document";
    if (type.includes("spreadsheet") || type.includes("excel") ||
        name.endsWith(".xls") || name.endsWith(".xlsx")) return "Spreadsheet";
    if (name.endsWith(".csv")) return "CSV File";
    if (type.includes("document") || type.includes("msword") ||
        name.endsWith(".doc") || name.endsWith(".docx")) return "Word Document";
    if (name.endsWith(".txt")) return "Text File";
    if (type.startsWith("video/")) return "Video";
    if (type.startsWith("image/")) return "Image";
    return "File";
  }

  ngOnDestroy(): void {
    if (this.subscription) {
      this.subscription.unsubscribe();
    }
  }
}
