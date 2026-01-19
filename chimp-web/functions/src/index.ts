import { firestore } from "firebase-admin";
import * as functions from "firebase-functions";
import { defineSecret } from "firebase-functions/params";
import * as moment from "moment";
import * as admin from "firebase-admin";

admin.initializeApp();

// Define secrets for Firebase Functions V2
const stripeSecretKey = defineSecret("STRIPE_SECRET_KEY");
const sendgridApiKey = defineSecret("SENDGRID_API_KEY");
const twilioAccountSid = defineSecret("TWILIO_ACCOUNT_SID");
const twilioAuthToken = defineSecret("TWILIO_AUTH_TOKEN");

const nodemailer = require("nodemailer");
const sendgridTransport = require("nodemailer-sendgrid-transport");

// Helper to create SendGrid transport (called at runtime when secret is available)
function createSendgridClient() {
  return nodemailer.createTransport(
    sendgridTransport({
      auth: {
        api_key: process.env.SENDGRID_API_KEY,
      },
    })
  );
}

// Helper to create Stripe client (called at runtime when secret is available)
function createStripeClient() {
  return require("stripe")(process.env.STRIPE_SECRET_KEY);
}


exports.outbound = require('./outbound');

// When a user is created, register them with Stripe
exports.createStripeCustomer = functions
  .runWith({ secrets: [stripeSecretKey] })
  .auth.user().onCreate(user => {
    const stripe = createStripeClient();
    return stripe.customers
      .create({
        email: user.email,
        description: "new Customer"
      })
      .then(customer => {
        return admin
          .firestore()
          .collection("team")
          .where("ownerId", "==", user.uid)
          .get()
          .then(querySnapshot => {
            querySnapshot.forEach(doc => {
              // should only be one, can't think of a better way
              return admin
                .firestore()
                .doc("team/" + doc.id)
                .update({ stripeCustomerId: customer.id });
            });
          })
          .catch(error => {
            return console.log("Error getting documents: ", error);
          });
      });
  });

exports.customerEnteredCC = functions
  .runWith({ secrets: [stripeSecretKey] })
  .firestore.document("/team/{teamId}")
  .onUpdate((change, context) => {
    const stripe = createStripeClient();
    let oldT = change.before.data();
    let newT = change.after.data();
    if (!oldT.cardToken && newT.cardToken) {
      // first time card enter
      stripe.customers
        .update(newT.stripeCustomerId, {
          source: newT.cardToken.id
        })
        .then(customer => {
          const days = moment().diff(moment(newT.createdAt.toDate()), "days");
          stripe.subscriptions
            .create({
              customer: customer.id,
              trial_period_days: days < 0 ? 0 : days,
              items: [
                { plan: "small-teams" } // small teams
              ]
            })
            .then(
              subscription => {
                admin
                  .firestore()
                  .doc(`team/${change.after.id}`)
                  .update({
                    stripeSubscriptionId: subscription.id,
                    stripePlanId: "small-teams"
                  });
                console.log(
                  `customer ${customer.id} subscribed to small teams`
                );
              },
              error => console.log(`error: ${error}`)
            );
        });
    } else if (oldT.cardToken !== newT.cardToken) {
      // updated CC
      stripe.customers
        .update(newT.stripeCustomerId, {
          source: newT.cardToken.id
        })
        .then(
          () => console.log(`customer card updated`),
          error => console.log(`error: ${error}`)
        );
    }
  });

exports.setStripePlan = functions
  .runWith({ secrets: [stripeSecretKey] })
  .https.onRequest((req, res) => {
    const stripe = createStripeClient();
    const body = req.body;
    const newPlan = body.plan;
    const subscriptionId = body.stripeSubscriptionId;
    const quantity = body.stripeQuantity;
    stripe.subscriptions.retrieve(subscriptionId).then(subscription => {
      stripe.subscriptions
        .update(subscriptionId, {
          cancel_at_period_end: false,
          items: [
            {
              id: subscription.items.data[0].id,
              plan: newPlan,
              quantity: quantity || 1
            }
          ]
        })
        .then(charge => {
          res.status(200).send("Success");
        })
        .catch(err => {
          res.status(500).send(err);
        });
    });
  });

