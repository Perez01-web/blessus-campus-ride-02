# Transport Booking Web App — MVP 1 (Foundation & Authentication)

A lightweight, clean full-stack transport booking web application designed to connect students and service seekers with verified taxi drivers and motorbike operators.

Built using **HTML5, CSS3, Vanilla JavaScript, Node.js, Express.js, and Firebase (Authentication & Firestore)**.

---

## 1. Project Folder Structure

```text
transport-booking-app/
│
├── frontend/
│   │
│   ├── index.html                   # Landing page
│   ├── login.html                   # Login form with role redirection
│   ├── register.html                # User registration with role & vehicle selection
│   │
│   ├── student/
│   │   └── dashboard.html           # Student dashboard & quick actions
│   │
│   ├── provider/
│   │   ├── dashboard.html           # Provider dashboard & live stats
│   │   └── profile.html             # Provider profile & vehicle/rate editor
│   │
│   ├── css/
│   │   ├── main.css                 # Global theme (transport amber/slate), layout, modals
│   │   ├── auth.css                 # Authentication & registration forms styling
│   │   └── dashboard.css            # Dashboards, cards, status badges & profile styles
│   │
│   ├── js/
│   │   ├── firebase-config.js       # Firebase Web SDK initialization
│   │   ├── auth.js                  # Authentication manager & role guards
│   │   ├── register.js              # Registration logic & Firestore user creation
│   │   ├── login.js                 # Login logic & Firestore role validation
│   │   ├── student-dashboard.js     # Student dashboard actions & placeholder handlers
│   │   ├── provider-dashboard.js     # Provider dashboard metrics & status handlers
│   │   ├── provider-profile.js      # Provider profile editing & Firestore synchronization
│   │   └── utils.js                 # UI helpers, alerts, session caching & modals
│   │
│   └── assets/
│       ├── images/                  # Image assets
│       └── icons/                   # Icon assets
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
│   │   └── provider.routes.js       # Provider profile routes
│   │
│   ├── controllers/
│   │   ├── auth.controller.js       # Auth request/response handling
│   │   └── provider.controller.js   # Provider profile request/response handling
│   │
│   ├── middleware/
│   │   └── auth.middleware.js       # Firebase ID token verification middleware
│   │
│   └── services/
│       ├── user.service.js          # Firestore database operations for 'users' collection
│       └── provider.service.js      # Firestore database operations for 'providers' collection
│
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
  * **`services/`**: Encapsulates Firestore database operations for `users` and `providers`.
  * **`middleware/`**: Reusable middleware, including `verifyAuthToken` for Firebase ID tokens.

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

---

## 4. How to Configure Firebase

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

---

## 5. Running the Application

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Start the development server:**
   ```bash
   npm run dev
   ```

3. Open your browser at `http://localhost:3000` to view the application.

---

## 6. MVP 1 Status

* **Status:** Module 1 Complete
* **Next Module:** Module 2 — Provider Discovery
