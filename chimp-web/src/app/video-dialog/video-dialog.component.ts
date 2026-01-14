import { Component, OnInit, Inject } from "@angular/core";
import { CommonModule } from "@angular/common";
import { MatDialogModule, MAT_DIALOG_DATA } from "@angular/material/dialog";

@Component({
  standalone: true,
  selector: "app-video-dialog",
  templateUrl: "./video-dialog.component.html",
  styleUrls: ["./video-dialog.component.css"],
  imports: [CommonModule, MatDialogModule]
})
export class VideoDialogComponent implements OnInit {
  productVideo: boolean;

  constructor(@Inject(MAT_DIALOG_DATA) public data: any) {}

  ngOnInit() {
    
  }
}