exports.getCustomerInvoices = functions
  .runWith({ secrets: [stripeSecretKey] })
  .https.onCall((data: any, res) => {
    const stripe = createStripeClient();
    return stripe.billingPortal.sessions.create({
      customer: data.stripeCustomerId,
      return_url: 'https://compliancechimp.com/account/account',
    }).then(session => {
      console.log(JSON.stringify(session));
      return session.url;
    });
  });

/* ----- TEAM ----- */

exports.updateTeam = functions.firestore
  .document("/team/{teamId}")
  .onUpdate((change, context) => {
    let oldTeam = change.before.data();
    let newTeam = change.after.data();

    /* billing achievement */
    let billing;
    if (!oldTeam.cardToken && newTeam.cardToken) {
      billing = updateCompletedAchievement(newTeam.id, "hasBillingInfo", true);
    }

    let address;
    if (!oldTeam.street && newTeam.street) {
      address = updateCompletedAchievement(
        context.params.teamId,
        "hasContactInfo",
        true
      );
    }

    /* logoUrl achievement */
    let logo;
    if (!oldTeam.logoUrl && newTeam.logoUrl) {
      logo = updateCompletedAchievement(newTeam.id, "hasCompanyLogo", true);
    }
    Promise.all([billing, logo, address]).then(() =>
      console.log("update team complete")
    );
  });

/* ----- USER ----- */

exports.userCreated = functions.firestore
  .document("/user/{userId}")
  .onCreate((snapshot, context) => {
    let user = snapshot.data();

    return null;
  });

exports.userChange = functions.firestore
  .document("/user/{userId}")
  .onUpdate((change, context) => {
    let oldUser = change.before.data();
    let newUser = change.after.data();

    return null;
  });

/* ----- SELF INSPECTION ----- */

exports.createdSelfInspection = functions.firestore
  .document("/team/{teamId}/self-inspection/{id}")
  .onCreate((snapshot, context) => {
    let selfInspection = snapshot.data();

    /* total self inspections achievement */
    const achievement = updateCompletedAchievement(
      context.params.teamId,
      "startedSelfAssesments",
      1,
      true
    );
    const event = logAsEvent(
      EventType.selfInspection,
      EventAction.created,
      snapshot.id,
      selfInspection.userId,
      `Created self-inspection: ${selfInspection.title || 'Untitled'}`,
      context.params.teamId
    );

    return Promise.all([achievement, event]).then(() =>
      console.log("created self inspection complete")
    );
  });

exports.modifySelfInspectionInspection = functions.firestore
  .document("/team/{teamId}/self-inspection/{id}/inspections/{inspecitonId}")
  .onUpdate(async (change, context) => {
    let oldI = change.before.data();
    let newI = change.after.data();

    if (newI.completedAt !== null && oldI.completedAt == null) {
      // has been completed - fetch the parent self-inspection to get the title
      const selfInspectionDoc = await admin.firestore()
        .doc(`team/${context.params.teamId}/self-inspection/${context.params.id}`)
        .get();
      const selfInspection = selfInspectionDoc.data();
      const title = selfInspection?.title || 'Untitled';
      
      const achievement = updateCompletedAchievement(
        context.params.teamId,
        "completedSelfAssesments",
        1,
        true
      );
      const event = logAsEvent(
        EventType.selfInspection,
        EventAction.completed,
        change.after.id,
        newI.completedBy,
        `Finished the self-inspection: ${title}`,
        context.params.teamId
      );

      return Promise.all([event, achievement]).then(() =>
        console.log("updated self inspection complete")
      );
    } else return null;
  });

/* ----- INJURY REPORT ----- */

