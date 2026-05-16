const express = require('express');
const prisma = require('../db');
const auth = require('../middleware/auth');

const router = express.Router();

// Apply auth middleware to all note routes
router.use(auth);

/**
 * @swagger
 * /notes:
 *   get:
 *     summary: Get all non-trashed notes for authenticated user (owned and shared)
 *     tags: [Notes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *         description: Page number for pagination
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: Number of items per page
 *     responses:
 *       200:
 *         description: List of notes
 */
router.get('/', async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 50, 1), 100);
    const skip = (page - 1) * limit;

    const notes = await prisma.note.findMany({
      where: {
        is_trashed: false,
        OR: [
          { owner_id: req.user.userId },
          { shared_users: { some: { shared_with_email: req.user.email } } }
        ]
      },
      skip,
      take: limit,
      orderBy: [
        { is_pinned: 'desc' },
        { updated_at: 'desc' }
      ]
    });
    res.json(notes);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * @swagger
 * /notes/trash:
 *   get:
 *     summary: Get all trashed notes for authenticated user
 *     tags: [Notes (Custom Feature)]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of trashed notes
 */
router.get('/trash', async (req, res) => {
  try {
    const notes = await prisma.note.findMany({
      where: {
        owner_id: req.user.userId,
        is_trashed: true
      },
      orderBy: { updated_at: 'desc' }
    });
    res.json(notes);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * @swagger
 * /notes:
 *   post:
 *     summary: Create a new note
 *     tags: [Notes]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *               - content
 *             properties:
 *               title:
 *                 type: string
 *               content:
 *                 type: string
 *     responses:
 *       201:
 *         description: Created note data
 */
router.post('/', async (req, res) => {
  const { title, content, is_pinned } = req.body;
  if (!title || !content || title.trim() === '' || content.trim() === '') {
    return res.status(400).json({ message: 'Title and content cannot be empty' });
  }

  try {
    const note = await prisma.note.create({
      data: {
        title,
        content,
        is_pinned: is_pinned === true,
        owner_id: req.user.userId
      }
    });
    res.status(201).json(note);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * @swagger
 * /notes/{id}:
 *   get:
 *     summary: Get a specific note by ID
 *     tags: [Notes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Note data
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Not Found
 */
router.get('/:id', async (req, res) => {
  const noteId = parseInt(req.params.id);
  if (isNaN(noteId)) return res.status(400).json({ message: 'Invalid note ID format' });

  try {
    const note = await prisma.note.findUnique({
      where: { id: noteId },
      include: { shared_users: true }
    });

    if (!note) {
      return res.status(404).json({ message: 'Note not found' });
    }

    const isOwner = note.owner_id === req.user.userId;
    const isShared = note.shared_users.some(s => s.shared_with_email === req.user.email);

    if (!isOwner && !isShared) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    // Don't leak the shared users list unnecessarily
    const { shared_users, ...noteData } = note;
    res.json(noteData);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * @swagger
 * /notes/{id}:
 *   put:
 *     summary: Update an existing note
 *     tags: [Notes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *               content:
 *                 type: string
 *     responses:
 *       200:
 *         description: Updated note data
 */
router.put('/:id', async (req, res) => {
  const noteId = parseInt(req.params.id);
  if (isNaN(noteId)) return res.status(400).json({ message: 'Invalid note ID format' });

  const { title, content, is_pinned } = req.body;
  if (!title || !content || title.trim() === '' || content.trim() === '') {
    return res.status(400).json({ message: 'Title and content cannot be empty' });
  }

  try {
    const note = await prisma.note.findUnique({ 
      where: { id: noteId },
      include: { shared_users: true }
    });
    if (!note) return res.status(404).json({ message: 'Note not found' });
    
    const isOwner = note.owner_id === req.user.userId;
    const sharedRecord = note.shared_users.find(s => s.shared_with_email === req.user.email);
    const isEditor = sharedRecord && sharedRecord.permission === 'Editor';

    if (!isOwner && !isEditor) {
      return res.status(403).json({ message: 'Forbidden: You do not have permission to edit this note' });
    }

    const updatedNote = await prisma.note.update({
      where: { id: noteId },
      data: { 
        title, 
        content,
        is_pinned: is_pinned !== undefined ? is_pinned : note.is_pinned
      }
    });
    res.json(updatedNote);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * @swagger
 * /notes/{id}:
 *   delete:
 *     summary: Soft delete a note (move to trash)
 *     tags: [Notes (Custom Feature)]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       204:
 *         description: No Content
 */
router.delete('/:id', async (req, res) => {
  const noteId = parseInt(req.params.id);
  if (isNaN(noteId)) return res.status(400).json({ message: 'Invalid note ID format' });

  try {
    const note = await prisma.note.findUnique({ where: { id: noteId } });
    if (!note) return res.status(404).json({ message: 'Note not found' });
    if (note.owner_id !== req.user.userId) return res.status(403).json({ message: 'Forbidden' });

    await prisma.note.update({
      where: { id: noteId },
      data: { is_trashed: true }
    });
    res.status(204).send();
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * @swagger
 * /notes/{id}/restore:
 *   post:
 *     summary: Restore a trashed note
 *     tags: [Notes (Custom Feature)]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Restored note
 */
router.post('/:id/restore', async (req, res) => {
  const noteId = parseInt(req.params.id);
  if (isNaN(noteId)) return res.status(400).json({ message: 'Invalid note ID format' });

  try {
    const note = await prisma.note.findUnique({ where: { id: noteId } });
    if (!note) return res.status(404).json({ message: 'Note not found' });
    if (note.owner_id !== req.user.userId) return res.status(403).json({ message: 'Forbidden' });

    const restoredNote = await prisma.note.update({
      where: { id: noteId },
      data: { is_trashed: false }
    });
    res.json(restoredNote);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * @swagger
 * /notes/{id}/share:
 *   post:
 *     summary: Share a note with another user
 *     tags: [Notes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - share_with_email
 *             properties:
 *               share_with_email:
 *                 type: string
 *     responses:
 *       200:
 *         description: Success message
 */
router.post('/:id/share', async (req, res) => {
  const noteId = parseInt(req.params.id);
  if (isNaN(noteId)) return res.status(400).json({ message: 'Invalid note ID format' });

  const { share_with_email, permission } = req.body;

  if (!share_with_email) {
    return res.status(400).json({ message: 'share_with_email is required' });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(share_with_email)) {
    return res.status(400).json({ message: 'Invalid email format' });
  }

  if (share_with_email === req.user.email) {
    return res.status(400).json({ message: 'You cannot share a note with yourself' });
  }

  try {
    const note = await prisma.note.findUnique({ where: { id: noteId } });
    if (!note) return res.status(404).json({ message: 'Note not found' });
    if (note.owner_id !== req.user.userId) return res.status(403).json({ message: 'Forbidden' });

    const sharePermission = permission === 'Editor' ? 'Editor' : 'Viewer';

    // Ensure we don't duplicate shares
    const existingShare = await prisma.sharedNote.findUnique({
      where: {
        note_id_shared_with_email: {
          note_id: noteId,
          shared_with_email: share_with_email
        }
      }
    });

    if (!existingShare) {
      await prisma.sharedNote.create({
        data: {
          note_id: noteId,
          shared_with_email: share_with_email,
          permission: sharePermission
        }
      });
    } else {
      await prisma.sharedNote.update({
        where: { id: existingShare.id },
        data: { permission: sharePermission }
      });
    }

    res.json({ message: `Note shared successfully as ${sharePermission}` });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
