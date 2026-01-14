import { Component, OnInit, ViewChild, OnDestroy } from "@angular/core";
import { CommonModule, DatePipe } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { AccountService, User } from "../account.service";
import { map, tap, share } from "rxjs/operators";
import { ImagesDialogComponent } from "../images-dialog/images-dialog.component";
import { MatDialog, MatDialogModule } from "@angular/material/dialog";
import { MatSnackBar, MatSnackBarModule } from "@angular/material/snack-bar";
import { MatToolbarModule } from "@angular/material/toolbar";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatBadgeModule } from "@angular/material/badge";
import { MatMenuModule } from "@angular/material/menu";
import { MatProgressBarModule } from "@angular/material/progress-bar";
import { MapDialogComponent } from "../map-dialog/map-dialog.component";
import { LogService, Log } from "./log.service";
import { Observable, forkJoin, of } from "rxjs";
import { SearchDialog, SearchParams } from "./search-dialog/search.dialog";

@Component({
  standalone: true,
  selector: "app-log",
  templateUrl: "./log.component.html",
  styleUrls: ["./log.component.css"],
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatSnackBarModule,
    MatToolbarModule,
    MatButtonModule,
    MatIconModule,
    MatBadgeModule,
    MatMenuModule,
    MatProgressBarModule
  ],
  providers: [DatePipe]
})

/* This is a pretty complex piece of code, make sure you understand what is
going on before you modify this class */
export class LogComponent implements OnInit, OnDestroy {
  /* Stored on client for searching */
  private logs: Log[];
  /* Logs grouped by date, author and time */
  public logsGroup: Observable<LogsGroup[]>;
  /* Temporary logs while log is sending */
  public responseLogs;
  /* Params passed to and from search dialog */
  private searchParams: SearchParams;
  /* If active search, for icon and new loads */
  public isSearch: boolean;
  /* Controlling view, shows after initial load */
  public showView: boolean;
  /* Shows ...sending in view */
  public sending: boolean;
  /* Shows progress bar in view */
  public loading: boolean;
  /* Keep track of scroll position on fetch more */
  private scrollPosition: number = 0;
  private limit: number = 0;
  /* Only show Load More button if there are more */
  public allowLoad: boolean = true;
  /* Shows if sending error, click to retry */
  public errorIcon: boolean;
  /* From textarea, to create new log */
  public description: string;
  /* Temp container for images, to create new log */
  public images: { previewImage; imgFile }[] = [];
  /* Reference to todays date, set onInit */
  private todaysDatePiped: string;
  private teamId: string;
  public users: User[];
  /* Colors used to create author icon */
  private colors = [
    "#FF6F00",
    "#880E4F",
    "#311B92",
    "#1B5E20",
    "#B71C1C",
    "#1A237E",
    "#BF360C",
    "#01579B",
    "#4A148C",
    "#006064"
  ];
  /* Handle to read and modify scroll position */
  @ViewChild("logs") contentArea;
  /* Handle to read and modify height */
  @ViewChild("myInput") myInput;
  /* Handle to read and modify height */
  @ViewChild("textbox") textbox;
  /* Handle to read and modify buffer height */
  @ViewChild("buffer") buffer;

