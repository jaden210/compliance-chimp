import * as functions from "firebase-functions";
import { defineSecret } from "firebase-functions/params";
import { getDatabase } from "./init";

import * as fs from 'fs';
const path = require('path');

const nodemailer = require('nodemailer');
const sendgridTransport = require('nodemailer-sendgrid-transport');

// Define secrets for Firebase Functions V2
const sendgridApiKey = defineSecret("SENDGRID_API_KEY");
const twilioAccountSid = defineSecret("TWILIO_ACCOUNT_SID");
const twilioAuthToken = defineSecret("TWILIO_AUTH_TOKEN");

// Helper to create SendGrid transport (called at runtime when secret is available)
function createSendgridClient() {
  return nodemailer.createTransport(sendgridTransport({
    auth: {
        api_key: process.env.SENDGRID_API_KEY
    }
  }));
}

exports.newTeamEmail = functions
  .runWith({ secrets: [sendgridApiKey] })
  .firestore.document("/team/{teamId}")
  .onCreate((snapshot, context) => {
    const client = createSendgridClient();
    const team = snapshot.data() || {};
    const mailOptions: any = {
      from: '"Compliancechimp" <support@compliancechimp.com>',
      to: team.email,
    };
    mailOptions.subject = "Welcome to Compliancechimp!";
    const name = team.name;
    let emailHtml = fs.readFileSync(
        path.resolve(`src/email-templates/user/create-account.html`)
    ).toString();

    let emailString = emailHtml.split("{{recipientName}}").join(name);
    mailOptions.html = emailString;

    return client
      .sendMail(mailOptions)
      .then(() =>
        console.log(`New account creation email sent to: ${team.email}`)
      )
      .catch((error: any) => {
        console.error(
          `An error occurred sending a new team email to ${
            team.email
          }. Error: ${JSON.stringify(error)}`
        );
      });
});

exports.newManagerEmail = functions
  .runWith({ secrets: [sendgridApiKey] })
  .firestore.document("/user/{userId}")
  .onCreate((snapshot, context) => {
    const client = createSendgridClient();
    const user = snapshot.data() || {};
    if (user.isManager) {
      const mailOptions: any = {
        from: '"Compliancechimp" <support@compliancechimp.com>',
        to: user.email,
      };
      mailOptions.subject = "Welcome to Compliancechimp!";
      const name = user.name;
      let emailHtml = fs.readFileSync(
        path.resolve(`src/email-templates/user/add-manager.html`)
        ).toString();
        
        let emailString = emailHtml.split("{{recipientName}}").join(name).split("{{userId}}").join(user.id);
        mailOptions.html = emailString;
        
        return client
        .sendMail(mailOptions)
        .then(() =>
        console.log(`New manager creation email sent to: ${user.email}`)
        )
        .catch((error: any) => {
          console.error(
            `An error occurred sending a new manager email to ${
              user.email
            }. Error: ${JSON.stringify(error)}`
            );
        });
    }
});

// exports.resendTeamMemberInvite = functions.https.onCall((data: any, res) => {
//   return messageTeamMember(data.teamMember, data.memberId);
// });
  
// exports.addNewUser = functions.firestore
// .document("/team-members/{memberId}")
// .onCreate((snapshot, context) => {
//   let teamMember = snapshot.data();
//   return messageTeamMember(teamMember, context.params.memberId)
// });

