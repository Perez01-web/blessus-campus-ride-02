# Transport Booking Web App — MVP 2 (Provider Discovery & Ride Booking)

A lightweight, clean full-stack transport booking web application designed to connect students and service seekers with verified taxi drivers and motorbike operators.

Built using **HTML5, CSS3, Vanilla JavaScript, Node.js, Express.js, and Firebase (Authentication & Firestore)**.

---

## 1. Project Folder Structure

```text
transport-booking-app/
│
├── frontend/
│   │   ├── index.html                   # Landing page
│   │   ├── login.html                   # Login form with role redirection
│   │   ├── register.html                # User registration with role & vehicle selection
│   │   │
│   │   ├── student/
│   │   │   ├── dashboard.html           # Student dashboard, quick actions & My Bookings modal
│   │   │   └── find-transport.html      # Driver discovery, booking modal & provider filters
│   │   │
│   │   ├── provider/
│   │   │   ├── dashboard.html           # Provider dashboard, live stats & ride request feed
│   │   │   └── profile.html             # Provider profile & vehicle/rate editor
│   │   │
│   │   ├── css/
│   │   │   ├── main.css                 # Global theme (transport amber/slate), layout, modals
│   │   │   ├── auth.css                 # Authentication & registration forms styling
│   │   │   ├── dashboard.css            # Dashboards, cards, status badges & profile styles
│   │   │   ├── find-transport.css       # Driver discovery grid, filters & provider cards
│   │   │   └── bookings.css             # Booking buttons, modal, request list & status badges
│   │   │
│   │   ├── js/
│   │   │   ├── firebase-config.js       # Firebase Web SDK initialization
│   │   │   ├── auth.js                  # Authentication manager & role guards
│   │   │   ├── register.js              # Registration logic & Firestore user creation
│   │   │   ├── login.js                 # Login logic & Firestore role validation
│   │   │   ├── api.js                   # Backend API client with Firebase ID token headers
│   │   │   ├── firestore-service.js     # Direct client-side Firestore reads
│   │   │   ├── bookings-service.js      # Firestore booking CRUD & live subscriptions
│   │   │   ├── student-dashboard.js     # Student dashboard, live My Bookings list & cancel
│   │   │   ├── provider-dashboard.js    # Provider dashboard, live ride request feed & actions
│   │   │   ├── provider-profile.js      # Provider profile editing & Firestore synchronization
│   │   │   ├── student/
│   │   │   │   └── find-transport.js    # Driver cards, Book/Call actions & booking submission
│   │   │   └── utils.js                 # UI helpers, alerts, session caching & modals
│   │   │
│   │   └── assets/
│   │       ├── images/                  # Image assets
│   │       └── icons/                   # Icon assets
│
├── backend/
│   │
│   ├── server.js                    # Express server entry point & static asset serving
│   │
│   ├── config/
│   │   └── firebase-admin.js        # Firebase Admin SDK initialization
│   │
│   ├── routes/
│   │   ├── auth.routes.js           # Auth & user profile routes
│   │   ├── provider.routes.js       # Provider profile routes
│   │   └── booking.routes.js        # Ride booking routes
│   │
│   ├── controllers/
│   │   ├── auth.controller.js       # Auth request/response handling
│   │   ├── provider.controller.js   # Provider profile request/response handling
│   │   └── booking.controller.js    # Booking request/response handling & ownership checks
│   │
│   ├── middleware/
│   │   └── auth.middleware.js       # Firebase ID token verification middleware
│   │
│   └── services/
│       ├── user.service.js          # Firestore database operations for 'users' collection
│       ├── provider.service.js      # Firestore database operations for 'providers' collection
│       └── booking.service.js       # Firestore operations for 'bookings' collection
│
├── firestore.rules                  # Firestore security rules (users, providers, bookings)
├── firebase.json                    # Firebase deploy config (points at firestore.rules)
├── firebase-blueprint.json          # Data model registry for users, providers & bookings
├── .env                             # Backend environment secrets
├── .env.example                     # Sample environment configuration template
├── .gitignore                       # Git ignore list (node_modules, .env, serviceAccountKey)
├── package.json                     # Node.js project scripts and dependencies
└── README.md                        # Documentation and setup guide
```

---

## 2. Folder Responsibilities

* **`frontend/`**: Contains everything the user sees and interacts with. Built with semantic HTML5, pure CSS3 (no external frameworks like Tailwind or Bootstrap), and Vanilla JavaScript (ES modules).
* **`backend/`**: Contains server-side logic powered by Node.js and Express.js.
  * **`server.js`**: Initializes Express, configures CORS/JSON middleware, serves frontend files, and mounts routes.
  * **`config/`**: Initializes Firebase Admin SDK securely using environment variables.
  * **`routes/`**: Defines API routes and connects endpoints to controllers.
  * **`controllers/`**: Receives requests, calls services, and formats JSON responses.
  * **`services/`**: Encapsulates Firestore database operations for `users`, `providers` and `bookings`.
  * **`middleware/`**: Reusable middleware, including `verifyAuthToken` for Firebase ID tokens.

### Where bookings are written

Booking data is written **client-side straight to Firestore**, so the provider portal receives updates live through a Firestore `onSnapshot` listener. The backend `/api/bookings` endpoints mirror the same client-generated `bookingId` for API parity and audit purposes, and enforce ownership rules server-side.

Both feeds query on a **single field** (`providerId` / `studentId`) and sort client-side, so **no composite Firestore index is required**.

