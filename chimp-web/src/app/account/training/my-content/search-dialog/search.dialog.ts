import { Component, Inject, OnInit } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { MatDialogRef, MatDialogModule, MAT_DIALOG_DATA } from "@angular/material/dialog";
import { MatButtonModule } from "@angular/material/button";
import { MatListModule } from "@angular/material/list";
import { MatRadioModule } from "@angular/material/radio";
import { MatIconModule } from "@angular/material/icon";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { MatSelectModule } from "@angular/material/select";
import { BehaviorSubject } from "rxjs";
import { AccountService, User } from "src/app/account/account.service";

@Component({
  standalone: true,
  templateUrl: "./search.dialog.html",
  styleUrls: ["search.dialog.css"],
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatListModule,
    MatRadioModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule
  ]
})
export class SearchDialog implements OnInit {
  users: BehaviorSubject<User[]>;
  searchParams: SearchParams;
  title1 = "Search MyContent";
  title2 = "Select Employee(s)";
  title: string;
  actionBtn: string = "APPLY";
  complianceTypes: any[] = [
    { key: "inCompliance", value: "In Compliance" },
    { key: "outOfCompliance", value: "Out of Compliance" },
    { key: "all", value: "All" }
  ];

  constructor(
    private accountService: AccountService,
    @Inject(MAT_DIALOG_DATA) private data: any,
    public dialogRef: MatDialogRef<SearchDialog>
  ) {}

  ngOnInit() {
    this.users = this.accountService.teamManagersObservable;
    this.searchParams = this.data.searchParams || new SearchParams();
    this.title = this.title1;
  }

  public selectEmployee(): void {
    this.title = this.title2;
  }

  public get EmployeesTitle(): string {
    return this.searchParams.employees.map(p => p.name).join(", ");
  }

  public back(): void {
    this.title = this.title1;
  }

  public reset(): void {
    this.searchParams = new SearchParams();
  }

  public apply(): void {
    this.dialogRef.close(this.searchParams);
  }
}

export class SearchParams {
  employees: User[] = [];
  string: string;
  complianceType: string = "all";
}
