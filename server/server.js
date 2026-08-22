import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import multer from 'multer'
import { createClient } from '@supabase/supabase-js'
import crypto from 'node:crypto'

const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!supabaseUrl || !supabaseKey) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Copy .env.example to .env and fill in your Supabase values.')
const supabase = createClient(supabaseUrl, supabaseKey)
const app = express()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } })
app.use(cors())
app.use(express.json({ limit: '1mb' }))

app.get('/', (_request, response) => response.json({ name: 'CodeWithKris API', status: 'running', database: 'Supabase' }))
app.get('/api/health', async (_request, response) => { const { error } = await supabase.from('dictionary_words').select('id').limit(1); response.status(error ? 503 : 200).json({ ok: !error, database: error ? error.message : 'connected' }) })
app.get('/api/dictionary', async (_request, response) => { const { data, error } = await supabase.from('dictionary_words').select('id, word, created_at').order('id'); if (error) return response.status(500).json({ error: error.message }); response.json(data.map((item) => ({ ...item, createdAt: item.created_at }))) })
app.post('/api/dictionary', async (request, response) => { const word = String(request.body.word || '').trim().toLowerCase(); if (!word) return response.status(400).json({ error: 'A word or phrase is required.' }); const { data, error } = await supabase.from('dictionary_words').insert({ word }).select('id, word').single(); if (error?.code === '23505') return response.status(409).json({ error: 'That word is already in your dictionary.' }); if (error) return response.status(500).json({ error: error.message }); response.status(201).json(data) })
app.delete('/api/dictionary/:id', async (request, response) => { const { error } = await supabase.from('dictionary_words').delete().eq('id', request.params.id); if (error) return response.status(500).json({ error: error.message }); response.status(204).end() })

app.get('/api/recordings', async (_request, response) => { const { data, error } = await supabase.from('recordings').select('id, template, duration, size, mime_type, storage_path, created_at').order('created_at', { ascending: false }); if (error) return response.status(500).json({ error: error.message }); response.json(data.map((item) => ({ ...item, mimeType: item.mime_type, storagePath: item.storage_path, createdAt: item.created_at }))) })
app.post('/api/recordings', upload.single('audio'), async (request, response) => { if (!request.file) return response.status(400).json({ error: 'Audio file is required.' }); const id = crypto.randomUUID(); const extension = request.file.mimetype.includes('mp4') ? '.m4a' : request.file.mimetype.includes('ogg') ? '.ogg' : '.webm'; const storagePath = `${id}${extension}`; const uploadResult = await supabase.storage.from('voice-recordings').upload(storagePath, request.file.buffer, { contentType: request.file.mimetype, upsert: false }); if (uploadResult.error) return response.status(500).json({ error: uploadResult.error.message }); const recording = { id, template: String(request.body.template || 'General practice'), duration: Number(request.body.duration || 0), size: request.file.size, mime_type: request.file.mimetype, storage_path: storagePath, created_at: new Date().toISOString() }; const { data, error } = await supabase.from('recordings').insert(recording).select('id, template, duration, size, mime_type, storage_path, created_at').single(); if (error) { await supabase.storage.from('voice-recordings').remove([storagePath]); return response.status(500).json({ error: error.message }) } response.status(201).json({ ...data, mimeType: data.mime_type, storagePath: data.storage_path, createdAt: data.created_at }) })
app.get('/api/recordings/:id/audio', async (request, response) => { const { data: recording, error } = await supabase.from('recordings').select('storage_path, mime_type').eq('id', request.params.id).single(); if (error || !recording) return response.status(404).end(); const { data, error: downloadError } = await supabase.storage.from('voice-recordings').download(recording.storage_path); if (downloadError) return response.status(404).end(); response.type(recording.mime_type).send(Buffer.from(await data.arrayBuffer())) })

app.get('/api/sessions', async (_request, response) => { const { data, error } = await supabase.from('practice_sessions').select('id, template, phrase, transcript, accuracy, created_at').order('created_at', { ascending: false }); if (error) return response.status(500).json({ error: error.message }); response.json(data.map((item) => ({ ...item, createdAt: item.created_at }))) })
app.post('/api/sessions', async (request, response) => { const session = { id: crypto.randomUUID(), template: String(request.body.template || 'General practice'), phrase: String(request.body.phrase || ''), transcript: String(request.body.transcript || ''), accuracy: Math.max(0, Math.min(100, Number(request.body.accuracy || 0))), created_at: new Date().toISOString() }; const { data, error } = await supabase.from('practice_sessions').insert(session).select('id, template, phrase, transcript, accuracy, created_at').single(); if (error) return response.status(500).json({ error: error.message }); response.status(201).json({ ...data, createdAt: data.created_at }) })
app.use((_request, response) => response.status(404).json({ error: 'Route not found. API routes begin with /api.' }))

const port = Number(process.env.API_PORT || 8787)
app.listen(port, '127.0.0.1', () => console.log(`CodeWithKris Supabase API listening on http://127.0.0.1:${port}`))
