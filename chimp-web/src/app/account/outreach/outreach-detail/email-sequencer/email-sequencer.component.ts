import { Component, OnInit, OnDestroy } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { RouterModule, ActivatedRoute, Router } from "@angular/router";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatTooltipModule } from "@angular/material/tooltip";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import { NgxEditorModule, Editor, Toolbar } from "ngx-editor";
import {
  CampaignService,
  Campaign,
  SequenceStep,
  Recipient,
  OutreachSettings,
  OutreachLandingPage,
} from "../../campaign.service";
import { OutreachService, ScrapeJob } from "../../outreach.service";
import { AccountService } from "../../../account.service";
import { Subscription } from "rxjs";

type PanelTab = "sequence" | "recipients" | "landing-page";

@Component({
  standalone: true,
  selector: "app-email-sequencer",
  templateUrl: "./email-sequencer.component.html",
  styleUrls: ["./email-sequencer.component.css"],
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    MatProgressSpinnerModule,
    NgxEditorModule,
  ],
  providers: [OutreachService, CampaignService],
})
export class EmailSequencerComponent implements OnInit, OnDestroy {
  // Data
  job: ScrapeJob;
  campaign: Campaign | null = null;
  loading: boolean = true;

  // Tab state
  activeTab: PanelTab = "sequence";

  // Settings
  settings: OutreachSettings = {
    dailySendLimit: 100,
    sentToday: 0,
    sentTodayDate: "",
  };

  // Sequence editing
  selectedStepIndex: number = -1;
  editingStep: SequenceStep | null = null;

  // Rich text editor
  editor: Editor;
  toolbar: Toolbar = [
    ["bold", "italic", "underline"],
    ["ordered_list", "bullet_list"],
    ["link"],
    ["align_left", "align_center", "align_right"],
    ["undo", "redo"],
  ];

  // AI generation
  aiPrompt: string = "";
  generating: boolean = false;

  // Recipients
  recipients: Recipient[] = [];
  recipientFilter: string = "all";
  syncing: boolean = false;
  syncResult: { added: number; skippedInvalid: number } | null = null;

  // Campaign controls
  populating: boolean = false;
  populateResult: { recipientCount: number; skippedInvalid: number; skippedUnverified: number } | null = null;
  starting: boolean = false;
  pausing: boolean = false;

  // Test send
  testEmail: string = "";
  sendingTest: boolean = false;
  testSent: boolean = false;


  // Landing page
  landingPage: OutreachLandingPage | null = null;
  generatingLP: boolean = false;
  lpPrompt: string = "";
  lpGeneratedUrl: string = "";
  lpUrlCopied: boolean = false;

  private subs: Subscription[] = [];

  constructor(
    private campaignService: CampaignService,
    private outreachService: OutreachService,
    public accountService: AccountService,
    private route: ActivatedRoute,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.editor = new Editor();

    const jobId = this.route.snapshot.paramMap.get("jobId");
    if (jobId) {
      this.loadJob(jobId);
    }

    this.loadSettings();
  }

  ngOnDestroy(): void {
    this.subs.forEach((s) => s.unsubscribe());
    if (this.editor) this.editor.destroy();
  }

  // ── Data loading ──

  private loadJob(jobId: string): void {
    const sub = this.outreachService.getJob(jobId).subscribe((job) => {
      this.job = job;
      if (job) this.loadOrCreateCampaign(job);
    });
    this.subs.push(sub);
  }

  private loadOrCreateCampaign(job: ScrapeJob): void {
    const sub = this.campaignService
      .getCampaignForJob(job.id)
      .subscribe(async (campaign) => {
        if (campaign) {
          this.campaign = campaign;
          this.loading = false;
          this.loadRecipients();
          this.loadLandingPage();
          if (campaign.sequence?.length && this.selectedStepIndex === -1) {
            this.selectStep(0);
          }
        } else if (this.loading) {
          await this.campaignService.createCampaign(job);
          // subscription will pick up the new doc
        }
      });
    this.subs.push(sub);
  }

  private loadSettings(): void {
    const sub = this.campaignService.getGlobalSettings().subscribe((s) => {
      this.settings = s;
    });
    this.subs.push(sub);
  }

  // ── Navigation ──

  goBack(): void {
    if (this.job) {
      this.router.navigate([
        "account",
        "support",
        "outreach",
        this.job.id,
      ]);
    } else {
      this.router.navigate(["account", "support", "outreach"]);
    }
  }

  // ── Settings ──

