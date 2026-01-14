/* Changes here need to happen on the app too */

export class Survey {
  articleId: string;
  receivedTraining: string[] = [];
  userId: string;
  active: boolean = true;
  createdAt: Date = new Date();
  category: string;
  categoryEs: string;
  title: string;
  titleEs: string;
  runDate: Date = new Date();
  userSurvey: any = {}; // userId: ms
  id?: string;
}
