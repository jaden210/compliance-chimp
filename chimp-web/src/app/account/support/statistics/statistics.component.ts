import { Component, viewChild, signal, AfterViewInit, OnInit, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatChipsModule } from '@angular/material/chips';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { Firestore, collection, collectionData, query, orderBy, where, limit, getCountFromServer, getDoc, doc } from '@angular/fire/firestore';
import { Functions, httpsCallable } from '@angular/fire/functions';
import { map, switchMap, catchError } from 'rxjs/operators';
import { forkJoin, from, of, Observable } from 'rxjs';
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
  ownerEmail?: string;
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
  readonly displayedColumns = ['status', 'name', 'email', 'created', 'users', 'delete'];
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

      // Get owner email - try multiple approaches
      this.findOwnerEmail(team);

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

  private findOwnerEmail(team: TeamStats): void {
    console.log(`[Team: ${team.name}] Looking for owner email. Team data:`, {
      id: team.id,
      ownerId: team.ownerId,
      email: team.email
    });

    // Build the lookup chain using RxJS operators to stay in injection context
    this.lookupOwnerEmail(team).subscribe(email => {
      if (email) {
        team.ownerEmail = email;
        this.dataSource.data = [...this.teams()];
        console.log(`[Team: ${team.name}] Found email: ${email}`);
      } else {
        console.log(`[Team: ${team.name}] NO EMAIL FOUND - all methods exhausted`);
      }
    });
  }

  private lookupOwnerEmail(team: TeamStats): Observable<string | null> {
    // Step 1: Try user collection by ownerId
    if (team.ownerId) {
      return from(getDoc(doc(this.db, `user/${team.ownerId}`))).pipe(
        switchMap(userDoc => {
          console.log(`[Team: ${team.name}] Checked user/${team.ownerId}:`, userDoc.exists() ? 'FOUND' : 'NOT FOUND');
          if (userDoc.exists() && userDoc.data()['email']) {
            return of(userDoc.data()['email'] as string);
          }
          // Step 2: Try team-members collection by ownerId
          return from(getDoc(doc(this.db, `team-members/${team.ownerId}`))).pipe(
            switchMap(memberDoc => {
              console.log(`[Team: ${team.name}] Checked team-members/${team.ownerId}:`, memberDoc.exists() ? 'FOUND' : 'NOT FOUND');
              if (memberDoc.exists() && memberDoc.data()['email']) {
                return of(memberDoc.data()['email'] as string);
              }
              // Step 3: Query users by teamId
              return this.lookupByTeamId(team);
            }),
            catchError(() => this.lookupByTeamId(team))
          );
        }),
        catchError(() => this.lookupByTeamId(team))
      );
    } else {
      // No ownerId, go straight to teamId lookup
      return this.lookupByTeamId(team);
    }
  }

  private lookupByTeamId(team: TeamStats): Observable<string | null> {
    const usersByTeamQuery = query(
      collection(this.db, 'user'),
      where('teamId', '==', team.id),
      limit(1)
    );
    return collectionData(usersByTeamQuery).pipe(
      switchMap((users: any[]) => {
        console.log(`[Team: ${team.name}] Query users by teamId:`, users.length > 0 ? 'FOUND' : 'NONE');
        if (users.length > 0 && users[0].email) {
          return of(users[0].email as string);
        }
        // Step 4: Try legacy teams map
        return this.lookupByLegacyTeamsMap(team);
      }),
      catchError(() => this.lookupByLegacyTeamsMap(team))
    );
  }

  private lookupByLegacyTeamsMap(team: TeamStats): Observable<string | null> {
    const legacyQuery = query(
      collection(this.db, 'user'),
      where(`teams.${team.id}`, '>=', 0),
      limit(1)
    );
    return collectionData(legacyQuery).pipe(
      map((legacyUsers: any[]) => {
        console.log(`[Team: ${team.name}] Query users by legacy teams map:`, legacyUsers.length > 0 ? 'FOUND' : 'NONE');
        if (legacyUsers.length > 0 && legacyUsers[0].email) {
          return legacyUsers[0].email as string;
        }
        return null;
      }),
      catchError(() => of(null))
    );
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
      data: { teamName: team.name, teamEmail: team.ownerEmail || team.email }
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

  downloadTeams(): void {
    const teams = this.teams();
    if (teams.length === 0) return;

    // CSV headers
    const headers = ['Team Name', 'Email', 'Status', 'Created', 'Users', 'Logs', 'Last Activity'];
    
    // CSV rows
    const rows = teams.map(team => [
      this.escapeCsvField(team.name),
      this.escapeCsvField(team.ownerEmail || team.email || ''),
      team.stripeSubscriptionId ? 'Paid' : 'Free',
      team.createdAt ? new Date(team.createdAt).toLocaleDateString() : '',
      team.userCount?.toString() || '',
      team.logCount?.toString() || '',
      team.lastActivity ? new Date(team.lastActivity).toLocaleDateString() : ''
    ]);

    // Build CSV content
    const csvContent = [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
    
    // Create and trigger download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `teams-export-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  private escapeCsvField(field: string): string {
    if (!field) return '';
    // Escape quotes and wrap in quotes if contains comma, quote, or newline
    if (field.includes(',') || field.includes('"') || field.includes('\n')) {
      return `"${field.replace(/"/g, '""')}"`;
    }
    return field;
  }
}