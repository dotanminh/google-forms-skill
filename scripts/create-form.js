#!/usr/bin/env node

/**
 * Google Forms Creator Script
 * 
 * Reads a JSON file with form questions and creates a Google Form via API.
 * 
 * Usage:
 *   node create-form.js <path-to-json>
 * 
 * JSON format:
 *   { title, description, questions: [{ text, type, required, options?, scale?, description? }] }
 */

import { google } from 'googleapis';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { createInterface } from 'readline';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, '..');
const CREDENTIALS_PATH = join(ROOT_DIR, 'credentials.json');
const TOKEN_PATH = join(ROOT_DIR, 'token.json');
const SCOPES = ['https://www.googleapis.com/auth/forms.body'];

// ─── Auth ────────────────────────────────────────────

async function getAuthClient() {
  if (!existsSync(CREDENTIALS_PATH)) {
    throw new Error(
      `credentials.json not found at ${CREDENTIALS_PATH}\n` +
      `Download OAuth 2.0 credentials from Google Cloud Console.`
    );
  }

  const credentials = JSON.parse(readFileSync(CREDENTIALS_PATH, 'utf-8'));
  const { client_id, client_secret, redirect_uris } =
    credentials.installed || credentials.web;

  const oAuth2Client = new google.auth.OAuth2(
    client_id, client_secret, redirect_uris?.[0] || 'http://localhost'
  );

  if (existsSync(TOKEN_PATH)) {
    const token = JSON.parse(readFileSync(TOKEN_PATH, 'utf-8'));
    oAuth2Client.setCredentials(token);

    if (token.expiry_date && token.expiry_date < Date.now()) {
      try {
        const { credentials: newToken } = await oAuth2Client.refreshAccessToken();
        oAuth2Client.setCredentials(newToken);
        writeFileSync(TOKEN_PATH, JSON.stringify(newToken, null, 2));
      } catch {
        return await authorize(oAuth2Client);
      }
    }
    return oAuth2Client;
  }

  return await authorize(oAuth2Client);
}

async function authorize(oAuth2Client) {
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline', scope: SCOPES
  });

  console.log('\n=== Authorization Required ===');
  console.log('Open this URL in your browser:\n');
  console.log(authUrl);
  console.log('\nPaste the authorization code below.\n');

  const code = await new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question('Code: ', (answer) => { rl.close(); resolve(answer.trim()); });
  });

  const { tokens } = await oAuth2Client.getToken(code);
  oAuth2Client.setCredentials(tokens);
  writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
  console.log('Token saved.\n');
  return oAuth2Client;
}

// ─── Converter ───────────────────────────────────────

function buildRequests(formData) {
  const requests = [];
  let index = 0;

  if (formData.description) {
    requests.push({
      updateFormInfo: {
        info: { description: formData.description },
        updateMask: 'description'
      }
    });
  }

  for (const q of formData.questions) {
    const item = buildItem(q);
    if (item) {
      requests.push({ createItem: { item, location: { index } } });
      index++;
    }
  }

  return requests;
}

function buildItem(q) {
  if (q.type === 'section') {
    return { title: q.text, description: q.description || '', pageBreakItem: {} };
  }

  const question = { required: q.required || false };

  switch (q.type) {
    case 'text':
      question.textQuestion = { paragraph: false }; break;
    case 'paragraph':
      question.textQuestion = { paragraph: true }; break;
    case 'radio':
      question.choiceQuestion = { type: 'RADIO', options: (q.options || []).map(v => ({ value: v })) }; break;
    case 'checkbox':
      question.choiceQuestion = { type: 'CHECKBOX', options: (q.options || []).map(v => ({ value: v })) }; break;
    case 'dropdown':
      question.choiceQuestion = { type: 'DROP_DOWN', options: (q.options || []).map(v => ({ value: v })) }; break;
    case 'scale':
      question.scaleQuestion = {
        low: q.scale?.low ?? 1, high: q.scale?.high ?? 5,
        lowLabel: q.scale?.lowLabel || '', highLabel: q.scale?.highLabel || ''
      }; break;
    case 'date':
      question.dateQuestion = { includeYear: true }; break;
    case 'time':
      question.timeQuestion = { duration: false }; break;
    default:
      question.textQuestion = { paragraph: false }; break;
  }

  return {
    title: q.text,
    description: q.description || '',
    questionItem: { question }
  };
}

// ─── API ─────────────────────────────────────────────

async function createForm(authClient, formData) {
  const forms = google.forms({ version: 'v1', auth: authClient });

  // Create form
  const { data } = await forms.forms.create({
    requestBody: { info: { title: formData.title, documentTitle: formData.title } }
  });

  const formId = data.formId;

  // Add questions
  const requests = buildRequests(formData);
  if (requests.length > 0) {
    await forms.forms.batchUpdate({ formId, requestBody: { requests } });
  }

  // Publish
  try {
    await authClient.request({
      url: `https://forms.googleapis.com/v1/forms/${formId}:setPublishSettings`,
      method: 'POST',
      data: { publishSettings: { publishState: { isPublished: true, isAcceptingResponses: true } } }
    });
  } catch { /* non-critical */ }

  // Verify
  const result = await forms.forms.get({ formId });
  const items = result.data.items || [];
  const questionCount = items.filter(i => i.questionItem || i.questionGroupItem).length;

  return {
    formId,
    editUrl: `https://docs.google.com/forms/d/${formId}/edit`,
    responderUri: result.data.responderUri,
    title: result.data.info?.title,
    questionCount,
    totalItems: items.length
  };
}

// ─── Main ────────────────────────────────────────────

async function main() {
  const jsonPath = process.argv[2];

  if (!jsonPath) {
    console.error('Usage: node create-form.js <path-to-json>');
    process.exit(1);
  }

  const filePath = resolve(jsonPath);
  if (!existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }

  const formData = JSON.parse(readFileSync(filePath, 'utf-8'));
  console.log(`Title: ${formData.title}`);
  console.log(`Questions: ${formData.questions.length}`);

  const authClient = await getAuthClient();
  console.log('Authenticated.');

  const result = await createForm(authClient, formData);

  console.log('\n=== Google Form Created ===');
  console.log(`Title: ${result.title}`);
  console.log(`Questions: ${result.questionCount}`);
  console.log(`Total items: ${result.totalItems}`);
  console.log(`\nForm URL: ${result.responderUri}`);
  console.log(`Edit URL: ${result.editUrl}`);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
