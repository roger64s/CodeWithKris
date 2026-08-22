import express from 'express'
import cors from 'cors'
import multer from 'multer'
import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import crypto from 'node:crypto'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dataDir = path.join(__dirname, '..', 'data')
const audioDir = path.join(dataDir, 'audio')
fs.mkdirSync(audioDir, { recursive: true })

const database = new Database(path.join(dataDir, 'codewithkris.db'))
database.pragma('journal_mode = WAL')
database.exec(`
  CREATE TABLE IF NOT EXISTS dictionary_words (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    word TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS recordings (
    id TEXT PRIMARY KEY,
    template TEXT NOT NULL,
    duration INTEGER NOT NULL DEFAULT 0,
    size INTEGER NOT NULL DEFAULT 0,
    mime_type TEXT NOT NULL,
    file_path TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS practice_sessions (
    id TEXT PRIMARY KEY,
    template TEXT NOT NULL,
    phrase TEXT NOT NULL,
    transcript TEXT NOT NULL,
    accuracy INTEGER NOT NULL,
    created_at TEXT NOT NULL
  );
`)

const app = express()
const upload = multer({ dest: audioDir, limits: { fileSize: 50 * 1024 * 1024 } })
app.use(cors())
app.use(express.json({ limit: '1mb' }))

app.get('/', (_request, response) => response.json({ name: 'CodeWithKris API', status: 'running', client: 'Open the Vite URL shown by npm run dev.' }))
app.get('/api/health', (_request, response) => response.json({ ok: true }))
app.get('/api/dictionary', (_request, response) => response.json(database.prepare('SELECT id, word, created_at AS createdAt FROM dictionary_words ORDER BY id').all()))
app.post('/api/dictionary', (request, response) => {
  const word = String(request.body.word || '').trim().toLowerCase()
  if (!word) return response.status(400).json({ error: 'A word or phrase is required.' })
  try {
    const result = database.prepare('INSERT INTO dictionary_words (word) VALUES (?)').run(word)
    return response.status(201).json({ id: result.lastInsertRowid, word })
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') return response.status(409).json({ error: 'That word is already in your dictionary.' })
    return response.status(500).json({ error: 'Could not save dictionary word.' })
  }
})
app.delete('/api/dictionary/:id', (request, response) => { database.prepare('DELETE FROM dictionary_words WHERE id = ?').run(request.params.id); response.status(204).end() })

app.get('/api/recordings', (_request, response) => response.json(database.prepare('SELECT id, template, duration, size, mime_type AS mimeType, created_at AS createdAt FROM recordings ORDER BY created_at DESC').all()))
app.post('/api/recordings', upload.single('audio'), (request, response) => {
  if (!request.file) return response.status(400).json({ error: 'Audio file is required.' })
  const id = crypto.randomUUID()
  const extension = request.file.mimetype.includes('mp4') ? '.m4a' : request.file.mimetype.includes('ogg') ? '.ogg' : '.webm'
  const filePath = path.join(audioDir, `${id}${extension}`)
  fs.renameSync(request.file.path, filePath)
  const recording = { id, template: String(request.body.template || 'General practice'), duration: Number(request.body.duration || 0), size: request.file.size, mimeType: request.file.mimetype, filePath, createdAt: new Date().toISOString() }
  database.prepare('INSERT INTO recordings (id, template, duration, size, mime_type, file_path, created_at) VALUES (@id, @template, @duration, @size, @mimeType, @filePath, @createdAt)').run(recording)
  response.status(201).json({ ...recording, filePath: undefined })
})
app.get('/api/recordings/:id/audio', (request, response) => { const recording = database.prepare('SELECT file_path, mime_type FROM recordings WHERE id = ?').get(request.params.id); if (!recording || !fs.existsSync(recording.file_path)) return response.status(404).end(); response.type(recording.mime_type).sendFile(path.resolve(recording.file_path)) })

app.get('/api/sessions', (_request, response) => response.json(database.prepare('SELECT id, template, phrase, transcript, accuracy, created_at AS createdAt FROM practice_sessions ORDER BY created_at DESC').all()))
app.post('/api/sessions', (request, response) => {
  const session = { id: crypto.randomUUID(), template: String(request.body.template || 'General practice'), phrase: String(request.body.phrase || ''), transcript: String(request.body.transcript || ''), accuracy: Math.max(0, Math.min(100, Number(request.body.accuracy || 0))), createdAt: new Date().toISOString() }
  database.prepare('INSERT INTO practice_sessions (id, template, phrase, transcript, accuracy, created_at) VALUES (@id, @template, @phrase, @transcript, @accuracy, @createdAt)').run(session)
  response.status(201).json(session)
})
app.use((_request, response) => response.status(404).json({ error: 'Route not found. API routes begin with /api.' }))

const port = Number(process.env.API_PORT || 8787)
app.listen(port, '127.0.0.1', () => console.log(`CodeWithKris API listening on http://127.0.0.1:${port}`))
