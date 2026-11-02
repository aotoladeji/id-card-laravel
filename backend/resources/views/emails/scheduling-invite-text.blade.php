Dear {{ $student->full_name ?? 'Student' }},

You have been scheduled to capture your student ID card for {{ $config->title }}.

Book your appointment here: {{ $schedulingUrl }}

Login Code: {{ $student->login_code }}
Student ID: {{ $student->matric_number ?: '—' }}

Booking Opens: {{ $startDateStr }}
Deadline: {{ $endDateStr }}
Location: {{ $location }}

@if (count($importantLines))
Important Instructions:
@foreach ($importantLines as $line)
  - {{ $line }}
@endforeach

@endif
If you have any questions, please contact the ID Card Unit directly.

Do not reply to this email, it is sent from a restricted address.

© {{ date('Y') }} University of Ibadan · ITeMS Management Information Systems Unit
