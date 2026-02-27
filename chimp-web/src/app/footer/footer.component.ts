import { Component } from "@angular/core";
import { RouterModule } from "@angular/router";
import { MatIconModule } from "@angular/material/icon";

@Component({
  standalone: true,
  imports: [
    RouterModule,
    MatIconModule
  ],
  selector: "footer",
  templateUrl: "./footer.component.html",
  styleUrls: ["./footer.component.css"]
})
export class FooterComponent {
  private chimps = [
    '/assets/chimp.png',
    '/assets/chimpLate.png',
    '/assets/chimpNice.png',
    '/assets/chimpSad.png',
  ];
  private currentIndex = 0;
  currentChimp = this.chimps[0];

  cycleChimp() {
    this.currentIndex = (this.currentIndex + 1) % this.chimps.length;
    this.currentChimp = this.chimps[this.currentIndex];
  }
}
