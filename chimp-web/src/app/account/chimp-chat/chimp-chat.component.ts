import { Component, Output, EventEmitter, ViewChild, ElementRef, AfterViewChecked, OnDestroy, OnInit, OnChanges, SimpleChanges, inject, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { CdkDrag, CdkDragHandle, CdkDragEnd } from '@angular/cdk/drag-drop';
import { ChimpChatService, ChimpChatMessage, ChimpChatAction } from './chimp-chat.service';
import { TourService } from '../tour.service';
import { Subscription } from 'rxjs';

interface SuggestedPrompt {
  text: string;
  icon: string;
  variant?: 'tour';
}

interface Position {
  x: number;
  y: number;
}

export type ChimpChatMode = 'dialog' | 'sidenav';

const POSITION_STORAGE_KEY = 'chimp_chat_position';
const MODE_STORAGE_KEY = 'chimp_chat_mode';
const PANEL_WIDTH = 440;
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
    MatTooltipModule,
    CdkDrag,
    CdkDragHandle
  ],
  templateUrl: './chimp-chat.component.html',
  styleUrls: ['./chimp-chat.component.scss']
})
export class ChimpChatComponent implements OnInit, OnChanges, AfterViewChecked, OnDestroy {
  private chimpChatService = inject(ChimpChatService);
  private tourService = inject(TourService);
  private router = inject(Router);
  
  @Input() initialMessage: string | null = null;
  @Input() mode: ChimpChatMode = 'dialog';
  @Input() isMobile: boolean = false;
  @Output() close = new EventEmitter<void>();
  @Output() modeChange = new EventEmitter<ChimpChatMode>();
  @Output() minimize = new EventEmitter<void>();
  @Output() messageConsumed = new EventEmitter<void>();
  @ViewChild('messagesContainer') private messagesContainer!: ElementRef;
  @ViewChild('messageInput') private messageInput!: ElementRef;

  inputMessage: string = '';
  isLoading: boolean = false;
  
  // Use service's messages array for persistence across mode switches
  get messages(): ChimpChatMessage[] {
    return this.chimpChatService.messages;
  }
  dragPosition: Position = { x: 0, y: 0 };
  private shouldScrollToBottom = false;
  private subscription?: Subscription;
  private hasProcessedInitialMessage = false;

  suggestedPrompts: SuggestedPrompt[] = [
    { text: 'How do I add a team member?', icon: 'group_add' },
    { text: 'Do I have any trainings about PPE?', icon: 'search' },
    { text: 'Create a new training about hazard communication', icon: 'add_circle' },
    { text: 'What inspections are overdue?', icon: 'assignment_late' },
    { text: 'Show me the ropes again', icon: 'explore', variant: 'tour' }
  ];

  ngOnInit(): void {
    this.loadPosition();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['initialMessage']) {
      if (!this.initialMessage) {
        this.hasProcessedInitialMessage = false;
      } else if (!this.hasProcessedInitialMessage) {
        this.hasProcessedInitialMessage = true;
        setTimeout(() => {
          this.processInitialMessage(this.initialMessage!);
        }, 100);
      }
    }
  }

  private processInitialMessage(message: string): void {
    // Check if this is a tour trigger
    if (this.tourService.isTourTrigger(message)) {
      this.startTour();
    } else {
      // Regular message - submit it
      this.inputMessage = message;
      this.sendMessage();
    }
    this.messageConsumed.emit();
  }

  private startTour(): void {
    const step = this.tourService.startTour();
    if (step) {
      // Add user message
      const userMessage: ChimpChatMessage = {
        role: 'user',
        content: 'Take the tour',
        timestamp: new Date()
      };
      this.chimpChatService.addMessage(userMessage);
      
      // Build and add the tour response
      const response = this.tourService.buildTourResponse(step);
      const assistantMessage: ChimpChatMessage = {
        role: 'assistant',
        content: response.message,
        actions: response.actions,
        timestamp: new Date()
      };
      this.chimpChatService.addMessage(assistantMessage);
      this.shouldScrollToBottom = true;
    }
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

  minimizePanel(): void {
    this.minimize.emit();
  }

  toggleMode(): void {
    const newMode: ChimpChatMode = this.mode === 'dialog' ? 'sidenav' : 'dialog';
    this.modeChange.emit(newMode);
  }

  sendMessage(): void {
    const message = this.inputMessage.trim();
    if (!message || this.isLoading) return;

    // Check if this is a tour trigger
    if (this.tourService.isTourTrigger(message)) {
      this.inputMessage = '';
      this.startTour();
      return;
    }

    // Check if this is a tour continue command
    if (this.tourService.isTourContinue(message)) {
      this.inputMessage = '';
      // Create an action for the current step to advance the tour
      const currentStep = this.tourService.getCurrentStep();
      if (currentStep) {
        this.handleTourNext({ 
          type: 'tourNext', 
          label: 'next',
          tourStepId: currentStep.id 
        });
      }
      return;
    }

    this.inputMessage = '';
    this.shouldScrollToBottom = true;

    // Show loading state
    this.isLoading = true;

    // Call the service - it handles adding both user and assistant messages
    this.subscription = this.chimpChatService.sendMessage(message).subscribe({
      next: () => {
        this.isLoading = false;
        this.shouldScrollToBottom = true;
      },
      error: (error) => {
        console.error('ChimpChat error:', error);
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
    // Handle tour next action specially
    if (action.type === 'tourNext') {
      this.handleTourNext(action);
      return;
    }
    this.chimpChatService.executeAction(action);
  }

  private handleTourNext(action: ChimpChatAction): void {
    const currentStep = this.tourService.getCurrentStep();
    
    // Check if this button is from the current step
    const isCurrentStep = currentStep && action.tourStepId === currentStep.id;
    
    if (isCurrentStep) {
      // Advance to the next step
      const nextStep = this.tourService.nextStep();
      if (nextStep) {
        // Navigate to the next step's location
        if (nextStep.navigationAction.route) {
          this.chimpChatService.executeAction(nextStep.navigationAction);
        }
        
        // Build and add the next step response
        const response = this.tourService.buildTourResponse(nextStep);
        const assistantMessage: ChimpChatMessage = {
          role: 'assistant',
          content: response.message,
          actions: response.actions,
          timestamp: new Date()
        };
        this.chimpChatService.addMessage(assistantMessage);
        this.shouldScrollToBottom = true;
      } else {
        // Tour is complete - the service already marked it as completed
        this.shouldScrollToBottom = true;
      }
    } else {
      // Old button clicked - just navigate without advancing the tour
      if (action.tourStepRoute) {
        this.router.navigate([action.tourStepRoute], {
          queryParams: action.tourStepQueryParams
        });
      }
    }
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
