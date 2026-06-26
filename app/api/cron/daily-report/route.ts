import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { client, writeClient } from '@/sanity/lib/client';

export async function GET(req: Request) {
  try {
    // 1. Authenticate Cron Job
    const authHeader = req.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    // 2. Fetch all 'New' or un-reported Leads from Sanity
    const query = `*[_type == "lead" && reportedInDailyEmail == false]`;
    const leads = await client.fetch(query);

    if (leads.length === 0) {
      return NextResponse.json({ message: 'No new leads today' });
    }

    // 3. Format the Email Content
    let emailHtml = `
      <h2>Daily Lead Report 📅</h2>
      <p>Here are the new bookings/inquiries from Instagram today:</p>
      <table border="1" cellpadding="10" cellspacing="0" style="border-collapse: collapse; width: 100%;">
        <thead>
          <tr style="background-color: #f2f2f2;">
            <th>Username</th>
            <th>Name</th>
            <th>Phone</th>
            <th>Query Type</th>
            <th>Date Requested</th>
          </tr>
        </thead>
        <tbody>
    `;

    for (const lead of leads) {
      emailHtml += `
        <tr>
          <td>@${lead.instagramUsername || 'N/A'}</td>
          <td>${lead.name || 'N/A'}</td>
          <td>${lead.phoneNumber || 'Not provided'}</td>
          <td>${lead.queryType || 'General'}</td>
          <td>${lead.visitDate ? new Date(lead.visitDate).toLocaleDateString() : 'Not set'}</td>
        </tr>
      `;
    }

    emailHtml += `
        </tbody>
      </table>
      <p>Please follow up with these customers promptly to secure their bookings.</p>
    `;

    // 4. Send Email via Nodemailer
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: Number(process.env.SMTP_PORT) || 465,
      secure: process.env.SMTP_SECURE === 'true' || true,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    await transporter.sendMail({
      from: `"RJ Bot" <${process.env.EMAIL_USER}>`,
      to: process.env.JEWELER_EMAIL,
      subject: `[Daily Report] ${leads.length} New Leads Today`,
      html: emailHtml,
    });

    // 5. Mark leads as reported in Sanity
    for (const lead of leads) {
      await writeClient.patch(lead._id).set({ reportedInDailyEmail: true }).commit();
    }

    return NextResponse.json({ status: 'success', leadsReported: leads.length });
  } catch (error) {
    console.error('Error generating daily report:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
