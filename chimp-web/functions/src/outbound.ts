import { onDocumentCreated, onDocumentUpdated } from "firebase-functions/v2/firestore";
import { defineSecret } from "firebase-functions/params";

import * as fs from 'fs';
const path = require('path');

const nodemailer = require('nodemailer');
const sendgridTransport = require('nodemailer-sendgrid-transport');

// Define secrets for Firebase Functions V2
const sendgridApiKey = defineSecret("SENDGRID_API_KEY");

// Helper to create SendGrid transport (called at runtime when secret is available)
function createSendgridClient() {
  return nodemailer.createTransport(sendgridTransport({
    auth: {
        api_key: process.env.SENDGRID_API_KEY
    }
  }));
}

export const newTeamEmail = onDocumentCreated(
  { 
    document: "team/{teamId}",
    secrets: [sendgridApiKey]
  },
  async (event) => {
    const client = createSendgridClient();
    const team = event.data?.data() || {};
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
  }
);

export const newManagerEmail = onDocumentCreated(
  {
    document: "user/{userId}",
    secrets: [sendgridApiKey]
  },
  async (event) => {
    const client = createSendgridClient();
    const user = event.data?.data() || {};
    const userId = event.params.userId; // Get document ID from path params
    
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

      let emailString = emailHtml
        .split("{{recipientName}}").join(name)
        .split("{{userId}}").join(userId);
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
    return null;
  }
);

export const teamDisabled = onDocumentUpdated(
  {
    document: "team/{teamId}",
    secrets: [sendgridApiKey]
  },
  async (event) => {
    const oldTeam = event.data?.before.data();
    const newTeam = event.data?.after.data();
    
    if (!oldTeam || !newTeam) {
      return null;
    }
    
    const client = createSendgridClient();
    
    if (oldTeam.disabled === false && newTeam.disabled === true) {
      const disabledAt = newTeam.disabledAt?.toDate() || new Date();
      const mailOptions = {
        from: '"Compliancechimp" <support@compliancechimp.com>',
        to: "support@compliancechimp.com",
        subject: `${newTeam.name} has deleted their account`,
        html: `Looks like ${newTeam.name} decided to leave. The team was disabled on ${disabledAt}. 
        If you want to contact them their phone number is: ${newTeam.phone || 'N/A'} and email is: ${newTeam.email || 'N/A'}`
      };

      return client.sendMail(mailOptions).catch((error: any) => {
        console.error("Error sending team disabled email:", error);
      });
    } else if (oldTeam.disabled === true && newTeam.disabled === false) {
      const mailOptions = {
        from: '"Compliancechimp" <support@compliancechimp.com>',
        to: "support@compliancechimp.com",
        subject: `${newTeam.name} has re-activated their account`,
        html: `Looks like ${newTeam.name} decided to come back. If you want to contact them their phone number is: ${newTeam.phone || 'N/A'} and email is: ${newTeam.email || 'N/A'}`
      };

      return client.sendMail(mailOptions).catch((error: any) => {
        console.error("Error sending team re-activated email:", error);
      });
    }
    return null;
  }
);
