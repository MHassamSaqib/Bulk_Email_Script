# CSC Professor Email Helper

Node.js helper for sending personalized CSC Master's inquiry emails from a CSV faculty list.

> **Use responsibly.** Prefer small, targeted batches. Mass cold email can get blocked by Gmail or university servers.

## Setup

```bash
npm install
cp .env.example .env
```

Edit `.env` with your Gmail address, App Password, CV path, and applicant details.

Create a Gmail App Password: [Google App Passwords](https://myaccount.google.com/apppasswords)

## Example CSV

Only a sample file is included in this repo:

```text
examples/professors.example.csv
```

Copy it and replace rows with your own private list (kept locally, not committed):

```bash
cp examples/professors.example.csv my_professors.csv
```

Then set in `.env`:

```env
PROFESSOR_LIST_PATH=./my_professors.csv
```

### CSV columns

```csv
Professor Name,Email,Expert / Research Area,Department,University
```

## Run

```bash
node bulk_email_sender.js
```

## Privacy

Not committed to GitHub:

- `.env` — email, App Password, phone, name
- `*.pdf` — your CV
- `email_results.json` — send log
- Private faculty folders (`SEU/`, `USTC/`, `Xidian/`, etc.)

## Security note

If an App Password was ever shared, revoke it and create a new one in Google Account → App passwords.
