import { Injectable } from "@angular/core";
import { Observable, of } from "rxjs";
import {
  Firestore,
  collection,
  collectionData,
  doc,
  docData,
  query,
  orderBy,
  deleteDoc,
  updateDoc,
} from "@angular/fire/firestore";
import { map, catchError } from "rxjs/operators";

export interface ScrapeJobProgress {
  gridTotal: number;
  gridScanned: number;
  placesFound: number;
  placesScraped: number;
  emailsScraped: number;
  emailsFound: number;
  totalWithPhone: number;
  totalWithEmail: number;
  totalWithWebsite: number;
}

export interface ScrapeJobResult {
  name: string;
  phone: string;
  email: string;
  website: string;
  address: string;
  googleMapsUrl: string;
}

export interface ScrapeJob {
  id: string;
  niche: string;
  region: string;
  status: string;
  progress: ScrapeJobProgress;
  totalResults: number;
  csvUrl: string;
  results: ScrapeJobResult[];
  createdAt: Date;
  updatedAt: Date;
  lastHeartbeat: Date;
}

@Injectable()
export class OutreachService {
  constructor(private db: Firestore) {}

  getJobs(): Observable<ScrapeJob[]> {
    return collectionData(
      query(
        collection(this.db, "scrape-jobs"),
        orderBy("createdAt", "desc")
      ),
      { idField: "id" }
    ).pipe(
      map((jobs: any[]) =>
        jobs.map((data) => {
          const createdAt = data.createdAt?.toDate
            ? data.createdAt.toDate()
            : data.createdAt;
          const updatedAt = data.updatedAt?.toDate
            ? data.updatedAt.toDate()
            : data.updatedAt;
          const lastHeartbeat = data.lastHeartbeat?.toDate
            ? data.lastHeartbeat.toDate()
            : data.lastHeartbeat;
          return { ...data, createdAt, updatedAt, lastHeartbeat } as ScrapeJob;
        })
      ),
      catchError((error) => {
        console.error("Error loading scrape jobs:", error);
        return of([]);
      })
    );
  }

  getJob(jobId: string): Observable<ScrapeJob> {
    return docData(doc(this.db, `scrape-jobs/${jobId}`), {
      idField: "id",
    }).pipe(
      map((data: any) => {
        const createdAt = data.createdAt?.toDate
          ? data.createdAt.toDate()
          : data.createdAt;
        const updatedAt = data.updatedAt?.toDate
          ? data.updatedAt.toDate()
          : data.updatedAt;
        const lastHeartbeat = data.lastHeartbeat?.toDate
          ? data.lastHeartbeat.toDate()
          : data.lastHeartbeat;
        return { ...data, createdAt, updatedAt, lastHeartbeat } as ScrapeJob;
      }),
      catchError((error) => {
        console.error("Error loading scrape job:", error);
        return of(null as any);
      })
    );
  }

  updateResult(jobId: string, results: ScrapeJobResult[]): Promise<void> {
    return updateDoc(doc(this.db, `scrape-jobs/${jobId}`), { results }).catch(
      (error) => {
        console.error("Error updating result:", error);
        throw error;
      }
    );
  }

  deleteJob(jobId: string): Promise<void> {
    return deleteDoc(doc(this.db, `scrape-jobs/${jobId}`)).catch((error) => {
      console.error("Error deleting scrape job:", error);
      throw error;
    });
  }

  getStatusLabel(status: string, job?: ScrapeJob): string {
    if (job && this.isInterrupted(job)) {
      const phase: Record<string, string> = {
        scanning: "Interrupted during scan",
        scraping: "Interrupted during scraping",
        emails: "Interrupted during email search",
        exporting: "Interrupted during export",
      };
      return phase[status] || "Interrupted";
    }
    const labels: Record<string, string> = {
      created: "Created",
      scanning: "Scanning for businesses...",
      scan_complete: "Scan complete",
      scraping: "Scraping business details...",
      scrape_complete: "Scrape complete",
      emails: "Finding emails...",
      emails_complete: "Emails complete",
      exporting: "Exporting...",
      complete: "Complete",
      error: "Error",
    };
    return labels[status] || status;
  }

  getStatusColor(status: string, job?: ScrapeJob): string {
    if (job && this.isInterrupted(job)) return "#ff9800";
    if (status === "complete") return "#4caf50";
    if (status === "error") return "#f44336";
    if (status?.includes("complete")) return "#2196f3";
    return "#ff9800";
  }

  isRunning(status: string): boolean {
    return ["scanning", "scraping", "emails", "exporting"].includes(status);
  }

  isInterrupted(job: ScrapeJob): boolean {
    if (!this.isRunning(job.status)) return false;
    const heartbeat = job.lastHeartbeat;
    if (!heartbeat) return false;
    const now = new Date();
    const diffMs = now.getTime() - new Date(heartbeat).getTime();
    return diffMs > 2 * 60 * 1000;
  }

  getProgressPercent(job: ScrapeJob): number {
    if (!job?.progress) return 0;
    const p = job.progress;

    switch (job.status) {
      case "scanning":
        return p.gridTotal > 0 ? (p.gridScanned / p.gridTotal) * 33 : 0;
      case "scan_complete":
        return 33;
      case "scraping":
        return (
          33 +
          (p.placesFound > 0 ? (p.placesScraped / p.placesFound) * 33 : 0)
        );
      case "scrape_complete":
        return 66;
      case "emails":
        const websiteCount = p.totalWithWebsite || p.placesScraped;
        return (
          66 +
          (websiteCount > 0 ? (p.emailsScraped / websiteCount) * 27 : 0)
        );
      case "emails_complete":
      case "exporting":
        return 95;
      case "complete":
        return 100;
      default:
        return 0;
    }
  }

  downloadCsv(job: ScrapeJob): void {
    if (job.csvUrl) {
      window.open(job.csvUrl, "_blank");
      return;
    }

    // Fallback: generate CSV from results data
    if (job.results?.length) {
      const headers = [
        "Business Name",
        "Phone",
        "Email",
        "Website",
        "Address",
      ];
      const rows = job.results.map((r) =>
        [r.name, r.phone, r.email, r.website, r.address]
          .map((v) => `"${(v || "").replace(/"/g, '""')}"`)
          .join(",")
      );
      const csv = [headers.join(","), ...rows].join("\n");
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${job.niche}_${job.region}.csv`.replace(/\s+/g, "_");
      a.click();
      URL.revokeObjectURL(url);
    }
  }
}