  constructor(
    private service: LogService,
    public accountService: AccountService,
    private datePipe: DatePipe,
    private dialog: MatDialog,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit() {
    this.searchParams = new SearchParams();
    this.accountService.helper = this.accountService.helperProfiles.log;
    this.todaysDatePiped = this.datePipe.transform(
      new Date(),
      "EEEE, MMM d, y"
    );
    this.accountService.teamManagersObservable.subscribe(users => {
      if (users) {
        this.teamId = this.accountService.aTeam.id;
        this.setUsers(users);
        this.getLogs();
      }
    });
  }

  /* Builds all contacts of the logs and colors them */
  private setUsers(users: User[]): void {
    let colorsIndex = 0;
    this.users = users.map(user => {
      user["color"] = this.colors[colorsIndex];
      colorsIndex =
        colorsIndex + 1 > this.colors.length - 1 ? 0 : colorsIndex + 1;
      return user;
    });
  }

  private getLogs(): void {
    this.loading = true;
    this.limit += 40;
    this.service.getLogs(this.teamId, this.limit).subscribe(logs => {
      /* Since this is an open socket, do not allow a change to this
      observable to override their current search */
      if (!this.isSearch) {
        this.logs = logs.reverse();
        /* Hides load more button in the view */
        if (logs.length < this.limit) this.allowLoad = false;
        /* If the new log saved successfully, our observable will 
        update with that new log, if so clear out responseLogs */
        if (this.logBeingSent) this.checkIfShouldWipeLogSending(logs);
        this.buildLogsGroup();
      }
    });
  }

  /* Method used to build view, groups by day, then time, then author */
  private buildLogsGroup(): void {
    this.logsGroup = of(this.logs).pipe(
      map(logs => {
        let map = {};
        let lastAuthor;
        logs.forEach(log => {
          /* transforming timestamp to day specific date */
          let gbd = this.getGroupByDate(log.createdAt);
          /* transforming timestamp to time */
          /* grouping logs by date */
          map[gbd] = map[gbd] || {};
          /* grouping by 2 minute timespan if consecutive author logs */
          const gbt =
            lastAuthor == log.userId
              ? `${log.userId}-${Math.floor(log.createdAt.getTime() / 120000)}`
              : `${log.userId}-${Math.floor(log.createdAt.getTime() / 1000)}`;
          /* grouping logs that are less than 1 minute apart */
          map[gbd][gbt] = map[gbd][gbt] || [];
          let images = log.images || [];
          /* creating pseudo log for images to show in own bubble */
          images.forEach(image => {
            map[gbd][gbt].push(new PseudoLog(log, image));
          });
          if (log.description) map[gbd][gbt].push(new PseudoLog(log));
          lastAuthor = log.userId;
        });
        let n = Object.keys(map).map(key => {
          let date = key;
          let byAuthorObj = map[key];
          let logsByAuthor = Object.keys(byAuthorObj).map(key2 => {
            let logs = map[key][key2];
            let time = key2.split("-")[1];
            let userId = key2.split("-")[0];
            let author = this.getAuthor(userId);
            /* is this a log from me */
            let isMe = userId == this.accountService.user.id;
            return { author, logs, time, isMe };
          });
          return { date, logsByAuthor };
        });
        return n;
      }),
      tap(() => this.scrollToPosition()),
      share()
    );
  }

  /* If ID coming in from getLogs == the id of the log we're sending
  then wipe out the temporary response logs and clear sending flag */
  private checkIfShouldWipeLogSending(logs: Log[]): void {
    let i = logs.findIndex(log => log.id == this.logBeingSent.id);
    if (i > -1) {
      this.sending = false;
      this.responseLogs = [];
      this.logBeingSent = null;
    }
  }

  /* Scroll to bottom if new log, keep position if fetching more */
  private scrollToPosition(): void {
    /* Setting timeout to wait for ngFor to finish rendering */
    setTimeout(() => {
      this.contentArea.nativeElement.scrollTop =
        this.contentArea.nativeElement.scrollHeight - this.scrollPosition;
      this.loading = false;
      /* Shows view on initial load */
      this.showView = true;
    }, 250);
  }

  /* Builds date without time to group by and display */
  private getGroupByDate(date: Date): string {
    let ds = this.datePipe.transform(date, "EEEE, MMM d, y");
    if (this.todaysDatePiped == ds) return "Today";
    return ds;
  }

  public showTime(log: PseudoLog): void {
    log.showTime = !log.showTime;
  }

  /* Attaching user to authorGroup */
  private getAuthor(userId): User {
    return this.users.find(user => user.id == userId);
  }

  /* On search, grab entire logs collection so we can do a text
  search, this won't work in the future when there are thousands
  of logs, at that point we will need to figure something else out */
  public search(): void {
    this.dialog
      .open(SearchDialog, {
        data: { searchParams: this.searchParams },
        disableClose: true
      })
      .afterClosed()
      .subscribe((params: SearchParams) => {
        /* They didn't cancel out of the dialog */
        if (params) {
          this.searchParams = params;
          /* They want to search by something */
          if (
            params.employees.length ||
            params.date ||
            params.string ||
            params.imagesOnly
          ) {
            this.loading = true;
            /* Show the user they have an active search */
            this.isSearch = true;
            this.service.getAllLogs(this.teamId).subscribe(logs => {
              /* Setting logs to build logsGroup from */
              this.logs = logs
                .filter(log => {
                  if (params.employees.length)
                    return params.employees.includes(log.userId);
                  if (params.date) {
                    /* Floor it to day only, disregard time */
                    const pd = this.datePipe.transform(params.date);
                    const ld = this.datePipe.transform(log.createdAt);
                    return pd == ld;
                  }
                  if (params.string) {
                    let filter: string[] = params.string.trim().split(/\s+/);
                    let passed;
                    for (let f of filter) {
                      if (
                        log.description &&
                        log.description.toLowerCase().includes(f.toLowerCase())
                      )
                        passed = true;
                      else passed = false;
                    }
                    return passed;
                  }
                  if (params.imagesOnly) return log.imageUrl ? true : false;
                })
                .reverse();
              this.buildLogsGroup();
            });
          } else {
            this.isSearch = false;
            this.getLogs();
          }
        }
      });
  }

  /* Resizes the input box */
  public resize(): void {
    const sh = this.myInput.nativeElement.scrollHeight;
    this.myInput.nativeElement.style.height = "28px";
    this.myInput.nativeElement.style.height =
      sh > 90 ? "90px" : this.myInput.nativeElement.scrollHeight - 14 + "px";
  }

  /* User initiated click to grab an image */
  public getImage(): void {
    document.getElementById("upfile").click();
  }

  /* Called from change on upFile, hidden in view */
  public uploadImage(event) {
    if (event.target.files && event.target.files[0]) {
      const imgFile = event.target.files[0];
      /* Build preview image */
      var reader = new FileReader();
      reader.onload = (event: any) => {
        const previewImage = event.target.result;
        this.setImage({ previewImage, imgFile });
      };
      reader.readAsDataURL(imgFile);
    }
  }

  /* Sets the image on a new log */
  public setImage(imageObj): void {
    this.images.push(imageObj);
    setTimeout(() => {
      const teh = this.textbox.nativeElement.clientHeight;
      this.buffer.nativeElement.style.height = `${teh}px`;
      this.scrollPosition = 0;
      this.scrollToPosition();
    }, 0);
  }

  /* Removes image from the new log */
  public removeImage(image): void {
    let i = this.images.indexOf(image);
    this.images.splice(i, 1);
    /* Shrink textarea, reset bottom of page */
    setTimeout(() => {
      const teh = this.textbox.nativeElement.clientHeight;
      this.buffer.nativeElement.style.height = `${teh}px`;
      this.scrollToPosition();
    }, 0);
  }

  /* Called from template to preview image */
  public viewImage(imageUrl): void {
    this.dialog.open(ImagesDialogComponent, {
      data: [{ imageUrl }]
    });
  }

  /* Called onclick of send button in view */
  public createLog(): void {
    /* Build temporary logs to show while sending */
    this.buildResponseLogs();
    this.sending = true;
    let log = new Log();
    log.createdAt = new Date();
    log.userId = this.accountService.user.id;
    log.description = this.description;
    log.images = [...this.images];
    /* Reset textarea */
    this.description = null;
    this.images = [];
    this.persistLog(log);
  }

  /* Temporary logs shown while sending */
  private buildResponseLogs(): void {
    this.responseLogs = [];
    let responseImages = this.images.map(imgObj => imgObj.previewImage);
    responseImages.forEach(imageUrl => this.responseLogs.push({ imageUrl }));
    if (this.description)
      this.responseLogs.push({ description: this.description });
    /* Scroll to bottom of page */
    this.scrollPosition = 0;
    this.scrollToPosition();
  }

  /* Back-up log to retry if it fails to send */
  private logBeingSent: Log;
  private persistLog(log: Log): void {
    log.id = this.service.generateLogId(this.teamId);
    this.logBeingSent = JSON.parse(JSON.stringify(log));
    this.persistImages(log.images).subscribe(
      images => {
        log.images = images;
        this.service.createLog(log, this.teamId).catch(() => {
          this.sending = false;
          this.errorIcon = true;
        });
      },
      error => (this.errorIcon = true)
    );
  }

  /* Save each image to firestorage before saving log */
  private persistImages(images): Observable<any> {
    return images.length
      ? forkJoin(
          images.map(imgObj =>
            this.service.uploadImage(imgObj.imgFile, this.teamId)
          )
        )
      : of([]);
  }

  /* Called by user if log fails and they want to retry */
  public resendLog(): void {
    this.persistLog(this.logBeingSent);
  }

  /* Not used, maybe we should stick it in */
  public showMap(log: PseudoLog) {
    this.dialog.open(MapDialogComponent, {
      data: {
        longPos: log.LongPos,
        latPos: log.LatPos
      }
    });
  }

  /* From Load More button at top of scroll */
  public loadMore() {
    this.scrollPosition = this.contentArea.nativeElement.scrollHeight;
    this.getLogs();
  }

  /* This method is a little weird, since we break each log into
  pseudo logs, the user might thing each displayed pseudo log is 
  it's own log. Because of this we only want to delete the thing 
  the user thinks they are deleting. We need to find the original 
  log, remove from it the thing they are wanting to delete, then if
  there is nothing left of the log, delete the log. Else, update the
  log */
  public deleteLog(pseudoLog: PseudoLog) {
    const log = this.logs.find(l => l.id == pseudoLog.id);
    /* If they change their mind about the delete */
    const recoverLog = JSON.parse(JSON.stringify(log));
    const recoverPseudoLog = { ...pseudoLog };
    /* True if they want to undo the delete */
    let action;
    if (pseudoLog.description) {
      log.description = null;
    } else if (pseudoLog.imageUrl) {
      let i = log.images.indexOf(pseudoLog.imageUrl);
      log.images.splice(i, 1);
    }
    if (!log.description && !log.images.length) {
      /* Nothing left of the log, delete it instead of updating it */
      this.service.deleteLog(log.id, this.teamId).then(() => {
        let sbr = this.snackBar.open("Successfully deleted log", "UNDO", {
          duration: 5000
        });
        sbr.onAction().subscribe(() => {
          action = true;
          recoverLog.id = this.service.generateLogId(this.teamId);
          recoverLog.createdAt = new Date(recoverLog.createdAt);
          this.service.createLog(recoverLog, this.teamId);
        });
        sbr.afterDismissed().subscribe(() => {
          if (!action && recoverPseudoLog.imageUrl)
            /* Wipe image from our storage database */
            this.service.removeImage(recoverPseudoLog.imageUrl);
        });
      });
    } else {
      /* Only deleted a part of the log, update the log */
      this.service.updateLog(log, this.teamId).then(() => {
        let sbr = this.snackBar.open("Successfully deleted log", "UNDO", {
          duration: 5000
        });
        sbr.onAction().subscribe(() => {
          action = true;
          recoverLog.createdAt = new Date(recoverLog.createdAt);
          this.service.updateLog(recoverLog, this.teamId);
          this.getLogs();
        });
        sbr.afterDismissed().subscribe(() => {
          if (!action && recoverPseudoLog.imageUrl)
            /* Wipe image from our storage database */
            this.service.removeImage(recoverPseudoLog.imageUrl);
        });
      });
    }
  }

  ngOnDestroy() {
    this.accountService.searchForHelper = "";
  }
}

class LogsGroup {
  date: string;
  logsByAuthor: LogsByAuthor[];
}

class LogsByAuthor {
  author: User;
  logs: PseudoLog[];
  time: string;
  isMe: boolean;
}

/* This is the object that makes up the view, each log is split into 
one or more "logs", each image becomes its own log */
class PseudoLog {
  createdAt: Date;
  userId: string;
  id: string;
  description: string;
  imageUrl: string;
  LatPos: number;
  LongPos: number;
  showTime?: boolean;
  constructor(log: Log, imageUrl = null) {
    this.createdAt = log.createdAt;
    this.userId = log.userId;
    this.id = log.id;
    this.description = imageUrl ? null : log.description;
    this.imageUrl = imageUrl;
    this.LatPos = log.LatPos;
    this.LongPos = log.LongPos;
  }
}
