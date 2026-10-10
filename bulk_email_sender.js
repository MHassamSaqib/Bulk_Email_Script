require('dotenv').config();

const nodemailer = require('nodemailer');
const fs = require('fs');
const csv = require('csv-parser');
const path = require('path');

// Personal values come from .env (never commit .env)
const config = {
  senderEmail: process.env.SENDER_EMAIL || '',
  appPassword: process.env.APP_PASSWORD || '',
  cvPath: process.env.CV_PATH || './CV.pdf',
  professorListPath:
    process.env.PROFESSOR_LIST_PATH || './examples/professors.example.csv',
  emailsPerBatch: Number(process.env.EMAILS_PER_BATCH || 20),
  delayBetweenEmails: Number(process.env.DELAY_BETWEEN_EMAILS_MS || 6000),
  applicantName: process.env.APPLICANT_NAME || 'Applicant',
  applicantDegree: process.env.APPLICANT_DEGREE || 'BSCS',
  applicantPhone: process.env.APPLICANT_PHONE || '',
  applicantBackground:
    process.env.APPLICANT_BACKGROUND ||
    'a Computer Science graduate with software engineering experience',
};

const cleanAppPassword = String(config.appPassword || '').replace(/\s+/g, '');

function displayDepartment(raw) {
  const value = String(raw || '').trim();
  const key = value.toLowerCase();
  if (!value || key === 'ai') return 'Artificial Intelligence';
  if (key === 'se') return 'Software Engineering';
  if (key === 'cs') return 'Computer Science';
  if (key === 'iot' || key === 'internet of things') return 'Internet of Things';
  if (key.includes('intelligent science')) {
    return 'Intelligent Science and Technology';
  }
  return value;
}

function displayUniversity(raw) {
  const value = String(raw || '').trim();
  if (!value) return 'the university';
  if (/^njfu$/i.test(value) || /forestry/i.test(value)) {
    return 'Nanjing Forestry University';
  }
  if (
    /^ustc$/i.test(value) ||
    /university of science and technology of china/i.test(value)
  ) {
    return 'University of Science and Technology of China';
  }
  return value;
}

function pickEmail(raw) {
  const emails = String(raw || '')
    .split(/[;,/]/)
    .map((email) => email.trim())
    .filter((email) => email && email.includes('@'));
  const official = emails.find((email) =>
    /(njfu|seu|nju|njust|xidian|ustc)\.edu\.cn$/i.test(email)
  );
  return official || emails[0] || '';
}

function cleanExpertise(raw) {
  const value = String(raw || '').trim();
  if (
    !value ||
    /no research-area text|not exposed|not publicly verified|not specified on current profile|not provided/i.test(
      value
    )
  ) {
    return 'artificial intelligence';
  }
  return value;
}

// Chinese faculty sheets use Family Given (e.g. "Bi Changwei" -> Prof. Bi).
// Western names keep the last token (e.g. "Ateeq ur Rehman" -> Prof. Rehman).
function professorSurname(name, university) {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return 'Professor';
  const uni = String(university || '').toLowerCase();
  const chineseCampus =
    /forestry|southeast|nanjing|xidian|njust|njfu|ustc|science and technology of china|\bseu\b/.test(
      uni
    );
  if (chineseCampus && parts.length === 2) return parts[0];
  return parts[parts.length - 1];
}

function shortExpertise(expertise) {
  const value = String(expertise || 'artificial intelligence').trim();
  const first = value.split(/[;]/)[0].trim() || value;
  if (first.length <= 70) return first;
  return `${first.slice(0, 67)}...`;
}

const emailTemplate = {
  subject: (department, expertise) =>
    `CSC Master's Applicant in ${department} - Interested in Your Research in ${shortExpertise(expertise)}`,
  getBody: (professorSurname, expertise, department, university) =>
    `Respected Prof. ${professorSurname},

I'm ${config.applicantName}, ${config.applicantBackground} (${config.applicantDegree}). I recently built an AI agent pipeline using prompt engineering that automates first-pass app testing, and I want to move into AI research at the graduate level.

I plan to apply for a Master's in ${department} at ${university} through the CSC Scholarship, and I am particularly interested in your research in ${expertise}.

If you are open to supervising a student with my background, an acceptance letter from you would greatly strengthen my application. My CV is attached, and I can send my study plan and transcript right away.

Thank you for your time and consideration.

Best regards,
${config.applicantName}
${config.applicantPhone}`.trim(),
};

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true,
  auth: {
    user: config.senderEmail,
    pass: cleanAppPassword,
  },
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function verifyGmailAuth() {
  if (!config.senderEmail) {
    console.error('❌ Set SENDER_EMAIL in your .env file');
    process.exit(1);
  }

  if (!cleanAppPassword || cleanAppPassword.length !== 16) {
    console.error('❌ Set a real 16-character Gmail App Password in .env as APP_PASSWORD');
    console.error('   Open: https://myaccount.google.com/apppasswords');
    console.error('   Copy .env.example → .env and fill in your values.\n');
    process.exit(1);
  }

  console.log(`🔐 Verifying Gmail login as: ${config.senderEmail}`);
  console.log(`   App password length: ${cleanAppPassword.length} (must be 16)\n`);

  try {
    await transporter.verify();
    console.log('✅ Gmail authentication OK\n');
  } catch (error) {
    console.error('❌ Gmail authentication failed for', config.senderEmail);
    console.error('');
    if (/ENOTFOUND|EHOSTUNREACH|ETIMEDOUT|ECONNREFUSED/i.test(error.message)) {
      console.error('This looks like a network/DNS problem, not a wrong password.');
      console.error('  • Check internet / VPN / firewall');
      console.error('  • Try: ping smtp.gmail.com');
      console.error('  • Or switch network and run again');
      console.error('');
    } else {
      console.error('Common auth causes:');
      console.error('  • App Password was created on a different Google account');
      console.error('  • Wrong / old App Password in .env');
      console.error('  • Create a new App Password and update APP_PASSWORD');
      console.error('');
    }
    console.error('Error:', error.message);
    process.exit(1);
  }
}

