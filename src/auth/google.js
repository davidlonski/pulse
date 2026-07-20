import { google } from "googleapis";

const SCOPES = [
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/gmail.readonly",
];

function newClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

export function getAuthUrl() {
  return newClient().generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
  });
}

export async function getGoogleClient(db) {
  const client = newClient();
  const row = db.prepare("SELECT value FROM settings WHERE key = 'google_refresh_token'").get();
  if (row?.value) client.setCredentials({ refresh_token: row.value });
  return client;
}

export { SCOPES };
