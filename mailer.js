const EMAILJS_URL = 'https://api.emailjs.com/api/v1.0/email/send';

function escapeHtml(v) {
  return String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function codeEmailHtml(code) {
  return `
<div style="font-family:Arial,Helvetica,sans-serif;background:#f3f4f6;padding:24px;">
  <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 16px rgba(76,29,149,0.12);">
    <div style="background:#4c1d95;padding:20px 24px;"><h1 style="margin:0;color:#ffffff;font-size:20px;">Jobmed admin verification</h1></div>
    <div style="padding:24px;color:#374151;font-size:15px;line-height:1.5;">
      <p style="margin:0 0 16px;">Use this code to verify your email address:</p>
      <p style="margin:0 0 16px;font-size:32px;font-weight:700;letter-spacing:8px;color:#4c1d95;">${escapeHtml(code)}</p>
      <p style="margin:0;color:#6b7280;font-size:13px;">It expires in 15 minutes. If you did not request this, ignore this email.</p>
    </div>
    <div style="background:#14b8a6;padding:12px 24px;color:#ffffff;font-size:12px;">Jobmed Occupational Health</div>
  </div>
</div>`;
}

export async function sendVerificationCode(to, code) {
  const privateKey = process.env.EMAILJS_PRIVATE_KEY;
  if (!privateKey) {
    if (process.env.NODE_ENV === 'production') throw new Error('EMAILJS_PRIVATE_KEY is not configured');
    console.log(`[DEV] Verification code for ${to}: ${code}`);
    return;
  }

  const res = await fetch(EMAILJS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      service_id: process.env.EMAILJS_SERVICE_ID,
      template_id: process.env.EMAILJS_TEMPLATE_ID,
      user_id: process.env.EMAILJS_PUBLIC_KEY,
      accessToken: privateKey,
      template_params: {
        to_email: to,
        from_name: 'Jobmed',
        reply_to: 'info@jobmed.co.za',
        subject: 'Your Jobmed admin verification code',
        email_html: codeEmailHtml(code),
      },
    }),
  });
  if (!res.ok) throw new Error(`EmailJS send failed: ${res.status} ${await res.text()}`);
}
