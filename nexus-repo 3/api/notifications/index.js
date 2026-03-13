/**
 * @module api/notifications
 * @description User notifications endpoint.
 * Supports listing, marking as read, and deleting notifications.
 */
const { getPool } = require('../_lib/db');
const { verifyToken, cors, ok, err } = require('../_lib/auth');

/**
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 */
module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  let user;
  try { user = await verifyToken(req); }
  catch (e) { return err(res, 'Unauthorized', 401); }

  const db = getPool();

  // GET — list notifications (unread first)
  if (req.method === 'GET') {
    try {
      const { rows } = await db.query(
        `SELECT * FROM notifications
         WHERE user_id = $1
         ORDER BY read ASC, created_at DESC
         LIMIT 100`,
        [user.id]
      );
      const unreadCount = rows.filter(n => !n.read).length;
      return ok(res, { notifications: rows, unread_count: unreadCount });
    } catch (e) { return err(res, e.message, 500); }
  }

  // PATCH — mark all as read
  if (req.method === 'PATCH') {
    const { id } = req.query;
    try {
      if (id) {
        await db.query(
          'UPDATE notifications SET read=true WHERE id=$1 AND user_id=$2',
          [id, user.id]
        );
      } else {
        // Mark all as read
        await db.query(
          'UPDATE notifications SET read=true WHERE user_id=$1 AND read=false',
          [user.id]
        );
      }
      return ok(res, { ok: true });
    } catch (e) { return err(res, e.message, 500); }
  }

  // DELETE — remove a notification
  if (req.method === 'DELETE') {
    const { id } = req.query;
    if (!id) return err(res, 'Notification id required');
    try {
      await db.query('DELETE FROM notifications WHERE id=$1 AND user_id=$2', [id, user.id]);
      return ok(res, { ok: true });
    } catch (e) { return err(res, e.message, 500); }
  }

  return err(res, 'Method not allowed', 405);
};
