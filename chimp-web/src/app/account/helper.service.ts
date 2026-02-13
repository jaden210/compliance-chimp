import { Injectable} from "@angular/core";

@Injectable({
  providedIn: "root"
})
export class HelperService {
  
  helperProfiles = {
    feedback: {
      name: "How can we do better?",
      description: ""
    },
    team: {
      name: "Team",
      description:
        "Here’s your team at a glance. From here you can invite and remove workers, and see your training and compliance activities.<br><br>Step 1<br>Invite workers by clicking the orange “New Team Member” button at the bottom right. Depending on the contact information you provide, they’ll receive a text or email welcoming them to the team. We strongly recommend text to fully take advantage of our features. Return to this page to add or remove workers at any time. <br><br>Step 2<br>Each data card above gives you insight into the compliance health of your organization. Click on any card to jump to the information it represents."
    },
    achievement: {
      name: "Badges",
      description:
      "This page is designed to help you gain the benefits of Compliancechimp as quickly as possible. Compliancechimp is a thorough and powerful platform which improves safety and protects businesses. But those benefits only come if it gets used. Begin earning badges today. When you click on any badge, you’ll be taken to the page where you can accomplish the task. Some badges are self-assessment questions only which reset after 180 days. Your compliance level coincides with earning these badges."
    },
    training: {
      name: "Training",
      description:
      "The difference between each of your workers making it home tonight, or not, could be the next safety training. And the difference between passing an OSHA audit or not, is proof that the training occurred.<br><br>We’ve curated over a thousand OSHA safety training articles.  Click ‘CUSTOMIZE MY TRAINING’ to select the articles that are relevant to your operation. When you favorite an article, it becomes part of your worker’s training library within their profile. Keep in mind, you can narrow training down to certain workers from inside any training article.<br><br>You can also build custom OSHA-aligned topics and articles and make them available to your entire team. Create as much specialized safety training as you need, and lock it all in right here.<br><br>Click on any of the stats bars above to open your curated library. When you click ‘Start Training’ inside any article, we record that a training occurred, and fire off a training survey to every worker you include in the training. We create an authoritative record of what training was given, when, and who received it. And it’s stored forever in one consolidated, simple place, forever."
    },
    survey: {
      name: "Surveys",
      description:
      "Part of the magic of Compliancechimp is first-person surveys. This eliminates paper tracking by supervisors or other trainers, and it certifies that training actually occurred, down to the individual, as validated by the individual themselves.<br><br>Every time a training is given a survey link is automatically texted (or emailed) to each member of the team that participated. They can answer whether or not they received the training, and add comments.<br><br>Individual validation is the surest way to understand the training gaps that exist so you can correct them.<br><br>And surveys go even further. You can create a custom survey at any time and send it to any person, group, or the entire team. Find out first-person if your workers have performed the inspections they are responsible for, if they have the personal protective equipment they need, and anything else you can think of. The power of the survey is that it is always first-person, and it is tracked and stored forever."
    },
    selfInspection: {
      name: "Self-Inspection",
      description:
        "Our self-inspection process helps you identify and fix problems before they become injury reports! Click the 'New Self-Inspection' button to the right to create a new self inspection. You can create as many as you’d like, covering any number of locations or worksites. Then return and perform each inspection as often as necessary to ensure the worksite is safe.<br><br>The result of every inspection can be exported to a simple PDF which shows the areas that need addressed."
    },
    log: {
      name: "Logs",
      description:
        "Using the app, any member of your team can create worksite logs, including pictures and text. Logs can include everything from periodic progress and work accomplished, to client change orders and project updates, to incidents, injuries, near misses, safety concerns, or other noteworthy happenings. Worksite logs build the historical record which is called upon in the event of an OSHA audit or inspection. Aside from that, worksite logs create a living journal of the work your business accomplishes over time, all in one central and searchable place, forever."
    },
    time: {
      name: "Time",
      description:
        "Using the mobile app, anyone can track time. Each time event is recorded here so that you have a historical record. Time can be exported at any time, for anyone, which makes calculating payroll a breeze. Administrators can adjust time as necessary by clicking on any time log and editing it. Forget paperwork and workers trying to rely on memory. Use the time clock instead."
    },
    incidentReport: {
      name: "Incident Reports",
      description:
        "We put injury and near miss reporting, along with the accompanying investigation, in the hands of every worker. From any worker's profile page (accessed via their personal link from any device), they can report an injury or near miss, including pictures and a signature. Each report flows here where they are stored safely, forever. This turns an otherwise obscure process into something accessible to every worker, which is massively important in the event of an inspection or audit. These reports create what is known as the 300 Log."
    },
    event: {
      name: "Events",
      description:
        "Every time you or any member of your team uses Compliancechimp for anything, it creates what we call events. Think of this as safety and compliance stream of consciousness. Why does this page exist? The answer is simple: proof of compliance.<br><br>One of the most difficult parts of compliance is paperwork, or evidence of compliance. We take the hassle out of it. When your team uses Compliancechimp instead of paper, the Events page gives you a very simple, clean, consolidated, and searchable record of activity that goes back as far as the day you signed up. It’s the critical backstop in the event of an audit, and can provide additional insights to your business along the way."
    },
    account: {
      name: "Your Account",
      description:
        "Please ensure all information is filled out across all areas of your account, even down to your company logo and profile picture. These small touches make a big difference to your workers, and they'll take only a few seconds to complete. Your account holds personal details, business details, and billing and payment details."
    },
    files: {
      name: "Team Files",
      description:
        "Upload and manage important documents for your team. Store safety manuals, certificates, training materials, and any other files your team needs access to. Files can be made public to allow team members to view them from their BananaHandbook, or kept private for managers only."
    }
  };

  constructor() {}
}

export class Helper {
  name: string;
  description: string;
}