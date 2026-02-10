import { Injectable } from "@angular/core";
import { AppService } from "../app.service";
import { Firestore, collection, doc, setDoc, addDoc, updateDoc } from "@angular/fire/firestore";
import { Auth } from "@angular/fire/auth";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { BehaviorSubject } from "rxjs";

const STORAGE_KEY = 'chimp_challenge_state';
const CHALLENGE_DURATION_SECONDS = 360; // 6 minutes

export interface ChallengeState {
  startTime: number | null;
  pausedAt: number | null;
  totalPausedTime: number;
  isPaused: boolean;
  isComplete: boolean;
  finalTime: number | null;
  // Form data
  businessName: string;
  businessWebsite: string;
  industry: string;
  name: string;
  email: string;
  teamId: string | null;
}

@Injectable({ providedIn: 'root' })
export class ChallengeService {
  private state: ChallengeState = this.getInitialState();
  private timerInterval: any = null;
  
  // Observable for components to subscribe to timer updates
  public elapsedSeconds$ = new BehaviorSubject<number>(0);
  public isPaused$ = new BehaviorSubject<boolean>(false);
  public isComplete$ = new BehaviorSubject<boolean>(false);

  constructor(
    private appService: AppService,
    private db: Firestore,
    private auth: Auth
  ) {
    this.loadState();
    if (this.state.startTime && !this.state.isComplete) {
      if (this.state.isPaused) {
        // Resume from paused state
        this.updateElapsed();
      } else {
        // Start the interval
        this.startInterval();
      }
    }
  }

  private getInitialState(): ChallengeState {
    return {
      startTime: null,
      pausedAt: null,
      totalPausedTime: 0,
      isPaused: false,
      isComplete: false,
      finalTime: null,
      businessName: '',
      businessWebsite: '',
      industry: '',
      name: '',
      email: '',
      teamId: null
    };
  }

