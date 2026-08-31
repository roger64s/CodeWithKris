import 'dotenv/config'
import crypto from 'node:crypto'
import cors from 'cors'
import express from 'express'
import multer from 'multer'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
if (!supabaseUrl || !supabaseAnonKey) throw new Error('Missing SUPABASE_URL and SUPABASE_ANON_KEY.')

const app = express()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } })
app.use(cors())
app.use(express.json({ limit: '1mb' }))

app.get('/api/health', (_request, response) => response.json({ ok: true }))

app.use('/api', async (request, response, next) => {
  const authorization = request.headers.authorization || ''
  if (!authorization.startsWith('Bearer ')) return response.status(401).json({ error: 'Authentication required.' })
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await supabase.auth.getUser(authorization.slice(7))
  if (error || !data.user) return response.status(401).json({ error: 'Invalid or expired session.' })
  request.supabase = supabase
  request.user = data.user
  next()
})

app.get('/api/dictionary', async (request, response) => {
  const { data, error } = await request.supabase.from('dictionary_words').select('id, word, created_at').order('id')
  if (error) return response.status(500).json({ error: error.message })
  response.json(data.map((item) => ({ ...item, createdAt: item.created_at })))
})

app.post('/api/dictionary', async (request, response) => {
  const word = String(request.body.word || '').trim().toLowerCase()
  if (!word) return response.status(400).json({ error: 'A word or phrase is required.' })
  const { data, error } = await request.supabase.from('dictionary_words').insert({ word }).select('id, word').single()
  if (error?.code === '23505') return response.status(409).json({ error: 'That word is already in your dictionary.' })
  if (error) return response.status(500).json({ error: error.message })
  response.status(201).json(data)
})

app.delete('/api/dictionary/:id', async (request, response) => {
  const { error } = await request.supabase.from('dictionary_words').delete().eq('id', request.params.id)
  if (error) return response.status(500).json({ error: error.message })
  response.status(204).end()
})

app.get('/api/recordings', async (request, response) => {
  const { data, error } = await request.supabase.from('recordings').select('id, template, duration, size, mime_type, storage_path, created_at').order('created_at', { ascending: false })
  if (error) return response.status(500).json({ error: error.message })
  response.json(data.map((item) => ({ ...item, mimeType: item.mime_type, storagePath: item.storage_path, createdAt: item.created_at })))
})

app.post('/api/recordings', upload.single('audio'), async (request, response) => {
  if (!request.file) return response.status(400).json({ error: 'Audio file is required.' })
  const id = crypto.randomUUID()
  const extension = request.file.mimetype.includes('mp4') ? '.m4a' : request.file.mimetype.includes('ogg') ? '.ogg' : '.webm'
  const storagePath = `${request.user.id}/${id}${extension}`
  const uploadResult = await request.supabase.storage.from('voice-recordings').upload(storagePath, request.file.buffer, { contentType: request.file.mimetype, upsert: false })
  if (uploadResult.error) return response.status(500).json({ error: uploadResult.error.message })
  const recording = { id, user_id: request.user.id, template: String(request.body.template || 'General practice'), duration: Number(request.body.duration || 0), size: request.file.size, mime_type: request.file.mimetype, storage_path: storagePath }
  const { data, error } = await request.supabase.from('recordings').insert(recording).select('id, template, duration, size, mime_type, storage_path, created_at').single()
  if (error) {
    await request.supabase.storage.from('voice-recordings').remove([storagePath])
    return response.status(500).json({ error: error.message })
  }
  response.status(201).json({ ...data, mimeType: data.mime_type, storagePath: data.storage_path, createdAt: data.created_at })
})

app.get('/api/recordings/:id/audio', async (request, response) => {
  const { data: recording, error } = await request.supabase.from('recordings').select('storage_path, mime_type').eq('id', request.params.id).single()
  if (error || !recording) return response.status(404).end()
  const { data, error: downloadError } = await request.supabase.storage.from('voice-recordings').download(recording.storage_path)
  if (downloadError) return response.status(404).end()
  response.type(recording.mime_type).send(Buffer.from(await data.arrayBuffer()))
})

app.get('/api/sessions', async (request, response) => {
  const { data, error } = await request.supabase.from('practice_sessions').select('id, template, phrase, transcript, accuracy, created_at').order('created_at', { ascending: false })
  if (error) return response.status(500).json({ error: error.message })
  response.json(data.map((item) => ({ ...item, createdAt: item.created_at })))
})

app.post('/api/sessions', async (request, response) => {
  const session = { id: crypto.randomUUID(), user_id: request.user.id, template: String(request.body.template || 'General practice'), phrase: String(request.body.phrase || ''), transcript: String(request.body.transcript || ''), accuracy: Math.max(0, Math.min(100, Number(request.body.accuracy || 0))) }
  const { data, error } = await request.supabase.from('practice_sessions').insert(session).select('id, template, phrase, transcript, accuracy, created_at').single()
  if (error) return response.status(500).json({ error: error.message })
  response.status(201).json({ ...data, createdAt: data.created_at })
})

app.use((_request, response) => response.status(404).json({ error: 'Route not found. API routes begin with /api.' }))

export default app