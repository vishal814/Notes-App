const express = require('express');
const prisma = require('../db');
const auth = require('../middleware/auth');

const router = express.Router();

/**
 * @swagger
 * /about:
 *   get:
 *     summary: About the author and custom feature
 *     tags: [Misc]
 *     responses:
 *       200:
 *         description: About info
 */
router.get('/about', (req, res) => {
  res.json({
    "name": "Intern Candidate",
    "email": "candidate@example.com",
    "my features": {
      "Soft Delete / Trash Bin": "Instead of permanently deleting notes, they are moved to a trash state (`is_trashed=true`). I chose this because accidental deletion is a common problem in note-taking apps, and a trash bin vastly improves user experience and data safety.",
      "Note Pinning": "Added the ability to pin notes (`is_pinned=true`). Pinned notes are automatically sorted to always appear at the top of the GET /notes list.",
      "Share Permissions (Viewer vs Editor)": "When sharing a note, you can specify if the user has 'Viewer' or 'Editor' permissions. If they are an Editor, they are authorized to use the PUT /notes/:id endpoint on a note they don't own!"
    }
  });
});

/**
 * @swagger
 * /search:
 *   get:
 *     summary: Full-text search across user's notes
 *     tags: [Notes (Stretch Goal)]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         schema:
 *           type: string
 *         required: true
 *         description: Keyword to search
 *     responses:
 *       200:
 *         description: List of notes matching keyword
 */
router.get('/search', auth, async (req, res) => {
  const keyword = req.query.q;
  if (!keyword) {
    return res.status(400).json({ message: 'Missing search query parameter q' });
  }

  try {
    const notes = await prisma.note.findMany({
      where: {
        is_trashed: false,
        OR: [
          { owner_id: req.user.userId },
          { shared_users: { some: { shared_with_email: req.user.email } } }
        ],
        AND: [
          {
            OR: [
              { title: { contains: keyword, mode: 'insensitive' } },
              { content: { contains: keyword, mode: 'insensitive' } }
            ]
          }
        ]
      },
      orderBy: { updated_at: 'desc' }
    });
    res.json(notes);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
