# Compliance Chimp

OSHA safety compliance and training software for small businesses. Simplify workplace safety with automated training, self-inspections, and injury reporting.

## Tech Stack

- **Frontend**: Angular 20, Angular Material, RxJS
- **Backend**: Firebase (Firestore, Auth, Functions, Hosting)
- **Integrations**: Stripe (payments), Twilio (SMS), SendGrid (email)

## Features

- **Safety Training** - Automated OSHA training courses and tracking
- **Self-Inspections** - Customizable workplace safety inspections
- **Incident Reports** - Injury and incident documentation
- **Team Management** - Employee onboarding and role management
- **Surveys** - Safety culture and compliance surveys
- **File Management** - Document storage and organization

## Getting Started

### Prerequisites

- Node.js 20+
- npm
- Firebase CLI (`npm install -g firebase-tools`)

### Installation

```bash
cd chimp-web
npm install
```

### Development

```bash
npm start
```

The app will be available at `http://localhost:4200`.

### Build

```bash
npm run build
```

### Deploy

```bash
npm run deploy
```

This builds the production app and deploys to Firebase Hosting.

## Cloud Functions

The backend functions are located in `chimp-web/functions/`.

```bash
cd chimp-web/functions
npm install
npm run deploy
```

## Project Structure

```
chimp-web/
├── src/
│   ├── app/
│   │   ├── account/       # Authenticated dashboard features
│   │   ├── blog/          # Blog content
│   │   ├── home/          # Landing page
│   │   ├── user/          # User-facing pages
│   │   └── shared/        # Shared services and components
│   ├── assets/            # Static assets
│   └── styles/            # Global styles
├── functions/             # Firebase Cloud Functions
└── docs/                  # Documentation
```

## License

Private - All rights reserved