async function sendBulkEmails() {
  try {
    console.log('📧 Starting bulk email sender...\n');
    await verifyGmailAuth();

    if (!fs.existsSync(config.professorListPath)) {
      console.error(`❌ Professor list not found: ${config.professorListPath}`);
      process.exit(1);
    }

    if (!fs.existsSync(config.cvPath)) {
      console.error(`❌ CV file not found: ${config.cvPath}`);
      process.exit(1);
    }

    const professors = [];

    fs.createReadStream(config.professorListPath)
      .pipe(csv())
      .on('data', (row) => {
        professors.push(row);
      })
      .on('end', async () => {
        console.log(`✅ Loaded ${professors.length} professors from list\n`);

        let successCount = 0;
        let failureCount = 0;
        const results = [];

        const toSend = professors.filter((prof) => {
          const email = pickEmail(prof['Email Address'] || prof['Email']);
          const name = (prof['Professor Name'] || prof['Name'] || '').trim();
          return Boolean(name && email);
        });

        console.log(
          `📨 Ready to send: ${toSend.length} (skipped ${professors.length - toSend.length} without name/email)\n`
        );

        for (let i = 0; i < toSend.length; i++) {
          const prof = toSend[i];
          const professorName = (prof['Professor Name'] || prof['Name'] || '').trim();
          const professorEmail = pickEmail(prof['Email Address'] || prof['Email']);
          const expertise = cleanExpertise(
            prof['Expertise'] ||
              prof['Expert Area'] ||
              prof['Expert / Research Area'] ||
              prof['Research Area'] ||
              prof['Research Interests'] ||
              prof['Research'] ||
              ''
          );
          const department = displayDepartment(
            prof['Department'] || prof['Department / School']
          );
          const university = displayUniversity(prof['University']);
          const surname = professorSurname(professorName, university);

          console.log(
            `[${i + 1}/${toSend.length}] Sending to ${professorName} (${professorEmail})...`
          );
          console.log(`   ${department} at ${university}`);
          console.log(`   Expertise: ${expertise}`);

          try {
            const mailOptions = {
              from: config.senderEmail,
              to: professorEmail,
              subject: emailTemplate.subject(department, expertise),
              text: emailTemplate.getBody(
                surname,
                expertise,
                department,
                university
              ),
              attachments: [
                {
                  filename: 'CV.pdf',
                  path: path.resolve(config.cvPath),
                  contentType: 'application/pdf',
                },
              ],
            };

            await transporter.sendMail(mailOptions);
            console.log(`✅ Email sent successfully to ${professorName}\n`);
            successCount++;
            results.push({
              name: professorName,
              email: professorEmail,
              status: 'SUCCESS',
            });
          } catch (error) {
            console.error(
              `❌ Failed to send email to ${professorName}: ${error.message}\n`
            );
            failureCount++;
            results.push({
              name: professorName,
              email: professorEmail,
              status: 'FAILED',
              error: error.message,
            });
          }

          if (i < toSend.length - 1) {
            await sleep(config.delayBetweenEmails);
          }
        }

        console.log('\n' + '='.repeat(60));
        console.log('📊 BULK EMAIL SUMMARY');
        console.log('='.repeat(60));
        console.log(`✅ Successful: ${successCount}`);
        console.log(`❌ Failed: ${failureCount}`);
        console.log(`📧 Total Processed: ${toSend.length}`);
        console.log('='.repeat(60) + '\n');

        fs.writeFileSync('email_results.json', JSON.stringify(results, null, 2));
        console.log('📄 Results saved to: email_results.json\n');

        process.exit(failureCount > 0 ? 1 : 0);
      })
      .on('error', (error) => {
        console.error(`❌ Error reading CSV file: ${error.message}`);
        process.exit(1);
      });
  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
    process.exit(1);
  }
}

sendBulkEmails();
