import { Injectable } from "@angular/core";
import { combineLatest, Observable } from "rxjs";
import { Firestore, collection, collectionData, doc, updateDoc, addDoc, deleteDoc, query, where, orderBy, getDocs, limit } from "@angular/fire/firestore";
import { map } from "rxjs/operators";
import { AccountService, TeamMember } from "../account.service";
import { SelfInspection } from "../self-inspections/self-inspections.service";

export interface ParsedCsvMember {
  name: string;
  jobTitle: string;
  phone: string;
  email: string;
  preferEmail: boolean;
  errors: string[];
}

export interface CsvImportResult {
  success: boolean;
  added: number;
  errors: string[];
}

@Injectable({
  providedIn: "root"
})
export class TeamService {
  constructor(
    public db: Firestore,
    private accountService: AccountService
  ) {}

  getSelfInspections(): Observable<SelfInspection[]> {
    if (!this.accountService.aTeam?.id) {
      return new Observable(observer => observer.next([]));
    }
    const path = `team/${this.accountService.aTeam.id}/self-inspection`;
    const selfInspectionCollection = collection(this.db, path);
    return collectionData(selfInspectionCollection, { idField: "id" })
      .pipe(
        map((actions: any[]) => {
          return actions.map((data) => {
            const createdAt = data.createdAt?.toDate ? data.createdAt.toDate() : data.createdAt;
            const lastCompletedAt = data.lastCompletedAt?.toDate ? data.lastCompletedAt.toDate() : null;
            return { ...data, createdAt, lastCompletedAt };
          });
        })
      );
  }

  getFiles() {
    if (!this.accountService.aTeam?.id) {
      return new Observable(observer => observer.next([]));
    }
    const path = `team/${this.accountService.aTeam.id}/file`;
    const filesCollection = collection(this.db, path);
    return collectionData(filesCollection, { idField: "id" });
  }

  public addUserGroup(group): Promise<any> {
    if (!this.accountService.aTeam?.id) {
      return Promise.reject(new Error("Team not loaded"));
    }
    group.teamId = this.accountService.aTeam.id;
    const cleanedGroup = Object.fromEntries(
      Object.entries(group).filter(([_, v]) => v !== undefined)
    );
    return addDoc(collection(this.db, "user-groups"), cleanedGroup);
  }

  public archiveGroup(groupId: string): Promise<any> {
    return updateDoc(doc(this.db, `user-groups/${groupId}`), { archivedAt: new Date() });
  }

  getSystemAchievements(): Observable<any> {
    const achievementCollection = collection(this.accountService.db, "achievement");
    const achievementQuery = query(achievementCollection, orderBy("level"));
    return collectionData(achievementQuery, { idField: "id" });
  }

  /**
   * Smart delete: hard deletes the member if no history exists,
   * soft deletes (marks deleted) if survey responses or incident reports are tied to them.
   */
  async removeUser(user: TeamMember): Promise<any> {
    const hasHistory = await this.memberHasHistory(user.id);

    if (hasHistory) {
      // Soft delete – preserve the document for historical references
      return updateDoc(doc(this.db, `team-members/${user.id}`), {
        deleted: true,
        deletedAt: new Date()
      });
    } else {
      // Hard delete – no related data, safe to remove entirely
      return deleteDoc(doc(this.db, `team-members/${user.id}`));
    }
  }

  /**
   * Check whether a team member has any historical data tied to them
   * (survey responses, incident reports). Uses limit(1) for efficiency.
   */
  async memberHasHistory(memberId: string): Promise<boolean> {
    const responsesQuery = query(
      collection(this.db, "survey-response"),
      where("teamMemberId", "==", memberId),
      limit(1)
    );
    const incidentsQuery = query(
      collection(this.db, "incident-report"),
      where("submittedBy", "==", memberId),
      limit(1)
    );

    const [responses, incidents] = await Promise.all([
      getDocs(responsesQuery),
      getDocs(incidentsQuery)
    ]);

    return !responses.empty || !incidents.empty;
  }

  public getSurveysByTeamMember(memberId: string): Observable<any> {
    const surveyCollection = collection(this.db, "survey");
    const surveyQuery = query(surveyCollection, where("trainees", "array-contains", memberId));
    
    const responseCollection = collection(this.db, "survey-response");
    const responseQuery = query(responseCollection, where("teamMemberId", "==", memberId));
    
    return combineLatest([
      collectionData(surveyQuery, { idField: "id" }),
      collectionData(responseQuery, { idField: "id" }),
    ]);
  }

  // ============ CSV Import ============

