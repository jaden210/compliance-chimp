import { Injectable } from '@angular/core';
import { Functions, httpsCallable } from '@angular/fire/functions';
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
  type: 'navigate' | 'smartBuilder' | 'search' | 'tourNext';
  label: string;
  route?: string;
  queryParams?: Record<string, string>;
  smartBuilderData?: SmartBuilderData;
  icon?: string; // Material icon name for the button
  tourStepId?: string; // For tourNext: which step this button belongs to
  tourStepRoute?: string; // For tourNext: route to navigate to
  tourStepQueryParams?: Record<string, string>; // For tourNext: query params for navigation
}

export interface SmartBuilderData {
  name: string;
  description: string;
  cadence?: string;
  assignedTags?: string[];
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

  constructor(
    private functions: Functions,
    private router: Router,
    private accountService: AccountService
  ) {}

  sendMessage(message: string): Observable<ChimpChatMessage> {
    // Add user message to history
    const userMessage: ChimpChatMessage = {
      role: 'user',
      content: message,
      timestamp: new Date()
    };
    this.conversationHistory.push(userMessage);

    // Call the Cloud Function
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

  executeAction(action: ChimpChatAction): void {
    switch (action.type) {
      case 'navigate':
        if (action.route) {
          this.router.navigate([action.route], {
            queryParams: action.queryParams
          });
        }
        break;

      case 'smartBuilder':
        if (action.smartBuilderData) {
          // Store the recommendation in sessionStorage for the smart builder to pick up
          sessionStorage.setItem('pendingTrainingRecommendation', 
            JSON.stringify(action.smartBuilderData));
          this.router.navigate(['/account/training/smart-builder']);
        }
        break;

      case 'search':
        if (action.route) {
          this.router.navigate([action.route], {
            queryParams: action.queryParams
          });
        }
        break;

      default:
        console.warn('Unknown action type:', action.type);
    }
  }

  clearChat(): void {
    this.conversationHistory = [];
  }

  getConversationHistory(): ChimpChatMessage[] {
    return [...this.conversationHistory];
  }
}
