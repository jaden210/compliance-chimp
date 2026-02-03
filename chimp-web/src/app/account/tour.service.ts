import { Injectable, signal } from "@angular/core";
import { WelcomeService } from "./welcome.service";
import { ChimpChatAction } from "./chimp-chat/chimp-chat.service";

export interface TourStep {
  id: string;
  title: string;
  content: string;
  navigationAction: ChimpChatAction;
  nextLabel?: string; // Label for the next button, omit on last step
  nextIcon?: string; // Icon for the next button
  secondaryAction?: ChimpChatAction; // Optional secondary action button
}

const TOUR_STEPS: TourStep[] = [
  {
    id: 'chimp-chat',
    title: 'ChimpChat',
    content: "I'm Ulysses, your compliance assistant. I can help you navigate the app, answer questions about OSHA requirements, create custom trainings in seconds, and find information about your team's compliance status.<br><br>Just type what you need. You can open this chat anytime by clicking the chimp icon in the bottom corner.<br><br>Let's swing through the basics.",
    navigationAction: {
      type: 'navigate',
      label: 'Go to Dashboard',
      route: '/account/dashboard'
    },
    nextLabel: 'Next: Team',
    nextIcon: 'supervisor_account'
  },
  {
    id: 'team',
    title: 'Team',
    content: "Your team members are already set up from onboarding. This is where you manage them.<br><br>You'll notice everyone has tags based on their job title. Tags are useful because they let you assign trainings to entire groups at once instead of picking people one by one.<br><br>You can also add managers, who get visibility into their team's training progress and can run trainings themselves. Each person's SMS and email notification preferences can be configured here too.",
    navigationAction: {
      type: 'navigate',
      label: 'Go to Team',
      route: '/account/team'
    },
    secondaryAction: {
      type: 'navigate',
      label: 'Learn about tags',
      route: '/account/team',
      queryParams: { showTagsHelp: 'true' },
      icon: 'label'
    },
    nextLabel: 'Next: Training',
    nextIcon: 'explore'
  },
  {
    id: 'training',
    title: 'Training',
    content: "I built out a training library for your industry during setup. You'll see articles covering the essentials, things like hazard communication, PPE, emergency procedures, whatever's relevant to your work.<br><br>Each training is already assigned to the right team members based on their tags.<br><br>Turn on auto-send and SMS/email reminders go out automatically when someone's training is due. No more chasing people down.<br><br>If you need something specific that's not here, just ask me. I can create a new training in about 30 seconds using the Smart Builder.",
    navigationAction: {
      type: 'navigate',
      label: 'Go to Training',
      route: '/account/training'
    },
    secondaryAction: {
      type: 'navigate',
      label: 'Configure auto-send',
      route: '/account/training',
      queryParams: { showAutoSend: 'true' },
      icon: 'schedule_send'
    },
    nextLabel: 'Next: Training Details',
    nextIcon: 'article'
  },
  {
    id: 'training-detail',
    title: 'Training Details',
    content: "Here's what a training looks like inside. You'll find the full content, who's assigned, and who's completed it.<br><br>Each training has a cadence, which is how often people need to retake it. Annual is common, but you can set quarterly, monthly, or just once.<br><br>You can also start a training session right from here, which is useful for group meetings or one-on-ones.",
    navigationAction: {
      type: 'navigate',
      label: 'Go to Training',
      route: '/account/training',
      queryParams: { openFirst: 'true' }
    },
    nextLabel: 'Next: Inspections',
    nextIcon: 'import_contacts'
  },
  {
    id: 'inspections',
    title: 'Inspections',
    content: "I also set up self-inspections based on your industry. These are regular checklists, things like fire extinguisher checks, first aid kit inspections, safety walks, and equipment reviews.<br><br>Each one has a frequency, whether that's weekly, monthly, or quarterly. Compliance Chimp tracks when they're due and nudges you when it's time.<br><br>Click into any inspection to run it. Completed inspections are stored for your records, which matters when an auditor comes knocking.",
    navigationAction: {
      type: 'navigate',
      label: 'Go to Inspections',
      route: '/account/self-inspections'
    },
    nextLabel: 'Next: Incidents',
    nextIcon: 'assignment_late'
  },
  {
    id: 'incidents',
    title: 'Incidents',
    content: "This is where incident reports live. Your team members can report safety incidents through their portal, and everything shows up here.<br><br>You'll see what happened, when it happened, and any follow-up actions.<br><br>It's empty right now, which is honestly the goal. But when something does happen, you'll have a clear record and a proper paper trail.",
    navigationAction: {
      type: 'navigate',
      label: 'Go to Incidents',
      route: '/account/incident-reports'
    },
    nextLabel: 'Next: Files',
    nextIcon: 'folder'
  },
  {
    id: 'files',
    title: 'Files',
    content: "Upload any documents your team needs access to. Safety manuals, SOPs, emergency procedures, company policies, whatever's relevant.<br><br>You can enable the Resource Library to make selected files available to your team members through their portal.<br><br>Keeps everything organized in one tree, so to speak, instead of scattered across emails and shared drives.",
    navigationAction: {
      type: 'navigate',
      label: 'Go to Files',
      route: '/account/files'
    },
    nextLabel: 'Next: Events',
    nextIcon: 'event_note'
  },
  {
    id: 'events',
    title: 'Events',
    content: "The Events tab shows everything that happens across your compliance program. Trainings completed, inspections run, incidents reported.<br><br>Think of it as your compliance timeline. It's useful for getting a quick sense of activity, and invaluable when you need to prove to an auditor that yes, you actually did the thing.",
    navigationAction: {
      type: 'navigate',
      label: 'Go to Events',
      route: '/account/event'
    },
    nextLabel: 'Next: Account',
    nextIcon: 'person'
  },
  {
    id: 'account',
    title: 'Account',
    content: "The Account tab is where you can upload your company logo to brand your team's experience. Makes things look a bit more official.<br><br>This is also where subscription management lives. You've got a 14-day trial to explore everything. When you're ready to continue, this is where you'll set that up.",
    navigationAction: {
      type: 'navigate',
      label: 'Go to Account',
      route: '/account/account'
    },
    nextLabel: 'Finish Tour',
    nextIcon: 'check_circle'
  },
  {
    id: 'complete',
    title: 'Tour Complete',
    content: "That covers the territory. Your compliance program is already set up with trainings and inspections tailored to your team.<br><br>I'd suggest poking around the training library to see what's there, or running your first inspection to get a feel for how it works.<br><br>If you need anything, I'm always here. Just click the chimp. Type 'take the tour' if you ever want to run through this again.",
    navigationAction: {
      type: 'navigate',
      label: 'Go to Dashboard',
      route: '/account/dashboard'
    }
    // No nextLabel - this is the final step
  }
];

