import { Component, Inject, OnDestroy, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogRef, MatDialogModule, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Functions, httpsCallable } from '@angular/fire/functions';

// Web Speech API types
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionResultList {
  length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  isFinal: boolean;
  length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: (event: SpeechRecognitionEvent) => void;
  onerror: (event: any) => void;
  onend: () => void;
  onstart: () => void;
  start(): void;
  stop(): void;
  abort(): void;
}

declare var webkitSpeechRecognition: {
  new (): SpeechRecognition;
};

declare var SpeechRecognition: {
  new (): SpeechRecognition;
};

@Component({
  standalone: true,
  selector: 'voice-article-dialog',
  templateUrl: './voice-article-dialog.component.html',
  styleUrls: ['./voice-article-dialog.component.css'],
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatTooltipModule
  ]
})
export class VoiceArticleDialog implements OnDestroy {
  public description: string = '';
  public isRecording: boolean = false;
  public isGenerating: boolean = false;
  public error: string = '';
  public recordingSupported: boolean = false;
  
  private recognition: SpeechRecognition | null = null;
  private interimTranscript: string = '';

  constructor(
    public dialogRef: MatDialogRef<VoiceArticleDialog>,
    @Inject(MAT_DIALOG_DATA) public data: { industry?: string },
    private functions: Functions,
    private ngZone: NgZone
  ) {
    this.initSpeechRecognition();
  }

  private initSpeechRecognition(): void {
    const SpeechRecognitionAPI = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    
    if (SpeechRecognitionAPI) {
      this.recordingSupported = true;
      this.recognition = new SpeechRecognitionAPI();
      this.recognition.continuous = true;
      this.recognition.interimResults = true;
      this.recognition.lang = 'en-US';

      this.recognition.onstart = () => {
        this.ngZone.run(() => {
          this.isRecording = true;
          this.error = '';
        });
      };

      this.recognition.onresult = (event: SpeechRecognitionEvent) => {
        this.ngZone.run(() => {
          let finalTranscript = '';
          this.interimTranscript = '';

          for (let i = event.resultIndex; i < event.results.length; i++) {
            const result = event.results[i];
            if (result.isFinal) {
              finalTranscript += result[0].transcript;
            } else {
              this.interimTranscript += result[0].transcript;
            }
          }

          if (finalTranscript) {
            this.description += (this.description ? ' ' : '') + finalTranscript.trim();
          }
        });
      };

      this.recognition.onerror = (event: any) => {
        this.ngZone.run(() => {
          this.isRecording = false;
          if (event.error === 'no-speech') {
            this.error = 'No speech detected. Please try again.';
          } else if (event.error === 'not-allowed') {
            this.error = 'Microphone access denied. Please allow microphone access in your browser settings.';
          } else {
            this.error = `Error: ${event.error}`;
          }
        });
      };

      this.recognition.onend = () => {
        this.ngZone.run(() => {
          this.isRecording = false;
        });
      };
    }
  }

  toggleRecording(): void {
    if (!this.recognition) return;

    if (this.isRecording) {
      this.recognition.stop();
    } else {
      this.error = '';
      this.recognition.start();
    }
  }

  async generateArticle(): Promise<void> {
    if (!this.description.trim()) {
      this.error = 'Please describe the article you want to create.';
      return;
    }

    this.isGenerating = true;
    this.error = '';

    try {
      const generateArticle = httpsCallable(this.functions, 'generateArticleFromDescription');
      const result: any = await generateArticle({
        description: this.description.trim(),
        industry: this.data?.industry || null
      });

      if (result.data?.success) {
        this.dialogRef.close({
          title: result.data.title,
          content: result.data.content
        });
      } else {
        this.error = 'Failed to generate article. Please try again.';
      }
    } catch (err: any) {
      console.error('Error generating article:', err);
      this.error = err.message || 'An error occurred while generating the article.';
    } finally {
      this.isGenerating = false;
    }
  }

  cancel(): void {
    if (this.recognition && this.isRecording) {
      this.recognition.stop();
    }
    this.dialogRef.close();
  }

  ngOnDestroy(): void {
    if (this.recognition && this.isRecording) {
      this.recognition.stop();
    }
  }
}
