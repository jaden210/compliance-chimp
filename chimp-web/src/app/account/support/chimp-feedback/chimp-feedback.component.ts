import { Component, OnInit, AfterViewInit, inject, signal, viewChild, DestroyRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Firestore, collection, collectionData, query, orderBy, limit } from '@angular/fire/firestore';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { map } from 'rxjs/operators';

interface ChimpChatFeedback {
  id?: string;
  teamId?: string;
  teamName?: string;
  userId?: string;
  userName?: string;
  userEmail?: string;
  message: string;
  summary?: string;
  category?: string;
  sentiment?: string;
  confidence?: number;
  createdAt?: Date;
}

@Component({
  standalone: true,
  selector: 'chimp-feedback',
  templateUrl: './chimp-feedback.component.html',
  styleUrl: './chimp-feedback.component.css',
  imports: [
    CommonModule,
    MatTableModule,
    MatSortModule,
    MatChipsModule,
    MatProgressSpinnerModule
  ]
})
export class ChimpFeedbackComponent implements OnInit, AfterViewInit {
  private readonly db = inject(Firestore);
  private readonly destroyRef = inject(DestroyRef);
  private readonly sort = viewChild(MatSort);

  readonly loading = signal(true);
  readonly feedback = signal<ChimpChatFeedback[]>([]);
  readonly dataSource = new MatTableDataSource<ChimpChatFeedback>([]);
  readonly displayedColumns = ['createdAt', 'team', 'user', 'category', 'sentiment', 'summary', 'message'];

  ngOnInit(): void {
    this.loadFeedback();
  }

  ngAfterViewInit(): void {
    const sortRef = this.sort();
    if (sortRef) {
      this.dataSource.sort = sortRef;
    }
  }

  private loadFeedback(): void {
    const feedbackQuery = query(
      collection(this.db, 'chimpChatFeedback'),
      orderBy('createdAt', 'desc'),
      limit(300)
    );

    collectionData(feedbackQuery, { idField: 'id' }).pipe(
      takeUntilDestroyed(this.destroyRef),
      map((rows: any[]) => rows.map(row => ({
        ...row,
        createdAt: row.createdAt?.toDate ? row.createdAt.toDate() : row.createdAt
      })))
    ).subscribe(rows => {
      this.feedback.set(rows);
      this.dataSource.data = rows;
      this.loading.set(false);
    });
  }

  formatConfidence(value?: number): string {
    if (value === null || value === undefined) return '';
    return `${Math.round(value * 100)}%`;
  }

  getTeamLabel(row: ChimpChatFeedback): string {
    if (row.teamName) return row.teamName;
    return row.teamId || 'Unknown';
  }

  getUserLabel(row: ChimpChatFeedback): string {
    if (row.userName) return row.userName;
    if (row.userEmail) return row.userEmail;
    return row.userId || 'Unknown';
  }
}