  /**
   * Generate CSV template content
   */
  public generateCsvTemplate(): string {
    const headers = ['Name', 'Job Title', 'Phone Number', 'Email', 'Prefer SMS'];
    const exampleRows = [
      ['John Doe', 'Manager', '555-123-4567', 'john@example.com', 'Yes'],
      ['Jane Smith', 'Warehouse Associate', '555-987-6543', '', 'Yes'],
      ['Bob Wilson', 'Driver', '', 'bob@example.com', 'No']
    ];
    
    const csvContent = [
      headers.join(','),
      ...exampleRows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');
    
    return csvContent;
  }

  /**
   * Trigger download of CSV template file
   */
  public downloadCsvTemplate(): void {
    const csvContent = this.generateCsvTemplate();
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'team_import_template.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  /**
   * Parse CSV file and return parsed members with validation
   */
  public async parseCsvFile(file: File): Promise<ParsedCsvMember[]> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = (e) => {
        try {
          const text = e.target?.result as string;
          const lines = text.split(/\r?\n/).filter(line => line.trim());
          
          if (lines.length < 2) {
            reject(new Error('CSV file must have a header row and at least one data row'));
            return;
          }
          
          // Parse header
          const headers = this.parseCsvLine(lines[0]).map(h => h.toLowerCase().trim());
          const nameIdx = headers.findIndex(h => h.includes('name'));
          const jobIdx = headers.findIndex(h => h.includes('job') || h.includes('title'));
          const phoneIdx = headers.findIndex(h => h.includes('phone'));
          const emailIdx = headers.findIndex(h => h.includes('email'));
          const smsIdx = headers.findIndex(h => h.includes('sms') || h.includes('prefer'));
          
          if (nameIdx === -1) {
            reject(new Error('CSV must have a "Name" column'));
            return;
          }
          
          const parsedMembers: ParsedCsvMember[] = [];
          
          // Parse data rows
          for (let i = 1; i < lines.length; i++) {
            const values = this.parseCsvLine(lines[i]);
            const errors: string[] = [];
            
            const name = values[nameIdx]?.trim() || '';
            const jobTitle = jobIdx >= 0 ? values[jobIdx]?.trim() || '' : '';
            const phone = phoneIdx >= 0 ? this.formatPhone(values[phoneIdx]?.trim() || '') : '';
            const email = emailIdx >= 0 ? values[emailIdx]?.trim().toLowerCase() || '' : '';
            const preferSmsRaw = smsIdx >= 0 ? values[smsIdx]?.trim().toLowerCase() || '' : '';
            const preferEmail = preferSmsRaw === 'no' || preferSmsRaw === 'false' || preferSmsRaw === '0';
            
            // Validation
            if (!name) {
              errors.push(`Row ${i + 1}: Name is required`);
            }
            
            if (!preferEmail && !phone) {
              errors.push(`Row ${i + 1}: Phone is required when Prefer SMS is Yes`);
            }
            
            if (preferEmail && !email) {
              errors.push(`Row ${i + 1}: Email is required when Prefer SMS is No`);
            }
            
            if (phone && !this.isValidPhone(phone)) {
              errors.push(`Row ${i + 1}: Invalid phone number format`);
            }
            
            if (email && !this.isValidEmail(email)) {
              errors.push(`Row ${i + 1}: Invalid email format`);
            }
            
            parsedMembers.push({
              name,
              jobTitle,
              phone,
              email,
              preferEmail,
              errors
            });
          }
          
          resolve(parsedMembers);
        } catch (error) {
          reject(new Error('Failed to parse CSV file'));
        }
      };
      
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsText(file);
    });
  }

  /**
   * Parse a single CSV line handling quoted values
   */
  private parseCsvLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    
    result.push(current.trim());
    return result;
  }

  /**
   * Format phone number to (XXX) XXX-XXXX
   */
  private formatPhone(phone: string): string {
    const digits = phone.replace(/\D/g, '');
    if (digits.length === 10) {
      return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
    }
    if (digits.length === 11 && digits[0] === '1') {
      return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
    }
    return phone;
  }

  /**
   * Validate phone number (10-11 digits)
   */
  private isValidPhone(phone: string): boolean {
    const digits = phone.replace(/\D/g, '');
    return digits.length >= 10 && digits.length <= 11;
  }

  /**
   * Validate email format
   */
  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Import parsed CSV members into the team
   */
  public async importCsvMembers(members: ParsedCsvMember[]): Promise<CsvImportResult> {
    if (!this.accountService.aTeam?.id) {
      return { success: false, added: 0, errors: ['Team not loaded'] };
    }

    const validMembers = members.filter(m => m.errors.length === 0 && m.name);
    const allErrors = members.flatMap(m => m.errors);
    
    if (validMembers.length === 0) {
      return { success: false, added: 0, errors: allErrors.length ? allErrors : ['No valid members to import'] };
    }

    let added = 0;
    const importErrors: string[] = [];

    for (const member of validMembers) {
      try {
        const teamMember = {
          name: member.name,
          jobTitle: member.jobTitle || '',
          phone: member.phone || '',
          email: member.email || '',
          preferEmail: member.preferEmail,
          teamId: this.accountService.aTeam.id,
          createdAt: new Date(),
          tags: []
        };

        await addDoc(collection(this.db, 'team-members'), teamMember);
        added++;
      } catch (error) {
        importErrors.push(`Failed to add ${member.name}`);
      }
    }

    return {
      success: added > 0,
      added,
      errors: [...allErrors, ...importErrors]
    };
  }
}