  private loadState(): void {
    try {
      const stored = sessionStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        this.state = { ...this.getInitialState(), ...parsed };
        this.isPaused$.next(this.state.isPaused);
        this.isComplete$.next(this.state.isComplete);
        
        // If was paused when page closed, calculate additional paused time
        if (this.state.isPaused && this.state.pausedAt) {
          // Time was paused, we'll resume from where they left off
        }
      }
    } catch (e) {
      console.error('Error loading challenge state:', e);
    }
  }

  private saveState(): void {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch (e) {
      console.error('Error saving challenge state:', e);
    }
  }

  // Timer methods
  startTimer(): void {
    if (!this.state.startTime) {
      this.state.startTime = Date.now();
      this.state.isPaused = false;
      this.state.isComplete = false;
      this.isPaused$.next(false);
      this.isComplete$.next(false);
      this.saveState();
    }
    this.startInterval();
  }

  private startInterval(): void {
    if (this.timerInterval) return;
    
    this.timerInterval = setInterval(() => {
      this.updateElapsed();
    }, 100);
  }

  private updateElapsed(): void {
    if (!this.state.startTime || this.state.isPaused) return;
    
    const now = Date.now();
    const elapsed = Math.floor((now - this.state.startTime - this.state.totalPausedTime) / 1000);
    this.elapsedSeconds$.next(elapsed);
  }

  pauseTimer(): void {
    if (this.state.isPaused || this.state.isComplete) return;
    
    this.state.isPaused = true;
    this.state.pausedAt = Date.now();
    this.isPaused$.next(true);
    
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
    
    this.saveState();
  }

  resumeTimer(): void {
    if (!this.state.isPaused || this.state.isComplete) return;
    
    if (this.state.pausedAt) {
      this.state.totalPausedTime += Date.now() - this.state.pausedAt;
    }
    
    this.state.isPaused = false;
    this.state.pausedAt = null;
    this.isPaused$.next(false);
    this.saveState();
    
    this.startInterval();
  }

  stopTimer(): void {
    if (this.state.isComplete) return;
    
    const elapsed = this.getElapsedSeconds();
    this.state.isComplete = true;
    this.state.finalTime = elapsed;
    this.isComplete$.next(true);
    
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
    
    this.saveState();
  }

  getElapsedSeconds(): number {
    if (!this.state.startTime) return 0;
    
    if (this.state.isComplete && this.state.finalTime !== null) {
      return this.state.finalTime;
    }
    
    const now = this.state.isPaused && this.state.pausedAt ? this.state.pausedAt : Date.now();
    return Math.floor((now - this.state.startTime - this.state.totalPausedTime) / 1000);
  }

  getRemainingSeconds(): number {
    const elapsed = this.getElapsedSeconds();
    return Math.max(0, CHALLENGE_DURATION_SECONDS - elapsed);
  }

  didBeatTimer(): boolean {
    return this.getElapsedSeconds() < CHALLENGE_DURATION_SECONDS;
  }

  getTimerDisplay(): string {
    const elapsed = this.getElapsedSeconds();
    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

  getFinalTimeDisplay(): string {
    const elapsed = this.getElapsedSeconds();
    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

  // Form data methods
  setBusinessInfo(businessName: string, businessWebsite: string, industry: string): void {
    this.state.businessName = businessName;
    this.state.businessWebsite = businessWebsite;
    this.state.industry = industry;
    this.saveState();
  }

  setUserInfo(name: string, email: string): void {
    this.state.name = name;
    this.state.email = email;
    this.appService.email = email;
    this.saveState();
  }

  setTeamId(teamId: string): void {
    this.state.teamId = teamId;
    this.saveState();
  }

  get businessName(): string { return this.state.businessName; }
  get businessWebsite(): string { return this.state.businessWebsite; }
  get industry(): string { return this.state.industry; }
  get name(): string { return this.state.name; }
  get email(): string { return this.state.email; }
  get teamId(): string | null { return this.state.teamId; }
  get isTimerStarted(): boolean { return this.state.startTime !== null; }

  // Auth and database methods
  createAuthUser(password: string): Promise<any> {
    return createUserWithEmailAndPassword(this.auth, this.state.email, password)
      .catch(error => {
        console.error(error);
        throw error;
      });
  }

  createTeam(userId: string): Promise<string> {
    // Analytics tracking is handled in the step2 component
    const teamData = {
      createdAt: new Date(),
      ownerId: userId,
      name: this.state.businessName,
      website: this.state.businessWebsite,
      industry: this.state.industry,
      email: this.state.email,
      disabled: false,
      createdVia: 'challenge',
      autoStartTrainings: true  // New teams default to auto-start enabled
    };
    
    return addDoc(collection(this.db, "team"), teamData)
      .then(team => {
        this.state.teamId = team.id;
        this.saveState();
        return team.id;
      })
      .catch(error => {
        console.error(error);
        throw error;
      });
  }

  createUser(user: any, teamId: string): Promise<any> {
    const userData = {
      id: user.user.uid,
      email: user.user.email,
      profileUrl: user.user.photoURL || null,
      name: this.state.name,
      jobTitle: null,
      isManager: false,
      teamId: teamId,
      createdAt: new Date(),
      disabledBy: null,
      linkedMemberId: null as string | null
    };
    
    return setDoc(doc(this.db, `user/${userData.id}`), userData)
      .then(() => {
        // Also create a linked team-members doc so the owner gets trainings, surveys, etc.
        const memberData = {
          name: this.state.name,
          email: user.user.email,
          phone: null,
          teamId: teamId,
          createdAt: new Date(),
          tags: [],
          preferEmail: true,
          linkedUserId: user.user.uid,
          welcomeSent: true // Owner doesn't need a welcome message
        };
        // Remove null fields
        const cleanedMember = Object.fromEntries(
          Object.entries(memberData).filter(([_, v]) => v !== null)
        );
        return addDoc(collection(this.db, 'team-members'), cleanedMember)
          .then(memberDoc => {
            // Link the user doc back to the team member
            userData.linkedMemberId = memberDoc.id;
            return updateDoc(doc(this.db, `user/${userData.id}`), { linkedMemberId: memberDoc.id })
              .then(() => userData);
          });
      })
      .catch(error => {
        console.error(error);
        throw error;
      });
  }

  // Reset for new challenge
  reset(): void {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
    
    this.state = this.getInitialState();
    this.elapsedSeconds$.next(0);
    this.isPaused$.next(false);
    this.isComplete$.next(false);
    
    sessionStorage.removeItem(STORAGE_KEY);
  }
}
