import { useState, useEffect } from 'react';
import Modal from '../../components/Modal';
import CreateUserForm from '../../components/admin/CreateUserForm';
import EditPermissionsForm from '../../components/admin/EditPermissionsForm';
import DeleteConfirmForm from '../../components/admin/DeleteConfirmForm';
import { showNotification } from '../../utils/errorHandler';

export default function StaffManagement() {
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalContent, setModalContent] = useState(null);
  const [modalTitle, setModalTitle] = useState('');

  useEffect(() => {
    fetchStaff();
  }, []);

  const fetchStaff = async () => {
    try {
      const response = await fetch('/api/users', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      const data = await response.json();

      if (response.ok) {
        // Filter only staff members
        const staffMembers = data.users.filter(u => u.role === 'staff');
        setStaff(staffMembers);
      } else {
        showNotification(data.message || 'Failed to fetch staff', 'error');
      }
    } catch (error) {
      console.error('Error fetching staff:', error);
      showNotification('Unable to connect to server', 'error');
    } finally {
      setLoading(false);
    }
  };

  const openModal = (title, content) => {
    setModalTitle(title);
    setModalContent(content);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setModalContent(null);
    setModalTitle('');
  };

  const createStaff = () => {
    openModal(
      'Create Staff Account',
      <CreateUserForm 
        role="staff" 
        onSubmit={(newUser) => {
          setStaff([...staff, newUser]);
          showNotification('Staff account created successfully!', 'success');
        }}
        onClose={closeModal}
      />
    );
  };

  const editPermissions = (staffMember) => {
    openModal(
      `Edit Permissions: ${staffMember.name}`,
      <EditPermissionsForm 
        staff={staffMember} 
        onSave={(permissions) => {
          setStaff(staff.map(s => 
            s.id === staffMember.id ? {...s, permissions} : s
          ));
          showNotification('Permissions updated successfully!', 'success');
        }}
        onClose={closeModal}
      />
    );
  };

  const deleteStaff = (staffMember) => {
    openModal(
      'Delete Staff Account',
      <DeleteConfirmForm 
        user={staffMember}
        onConfirm={() => {
          setStaff(staff.filter(s => s.id !== staffMember.id));
          showNotification(`Staff account ${staffMember.name} has been deleted.`, 'success');
        }}
        onClose={closeModal}
      />
    );
  };

  if (loading) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '400px' 
      }}>
        <div style={{ textAlign: 'center', color: 'var(--text-dim)' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⏳</div>
          <div>Loading staff members...</div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="header">
        <h1>👥 Staff Management</h1>
        <button className="btn btn-primary btn-sm" onClick={createStaff}>
          ➕ Create Staff Account
        </button>
      </div>

      <div className="card">
        {staff.length === 0 ? (
          <div style={{ 
            padding: '3rem', 
            textAlign: 'center', 
            color: 'var(--text-dim)' 
          }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>👥</div>
            <p>No staff members found. Create your first staff account!</p>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Staff ID</th>
                <th>Username</th>
                <th>Created</th>
                <th>Permissions</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {staff.map(s => (
                <tr key={s.id}>
                  <td>{s.name}</td>
                  <td>{s.staff_id}</td>
                  <td>{s.username}</td>
                  <td>{new Date(s.created_at).toLocaleDateString()}</td>
                  <td>
                    <span style={{fontSize: '0.85rem', color: 'var(--text-dim)'}}>
                      {s.permissions?.length || 0} permissions
                    </span>
                  </td>
                  <td>
                    <div className="btn-group">
                      <button 
                        className="btn btn-secondary btn-sm"
                        onClick={() => editPermissions(s)}
                      >
                        🔑 Permissions
                      </button>
                      <button 
                        className="btn btn-danger btn-sm"
                        onClick={() => deleteStaff(s)}
                      >
                        🗑️ Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Modal 
        isOpen={modalOpen} 
        onClose={closeModal} 
        title={modalTitle}
        size="large"
      >
        {modalContent}
      </Modal>
    </>
  );
}