  async saveDailyLimit(): Promise<void> {
    await this.campaignService.updateDailySendLimit(
      this.settings.dailySendLimit
    );
  }

  // ── Sequence step management ──

  addStep(): void {
    if (!this.campaign) return;
    const newStep: SequenceStep = {
      subject: "",
      bodyHtml: "",
      delayDays: this.campaign.sequence.length === 0 ? 0 : 3,
    };
    this.campaign.sequence = [...this.campaign.sequence, newStep];
    this.saveSequence();
    this.selectStep(this.campaign.sequence.length - 1);
  }

  removeStep(index: number): void {
    if (!this.campaign) return;
    this.campaign.sequence = this.campaign.sequence.filter(
      (_, i) => i !== index
    );
    this.saveSequence();
    if (this.selectedStepIndex === index) {
      this.selectedStepIndex = -1;
      this.editingStep = null;
    } else if (this.selectedStepIndex > index) {
      this.selectedStepIndex--;
    }
  }

  selectStep(index: number): void {
    this.selectedStepIndex = index;
    this.editingStep = { ...this.campaign!.sequence[index] };
  }

  saveStep(): void {
    if (!this.editingStep || this.selectedStepIndex < 0) return;
    this.campaign!.sequence[this.selectedStepIndex] = { ...this.editingStep };
    this.saveSequence();
  }

  private async saveSequence(): Promise<void> {
    if (!this.campaign) return;
    await this.campaignService.updateSequence(
      this.campaign.id,
      this.campaign.sequence
    );
  }

  // ── AI generation ──

  async autoGenerate(): Promise<void> {
    await this.generateEmailContent();
  }

  async generateWithPrompt(): Promise<void> {
    await this.generateEmailContent(this.aiPrompt);
  }

  private async generateEmailContent(prompt?: string): Promise<void> {
    if (!this.campaign || this.selectedStepIndex < 0) return;
    this.generating = true;
    try {
      const result = await this.campaignService.generateEmail({
        niche: this.campaign.niche,
        region: this.campaign.region,
        stepNumber: this.selectedStepIndex + 1,
        totalSteps: this.campaign.sequence.length,
        prompt: prompt || undefined,
      });
      this.editingStep = {
        ...this.editingStep!,
        subject: result.subject,
        bodyHtml: result.bodyHtml,
      };
      this.saveStep();
    } catch (err) {
      console.error("Error generating email:", err);
    } finally {
      this.generating = false;
    }
  }

  // ── Recipients ──

  private loadRecipients(): void {
    if (!this.campaign) return;
    const sub = this.campaignService
      .getRecipients(this.campaign.id)
      .subscribe((r) => {
        this.recipients = r;
      });
    this.subs.push(sub);
  }

  get filteredRecipients(): Recipient[] {
    if (this.recipientFilter === "all") return this.recipients;
    if (this.recipientFilter === "failed") {
      return this.recipients.filter(
        (r) => r.status === "failed" || r.status === "bounced"
      );
    }
    return this.recipients.filter((r) => r.status === this.recipientFilter);
  }

  get recipientStatusCounts(): Record<string, number> {
    const counts: Record<string, number> = {};
    this.recipients.forEach((r) => {
      counts[r.status] = (counts[r.status] || 0) + 1;
    });
    return counts;
  }

  async syncNewContacts(): Promise<void> {
    if (!this.campaign) return;
    this.syncing = true;
    this.syncResult = null;
    try {
      this.syncResult = await this.campaignService.syncRecipients(
        this.campaign.id
      );
    } catch (err) {
      console.error("Error syncing recipients:", err);
    } finally {
      this.syncing = false;
    }
  }

  async removeRecipient(recipient: Recipient): Promise<void> {
    if (!this.campaign) return;
    try {
      await this.campaignService.deleteRecipient(
        this.campaign.id,
        recipient.id
      );
    } catch (err) {
      console.error("Error removing recipient:", err);
    }
  }

  // ── Campaign controls ──

  async populateRecipients(): Promise<void> {
    if (!this.campaign) return;
    this.populating = true;
    this.populateResult = null;
    try {
      this.populateResult = await this.campaignService.populateRecipients(this.campaign.id);
      this.activeTab = "recipients";
    } catch (err) {
      console.error("Error populating recipients:", err);
    } finally {
      this.populating = false;
    }
  }

  async startCampaign(): Promise<void> {
    if (!this.campaign) return;
    this.starting = true;
    try {
      await this.campaignService.startCampaign(this.campaign.id);
    } catch (err) {
      console.error("Error starting campaign:", err);
    } finally {
      this.starting = false;
    }
  }

