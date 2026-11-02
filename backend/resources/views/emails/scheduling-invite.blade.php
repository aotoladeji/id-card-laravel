<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f6f9;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f9;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);max-width:600px;">

        <!-- Header -->
        <tr>
          <td style="background:#003399;padding:28px 32px;text-align:center;">
            @if ($logoCid ?? null)
              <img src="cid:{{ $logoCid }}" alt="University of Ibadan" width="56" height="56" style="display:block;margin:0 auto 10px;border-radius:8px;">
            @endif
            <h1 style="margin:0;color:#ffffff;font-size:22px;letter-spacing:0.5px;">University of Ibadan</h1>
            <p style="margin:6px 0 0;color:#c8d8ff;font-size:13px;text-transform:uppercase;letter-spacing:1px;">ID Card Management Unit</p>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:32px;">
            <p style="margin:0 0 8px;color:#333333;font-size:16px;">Dear <strong>{{ $student->full_name ?? 'Student' }}</strong>,</p>
            <p style="margin:0 0 24px;color:#555555;font-size:15px;line-height:1.6;">
              You have been scheduled to capture your student ID card. Please use the details below to book your preferred appointment slot before the deadline.
            </p>

            <!-- Credentials box -->
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4ff;border:1px solid #c5d0f0;border-radius:6px;margin-bottom:24px;">
              <tr>
                <td style="padding:20px 24px;">
                  <p style="margin:0 0 6px;font-size:12px;text-transform:uppercase;letter-spacing:0.8px;color:#666666;">Your Login Credentials</p>
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td style="padding:8px 0;border-bottom:1px solid #d8e0f5;width:45%;color:#555;font-size:14px;">Student ID</td>
                      <td style="padding:8px 0;border-bottom:1px solid #d8e0f5;color:#003399;font-weight:bold;font-size:15px;">{{ $student->matric_number ?: '—' }}</td>
                    </tr>
                    <tr>
                      <td style="padding:8px 0;color:#555;font-size:14px;">Login Code</td>
                      <td style="padding:8px 0;color:#003399;font-weight:bold;font-size:22px;letter-spacing:4px;">{{ $student->login_code }}</td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>

            <!-- Schedule details -->
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
              <tr>
                <td width="50%" style="padding:10px 12px;background:#f9f9f9;border:1px solid #ececec;border-radius:4px;font-size:13px;color:#555;">
                  📅 <strong>Booking Opens:</strong><br>{{ $startDateStr }}
                </td>
                <td width="10%"></td>
                <td width="50%" style="padding:10px 12px;background:#fff3cd;border:1px solid #ffc107;border-radius:4px;font-size:13px;color:#555;">
                  ⏰ <strong>Deadline:</strong><br>{{ $endDateStr }}
                </td>
              </tr>
              <tr><td colspan="3" style="height:10px;"></td></tr>
              <tr>
                <td colspan="3" style="padding:10px 12px;background:#f9f9f9;border:1px solid #ececec;border-radius:4px;font-size:13px;color:#555;">
                  📍 <strong>Location:</strong> {{ $location }}
                </td>
              </tr>
            </table>

            <!-- CTA Button -->
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
              <tr>
                <td align="center">
                  <a href="{{ $schedulingUrl }}" style="display:inline-block;background:#003399;color:#ffffff;text-decoration:none;padding:14px 36px;border-radius:6px;font-size:15px;font-weight:bold;letter-spacing:0.3px;">
                    Book My Appointment &rarr;
                  </a>
                  <p style="margin:10px 0 0;font-size:12px;color:#888888;">Or copy this link: <a href="{{ $schedulingUrl }}" style="color:#003399;">{{ $schedulingUrl }}</a></p>
                </td>
              </tr>
            </table>

            @if (count($importantLines))
            <!-- Important notes -->
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#fff8e1;border-left:4px solid #ffc107;border-radius:0 4px 4px 0;margin-bottom:24px;">
              <tr>
                <td style="padding:16px 20px;">
                  <p style="margin:0 0 8px;font-size:13px;font-weight:bold;color:#7a5800;">⚠️ Important Instructions</p>
                  <ul style="margin:0;padding-left:20px;color:#555555;font-size:13px;line-height:1.7;">
                    @foreach ($importantLines as $line)
                      <li style="margin-bottom:6px;">{{ $line }}</li>
                    @endforeach
                  </ul>
                </td>
              </tr>
            </table>
            @endif

            <p style="margin:0;color:#888888;font-size:13px;line-height:1.6;">
              If you have any questions, please contact the ID Card Unit directly (ITeMS/MIS Unit).<br>
              Do not reply to this email, it is sent from a restricted address.
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f0f0f0;padding:16px 32px;text-align:center;border-top:1px solid #e0e0e0;">
            <p style="margin:0;font-size:12px;color:#999999;">&copy; {{ date('Y') }} University of Ibadan &middot; ITeMS Management Information Systems Unit</p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>
