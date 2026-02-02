import { Component, Output, EventEmitter, ViewChild, ElementRef, AfterViewChecked, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { CdkDrag, CdkDragHandle, CdkDragEnd } from '@angular/cdk/drag-drop';
import { ChimpChatService, ChimpChatMessage, ChimpChatAction } from './chimp-chat.service';
import { Subscription } from 'rxjs';

interface SuggestedPrompt {
  text: string;
  icon: string;
}

interface Position {
  x: number;
  y: number;
}

const POSITION_STORAGE_KEY = 'chimp_chat_position';
const PANEL_WIDTH = 400;
const PANEL_HEIGHT = 520;

@Component({
  selector: 'chimp-chat',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatIconModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    CdkDrag,
    CdkDragHandle
  ],
  templateUrl: './chimp-chat.component.html',
  styleUrls: ['./chimp-chat.component.scss']
})
export class ChimpChatComponent implements OnInit, AfterViewChecked, OnDestroy {
  private chimpChatService = inject(ChimpChatService);
  
  @Output() close = new EventEmitter<void>();
  @ViewChild('messagesContainer') private messagesContainer!: ElementRef;
  @ViewChild('messageInput') private messageInput!: ElementRef;

  messages: ChimpChatMessage[] = [];
  inputMessage: string = '';
  isLoading: boolean = false;
  dragPosition: Position = { x: 0, y: 0 };
  private shouldScrollToBottom = false;
  private subscription?: Subscription;

  suggestedPrompts: SuggestedPrompt[] = [
    { text: 'How do I add a team member?', icon: 'group_add' },
    { text: 'Do I have any trainings about PPE?', icon: 'search' },
    { text: 'Create a new training about hazard communication', icon: 'add_circle' },
    { text: 'What inspections are overdue?', icon: 'assignment_late' }
  ];

  ngOnInit(): void {
    this.loadPosition();
  }

  ngAfterViewChecked(): void {
    if (this.shouldScrollToBottom) {
      this.scrollToBottom();
      this.shouldScrollToBottom = false;
    }
  }

  private loadPosition(): void {
    try {
      const saved = localStorage.getItem(POSITION_STORAGE_KEY);
      if (saved) {
        const position = JSON.parse(saved) as Position;
        // Validate the position is still within viewport
        const maxX = window.innerWidth - PANEL_WIDTH;
        const maxY = window.innerHeight - PANEL_HEIGHT;
        this.dragPosition = {
          x: Math.min(Math.max(0, position.x), maxX),
          y: Math.min(Math.max(0, position.y), maxY)
        };
      } else {
        // Center the panel if no saved position
        this.centerPanel();
      }
    } catch {
      this.centerPanel();
    }
  }

  private centerPanel(): void {
    this.dragPosition = {
      x: (window.innerWidth - PANEL_WIDTH) / 2,
      y: (window.innerHeight - PANEL_HEIGHT) / 2
    };
  }

  onDragEnded(event: CdkDragEnd): void {
    const element = event.source.element.nativeElement;
    const rect = element.getBoundingClientRect();
    const position: Position = {
      x: rect.left,
      y: rect.top
    };
    try {
      localStorage.setItem(POSITION_STORAGE_KEY, JSON.stringify(position));
    } catch {}
  }

  ngOnDestroy(): void {
    if (this.subscription) {
      this.subscription.unsubscribe();
    }
    // Clear chat history when panel closes
    this.chimpChatService.clearChat();
  }

  closePanel(): void {
    this.close.emit();
  }

  sendMessage(): void {
    const message = this.inputMessage.trim();
    if (!message || this.isLoading) return;

    // Add user message
    const userMessage: ChimpChatMessage = {
      role: 'user',
      content: message,
      timestamp: new Date()
    };
    this.messages.push(userMessage);
    this.inputMessage = '';
    this.shouldScrollToBottom = true;

    // Show loading state
    this.isLoading = true;

    // Call the service
    this.subscription = this.chimpChatService.sendMessage(message).subscribe({
      next: (response) => {
        this.messages.push(response);
        this.isLoading = false;
        this.shouldScrollToBottom = true;
      },
      error: (error) => {
        console.error('ChimpChat error:', error);
        const errorMessage: ChimpChatMessage = {
          role: 'assistant',
          content: 'Sorry, I encountered an error. Please try again.',
          timestamp: new Date()
        };
        this.messages.push(errorMessage);
        this.isLoading = false;
        this.shouldScrollToBottom = true;
      }
    });
  }

  selectPrompt(prompt: SuggestedPrompt): void {
    this.inputMessage = prompt.text;
    this.sendMessage();
  }

  executeAction(action: ChimpChatAction): void {
    this.chimpChatService.executeAction(action);
  }

  onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendMessage();
    }
  }

  private scrollToBottom(): void {
    try {
      if (this.messagesContainer) {
        this.messagesContainer.nativeElement.scrollTop = 
          this.messagesContainer.nativeElement.scrollHeight;
      }
    } catch (err) {}
  }

  get showWelcome(): boolean {
    return this.messages.length === 0;
  }
}