exports.createdInjuryReport = functions.firestore
  .document("/team/{teamId}/incident-report/{id}")
  .onCreate((snapshot, context) => {
    let injuryReport = snapshot.data();

    /* total self inspections achievement */
    const achievement = updateCompletedAchievement(
      context.params.teamId,
      "injuryReports",
      1,
      true
    );
    const event = logAsEvent(
      EventType.incidentReport,
      EventAction.created,
      snapshot.id,
      injuryReport.submittedBy,
      "Created a new " + injuryReport.type,
      context.params.teamId
    );

    return Promise.all([event, achievement]).then(() =>
      console.log("created injury report complete")
    );
  });
/* ----- INJURY REPORT NEW ----- */

exports.createdInjuryReportNew = functions.firestore
  .document("incident-report/{id}")
  .onCreate((snapshot, context) => {
    let injuryReport = snapshot.data();

    /* total self inspections achievement */
    const achievement = updateCompletedAchievement(
      injuryReport.teamId,
      "injuryReports",
      1,
      true
    );
    const event = logAsEvent(
      EventType.incidentReport,
      EventAction.created,
      snapshot.id,
      injuryReport.submittedBy,
      "Created a new " + injuryReport.type,
      injuryReport.teamId
    );

    return Promise.all([event, achievement]).then(() =>
      console.log("created injury report complete")
    );
  });

/* ----- ADD TO LIBRARY ----- */

exports.addToLibrary = functions.firestore
  .document("/library/{id}")
  .onCreate((snapshot, context) => {
    let libraryItem = snapshot.data();
    const libraryItemLog = logAsEvent(
      EventType.customContent,
      EventAction.created,
      snapshot.id,
      libraryItem.teamMemberId,
      `A new Article was Added to the Library: ${libraryItem.name}`,
      libraryItem.teamId
    );

    return Promise.all([libraryItemLog]).then(() =>
      console.log("Add to library complete")
    );
  });

/* ----- SURVEY ----- */

exports.createdSurvey = functions
  .runWith({ secrets: [sendgridApiKey, twilioAccountSid, twilioAuthToken] })
  .firestore.document("/survey/{id}")
  .onCreate((snapshot, context) => {
    let survey = snapshot.data();
    const log = logAsEvent(
      EventType.survey,
      EventAction.created,
      snapshot.id,
      survey.userId,
      survey.title,
      survey.teamId
    );
    blastSurvey({...survey, id: snapshot.id});
    return log.then(() =>
      console.log("created survey complete")
    );
});

function blastSurvey(survey: any): Promise<any> {
  let teamMember = [];
  return admin.firestore().collection(`team-members`).where("teamId", "==", survey.teamId).get().then((users: any) => {
      users.forEach((userDoc: any) => {
        teamMember.push({...userDoc.data(), id: userDoc.id});
      });
      survey.trainees.forEach((tmId) => {
        let member = teamMember.find(tm => tm.id == tmId);
        if (member) {
          console.log('sending');
          const body = `Hi ${member.name}. A new survey is waiting for you. Click the link to answer. Please answer right away to help your employer maintain current records. Thank you! - The Compliancechimp team.\n
          https://compliancechimp.com/user?member-id=${member.id}`;
          return sendMessage(member, null, body).then(() => {
            return;
          });
        } else {
          console.log('no team member found');
          return null;
        }
      });
  });
}

exports.modifiedSurvey = functions.firestore
  .document("/survey/{surveyId}")
  .onUpdate((change, context) => {
    let newSurvey = change.after.data();
    return logAsEvent(
      EventType.survey,
      EventAction.updated,
      change.after.id,
      newSurvey.userId,
      newSurvey.title,
      newSurvey.teamId
    ).then(() => console.log("updated survey complete"));
  });

exports.deletedSurvey = functions.firestore
  .document("/survey/{logId}")
  .onDelete((snapshot, context) => {
    let deletedSurvey = snapshot.data();
    return logAsEvent(
      EventType.log,
      EventAction.deleted,
      snapshot.id,
      deletedSurvey.userId,
      deletedSurvey.title,
      deletedSurvey.teamId
    ).then(() => console.log("deleted survey complete"));
  });