function messageTeamMember(teamMember, memberId: string): Promise<any> {
  if (teamMember.preferEmail) { // send email
    const client = createSendgridClient();
    const mailOptions: any = {
      from: '"Compliancechimp" <support@compliancechimp.com>',
      to: teamMember.email,
    };
    mailOptions.subject = "Welcome to Compliancechimp!";
    const nameArr = teamMember.name ? teamMember.name : null;
    const name = nameArr && nameArr.length ? nameArr : null;

    let emailHtml = fs.readFileSync(
        path.resolve(`src/email-templates/user/add-team-member.html`)
    ).toString();

    let emailString = emailHtml.split("{{recipientName}}").join(name).split("{{userId}}").join(memberId).split("{{teamId}}").join(teamMember.teamId);
    mailOptions.html = emailString;
    return client
      .sendMail(mailOptions)
      .then(() =>
        console.log(`New account creation email sent to: ${teamMember.email}`)
      )
      .catch((error: any) => {
        console.error(
          `An error occured sending a transaction email to ${
            teamMember.email
          }. Error: ${JSON.stringify(error)}`
        );
      });
  } else { // send sms
    // Use secrets from environment variables
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const twilioClient = require('twilio')(accountSid, authToken);
    return twilioClient.messages
      .create({
          body: `Hi ${teamMember.name}! You've been added to your company's Compliancechimp account. Compliancechimp assists with safety training and helps your employer remain OSHA compliant. Click the link below to visit your profile where you'll find training content, training surveys, and near miss and injury reporting. When you attend safety training you'll receive a text message like this asking you to respond to the training survey. Contact your employer if you'd prefer to receive notices via email instead of text. Thank you! - The Compliancechimp team. https://compliancechimp.com/user?member-id=${memberId}`,
          from: '+18647401144',
          to: `+1${teamMember.phone}`
        })
      .then(message => {
        console.log(message.sid);
        return;
      });
  }
}




// everything above has been redone //















exports.supportTicketSubmitted = functions.firestore
  .document("/support/{supportId}")
  .onCreate((snapshot, context) => {
    let info = snapshot.data();
    const nodemailer = require("nodemailer");
    const db = getDatabase();

    const mailTransport = nodemailer.createTransport(
      `smtps://support@compliancechimp.com:thechimpishere@smtp.gmail.com`
    );
    const mailOptions: any = {
      from: '"Compliancechimp" <support@compliancechimp.com>',
      to: info.email
    };
    mailOptions.subject =
      "We have received your message - hello from Compliancechimp";
    mailOptions.html = `Hi there<br><br>
    This is just a friendly note to say we've received your message and will respond as quickly as possible.
    <br><br>Thank you,
    <br><br>Ken, Client Support
    <br>Compliancechimp
    <br>support@compliancechimp.com`;

    return mailTransport
      .sendMail(mailOptions)
      .then(() => {
        console.log(`New invitation email sent to:` + info.email);
      })
      .catch(error => {
        console.error("There was an error while sending the email:", error);
      });
  });

exports.teamDisabled = functions.firestore
  .document("/team/{teamId}")
  .onUpdate((change, context) => {
    let oldTeam = change.before.data();
    let newTeam = change.after.data();
    if (oldTeam.disabled == false && newTeam.disabled == true) {
      const nodemailer = require("nodemailer");
      const db = getDatabase();
      let disabledAt = newTeam.disabledAt.toDate();

      const mailTransport = nodemailer.createTransport(
        `smtps://support@compliancechimp.com:thechimpishere@smtp.gmail.com`
      );
      const mailOptions: any = {
        from: '"Compliancechimp" <support@compliancechimp.com>',
        to: "support@compliancechimp.com"
      };
      mailOptions.subject = `${newTeam.name} has deleted their account`;
      mailOptions.html = `Looks like ${
        newTeam.name
      } decided to leave. The team has been disabled and on ${disabledAt}. 
    If you want to contact them their phone number is: ${newTeam.phone}`;

      return mailTransport.sendMail(mailOptions).catch(error => {
        console.error("There was an error while sending the email:", error);
      });
    } else if (oldTeam.disabled == true && newTeam.disabled == false) {
      const nodemailer = require("nodemailer");
      const db = getDatabase();

      const mailTransport = nodemailer.createTransport(
        `smtps://support@compliancechimp.com:thechimpishere@smtp.gmail.com`
      );
      const mailOptions: any = {
        from: '"Compliancechimp" <support@compliancechimp.com>',
        to: "support@compliancechimp.com"
      };
      mailOptions.subject = `${newTeam.name} has re-activated their account`;
      mailOptions.html = `Looks like ${
        newTeam.name
      } decided to come back. If you want to contact them their phone number is: ${
        newTeam.phone
      }`;

      return mailTransport.sendMail(mailOptions).catch(error => {
        console.error("There was an error while sending the email:", error);
      });
    }
  });
