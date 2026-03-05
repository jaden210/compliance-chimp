import { Injectable } from '@angular/core';
import { Functions, httpsCallable } from '@angular/fire/functions';
import { Firestore, collection, collectionData, addDoc, doc, updateDoc, query, orderBy, limit } from '@angular/fire/firestore';
import { Router } from '@angular/router';
import { Observable, from, map, catchError, of } from 'rxjs';
import { AccountService } from '../account.service';

export interface ChimpChatMessage {
  role: 'user' | 'assistant';
  content: string;
  actions?: ChimpChatAction[];
  timestamp: Date;
}

export interface ChimpChatAction {
  type: 'navigate' | 'smartBuilder' | 'search' | 'tourNext' | 'assignTraining' | 'createDraftInspection' | 'runComplianceCheck';
  label: string;
  route?: string;
  queryParams?: Record<string, string>;
  smartBuilderData?: SmartBuilderData;
  icon?: string;
  tourStepId?: string;
  tourStepRoute?: string;
  tourStepQueryParams?: Record<string, string>;
  // Write action fields
  trainingId?: string;
  trainingName?: string;
  tags?: string[];
  inspectionName?: string;
  inspectionDescription?: string;
}

export interface SmartBuilderData {
  name: string;
  description: string;
  cadence?: string;
  assignedTags?: string[];
}

export interface ChimpActivity {
  id?: string;
  teamId: string;
  userId: string | null;
  source: 'chat' | 'scheduled';
  actionType: string;
  description: string;
  timestamp: any;
  metadata?: Record<string, any>;
}

interface ChimpChatResponse {
  message: string;
  actions?: ChimpChatAction[];
}

@Injectable({
  providedIn: 'root'
})
export class ChimpChatService {
  private conversationHistory: ChimpChatMessage[] = [];
  /** Set to true before closing the overlay to navigate to full-page mode, so messages aren't wiped. */
  skipNextClear = false;

  get messages(): ChimpChatMessage[] {
    return this.conversationHistory;
  }

  constructor(
    private functions: Functions,
    private firestore: Firestore,
    private router: Router,
    private accountService: AccountService
  ) {}

  sendMessage(message: string): Observable<ChimpChatMessage> {
    const userMessage: ChimpChatMessage = {
      role: 'user',
      content: message,
      timestamp: new Date()
    };
    this.conversationHistory.push(userMessage);

    const chimpChatFn = httpsCallable<
      { teamId: string; message: string; userId: string; conversationHistory: Array<{ role: string; content: string }> },
      ChimpChatResponse
    >(this.functions, 'chimpChat');

    const payload = {
      teamId: this.accountService.aTeam?.id || '',
      message: message,
      userId: this.accountService.user?.id || '',
      conversationHistory: this.conversationHistory.map(m => ({
        role: m.role,
        content: m.content
      }))
    };

    return from(chimpChatFn(payload)).pipe(
      map(result => {
        const response = result.data;
        const assistantMessage: ChimpChatMessage = {
          role: 'assistant',
          content: response.message,
          actions: response.actions,
          timestamp: new Date()
        };
        this.conversationHistory.push(assistantMessage);
        return assistantMessage;
      }),
      catchError(error => {
        console.error('ChimpChat API Error:', error);
        const errorMessage: ChimpChatMessage = {
          role: 'assistant',
          content: 'I apologize, but I\'m having trouble connecting right now. Please try again in a moment.',
          timestamp: new Date()
        };
        this.conversationHistory.push(errorMessage);
        return of(errorMessage);
      })
    );
  }

  async executeAction(action: ChimpChatAction): Promise<void> {
    switch (action.type) {
      case 'navigate':
        if (action.route) {
          this.router.navigate([action.route], { queryParams: action.queryParams });
        }
        break;

      case 'smartBuilder':
        if (action.smartBuilderData) {
          sessionStorage.setItem('pendingTrainingRecommendation', JSON.stringify(action.smartBuilderData));
          this.router.navigate(['/account/training/smart-builder']);
        }
        break;

      case 'search':
        if (action.route) {
          this.router.navigate([action.route], { queryParams: action.queryParams });
        }
        break;

      case 'assignTraining':
        if (action.trainingId && action.tags && action.tags.length > 0) {
          try {
            await updateDoc(doc(this.firestore, `library/${action.trainingId}`), {
              assignedTags: action.tags
            });
            const tagList = action.tags.join(', ');
            await this.logActivity({
              actionType: 'assignTraining',
              description: `I assigned "${action.trainingName || 'a training'}" to the ${tagList} group${action.tags.length > 1 ? 's' : ''}.`,
              metadata: { trainingId: action.trainingId, trainingName: action.trainingName, tags: action.tags }
            });
          } catch (err) {
            console.error('Failed to assign training:', err);
          }
        }
        break;

      case 'createDraftInspection':
        if (action.inspectionName) {
          sessionStorage.setItem('pendingInspectionDraft', JSON.stringify({
            name: action.inspectionName,
            description: action.inspectionDescription || ''
          }));
        }
        this.router.navigate(['/account/self-inspections/new']);
        await this.logActivity({
          actionType: 'createDraftInspection',
          description: `I opened the inspection builder for "${action.inspectionName || 'a new inspection'}".`,
          metadata: { inspectionName: action.inspectionName }
        });
        break;

      case 'runComplianceCheck':
        await this.logActivity({
          actionType: 'runComplianceCheck',
          description: 'I ran a compliance check on your team\'s training and inspection status.'
        });
        break;

      default:
        console.warn('Unknown action type:', (action as any).type);
    }
  }

  addMessage(message: ChimpChatMessage): void {
    this.conversationHistory.push(message);
  }

  clearChat(): void {
    if (this.skipNextClear) {
      this.skipNextClear = false;
      return;
    }
    this.conversationHistory = [];
  }

  getConversationHistory(): ChimpChatMessage[] {
    return [...this.conversationHistory];
  }

  async logActivity(entry: {
    actionType: string;
    description: string;
    metadata?: Record<string, any>;
  }): Promise<void> {
    const teamId = this.accountService.aTeam?.id;
    if (!teamId) return;

    try {
      const activityRef = collection(this.firestore, `team/${teamId}/chimpActivity`);
      await addDoc(activityRef, {
        teamId,
        userId: this.accountService.user?.id || null,
        source: 'chat',
        actionType: entry.actionType,
        description: entry.description,
        metadata: entry.metadata || {},
        timestamp: new Date()
      });
    } catch (err) {
      console.error('Failed to log chimp activity:', err);
    }
  }

  getActivityLog(): Observable<ChimpActivity[]> {
    const teamId = this.accountService.aTeam?.id;
    if (!teamId) return of([]);

    const activityRef = collection(this.firestore, `team/${teamId}/chimpActivity`);
    const q = query(activityRef, orderBy('timestamp', 'desc'), limit(100));
    return collectionData(q, { idField: 'id' }) as Observable<ChimpActivity[]>;
  }
}
