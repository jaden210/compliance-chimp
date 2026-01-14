import { Component, OnInit , ViewChild} from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { map } from 'rxjs/operators';
import { User } from '../../../app.service';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { SupportService } from '../support.service';
import { Team } from '../../account.service';

@Component({
  standalone: true,
  selector: 'statistics',
  templateUrl: './statistics.component.html',
  styleUrls: ['./statistics.component.css'],
  imports: [
    CommonModule,
    MatTableModule,
    MatSortModule,
    MatCardModule,
    MatIconModule
  ],
  providers: [DatePipe]
})
export class StatisticsComponent implements OnInit {

  @ViewChild(MatSort) sort: MatSort;
  aItem: Support; // temp var
  teams = [];
  displayedColumns: string[] = ["name", "email", "phone", "owner", "created","users", "logs"];
  datasource = new MatTableDataSource(this.teams)

  constructor(public supportService: SupportService) { }

  ngOnInit() {
    this.datasource.sort = this.sort;
  }


}

export class Support {
  id?: string;
  createdAt: any;
  email: string;
  body: string;
  isUser?: boolean = false;
  user?: User;

  respondedAt?: any;
  notes?: string;
}