/* ----- SURVEY RESPONSE ----- */

exports.createdSurveyResponse = functions.firestore
  .document("/survey-response/{id}")
  .onCreate((snapshot, context) => {
    let surveyResponse = snapshot.data();
    const trainingLog = logAsEvent(
      EventType.surveyResponse,
      EventAction.respond,
      surveyResponse.surveyId,
      surveyResponse.teamMemberId,
      surveyResponse.shortAnswer.toString() ||
        "" + " " + surveyResponse.longAnswer ||
        "",
      surveyResponse.teamId
    );

    return Promise.all([trainingLog]).then(() =>
      console.log("created survey response complete")
    );
  });

/* ----- CUSTOM ARTICLE ----- */

exports.createdCustomTrainingArticle = functions.firestore
  .document("/team/{teamId}/article/{id}")
  .onCreate((snapshot, context) => {
    let article = snapshot.data();

    const trainingSurveyResponse = updateCompletedAchievement(
      context.params.teamId,
      "customTrainingArticleCount",
      1,
      true
    );

    return Promise.all([trainingSurveyResponse]).then(() =>
      console.log("created survey response complete")
    );
});

  exports.scheduledFunctionCrontab = functions
    .runWith({ secrets: [sendgridApiKey, twilioAccountSid, twilioAuthToken] })
    .pubsub.schedule('0 12 * * *') //(minute, hour, day of month, month ...) .timeZone('America/New_York') Users can choose timezone - default is America/Los_Angeles
    .onRun((context) => {
    console.log(`This will be run every day at noon western!`);
    return Promise.all([findSurveys(), checkSelfInspectionReminders()]);
  });

  async function checkSelfInspectionReminders() {
    const today = moment();
    const teamsSnapshot = await admin.firestore().collection("team").get();
    
    for (const teamDoc of teamsSnapshot.docs) {
      const team = { ...teamDoc.data(), id: teamDoc.id };
      const selfInspectionsSnapshot = await admin.firestore()
        .collection(`team/${team.id}/self-inspection`)
        .get();
      
      for (const siDoc of selfInspectionsSnapshot.docs) {
        const selfInspection = siDoc.data();
        
        if (!selfInspection.inspectionExpiration || !selfInspection.lastCompletedAt) {
          continue; // No interval set or never completed
        }
        
        const lastCompleted = moment(selfInspection.lastCompletedAt.toDate());
        let dueDate: moment.Moment;
        
        // Calculate when the next inspection is due based on the interval
        switch (selfInspection.inspectionExpiration) {
          case 'Monthly':
            dueDate = lastCompleted.clone().add(1, 'month');
            break;
          case 'Quarterly':
            dueDate = lastCompleted.clone().add(3, 'months');
            break;
          case 'Semi-Anually':
            dueDate = lastCompleted.clone().add(6, 'months');
            break;
          case 'Anually':
            dueDate = lastCompleted.clone().add(1, 'year');
            break;
          default:
            continue;
        }
        
        // Check if due date is within the next 7 days or past due
        const daysUntilDue = dueDate.diff(today, 'days');
        
        if (daysUntilDue <= 7 && daysUntilDue >= -30) {
          // Check if we already sent a reminder recently
          const lastReminderSent = selfInspection.lastReminderSent 
            ? moment(selfInspection.lastReminderSent.toDate()) 
            : null;
          
          if (lastReminderSent && today.diff(lastReminderSent, 'days') < 7) {
            continue; // Already sent a reminder within the last week
          }
          
          // Get team owner/managers to notify
          const managersSnapshot = await admin.firestore()
            .collection("user")
            .where("teamId", "==", team.id)
            .get();
          
          for (const managerDoc of managersSnapshot.docs) {
            const manager = managerDoc.data();
            if (manager.email) {
              const urgency = daysUntilDue < 0 
                ? `is ${Math.abs(daysUntilDue)} days overdue` 
                : daysUntilDue === 0 
                  ? 'is due today'
                  : `is due in ${daysUntilDue} days`;
              
              const body = `
                <h2>Self-Inspection Reminder</h2>
                <p>Hi ${manager.name || 'there'},</p>
                <p>Your self-inspection "<strong>${selfInspection.title}</strong>" ${urgency}.</p>
                <p>Last completed: ${lastCompleted.format('MMMM D, YYYY')}</p>
                <p>Frequency: ${selfInspection.inspectionExpiration}</p>
                <p><a href="https://compliancechimp.com/account/self-inspections/${siDoc.id}">Complete the inspection now</a></p>
                <p>- The ComplianceChimp Team</p>
              `;
              
              await sendMessage({ ...manager, preferEmail: true }, team, body);
            }
          }
          
          // Update the last reminder sent timestamp
          await admin.firestore()
            .doc(`team/${team.id}/self-inspection/${siDoc.id}`)
            .update({ lastReminderSent: new Date() });
        }
      }
    }
    
    console.log('Self-inspection reminders check complete');
  }
  
  function findSurveys(): Promise<any> {
  const today = moment(); 
  let teamDocs = admin.firestore().collection("team").get();
  return teamDocs.then((teams: any) => {
    const promises: Promise<any>[] = [];
    teams.forEach((teamDoc: any) => {
      const team = { ...teamDoc.data(), id: teamDoc.id };
      let surveysDocs = admin.firestore().collection(`team/${team.id}/survey`).get();
      promises.push(surveysDocs.then((surveys: any) => {
          surveys.forEach((surveyDoc: any) => {
            const survey = surveyDoc.data();
            if (!survey.notificationSent) {
              let teamMember: any[] = [];
              if (moment(survey.runDate).isSame(today, 'day')) { //do it
                if (teamMember.length == 0) {
                  admin.firestore().collection(`team/${team.id}/user`).get().then((users: any) => {
                      users.forEach((userDoc: any) => {
                        teamMember.push(userDoc.data());
                      });
                      Object.keys(survey.userSurvey).forEach((key,index) => {
                        let user = teamMember.find(u => u.id == key);
                        if (user) {
                          const body = `Hi ${user.name}. A new survey is waiting for you. Click the link to answer. Please answer right away to help your employer maintain current records. Thank you! - The Compliancechimp team.\n
                          https://compliancechimp.com/user?member-id=${user.id}`;
                          sendMessage(user, team, body).then(() => {
                            surveyDoc.ref.update({notificationSent: true});
                          });
                        }
                      });
                  });
                } else {
                  Object.keys(survey.userSurvey).forEach((key,index) => {
                    const body = ``;
                    let user = teamMember.find(u => u.id == key);
                    if (user) {
                      sendMessage(user, team, body).then(() => {
                        surveyDoc.ref.update({notificationSent: true});
                      });
                    }
                  });
                }
              }
            }
          });
      }));
    });
    return Promise.all(promises);
  });
}


