import { Component, Inject, OnInit } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { MatDialogRef, MatDialogModule, MAT_DIALOG_DATA } from "@angular/material/dialog";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatProgressBarModule } from "@angular/material/progress-bar";
import { MatSlideToggleModule } from "@angular/material/slide-toggle";
import { MatTooltipModule } from "@angular/material/tooltip";
import { Topic } from "../../training.service";
import { TopicsService } from "../topics.service";
import { Observable, of } from "rxjs";

@Component({
  standalone: true,
  templateUrl: "./topic-dialog.component.html",
  styleUrls: ["topic-dialog.component.css"],
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    MatSlideToggleModule,
    MatTooltipModule
  ]
})
export class TopicDialogComponent implements OnInit {
  private industryId: string;
  private teamId: string;
  public topic: Topic;
  public image: any;
  public isEdit: boolean;
  public errorMessage: string;
  public previewImg: any;
  public loading: boolean;
  public isGlobal: boolean;
  public isDev: boolean;

  constructor(
    public dialogRef: MatDialogRef<TopicDialogComponent>,
    private service: TopicsService,
    @Inject(MAT_DIALOG_DATA) private data: any
  ) {}

  ngOnInit() {
    this.topic = this.data.topic;
    this.teamId = this.data.teamId;
    this.isDev = this.data.isDev;
    this.isGlobal = this.isDev ? true : false;
    this.industryId = this.data.industryId;
    this.isEdit = this.topic.id ? true : false;
  }

  public getImage(): void {
    document.getElementById("image-input").click();
  }

  public setImage(event): void {
    // callback from view
    if (event.target.files && event.target.files[0]) {
      var reader = new FileReader();
      reader.onload = (event: ProgressEvent) => {
        this.previewImg = (<FileReader>event.target).result;
      };
      reader.readAsDataURL(event.target.files[0]);
      this.image = event.target.files[0];
    } else {
      this.previewImg = undefined; // broken image
      this.image = undefined;
    }
  }

  public createTopic(): void {
    this.loading = true;
    this.topic.industryId = this.industryId;
    this.doImage().subscribe(imageUrl => {
      this.topic.imageUrl = imageUrl;
      this.service
        .createTopic(this.topic, this.teamId, this.isGlobal)
        .then(() => this.dialogRef.close(this.topic))
        .catch(() => {
          this.loading = false;
          this.errorMessage = `Error creating topic`;
        });
    });
  }

  private doImage(): Observable<string> {
    return this.image
      ? this.service.uploadImage(this.image, this.teamId)
      : of(null);
  }

  public editTopic(): void {
    this.loading = true;
    this.doImage().subscribe(imageUrl => {
      if (imageUrl) {
        if (this.topic.imageUrl) this.service.removeImage(this.topic.imageUrl);
        this.topic.imageUrl = imageUrl;
      }
      this.service
        .updateTopic(this.topic, this.teamId)
        .then(() => this.dialogRef.close(this.topic))
        .catch(() => {
          this.loading = false;
          this.errorMessage = `Error updating topic`;
        });
    });
  }

  public deleteTopic(): void {
    if (
      window.confirm(
        `Are you sure you want to delete topic ${this.topic.name}?`
      )
    ) {
      this.loading = true;
      if (this.topic.imageUrl) this.service.removeImage(this.topic.imageUrl);
      this.service
        .deleteTopic(this.topic, this.teamId)
        .then(() => this.dialogRef.close("deleted"))
        .catch(() => {
          this.loading = false;
          this.errorMessage = `Error deleting topic`;
        });
    }
  }

  public deleteImage(): void {
    this.image = undefined;
    this.previewImg = undefined;
  }
}