// Phrases that trigger the tour
export const TOUR_TRIGGER_PHRASES = [
  // Direct tour requests
  'take the tour',
  'take a tour',
  'start tour',
  'start the tour',
  'begin tour',
  'begin the tour',
  'give me a tour',
  'give me the tour',
  'guided tour',
  'run the tour',
  'run tour',
  'do the tour',
  'do tour',
  'tour please',
  'tour me',
  'tour',
  
  // Getting started phrases
  'get started',
  'getting started',
  'help me get started',
  'how do i get started',
  'where do i start',
  'where should i start',
  'how to start',
  'let\'s get started',
  'lets get started',
  
  // Show me around
  'show me around',
  'show me the app',
  'show me how',
  'show me everything',
  'walk me through',
  'walkthrough',
  'walk through',
  
  // Tutorial/intro requests
  'tutorial',
  'intro',
  'introduction',
  'onboarding',
  'orientation',
  'overview',
  'demo',
  'demonstration',
  
  // Help/learning phrases
  'how does this work',
  'how do i use this',
  'how to use',
  'teach me',
  'explain the app',
  'what can you do',
  'what can i do',
  'what is this',
  'new here',
  'i\'m new',
  'im new',
  'first time',
  'just signed up',
  'just joined'
];

@Injectable({
  providedIn: "root"
})
export class TourService {
  private currentStepIndex = signal<number>(-1); // -1 means tour not active
  private isActive = signal<boolean>(false);