---

## 3. Data Models in Firestore

### Collection: `users/{uid}`
```json
{
  "uid": "user-unique-id",
  "name": "Grace Phiri",
  "email": "grace@example.com",
  "phone": "0887654321",
  "role": "student",
  "createdAt": "2026-10-08T00:00:00.000Z"
}
```
*(For providers, `providerType` is also set to `"taxi"` or `"motorbike"`).*

### Collection: `providers/{providerId}`
```json
{
  "providerId": "provider-unique-id",
  "userId": "provider-unique-id",
  "name": "John Banda",
  "providerType": "taxi",
  "phone": "0991234567",
  "vehicleName": "Toyota Corolla",
  "vehicleRegistration": "NA 1234",
  "price": 5000,
  "estimatedWaitTime": 10,
  "available": true,
  "createdAt": "2026-10-08T00:00:00.000Z",
  "updatedAt": "2026-10-08T00:00:00.000Z"
}
```

### Collection: `bookings/{bookingId}`
```json
{
  "bookingId": "bkg_m1x2y3_a4b5c6",
  "studentId": "student-unique-id",
  "studentName": "Grace Phiri",
  "studentPhone": "0887654321",
  "providerId": "provider-unique-id",
  "providerName": "John Banda",
  "providerPhone": "0991234567",
  "providerType": "taxi",
  "vehicleName": "Toyota Corolla",
  "pickupTime": "2026-10-08T14:30:00.000Z",
  "fare": 5000,
  "estimatedWaitTime": 10,
  "status": "pending",
  "createdAt": "2026-10-08T14:20:00.000Z",
  "updatedAt": "2026-10-08T14:20:00.000Z"
}
```

* `bookingId` is also the document id, and `pickupTime` is the **specific time** the student selected for pickup.
* `status` is one of `pending` → `accepted` → `completed`, with `rejected` (provider) and `cancelled` (student) as the other terminal states.
* Timestamps are ISO strings, matching the rest of the codebase, so they sort chronologically as plain strings.

---

## 4. The Ride Booking Feature

### Student side — Find Available Transport

Each driver card ends with two actions instead of a price tag:

| Action | Behaviour |
| --- | --- |
| **Book** | Opens the booking modal, showing driver, service, vehicle and trip fare, plus a `datetime-local` pickup picker pre-filled with *now + the driver's average wait time*. Confirming writes the booking to Firestore with status `pending`. |
| **Call** *(icon only)* | A `tel:` link that dials the driver's saved phone number. Rendered as a non-interactive hint if the driver has no number on file. |

The trip fare was moved into the card's details list so the price stays visible now that the footer holds the buttons.

### Provider side — Live Ride Requests

The provider dashboard has a **Ride Requests** section driven by a Firestore `onSnapshot` listener. A new booking appears the moment a student confirms it, showing the student, the exact pickup time, the fare and a Call button for the student. From there the provider can:

* **Accept** → `accepted` (the student sees the confirmation immediately)
* **Decline** → `rejected`
* **Mark Completed** → `completed`

The dashboard also carries a live request counter in its stats row.

### Student side — My Bookings

The "My Bookings" card on the student dashboard opens a modal with a live list of the student's bookings, their status badge, and a **Cancel Booking** action for anything still `pending` or `accepted`.

---

## 5. How to Configure Firebase

### Frontend (Client SDK)
Open `frontend/js/firebase-config.js` and paste your Firebase Web App configuration from the Firebase Console (*Project Settings > General > Your apps*):

```javascript
export const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:abcdef"
};
```

### Backend (Admin SDK)
In `.env`, configure your service account variables from the Firebase Console (*Project Settings > Service accounts > Generate new private key*):

```env
PORT=3000
FIREBASE_PROJECT_ID="your-project-id"
FIREBASE_CLIENT_EMAIL="firebase-adminsdk@your-project-id.iam.gserviceaccount.com"
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

*Note: Never commit `.env` or `serviceAccountKey.json` to source control. They are protected by `.gitignore`.*

Without these credentials the backend falls back to an in-memory store, which is enough to run the app locally because the browser writes bookings directly to Firestore.

### Firestore Security Rules

`firestore.rules` holds the rules for `users`, `providers` and `bookings`, and `firebase.json` points the Firebase CLI at that file. **Deploy them before using the booking feature**, otherwise writes to the `bookings` collection are rejected with `permission-denied`:

```bash
firebase login
firebase deploy --only firestore:rules
```

Or paste the contents of `firestore.rules` into *Firebase Console → Firestore Database → Rules → Publish*.

The `bookings` rules are deliberately tight:

* only a signed-in student can create a booking, and only for themselves, always starting as `pending`;
* the student and the provider can both read their own bookings;
* the parties on a booking and the agreed `fare` are **immutable**;
* a student may only set `status` to `cancelled`, a provider only to `accepted`, `rejected` or `completed`.

---

## 6. Running the Application

1. **Install dependencies:**
   ```bash
   npm install --legacy-peer-deps
   ```
   *(The `--legacy-peer-deps` flag is required because the React/Vite tooling in `package.json` is not used by this app and pulls conflicting peer versions of `esbuild`.)*

2. **Start the development server:**
   ```bash
   npm run dev
   ```

3. Open your browser at `http://localhost:3000` to view the application.

---

## 7. MVP 2 Status

* **Status:** Module 2 Complete — provider discovery and live ride booking
* **Next Module:** Module 3 — trip execution, in-trip tracking and ratings
