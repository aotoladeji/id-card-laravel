const pool = require('../config/database');
const bcrypt = require('bcrypt');

// Get all users
const getAllUsers = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, staff_id, username, role, permissions, created_at, updated_at 
       FROM users 
       ORDER BY created_at DESC`
    );

    res.json({
      success: true,
      users: result.rows
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ message: 'Error fetching users' });
  }
};

// Get user by ID
const getUserById = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `SELECT id, name, staff_id, username, role, permissions, created_at, updated_at 
       FROM users 
       WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({
      success: true,
      user: result.rows[0]
    });
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ message: 'Error fetching user' });
  }
};

// Update user permissions
const updateUserPermissions = async (req, res) => {
  try {
    const { id } = req.params;
    const { permissions } = req.body;

      console.log('Update permissions request:', {
      requesterId: req.user.id,
      requesterRole: req.user.role,
      targetUserId: id,
      newPermissions: permissions
    });

    // Check if user has permission (admin or supervisor)
    if (req.user.role !== 'admin' && req.user.role !== 'supervisor') {
      return res.status(403).json({ message: 'You do not have permission to perform this action' });
    }

    // Get the target user
    const targetUser = await pool.query('SELECT role FROM users WHERE id = $1', [id]);
    
    if (targetUser.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Only allow editing staff permissions
    if (targetUser.rows[0].role !== 'staff') {
      return res.status(403).json({ message: 'Can only edit staff permissions' });
    }

    const result = await pool.query(
      'UPDATE users SET permissions = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
      [permissions, id]
    );

    // Log activity
    await pool.query(
      'INSERT INTO activity_logs (user_id, action, details) VALUES ($1, $2, $3)',
      [req.user.id, 'USER_PERMISSIONS_UPDATED', `Updated permissions for user ID: ${id}`]
    );

    res.json({
      success: true,
      message: 'Permissions updated successfully',
      user: result.rows[0]
    });
  } catch (error) {
    console.error('Error updating permissions:', error);
    res.status(500).json({ message: 'Error updating permissions' });
  }
};

// Delete user (soft delete - only removes user account, not their activities)
const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;

    console.log('Delete user request:', {
      requesterId: req.user.id,
      requesterRole: req.user.role,
      targetUserId: id
    });

    // Check if user has permission (admin or supervisor)
    if (req.user.role !== 'admin' && req.user.role !== 'supervisor') {
      return res.status(403).json({ 
        message: 'You do not have permission to perform this action' 
      });
    }

    // Prevent self-deletion
    if (parseInt(id) === req.user.id) {
      return res.status(400).json({ 
        message: 'You cannot delete your own account' 
      });
    }

    // Get the target user FIRST before any checks
    const targetUserResult = await pool.query(
      'SELECT id, role, name FROM users WHERE id = $1', 
      [id]
    );
    
    if (targetUserResult.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Declare variables from query result here so they're accessible throughout
    const targetRole = targetUserResult.rows[0].role;
    const targetName = targetUserResult.rows[0].name;

    console.log('Target user details:', { targetRole, targetName });

    // Admins cannot be deleted by anyone
    if (targetRole === 'admin') {
      return res.status(403).json({ 
        message: 'Admin accounts cannot be deleted' 
      });
    }

    // Supervisors can only delete staff
    if (req.user.role === 'supervisor' && targetRole !== 'staff') {
      return res.status(403).json({ 
        message: 'Supervisors can only delete staff accounts' 
      });
    }

 // Nullify user references in all related tables before deleting
    // This preserves all records but removes the user reference

    await pool.query('UPDATE activity_logs SET user_id = NULL WHERE user_id = $1', [id]);
    await pool.query('UPDATE daily_reports SET submitted_by = NULL WHERE submitted_by = $1', [id]);
    await pool.query('UPDATE daily_reports SET verified_by = NULL WHERE verified_by = $1', [id]);
    await pool.query('UPDATE reprint_requests SET requested_by = NULL WHERE requested_by = $1', [id]);
    await pool.query('UPDATE reprint_requests SET resolved_by = NULL WHERE resolved_by = $1', [id]);
    await pool.query('UPDATE material_requests SET requested_by = NULL WHERE requested_by = $1', [id]);
    await pool.query('UPDATE material_requests SET responded_by = NULL WHERE responded_by = $1', [id]);
    await pool.query('UPDATE inventory SET added_by = NULL WHERE added_by = $1', [id]);
    await pool.query('UPDATE faulty_deliveries SET reported_by = NULL WHERE reported_by = $1', [id]);
    await pool.query('UPDATE faulty_inventory_logs SET reported_by = NULL WHERE reported_by = $1', [id]); // ADD THIS
    await pool.query('UPDATE id_cards SET captured_by = NULL WHERE captured_by = $1', [id]);
    await pool.query('UPDATE id_cards SET approved_by = NULL WHERE approved_by = $1', [id]);
    await pool.query('UPDATE id_cards SET printed_by = NULL WHERE printed_by = $1', [id]);
    await pool.query('UPDATE id_cards SET collected_by = NULL WHERE collected_by = $1', [id]);

    // All checks passed — delete the user
    await pool.query('DELETE FROM users WHERE id = $1', [id]);

    console.log('User deleted successfully:', { id, targetName });

    // Log activity
    await pool.query(
      'INSERT INTO activity_logs (user_id, action, details) VALUES ($1, $2, $3)',
      [req.user.id, 'USER_DELETED', `Deleted user: ${targetName} (ID: ${id})`]
    );

    res.json({
      success: true,
      message: `${targetName}'s account has been deleted. Their activities remain in the system.`
    });

  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ 
      message: 'Error deleting user',
      error: error.message 
    });
  }
};

module.exports = {
  getAllUsers,
  getUserById,
  updateUserPermissions,
  deleteUser
};