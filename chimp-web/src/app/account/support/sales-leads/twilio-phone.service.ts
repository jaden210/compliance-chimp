import { Injectable, inject, signal } from '@angular/core';
import { Functions, httpsCallable } from '@angular/fire/functions';

export interface IncomingCallInfo {
  callerNumber: string;
  callerName: string;
  leadId: string;
  businessName: string;
  call: any;
}

@Injectable({ providedIn: 'root' })
export class TwilioPhoneService {
  private readonly functions = inject(Functions);
  private device: any = null;
  private activeCall: any = null;
  private initialized = false;

  readonly deviceReady = signal(false);
  readonly incomingCall = signal<IncomingCallInfo | null>(null);
  readonly callActive = signal(false);
  readonly callMuted = signal(false);
  readonly activeCallLeadId = signal<string | null>(null);

  async initDevice(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    try {
      const fn = httpsCallable<any, { token: string; identity: string }>(
        this.functions,
        'getTwilioVoiceToken'
      );
      const result = await fn({});
      const { token } = result.data;

      const { Device } = await import('@twilio/voice-sdk');
      this.device = new Device(token);

      this.device.on('registered', () => {
        this.deviceReady.set(true);
      });

      this.device.on('incoming', (call: any) => {
        const params: Map<string, string> = call.customParameters || new Map();
        this.incomingCall.set({
          callerNumber: call.parameters?.From || 'Unknown',
          callerName: params.get('callerName') || '',
          leadId: params.get('leadId') || '',
          businessName: params.get('businessName') || '',
          call,
        });

        call.on('cancel', () => this.incomingCall.set(null));
        call.on('disconnect', () => {
          this.incomingCall.set(null);
          this.activeCall = null;
          this.callActive.set(false);
          this.callMuted.set(false);
          this.activeCallLeadId.set(null);
        });
      });

      this.device.on('error', (err: any) => {
        console.error('Twilio Device error:', err);
      });

      await this.device.register();
    } catch (err) {
      console.error('Failed to init Twilio device:', err);
      this.initialized = false;
    }
  }

  acceptIncoming(): void {
    const incoming = this.incomingCall();
    if (!incoming) return;
    incoming.call.accept();
    this.activeCall = incoming.call;
    this.callActive.set(true);
    this.callMuted.set(false);
    this.activeCallLeadId.set(incoming.leadId || null);
    this.incomingCall.set(null);
  }

  declineIncoming(): void {
    const incoming = this.incomingCall();
    if (!incoming) return;
    incoming.call.reject();
    this.incomingCall.set(null);
  }

  async makeCall(phoneNumber: string, leadId: string, callerUid?: string): Promise<void> {
    if (!this.device) await this.initDevice();
    if (!this.device) throw new Error('Twilio device not ready');

    const call = await this.device.connect({
      params: { To: phoneNumber, leadId, ...(callerUid ? { callerUid } : {}) },
    });

    this.activeCall = call;
    this.callActive.set(true);
    this.callMuted.set(false);
    this.activeCallLeadId.set(leadId);

    call.on('disconnect', () => {
      this.activeCall = null;
      this.callActive.set(false);
      this.callMuted.set(false);
      this.activeCallLeadId.set(null);
    });
  }

  toggleMute(): void {
    if (!this.activeCall) return;
    const muted = !this.callMuted();
    this.activeCall.mute(muted);
    this.callMuted.set(muted);
  }

  hangUp(): void {
    if (this.activeCall) {
      this.activeCall.disconnect();
      this.activeCall = null;
    }
    this.callActive.set(false);
    this.callMuted.set(false);
    this.activeCallLeadId.set(null);
  }

  destroy(): void {
    this.hangUp();
    if (this.device) {
      this.device.destroy();
      this.device = null;
    }
    this.initialized = false;
    this.deviceReady.set(false);
    this.incomingCall.set(null);
  }
}
