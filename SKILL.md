---
name: google-forms
description: "Create Google Forms from any content via the Google Forms API. Use this skill when the user wants to create a Google Form, survey, quiz, questionnaire, or feedback form. Triggers include: mentioning 'Google Form', 'form', 'survey', 'questionnaire', 'feedback form', or asking to convert documents, text, or topics into a Google Form. The user may provide a Word file (.docx), text file (.txt), or simply describe what they want. The agent analyzes the content, generates appropriate questions with optimal question types, and creates the form automatically via the Google Forms API. Also use when the user says 'tao form', 'khao sat', 'bieu mau', or similar Vietnamese equivalents."
---

# Google Forms Generator

Create Google Forms from any content - files, pasted text, or topic descriptions.

## Prerequisites

Before first use, set up Google Cloud credentials:

1. Create a project at [Google Cloud Console](https://console.cloud.google.com/)
2. Enable **Google Forms API**
3. Create **OAuth 2.0 Client ID** (Desktop app)
4. Save the downloaded JSON as `credentials.json` in this skill's `scripts/` directory

## Workflow

### Step 1: Understand the Input

Accept any of these input types:
- **File path** (.docx, .txt, .pdf) - read and analyze the content
- **Pasted text** - user pastes content directly in chat
- **Topic description** - user says "create a survey about X"

If user provides a file, read its content first.

### Step 2: Generate Question JSON

Analyze the content and create `/tmp/form-questions.json`:

```json
{
  "title": "Form title",
  "description": "Form description",
  "questions": [
    { "text": "Short answer question", "type": "text", "required": true },
    { "text": "Long answer question", "type": "paragraph" },
    { "text": "Single choice", "type": "radio", "required": true, "options": ["A", "B", "C"] },
    { "text": "Multiple choice", "type": "checkbox", "options": ["X", "Y", "Z"] },
    { "text": "Dropdown select", "type": "dropdown", "options": ["One", "Two", "Three"] },
    { "text": "Rate 1-5", "type": "scale", "scale": { "low": 1, "high": 5, "lowLabel": "Bad", "highLabel": "Great" } },
    { "text": "Pick a date", "type": "date" },
    { "text": "Pick a time", "type": "time" },
    { "text": "New Section Title", "type": "section", "description": "Section description" }
  ]
}
```

**Question type reference:**

| type | Description | Extra fields |
|------|------------|-------------|
| `text` | Short text | - |
| `paragraph` | Long text | - |
| `radio` | Single choice | `options: string[]` |
| `checkbox` | Multi choice | `options: string[]` |
| `dropdown` | Dropdown | `options: string[]` |
| `scale` | Linear scale | `scale: { low, high, lowLabel, highLabel }` |
| `date` | Date picker | - |
| `time` | Time picker | - |
| `section` | Page break | `description` (optional) |

**Question design guidelines:**
- Choose appropriate types (use radio/checkbox/dropdown when options are clear, not always text)
- Group related questions into sections when there are 6+ questions
- Mark essential questions as `required: true`
- Match the language of the content (Vietnamese content = Vietnamese questions)

### Step 3: Create the Form

```bash
node scripts/create-form.js /tmp/form-questions.json
```

The `scripts/` path is relative to this skill's directory. The script outputs the form URL and edit URL.

### Step 4: Present Results

Report to the user:
- Form URL (for respondents)
- Edit URL (for the form owner)
- Summary of questions created

## Troubleshooting

| Error | Solution |
|-------|---------|
| `credentials.json not found` | Download OAuth credentials from Google Cloud Console and save in `scripts/` |
| `401 Unauthorized` | Delete `token.json` in `scripts/` and re-run to re-authorize |
| `403 Forbidden` | Enable Google Forms API at Google Cloud Console |
| `ENOENT: node_modules` | Run `npm install` in the `scripts/` directory |
