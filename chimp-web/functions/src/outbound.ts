import { onDocumentCreated, onDocumentUpdated } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { defineSecret } from "firebase-functions/params";
import * as admin from "firebase-admin";

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

const STRIPE_PAYMENT_LINK = "https://buy.stripe.com/6oU4gB1vGfhh2nQ2RPb3q00";
const TRIAL_DAYS = 14;
const FOLLOWUP_DAYS = 7;

/**
 * Runs daily at 9 AM Central (15:00 UTC).
 * Sends trial-expired emails to teams whose 14-day trial ended today,
 * and a follow-up email to teams whose trial ended 7 days ago,
 * provided they still haven't subscribed.
 */
export const checkTrialExpirationEmails = onSchedule(
  {
    schedule: '0 15 * * *',
    secrets: [sendgridApiKey],
    timeoutSeconds: 120,
  },
  async () => {
    const db = admin.firestore();
    const client = createSendgridClient();
    const now = new Date();

    // Query teams that have no active subscription and are not disabled
    const teamsSnapshot = await db.collection('team')
      .where('disabled', '==', false)
      .get();

    for (const doc of teamsSnapshot.docs) {
      const team = doc.data();

      // Skip teams that already have a subscription
      if (team.stripeSubscriptionId) {
        continue;
      }

      if (!team.createdAt) {
        continue;
      }

      const createdAt = team.createdAt.toDate ? team.createdAt.toDate() : new Date(team.createdAt);
      const trialEndDate = new Date(createdAt.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
      const daysSinceTrialEnd = Math.floor((now.getTime() - trialEndDate.getTime()) / (24 * 60 * 60 * 1000));

      // Build the subscribe URL with team ID and prefilled email
      let subscribeUrl = `${STRIPE_PAYMENT_LINK}?client_reference_id=${doc.id}`;
      if (team.email) {
        subscribeUrl += `&prefilled_email=${encodeURIComponent(team.email)}`;
      }

      const recipientName = team.name || 'there';

      // Day 0: Trial just expired (0-1 days since expiration)
      if (daysSinceTrialEnd >= 0 && daysSinceTrialEnd < 1 && !team.trialExpiredEmailSent) {
        try {
          let emailHtml = fs.readFileSync(
            path.resolve('src/email-templates/user/trial-expired.html')
          ).toString();

          emailHtml = emailHtml
            .split('{{recipientName}}').join(recipientName)
            .split('{{subscribeUrl}}').join(subscribeUrl);

          await client.sendMail({
            from: '"Compliancechimp" <support@compliancechimp.com>',
            to: team.email,
            subject: 'Your Free Trial Has Ended',
            html: emailHtml,
          });

          await doc.ref.update({ trialExpiredEmailSent: true });
          console.log(`Trial expired email sent to: ${team.email} (team: ${doc.id})`);
        } catch (error: any) {
          console.error(`Error sending trial expired email to ${team.email}: ${JSON.stringify(error)}`);
        }
      }

      // Day 7: Follow-up email one week after trial expiration
      if (daysSinceTrialEnd >= FOLLOWUP_DAYS && daysSinceTrialEnd < FOLLOWUP_DAYS + 1 && !team.trialFollowupEmailSent) {
        try {
          let emailHtml = fs.readFileSync(
            path.resolve('src/email-templates/user/trial-followup.html')
          ).toString();

          emailHtml = emailHtml
            .split('{{recipientName}}').join(recipientName)
            .split('{{subscribeUrl}}').join(subscribeUrl);

          await client.sendMail({
            from: '"Compliancechimp" <support@compliancechimp.com>',
            to: team.email,
            subject: 'Your Compliance Program is Still Waiting',
            html: emailHtml,
          });

          await doc.ref.update({ trialFollowupEmailSent: true });
          console.log(`Trial follow-up email sent to: ${team.email} (team: ${doc.id})`);
        } catch (error: any) {
          console.error(`Error sending trial follow-up email to ${team.email}: ${JSON.stringify(error)}`);
        }
      }
    }
  }
);
