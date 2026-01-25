import { Component, viewChild, signal, AfterViewInit, OnInit, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatChipsModule } from '@angular/material/chips';
import { Firestore, collection, collectionData, query, orderBy, where, limit, getCountFromServer } from '@angular/fire/firestore';
import { map } from 'rxjs/operators';
import { forkJoin, from, of } from 'rxjs';

interface TeamStats {
  id?: string;
  name: string;
  email?: string;
  phone?: string;
  ownerId?: string;
  createdAt?: Date;
  stripeSubscriptionId?: string;
  userCount?: number;
  logCount?: number;
  lastActivity?: Date;
}

@Component({
  selector: 'statistics',
  templateUrl: './statistics.component.html',
  styleUrl: './statistics.component.css',
  imports: [
    DatePipe,
    MatTableModule,
    MatSortModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatChipsModule
  ]
})
export class StatisticsComponent implements OnInit, AfterViewInit {
  private readonly db = inject(Firestore);
  private readonly sort = viewChild(MatSort);

  readonly teams = signal<TeamStats[]>([]);
  readonly loading = signal(true);
  readonly displayedColumns = ['status', 'name', 'email', 'created', 'users', 'logs', 'lastActivity'];
  readonly dataSource = new MatTableDataSource<TeamStats>([]);

  readonly paidTeamsCount = signal(0);
  readonly totalUsersCount = signal(0);

  ngOnInit(): void {
    this.loadTeams();
  }

  ngAfterViewInit(): void {
    const sortRef = this.sort();
    if (sortRef) {
      this.dataSource.sort = sortRef;
    }
  }

  private loadTeams(): void {
    const teamsQuery = query(collection(this.db, 'team'), orderBy('createdAt', 'desc'));
    collectionData(teamsQuery, { idField: 'id' }).pipe(
      map((teams: any[]) => teams.map(team => ({
        ...team,
        createdAt: team.createdAt?.toDate ? team.createdAt.toDate() : team.createdAt
      })))
    ).subscribe(teams => {
      this.teams.set(teams);
      this.dataSource.data = teams;
      this.paidTeamsCount.set(teams.filter(t => t.stripeSubscriptionId).length);
      this.loading.set(false);
      
      // Load additional stats for each team
      this.loadTeamStats(teams);
    });
  }

  private loadTeamStats(teams: TeamStats[]): void {
    teams.forEach(team => {
      if (!team.id) return;

      // Get user count
      const usersQuery = query(collection(this.db, 'user'), where('teamId', '==', team.id));
      from(getCountFromServer(usersQuery)).subscribe(snapshot => {
        team.userCount = snapshot.data().count;
        this.updateTotalUsers();
        this.dataSource.data = [...this.teams()];
      });

      // Get most recent log for last activity
      const logsQuery = query(
        collection(this.db, `team/${team.id}/log`),
        orderBy('createdAt', 'desc'),
        limit(1)
      );
      collectionData(logsQuery).subscribe((logs: any[]) => {
        if (logs.length > 0) {
          team.lastActivity = logs[0].createdAt?.toDate ? logs[0].createdAt.toDate() : logs[0].createdAt;
        }
        this.dataSource.data = [...this.teams()];
      });

      // Get log count
      from(getCountFromServer(collection(this.db, `team/${team.id}/log`))).subscribe(snapshot => {
        team.logCount = snapshot.data().count;
        this.dataSource.data = [...this.teams()];
      });
    });
  }

  private updateTotalUsers(): void {
    const total = this.teams().reduce((sum, t) => sum + (t.userCount || 0), 0);
    this.totalUsersCount.set(total);
  }

  getActivityStatus(lastActivity: Date | undefined): string {
    if (!lastActivity) return 'inactive';
    const daysSince = Math.floor((Date.now() - lastActivity.getTime()) / (1000 * 60 * 60 * 24));
    if (daysSince <= 7) return 'active';
    if (daysSince <= 30) return 'moderate';
    return 'inactive';
  }
}