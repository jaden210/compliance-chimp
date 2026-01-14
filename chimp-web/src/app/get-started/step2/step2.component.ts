import { Component, OnInit } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { Router } from "@angular/router";
import { MatCardModule } from "@angular/material/card";
import { MatListModule } from "@angular/material/list";
import { MatCheckboxModule } from "@angular/material/checkbox";
import { MatButtonModule } from "@angular/material/button";
import { GetStartedService } from "../get-started.service";
declare var gtag: Function;

@Component({
  standalone: true,
  selector: "step2",
  templateUrl: "./step2.component.html",
  styleUrls: ["./step2.component.css"],
  imports: [CommonModule, FormsModule, MatCardModule, MatListModule, MatCheckboxModule, MatButtonModule]
})
export class Step2Component implements OnInit {
  constructor(
    private router: Router,
    private getStartedService: GetStartedService
  ) {}

  ngOnInit() {
    if (
      !this.getStartedService.name ||
      !this.getStartedService.companyName ||
      !this.getStartedService.Email
    )
      this.router.navigate(["/get-started"]);
  }

  setIndustry(): void {
    this.getStartedService.selectedIndustries = this.Industries.filter((i: any) => i.checked).map(i => i.id);
    this.router.navigate(["/get-started/step3"]);
  }

  public get IndustrySelected(): boolean {
    return (this.Industries || []).filter((i: any) => i.checked).length > 0;
  }

  get Industries(): Industry[] {
    return this.getStartedService.industries;
  }
}


export class Industry {
  name: string;
  nameEs: string;
  id?: string;
  imageUrl?: string;
  checked?: boolean;
}