exports.teamMemberAdded = functions
  .runWith({ secrets: [sendgridApiKey, twilioAccountSid, twilioAuthToken] })
  .firestore.document("/team-members/{teamMemberId}")
  .onCreate(async (snapshot, context) => {
    const data = snapshot.data() as any;
    const teamMember = { ...data, id: snapshot.id };
    const teamDoc = await admin.firestore().doc(`team/${teamMember.teamId}`).get();
    const team = teamDoc.data();
    
    let messageBody: string;
    if (teamMember.preferEmail) {
      // Use HTML email template for email
      const emailHtml = getEmail("add-team-member");
      messageBody = emailHtml
        .split("{{recipientName}}")
        .join(teamMember.name)
        .split("{{userId}}")
        .join(teamMember.id);
    } else {
      // Use plain text for SMS
      messageBody = `Hi ${teamMember.name}! You've been added to ${team?.name || 'your company'}'s Compliancechimp account. Visit your profile for training content and surveys: https://compliancechimp.com/user?member-id=${teamMember.id}`;
    }
    
    return await sendMessage(teamMember, team, messageBody);
});

exports.resendTeamMemberInvite = functions
  .runWith({ secrets: [sendgridApiKey, twilioAccountSid, twilioAuthToken] })
  .https.onCall(async (data, context) => {
    const teamMember = data.teamMember;
    const team = data.team;
    
    let messageBody: string;
    if (teamMember.preferEmail) {
      // Use HTML email template for email
      const emailHtml = getEmail("add-team-member");
      messageBody = emailHtml
        .split("{{recipientName}}")
        .join(teamMember.name)
        .split("{{userId}}")
        .join(teamMember.id);
    } else {
      // Use plain text for SMS
      messageBody = `Hi ${teamMember.name}! This is a reminder from ${team?.name || 'your company'}. Visit your Compliancechimp profile for training content and surveys: https://compliancechimp.com/user?member-id=${teamMember.id}`;
    }
    
    return await sendMessage(teamMember, team, messageBody);
});

