import { useState, useEffect } from 'react';
import Modal from '../../components/Modal';
import CreateUserForm from '../../components/admin/CreateUserForm';
import EditPermissionsForm from '../../components/admin/EditPermissionsForm';
import DeleteConfirmForm from '../../components/admin/DeleteConfirmForm';
import { showNotification } from '../../utils/errorHandler';

export default function UserManagement() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalContent, setModalContent] = useState(null);
  const [modalTitle, setModalTitle] = useState('');

  // Fetch users on component mount
  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const response = await fetch('/api/users', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      const data = await response.json();

      if (response.ok) {
        setUsers(data.users);
      } else {
        showNotification(data.message || 'Failed to fetch users', 'error');
      }
    } catch (error) {
      console.error('Error fetching users:', error);
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

  const createUser = (role) => {
    openModal(
      `Create ${role.charAt(0).toUpperCase() + role.slice(1)} Account`,
      <CreateUserForm 
        role={role} 
        onSubmit={(newUser) => {
          setUsers([...users, newUser]);
          showNotification(
            `${role.charAt(0).toUpperCase() + role.slice(1)} account created successfully!`,
            'success'
          );
        }}
        onClose={closeModal}
      />
    );
  };

  const editPermissions = (targetUser) => {
    if (targetUser.role === 'staff') {
      openModal(
        `Edit Permissions: ${targetUser.name}`,
        <EditPermissionsForm 
          staff={targetUser} 
          onSave={(permissions) => {
            setUsers(users.map(u => 
              u.id === targetUser.id ? {...u, permissions} : u
            ));
            showNotification('Permissions updated successfully!', 'success');
          }}
          onClose={closeModal}
        />
      );
    }
  };

  const deleteUser = (targetUser) => {
    // Admin can delete supervisor and staff, but not other admins
    if (targetUser.role === 'admin') {
      showNotification('Cannot delete admin accounts for security reasons.', 'warning');
      return;
    }

    openModal(
      `Delete ${targetUser.role.charAt(0).toUpperCase() + targetUser.role.slice(1)} Account`,
      <DeleteConfirmForm 
        user={targetUser}
        onConfirm={() => {
          setUsers(users.filter(u => u.id !== targetUser.id));
          showNotification(
            `${targetUser.role.charAt(0).toUpperCase() + targetUser.role.slice(1)} account ${targetUser.name} has been deleted.`,
            'success'
          );
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
        height: '400px',
        color: 'var(--text-dim)'
      }}>
        <div>
          <div style={{ fontSize: '3rem', marginBottom: '1rem', textAlign: 'center' }}>
            ⏳
          </div>
          <div>Loading users...</div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="header">
        <h1>👥 User Management</h1>
        <div className="btn-group">
          <button className="btn btn-primary btn-sm" onClick={() => createUser('supervisor')}>
            ➕ Create Supervisor
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => createUser('staff')}>
            ➕ Create Staff
          </button>
        </div>
      </div>

      <div className="card">
        {users.length === 0 ? (
          <div style={{ 
            padding: '3rem', 
            textAlign: 'center', 
            color: 'var(--text-dim)' 
          }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>👥</div>
            <p>No users found. Create your first user to get started!</p>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Staff ID</th>
                <th>Username</th>
                <th>Role</th>
                <th>Created</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id}>
                  <td>{u.name}</td>
                  <td>{u.staff_id}</td>
                  <td>{u.username}</td>
                  <td>
                    <span className={`badge badge-${
                      u.role === 'admin' ? 'danger' : 
                      u.role === 'supervisor' ? 'warning' : 
                      'info'
                    }`}>
                      {u.role}
                    </span>
                  </td>
                  <td>{new Date(u.created_at).toLocaleDateString()}</td>
                  <td>
                    <span className="badge badge-success">Active</span>
                  </td>
                  <td>
                    <div className="btn-group">
                      {u.role === 'staff' && (
                        <button 
                          className="btn btn-secondary btn-sm"
                          onClick={() => editPermissions(u)}
                        >
                          🔧 Permissions
                        </button>
                      )}
                      {u.role !== 'admin' && (
                        <button 
                          className="btn btn-danger btn-sm"
                          onClick={() => deleteUser(u)}
                        >
                          🗑️ Delete
                        </button>
                      )}
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