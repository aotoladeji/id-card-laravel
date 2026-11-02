<!DOCTYPE html>
<html>
<body style="font-family: Arial, sans-serif; color:#333;">
    <p>Dear <strong>{{ $student->full_name ?? 'Student' }}</strong>,</p>
    <p>Your ID card capture booking has been confirmed successfully.</p>
    <p><strong>Matric Number:</strong> {{ $student->matric_number ?? $matricNumber ?? 'N/A' }}</p>
    <p><strong>Appointment Date:</strong> {{ \Carbon\Carbon::parse($slot->slot_date)->toFormattedDateString() }}</p>
    <p><strong>Appointment Time:</strong> {{ substr($slot->slot_time, 0, 5) }}</p>
    <p><strong>Venue:</strong> {{ $location ?? 'MacArthur Building, University of Ibadan' }}</p>
    <p><strong>Capture App Login Code:</strong>
        <span style="font-size:20px;letter-spacing:3px;color:#003399;">{{ $captureLoginCode }}</span>
    </p>
    <p>Please keep this code safe. It is unique to your booking and required for login on the capture app.</p>
</body>
</html>