  constructor(private welcomeService: WelcomeService) {}

  // Check if a message is a tour trigger
  isTourTrigger(message: string): boolean {
    const lowerMessage = message.toLowerCase().trim();
    return TOUR_TRIGGER_PHRASES.some(phrase => lowerMessage.includes(phrase));
  }

  // Check if message is asking to continue the tour
  isTourContinue(message: string): boolean {
    const lowerMessage = message.toLowerCase().trim();
    const continuePhrases = ['next', 'continue', 'continue tour', 'next step'];
    return this.isActive() && continuePhrases.some(phrase => lowerMessage.includes(phrase));
  }

  // Start or restart the tour
  startTour(): TourStep {
    this.currentStepIndex.set(0);
    this.isActive.set(true);
    return TOUR_STEPS[0];
  }

  // Get current step
  getCurrentStep(): TourStep | null {
    const index = this.currentStepIndex();
    if (index < 0 || index >= TOUR_STEPS.length) {
      return null;
    }
    return TOUR_STEPS[index];
  }

  // Advance to next step
  nextStep(): TourStep | null {
    const currentIndex = this.currentStepIndex();
    const nextIndex = currentIndex + 1;

    if (nextIndex >= TOUR_STEPS.length) {
      // Already past the end
      this.completeTour();
      return null;
    }

    this.currentStepIndex.set(nextIndex);
    const nextStep = TOUR_STEPS[nextIndex];
    
    // If this is the final step (no nextLabel), mark tour as complete
    if (!nextStep.nextLabel) {
      this.completeTour();
    }
    
    return nextStep;
  }

  // Get a specific step by index
  getStep(index: number): TourStep | null {
    if (index < 0 || index >= TOUR_STEPS.length) {
      return null;
    }
    return TOUR_STEPS[index];
  }

  // Check if tour is currently active
  isTourActive(): boolean {
    return this.isActive();
  }

  // Get total number of steps
  getTotalSteps(): number {
    return TOUR_STEPS.length;
  }

  // Get current step number (1-based for display)
  getCurrentStepNumber(): number {
    return this.currentStepIndex() + 1;
  }

  // Complete the tour
  completeTour(): void {
    this.isActive.set(false);
    this.currentStepIndex.set(-1);
    this.welcomeService.completeTour();
  }

  // Exit tour without completing
  exitTour(): void {
    this.isActive.set(false);
    this.currentStepIndex.set(-1);
  }

  // Build the response for the current tour step
  buildTourResponse(step: TourStep): { message: string; actions: ChimpChatAction[] } {
    const actions: ChimpChatAction[] = [];
    
    // Add secondary action first if present (so it appears before the Next button)
    if (step.secondaryAction) {
      actions.push(step.secondaryAction);
    }
    
    // Add next step button if not the last step (this will navigate AND advance)
    if (step.nextLabel) {
      // Find the next step to get its navigation info
      const currentIndex = TOUR_STEPS.findIndex(s => s.id === step.id);
      const nextStep = currentIndex >= 0 && currentIndex < TOUR_STEPS.length - 1 
        ? TOUR_STEPS[currentIndex + 1] 
        : null;
      
      actions.push({
        type: 'tourNext',
        label: step.nextLabel,
        icon: step.nextIcon,
        tourStepId: step.id,
        tourStepRoute: nextStep?.navigationAction.route,
        tourStepQueryParams: nextStep?.navigationAction.queryParams
      });
    } else {
      // Final step - add actions to explore existing content
      actions.push({
        type: 'navigate',
        label: 'Go to Training',
        route: '/account/training',
        icon: 'explore'
      });
      actions.push({
        type: 'navigate',
        label: 'Run an Inspection',
        route: '/account/self-inspections',
        icon: 'import_contacts'
      });
    }

    return {
      message: step.content,
      actions
    };
  }
}