  async pauseCampaign(): Promise<void> {
    if (!this.campaign) return;
    this.pausing = true;
    try {
      await this.campaignService.pauseCampaign(this.campaign.id);
    } catch (err) {
      console.error("Error pausing campaign:", err);
    } finally {
      this.pausing = false;
    }
  }

  // ── Test send ──

  async sendTest(): Promise<void> {
    if (!this.campaign || !this.testEmail || this.selectedStepIndex < 0) return;
    this.sendingTest = true;
    this.testSent = false;
    try {
      await this.campaignService.sendTestEmail({
        campaignId: this.campaign.id,
        stepIndex: this.selectedStepIndex,
        testEmail: this.testEmail,
      });
      this.testSent = true;
      setTimeout(() => (this.testSent = false), 4000);
    } catch (err) {
      console.error("Error sending test:", err);
    } finally {
      this.sendingTest = false;
    }
  }

  // ── Landing page ──

  private loadLandingPage(): void {
    if (!this.campaign) return;
    const sub = this.campaignService
      .getLandingPage(this.campaign.id)
      .subscribe((lp) => {
        this.landingPage = lp;
      });
    this.subs.push(sub);
  }

  async generateLP(): Promise<void> {
    if (!this.campaign) return;
    this.generatingLP = true;
    try {
      const result = await this.campaignService.generateLandingPage(this.campaign.id);
      this.lpGeneratedUrl = result.url;
    } catch (err) {
      console.error("Error generating landing page:", err);
    } finally {
      this.generatingLP = false;
    }
  }

  async regenerateLP(): Promise<void> {
    if (!this.campaign) return;
    this.generatingLP = true;
    try {
      const result = await this.campaignService.generateLandingPage(
        this.campaign.id,
        this.lpPrompt.trim() || undefined
      );
      this.lpGeneratedUrl = result.url;
      this.lpPrompt = "";
    } catch (err) {
      console.error("Error regenerating landing page:", err);
    } finally {
      this.generatingLP = false;
    }
  }

  copyLandingPageUrl(): void {
    const url = this.landingPageUrl;
    if (!url) return;
    navigator.clipboard.writeText(url).then(() => {
      this.lpUrlCopied = true;
      setTimeout(() => (this.lpUrlCopied = false), 2500);
    });
  }

  get landingPageUrl(): string {
    if (!this.campaign?.landingPageSlug) return "";
    return `https://compliancechimp.com/lp/o/${this.campaign.landingPageSlug}`;
  }

  openLandingPage(): void {
    if (this.landingPageUrl) window.open(this.landingPageUrl, "_blank");
  }

  get clickThroughRate(): string {
    const sent = this.campaign?.stats?.totalSent || 0;
    const visitors = this.landingPage?.uniqueVisitors || 0;
    if (!sent) return "0";
    return Math.min((visitors / sent) * 100, 100).toFixed(1);
  }

  get recentDailyVisits(): { date: string; label: string; count: number; pct: number }[] {
    const byDay = this.landingPage?.visitsByDay;
    if (!byDay) return [];

    const days: { date: string; label: string; count: number; pct: number }[] = [];
    const today = new Date();

    for (let i = 13; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split("T")[0];
      const count = byDay[key] || 0;
      const month = d.toLocaleDateString("en-US", { month: "short" });
      const day = d.getDate();
      days.push({ date: key, label: `${month} ${day}`, count, pct: 0 });
    }

    const max = Math.max(...days.map((d) => d.count), 1);
    for (const d of days) {
      d.pct = (d.count / max) * 100;
    }
    return days;
  }

  // ── Helpers ──

  getStatusLabel(status: string): string {
    const labels: Record<string, string> = {
      draft: "Draft",
      active: "Active",
      paused: "Paused",
      completed: "Completed",
      queued: "Queued",
      sending: "Sending",
      failed: "Failed",
      unsubscribed: "Unsubscribed",
      bounced: "Bounced",
    };
    return labels[status] || status;
  }

  getStatusColor(status: string): string {
    const colors: Record<string, string> = {
      draft: "#9e9e9e",
      active: "#4caf50",
      paused: "#ff9800",
      completed: "#4caf50",
      queued: "#ff9800",
      sending: "#2196f3",
      failed: "#f44336",
      unsubscribed: "#9e9e9e",
      bounced: "#f44336",
    };
    return colors[status] || "#999";
  }
}
