import { Component, viewChild, signal, AfterViewInit, OnInit, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatChipsModule } from '@angular/material/chips';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { Firestore, collection, collectionData, query, orderBy, where, limit, getCountFromServer } from '@angular/fire/firestore';
import { Functions, httpsCallable } from '@angular/fire/functions';
import { map } from 'rxjs/operators';
import { forkJoin, from, of } from 'rxjs';
import { ConfirmDeleteTeamDialog } from './confirm-delete-team.dialog';

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
  standalone: true,
  selector: 'statistics',
  templateUrl: './statistics.component.html',
  styleUrl: './statistics.component.css',
  imports: [
    DatePipe,
    MatTableModule,
    MatSortModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatChipsModule,
    MatButtonModule,
    MatDialogModule
  ]
})
export class StatisticsComponent implements OnInit, AfterViewInit {
  private readonly db = inject(Firestore);
  private readonly functions = inject(Functions);
  private readonly dialog = inject(MatDialog);
  private readonly sort = viewChild(MatSort);

  readonly teams = signal<TeamStats[]>([]);
  readonly loading = signal(true);
  readonly deleting = signal(false);
  readonly displayedColumns = ['status', 'name', 'email', 'created', 'users', 'logs', 'lastActivity', 'delete'];
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

  confirmDeleteTeam(team: TeamStats): void {
    const dialogRef = this.dialog.open(ConfirmDeleteTeamDialog, {
      width: '400px',
      data: { teamName: team.name, teamEmail: team.email }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result === true) {
        this.deleteTeam(team);
      }
    });
  }

  private async deleteTeam(team: TeamStats): Promise<void> {
    if (!team.id) return;

    this.deleting.set(true);
    try {
      const deleteTeamFn = httpsCallable(this.functions, 'deleteTeamCompletely');
      await deleteTeamFn({ teamId: team.id });
      
      // Remove from local data
      const updatedTeams = this.teams().filter(t => t.id !== team.id);
      this.teams.set(updatedTeams);
      this.dataSource.data = updatedTeams;
      this.paidTeamsCount.set(updatedTeams.filter(t => t.stripeSubscriptionId).length);
      this.updateTotalUsers();
    } catch (error) {
      console.error('Error deleting team:', error);
      alert('Failed to delete team. Please try again.');
    } finally {
      this.deleting.set(false);
    }
  }
}