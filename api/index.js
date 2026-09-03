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

const OPERATIONAL_ROLES = new Set(['Developer', 'Tester', 'Project Manager'])
const TASK_STATUSES = new Set(['backlog', 'assigned', 'in_progress', 'awaiting_review'])
const QUALITY_METRICS = new Set(['code_quality', 'test_quality', 'delivery_quality'])
const isAdministrator = (user) => user.email?.toLowerCase() === 'roger.s@gradagig.com' || user.app_metadata?.role === 'CodeWithKris Administrator'

const getProjectAccess = async (request, projectId) => {
  const [{ data: project }, { data: membership }] = await Promise.all([
    request.supabase.from('gtm_projects').select('id, client_user_id, name, status').eq('id', projectId).maybeSingle(),
    request.supabase.from('gtm_project_members').select('user_id, member_role, operational_role, participant_group').eq('project_id', projectId).eq('user_id', request.user.id).maybeSingle(),
  ])
  return {
    project,
    membership,
    canManage: Boolean(project && (project.client_user_id === request.user.id || isAdministrator(request.user))),
  }
}

app.get('/api/session-context', async (request, response) => {
  const [{ data: account, error: accountError }, { data: memberships, error: membershipError }] = await Promise.all([
    request.supabase.from('user_accounts').select('platform_category').eq('user_id', request.user.id).maybeSingle(),
    request.supabase.from('gtm_project_members').select('project_id, member_role, operational_role, participant_group, joined_at').eq('user_id', request.user.id),
  ])
  if (accountError || membershipError) return response.status(500).json({ error: accountError?.message || membershipError?.message })
  response.json({ userId: request.user.id, platformCategory: account?.platform_category || null, projectMemberships: memberships || [] })
})

app.get('/api/projects/:projectId/delivery', async (request, response) => {
  const access = await getProjectAccess(request, request.params.projectId)
  if (!access.project || (!access.canManage && !access.membership)) return response.status(403).json({ error: 'Project access is required.' })
  const [members, tasks, quality] = await Promise.all([
    request.supabase.from('gtm_project_members').select('user_id, member_role, operational_role, participant_group, joined_at').eq('project_id', request.params.projectId),
    request.supabase.from('gtm_tasks').select('id, title, task_type, assignee_user_id, required_operational_role, status, ovu_status, created_at').eq('project_id', request.params.projectId),
    request.supabase.from('gtm_quality_metrics').select('id, task_id, subject_user_id, reviewer_user_id, metric_type, score, notes, recorded_at').eq('project_id', request.params.projectId),
  ])
  const error = members.error || tasks.error || quality.error
  if (error) return response.status(500).json({ error: error.message })
  response.json({ project: access.project, currentMembership: access.membership, members: members.data, tasks: tasks.data, qualityMetrics: quality.data })
})

app.put('/api/projects/:projectId/members/:userId', async (request, response) => {
  const access = await getProjectAccess(request, request.params.projectId)
  if (!access.canManage) return response.status(403).json({ error: 'Client ownership or administrator access is required.' })
  const operationalRole = request.body.operationalRole || null
  if (operationalRole && !OPERATIONAL_ROLES.has(operationalRole)) return response.status(400).json({ error: 'Invalid operational role.' })
  const membership = {
    project_id: request.params.projectId,
    user_id: request.params.userId,
    member_role: String(request.body.memberRole || 'participant'),
    participant_group: String(request.body.participantGroup || 'Open community'),
    operational_role: operationalRole,
  }
  const { data, error } = await request.supabase.from('gtm_project_members').upsert(membership).select('project_id, user_id, member_role, operational_role, participant_group, joined_at').single()
  if (error) return response.status(400).json({ error: error.message })
  response.json(data)
})

app.post('/api/projects/:projectId/tasks', async (request, response) => {
  const access = await getProjectAccess(request, request.params.projectId)
  const canAllocate = access.canManage || access.membership?.operational_role === 'Project Manager'
  if (!canAllocate) return response.status(403).json({ error: 'Project Manager access is required.' })
  const operationalRole = String(request.body.operationalRole || '')
  if (!OPERATIONAL_ROLES.has(operationalRole)) return response.status(400).json({ error: 'A valid operational role is required.' })
  if (!request.body.assigneeUserId || !String(request.body.title || '').trim()) return response.status(400).json({ error: 'Task title and assignee are required.' })
  const task = {
    project_id: request.params.projectId,
    task_type: String(request.body.taskType || 'delivery'),
    title: String(request.body.title).trim(),
    description: String(request.body.description || '').trim(),
    participant_group: String(request.body.participantGroup || 'Open community'),
    assignee_user_id: request.body.assigneeUserId,
    assignee_name: request.body.assigneeName || null,
    required_operational_role: operationalRole,
    status: 'assigned',
  }
  const { data, error } = await request.supabase.from('gtm_tasks').insert(task).select('*').single()
  if (error) return response.status(400).json({ error: error.message })
  response.status(201).json(data)
})

app.patch('/api/projects/:projectId/tasks/:taskId/status', async (request, response) => {
  const status = String(request.body.status || '')
  if (!TASK_STATUSES.has(status)) return response.status(400).json({ error: 'Invalid task status.' })
  const access = await getProjectAccess(request, request.params.projectId)
  const { data: task } = await request.supabase.from('gtm_tasks').select('id, assignee_user_id').eq('id', request.params.taskId).eq('project_id', request.params.projectId).maybeSingle()
  const canUpdate = access.canManage || access.membership?.operational_role === 'Project Manager' || task?.assignee_user_id === request.user.id
  if (!task || !canUpdate) return response.status(403).json({ error: 'Task assignment or Project Manager access is required.' })
  const { data, error } = await request.supabase.from('gtm_tasks').update({ status }).eq('id', task.id).select('*').single()
  if (error) return response.status(400).json({ error: error.message })
  response.json(data)
})

app.post('/api/projects/:projectId/quality-metrics', async (request, response) => {
  const access = await getProjectAccess(request, request.params.projectId)
  const canReview = access.canManage || ['Tester', 'Project Manager'].includes(access.membership?.operational_role)
  if (!canReview) return response.status(403).json({ error: 'Tester or Project Manager access is required.' })
  const metricType = String(request.body.metricType || '')
  const score = Number(request.body.score)
  if (!QUALITY_METRICS.has(metricType) || !Number.isInteger(score) || score < 0 || score > 100) return response.status(400).json({ error: 'A valid metric type and score from 0 to 100 are required.' })
  const metric = { project_id: request.params.projectId, task_id: request.body.taskId, subject_user_id: request.body.subjectUserId, reviewer_user_id: request.user.id, metric_type: metricType, score, notes: String(request.body.notes || '').trim() }
  const { data, error } = await request.supabase.from('gtm_quality_metrics').insert(metric).select('*').single()
  if (error) return response.status(400).json({ error: error.message })
  response.status(201).json(data)
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