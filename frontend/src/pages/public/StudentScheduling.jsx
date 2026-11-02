import { useState } from 'react';
import { useParams } from 'react-router-dom';
import ConfirmDialog from '../../components/ConfirmDialog';
import { useConfirmDialog } from '../../hooks/useConfirmDialog';
import { formatTime12Hour } from '../../utils/timeFormat';

const rawApiBaseUrl = (import.meta.env.VITE_API_BASE_URL || '/api').trim();
const API_BASE_URL = rawApiBaseUrl.endsWith('/')
  ? rawApiBaseUrl.slice(0, -1)
  : rawApiBaseUrl;

const buildApiUrl = (path) => {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE_URL}${normalizedPath}`;
};

export default function StudentScheduling() {
  const { configId } = useParams();
  const [step, setStep] = useState('login');
  const [studentId, setStudentId] = useState('');
  const [loginCode, setLoginCode] = useState('');
  const [student, setStudent] = useState(null);
  const [config, setConfig] = useState(null);
  const [slots, setSlots] = useState({});
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { dialogState, showDialog, closeDialog } = useConfirmDialog();

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await fetch(buildApiUrl('/public/scheduling/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ configId, studentId, loginCode })
      });

      const data = await response.json();
      
      if (response.ok) {
        setStudent(data.student);
        setConfig(data.config);
        
        if (data.student.hasScheduled) {
          setStep('confirmation');
        } else {
          await fetchSlots();
          setStep('schedule');
        }
      } else {
        setError(data.message);
      }
    } catch {
      setError('Connection error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const fetchSlots = async () => {
    try {
      const response = await fetch(buildApiUrl(`/public/scheduling/${configId}/available-slots`));
      const data = await response.json();
      if (response.ok) {
        setSlots(data.slots);
      }
    } catch {
      setError('Error loading slots');
    }
  };

  const handleBookSlot = async () => {
    if (!selectedSlot) {
      setError('Please select a time slot');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await fetch(buildApiUrl('/public/scheduling/book'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: student.id,
          slotId: selectedSlot.id,
          configId
        })
      });

      const data = await response.json();
      
      if (response.ok) {
        setStep('confirmation');
        setStudent({
          ...student,
          appointment: data.appointment,
          captureLoginCode: data.captureLoginCode,
          confirmationEmailSent: data.confirmationEmailSent,
          confirmationEmailError: data.confirmationEmailError
        });
      } else {
        setError(data.message);
      }
    } catch {
      setError('Error booking appointment');
    } finally {
      setLoading(false);
    }
  };

  const handleCancelAppointment = async () => {
    const confirmed = await showDialog({
      type: 'confirm',
      title: 'Cancel Appointment',
      message: 'Are you sure you want to cancel this appointment?'
    });

    if (!confirmed) return;

    setLoading(true);

    try {
      const response = await fetch(buildApiUrl('/public/scheduling/cancel'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId: student.id })
      });

      const data = await response.json();
      
      if (response.ok) {
        setStudent({ ...student, hasScheduled: false, appointment: null });
        await fetchSlots();
        setStep('schedule');
      } else {
        setError(data.message);
      }
    } catch {
      setError('Error cancelling appointment');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    // Close the window or redirect
    window.close();
    // If window.close() doesn't work (popup blocked), redirect to a thank you page
    setTimeout(() => {
      window.location.href = 'about:blank';
    }, 100);
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '2rem'
    }}>
      <div style={{
        background: '#1e293b',
        borderRadius: '20px',
        padding: '2.5rem',
        maxWidth: '900px',
        width: '100%',
        boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
        border: '1px solid #334155',
        position: 'relative'
      }}>
        {step === 'login' && (
          <>
            <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
              <h1 style={{ 
                fontSize: '2rem', 
                marginBottom: '0.5rem', 
                color: '#ffffff',
                fontWeight: '700'
              }}>
                📅 Schedule Your ID Card Capture
              </h1>
              <p style={{ color: '#cbd5e1', fontSize: '1rem' }}>
                Enter your credentials to book an appointment
              </p>
            </div>

            {error && (
              <div style={{
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                color: '#ef4444',
                padding: '1rem',
                borderRadius: '8px',
                marginBottom: '1.5rem'
              }}>
                {error}
              </div>
            )}

            <form onSubmit={handleLogin} style={{ maxWidth: '400px', margin: '0 auto' }}>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ 
                  display: 'block', 
                  marginBottom: '0.5rem', 
                  color: '#ffffff', 
                  fontWeight: '600',
                  fontSize: '0.95rem'
                }}>
                  Matric Number
                </label>
                <input
                  type="text"
                  value={studentId}
                  onChange={(e) => setStudentId(e.target.value)}
                  placeholder="e.g., UI/2023/1234"
                  required
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    borderRadius: '8px',
                    border: '1px solid #334155',
                    background: '#0f172a',
                    color: '#f1f5f9',
                    fontSize: '0.95rem'
                  }}
                />
              </div>

              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ 
                  display: 'block', 
                  marginBottom: '0.5rem', 
                  color: '#ffffff', 
                  fontWeight: '600',
                  fontSize: '0.95rem'
                }}>
                  Login Code
                </label>
                <input
                  type="text"
                  value={loginCode}
                  onChange={(e) => setLoginCode(e.target.value)}
                  placeholder="6-digit code from email"
                  required
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    borderRadius: '8px',
                    border: '1px solid #334155',
                    background: '#0f172a',
                    color: '#f1f5f9',
                    fontSize: '0.95rem'
                  }}
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                style={{
                  width: '100%',
                  padding: '0.875rem',
                  borderRadius: '8px',
                  border: 'none',
                  background: '#3b82f6',
                  color: 'white',
                  fontSize: '1rem',
                  fontWeight: '600',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  opacity: loading ? 0.5 : 1
                }}
              >
                {loading ? 'Verifying...' : 'Continue →'}
              </button>
            </form>
          </>
        )}

        {step === 'schedule' && (
          <>
            <div style={{ marginBottom: '2rem' }}>
              <h2 style={{ 
                fontSize: '1.75rem', 
                marginBottom: '0.5rem', 
                color: '#ffffff',
                fontWeight: '700'
              }}>
                Welcome, {student?.fullName || student?.full_name || 'Student'}! 👋
              </h2>
              <p style={{ 
                color: '#cbd5e1',
                fontSize: '1rem'
              }}>
                Select a date and time for your ID card capture appointment
              </p>
            </div>

            <div style={{ 
              marginBottom: '1.5rem', 
              padding: '1rem', 
              background: '#0f172a', 
              borderRadius: '10px',
              fontSize: '0.9rem',
              color: '#cbd5e1'
            }}>
              📧 {student?.email} • {student?.faculty} • {student?.department}
            </div>

            {error && (
              <div style={{
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                color: '#ef4444',
                padding: '1rem',
                borderRadius: '8px',
                marginBottom: '1.5rem'
              }}>
                {error}
              </div>
            )}

            <div style={{ marginBottom: '2rem' }}>
              <h3 style={{ 
                fontSize: '1.25rem', 
                marginBottom: '1rem', 
                color: '#ffffff',
                fontWeight: '600'
              }}>
                Available Time Slots
              </h3>
              
              {Object.keys(slots).length === 0 ? (
                <p style={{ textAlign: 'center', color: '#cbd5e1', padding: '2rem', fontSize: '1rem' }}>
                  No available slots at the moment
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxHeight: '400px', overflowY: 'auto' }}>
                  {Object.entries(slots).map(([date, dateSlots]) => (
                    <div key={date}>
                      <h4 style={{ 
                        fontSize: '1rem', 
                        marginBottom: '0.75rem', 
                        color: '#e2e8f0',
                        fontWeight: '600'
                      }}>
                        {new Date(date).toLocaleDateString('en-US', { 
                          weekday: 'long', 
                          year: 'numeric', 
                          month: 'long', 
                          day: 'numeric' 
                        })}
                      </h4>
                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
                        gap: '0.5rem'
                      }}>
                        {dateSlots.map(slot => {
                          const spotsLeft = slot.capacity - slot.booked;
                          const isSelected = selectedSlot?.id === slot.id;
                          return (
                            <button
                              key={slot.id}
                              type="button"
                              onClick={() => setSelectedSlot(slot)}
                              style={{
                                padding: '0.75rem 0.5rem',
                                borderRadius: '8px',
                                border: isSelected ? '2px solid #3b82f6' : '1px solid #334155',
                                background: isSelected ? '#3b82f6' : '#0f172a',
                                color: isSelected ? 'white' : '#cbd5e1',
                                cursor: 'pointer',
                                fontSize: '0.85rem',
                                fontWeight: isSelected ? '600' : '400',
                                transition: 'all 0.2s',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                gap: '0.25rem'
                              }}
                            >
                              <span>⏰ {formatTime12Hour(slot.slot_time)}</span>
                              <span style={{
                                fontSize: '0.75rem',
                                opacity: 0.85,
                                color: isSelected ? 'rgba(255,255,255,0.9)' : (spotsLeft <= 2 ? '#f59e0b' : '#94a3b8')
                              }}>
                                {spotsLeft} spot{spotsLeft !== 1 ? 's' : ''} left
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <button
              onClick={handleBookSlot}
              disabled={!selectedSlot || loading}
              style={{
                width: '100%',
                padding: '0.875rem',
                borderRadius: '8px',
                border: 'none',
                background: '#3b82f6',
                color: 'white',
                fontSize: '1rem',
                fontWeight: '600',
                cursor: (!selectedSlot || loading) ? 'not-allowed' : 'pointer',
                opacity: (!selectedSlot || loading) ? 0.5 : 1
              }}
            >
              {loading ? 'Booking...' : '✓ Confirm Appointment'}
            </button>
          </>
        )}

        {step === 'confirmation' && (
          <>
            {/* Close Button */}
            <button
              onClick={handleClose}
              style={{
                position: 'absolute',
                top: '1.5rem',
                right: '1.5rem',
                background: '#ef4444',
                color: 'white',
                border: 'none',
                borderRadius: '50%',
                width: '40px',
                height: '40px',
                fontSize: '1.25rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 'bold',
                boxShadow: '0 2px 8px rgba(0,0,0,0.3)'
              }}
              title="Close"
            >
              ✕
            </button>

            <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
              <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>✅</div>
              <h2 style={{ 
                fontSize: '1.8rem', 
                marginBottom: '0.5rem', 
                color: '#ffffff',
                fontWeight: '700'
              }}>
                Appointment Confirmed!
              </h2>
              <p style={{ color: '#cbd5e1', fontSize: '1rem' }}>
                Your ID card capture has been scheduled
              </p>
            </div>

            <div style={{
              background: '#0f172a',
              borderRadius: '15px',
              padding: '2rem',
              marginBottom: '2rem'
            }}>
              <h3 style={{ 
                fontSize: '1.2rem', 
                marginBottom: '1.5rem', 
                color: '#ffffff',
                fontWeight: '600'
              }}>
                Appointment Details
              </h3>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: '#94a3b8', fontSize: '0.95rem' }}>Name:</span>
                  <strong style={{ color: '#ffffff', fontSize: '1rem' }}>
                    {student?.fullName || student?.full_name || 'N/A'}
                  </strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: '#94a3b8', fontSize: '0.95rem' }}>Date:</span>
                  <strong style={{ color: '#ffffff', fontSize: '1rem' }}>
                    {student?.appointment?.appointment_date ? 
                      new Date(student.appointment.appointment_date).toLocaleDateString('en-US', {
                        weekday: 'long',
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                      }) : 'N/A'
                    }
                  </strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: '#94a3b8', fontSize: '0.95rem' }}>Time:</span>
                  <strong style={{ color: '#ffffff', fontSize: '1rem' }}>
                    {formatTime12Hour(student?.appointment?.appointment_time)}
                  </strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: '#94a3b8', fontSize: '0.95rem' }}>Location:</span>
                  <strong style={{ color: '#ffffff', fontSize: '1rem' }}>
                    {config?.location || 'ID Card Unit, MIS Department'}
                  </strong>
                </div>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  background: 'rgba(59,130,246,0.12)',
                  border: '1px solid rgba(59,130,246,0.35)',
                  borderRadius: '10px',
                  padding: '0.75rem 0.9rem'
                }}>
                  <span style={{ color: '#93c5fd', fontSize: '0.95rem' }}>Capture App Login Code:</span>
                  <strong style={{ color: '#dbeafe', fontSize: '1.2rem', letterSpacing: '0.18em' }}>
                    {student?.captureLoginCode || 'N/A'}
                  </strong>
                </div>
              </div>
            </div>

            <div style={{
              background: student?.confirmationEmailSent ? 'rgba(16,185,129,0.12)' : 'rgba(245,158,11,0.12)',
              border: student?.confirmationEmailSent
                ? '1px solid rgba(16,185,129,0.35)'
                : '1px solid rgba(245,158,11,0.35)',
              borderRadius: '10px',
              padding: '0.85rem 1rem',
              marginBottom: '1.25rem',
              color: student?.confirmationEmailSent ? '#6ee7b7' : '#fcd34d',
              fontSize: '0.92rem'
            }}>
              {student?.confirmationEmailSent
                ? 'A booking confirmation email with your capture app login code has been sent.'
                : 'Email confirmation could not be delivered right now. Please keep the capture app login code shown above.'}
            </div>

            <div style={{
              background: 'rgba(245, 158, 11, 0.1)',
              border: '1px solid rgba(245, 158, 11, 0.3)',
              borderRadius: '10px',
              padding: '1.25rem',
              marginBottom: '1.5rem',
              color: '#fbbf24'
            }}>
              <strong style={{ fontSize: '1rem' }}>⚠️ Important:</strong>
              <ul style={{ margin: '0.75rem 0 0 1.5rem', lineHeight: '1.8' }}>
                {config?.important_message ? (
                  config.important_message.split('\n').map((line, i) => (
                    <li key={i}>{line}</li>
                  ))
                ) : (
                  <>
                    <li>Please arrive 10 minutes before your scheduled time</li>
                    <li>Bring a valid ID for verification</li>
                    <li>Dress appropriately for your ID photo</li>
                  </>
                )}
              </ul>
            </div>

            <button
              onClick={handleCancelAppointment}
              disabled={loading}
              style={{
                width: '100%',
                padding: '0.875rem',
                borderRadius: '8px',
                border: 'none',
                background: '#64748b',
                color: 'white',
                fontSize: '1rem',
                fontWeight: '600',
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.5 : 1
              }}
            >
              {loading ? 'Cancelling...' : 'Reschedule Appointment'}
            </button>

            <button
              onClick={handleClose}
              style={{
                width: '100%',
                padding: '0.875rem',
                borderRadius: '8px',
                border: '1px solid #334155',
                background: 'transparent',
                color: '#cbd5e1',
                fontSize: '1rem',
                fontWeight: '600',
                cursor: 'pointer',
                marginTop: '0.75rem'
              }}
            >
              Close
            </button>
          </>
        )}
      </div>

      <ConfirmDialog
        isOpen={dialogState.isOpen}
        type={dialogState.type}
        title={dialogState.title}
        message={dialogState.message}
        onConfirm={dialogState.onConfirm}
        onClose={closeDialog}
      />
    </div>
  );
}