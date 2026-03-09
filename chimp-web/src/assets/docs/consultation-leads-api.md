# Consultation Leads API

Use this endpoint when you want Compliance Chimp to generate a free safety consultation on behalf of a lead and email the finished report directly to them.

## Endpoint

- Method: `POST`
- URL: `{{CONSULTATION_LEAD_ENDPOINT}}`
- Authentication: send your shared secret in the `x-consultation-ingest-secret` header
- Content-Type: `application/json`

## Required Fields

- `companyName`: string, 2 to 120 characters
- `website`: string, optional but recommended
- `description`: string, 12 to 1200 characters
- `employeeCount`: number, 1 to 1,000,000
- `state`: two-letter U.S. state or territory code
- `email`: valid recipient email address

## Optional Fields

- `source`: string, up to 80 characters
- `campaign`: string, up to 120 characters
- `externalLeadId`: string, up to 120 characters

## Idempotency

If you send both `source` and `externalLeadId`, Compliance Chimp will treat that pair as your dedupe key. A second submission with the same pair returns the already-generated consultation instead of creating a new one.

## Example Request

```json
{
  "companyName": "Acme Fabrication",
  "website": "https://acmefab.example",
  "description": "Metal fabrication shop doing light welding, machine work, forklift material handling, and field installation.",
  "employeeCount": 24,
  "state": "UT",
  "email": "owner@acmefab.example",
  "source": "legion",
  "campaign": "march-2026-safety-consultation",
  "externalLeadId": "lead_12345"
}
```

## Example cURL

```bash
curl -X POST "{{CONSULTATION_LEAD_ENDPOINT}}" \
  -H "Content-Type: application/json" \
  -H "x-consultation-ingest-secret: YOUR_SHARED_SECRET" \
  -d '{
    "companyName": "Acme Fabrication",
    "website": "https://acmefab.example",
    "description": "Metal fabrication shop doing light welding, machine work, forklift material handling, and field installation.",
    "employeeCount": 24,
    "state": "UT",
    "email": "owner@acmefab.example",
    "source": "legion",
    "campaign": "march-2026-safety-consultation",
    "externalLeadId": "lead_12345"
  }'
```

## Success Response

```json
{
  "deduped": false,
  "leadId": "abc123",
  "assessmentId": "abc123",
  "publicConsultationId": "abc123",
  "publicPath": "/free-safety-consultation/report/abc123",
  "publicUrl": "https://compliancechimp.com/free-safety-consultation/report/abc123",
  "deliveryStatus": "sent",
  "emailSentAt": "2026-03-06T19:14:00.000Z",
  "emailError": null
}
```

## Deduped Response

When the same `source` plus `externalLeadId` is submitted again:

```json
{
  "deduped": true,
  "leadId": "abc123",
  "assessmentId": "abc123",
  "publicConsultationId": "abc123",
  "publicPath": "/free-safety-consultation/report/abc123",
  "publicUrl": "https://compliancechimp.com/free-safety-consultation/report/abc123",
  "deliveryStatus": "sent"
}
```

## Failure Responses

- `400`: missing or invalid payload fields
- `401`: missing or invalid `x-consultation-ingest-secret`
- `405`: method not allowed

## Delivery Status Values

- `generated`: consultation was created but email has not been confirmed as sent yet
- `sent`: consultation email was sent successfully
- `send_failed`: consultation was generated, but the email send failed and may need a resend from admin

## What The Lead Receives

The lead receives an email with:

- their consultation summary
- their compliance urgency score
- a direct link to the pre-generated consultation
- the first recommended next actions