import * as fs from "fs";
import path = require("path");

export function getEmail(location: string) {
  return fs
    .readFileSync(path.resolve(`src/email-templates/user/${location}.html`))
    .toString();
}





function sendMessage(teamMember, team, body) {
  if (teamMember.preferEmail) {
      const client = createSendgridClient();
      const mailOptions: any = {
        from: '"ComplianceChimp" <support@compliancechimp.com>',
        to: teamMember.email
      };
      mailOptions.subject = `Message from ComplianceChimp`;
      mailOptions.html = body || 'hi';
      return client
              .sendMail(mailOptions)
              .then(() =>
                console.log(`New tribute creation email sent to: ${teamMember.email}`)
              )
              .catch((error: any) =>
                console.error(
                  `An error occurred sending email to ${
                    teamMember.email
                  }. Error: ${JSON.stringify(error)}`
                )
              );
  } else {
    console.log('texting');
    
    // Use secrets from environment variables
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const twilioClient = require('twilio')(accountSid, authToken);
    return twilioClient.messages
    .create({
      body: body,
      from: '+12064389741',
      to: `+1${teamMember.phone}`
    })
    .then(message => {
      console.log(message.sid);
    });
  }
}

/*  ---------- Achievements ----------  */

function updateCompletedAchievement(
  teamId: string,
  mapKey: string,
  value: any,
  sum?: boolean
): Promise<any> {
  return admin
    .firestore()
    .collection("completed-achievement")
    .where("teamId", "==", teamId)
    .get()
    .then(querySnapshot => {
      querySnapshot.forEach(doc => {
        // should only be one, can't think of a better way
        const docData = doc.data();
        let obj = {};
        obj[mapKey] = sum ? docData[mapKey] + value : value;
        return admin
          .firestore()
          .doc("completed-achievement/" + doc.id)
          .update(obj);
      });
    })
    .catch(error => {
      return console.log("Error getting documents: ", error);
    });
}

/*  ---------- EVENTS ----------  */

function logAsEvent(
  type: string,
  action: string,
  documentId: string,
  userId: string,
  description: string,
  teamId: string
): Promise<void> {
  let createdAt = new Date();
  let event: Event = {
    type,
    action,
    documentId,
    userId,
    description,
    createdAt
  };
  return admin
    .firestore()
    .collection(`team/${teamId}/event`)
    .add(event)
    .then(newEvent => {
      console.log(`event created: ${newEvent.id}`);
    });
}

export class Event {
  type: string;
  action: string;
  createdAt: Date;
  userId: string;
  description: string;
  documentId: string;
}

enum EventType {
  log = "Log",
  timeclock = "Timeclock",
  incidentReport = "Incident Report",
  survey = "Survey",
  surveyResponse = "Survey",
  selfInspection = "Self Inspection",
  training = "Training",
  member = "New Member",
  customContent = "Custom training article"
}

enum EventAction {
  created = "created",
  updated = "updated",
  deleted = "deleted",
  respond = "responded to",
  completed = "completed"
}
