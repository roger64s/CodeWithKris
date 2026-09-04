import 'dotenv/config'
import crypto from 'node:crypto'
import cors from 'cors'
import express from 'express'
import multer from 'multer'
import { createClient } from '@supabase/supabase-js'
import { createSupportRouter } from './support.js'

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
const recordingFields = 'id, template, task_id, task_config_version, duration, size, mime_type, storage_path, source_type, original_filename, reference_phrase, expected_subtask, model_training_consent, transcript, transcription_status, transcription_model_reference, transcript_match, analysis_status, predicted_subtask, prediction_confidence, inference_latency_ms, inference_model_version, workflow_version, predicted_response_block, workflow_state_match, diarization, created_at'

const rbacResourceForPath = (path) => {
  if (path.startsWith('/v1/tickets')) return 'support'
  if (path.startsWith('/dictionary')) return 'dictionary'
  if (path.startsWith('/recordings')) return 'record'
  if (path.startsWith('/sessions')) return 'practice'
  if (path.startsWith('/model-metrics')) return 'progress'
  if (path.startsWith('/action-trial')) return 'action-trial'
  if (path.startsWith('/projects/')) return 'gtm-pilot'
  if (path.startsWith('/session-context')) return 'gtm-pilot'
  return null
}

app.use('/api', async (request, response, next) => {
  const resource = rbacResourceForPath(request.path)
  if (!resource) return next()
  const { data, error } = await request.supabase.rpc('has_rbac_access', { resource_key_input: resource })
  if (error) return response.status(503).json({ error: 'Role-based access control is unavailable.' })
  if (!data) return response.status(403).json({ error: `Your assigned role cannot access ${resource}.` })
  next()
})

app.use('/api/v1/tickets', createSupportRouter(upload))

const transcriptMatch = (reference, transcript) => {
  const words = (value) => String(value).toLowerCase().replace(/[^a-z0-9 ]/g, '').split(/\s+/).filter(Boolean)
  const expected = words(reference)
  const heard = words(transcript)
  if (!expected.length || !heard.length) return null
  const matches = heard.filter((word) => expected.includes(word)).length
  return Math.min(100, Math.round((matches / Math.max(expected.length, heard.length)) * 100))
}

const transcribeRecording = async (file) => {
  const transcriptionUrl = process.env.AI_TRANSCRIPTION_API_URL
  const transcriptionKey = process.env.AI_TRANSCRIPTION_API_KEY
  const transcriptionModel = process.env.AI_TRANSCRIPTION_MODEL
  if (!transcriptionUrl || !transcriptionKey || !transcriptionModel) {
    return { transcript: '', status: 'unavailable', modelReference: null }
  }
  try {
    const body = new FormData()
    body.append('model', transcriptionModel)
    body.append('file', new Blob([file.buffer], { type: file.mimetype }), file.originalname || 'recording.webm')
    const transcriptionResponse = await fetch(transcriptionUrl, {
      method: 'POST',
      signal: AbortSignal.timeout(60_000),
      headers: { Authorization: `Bearer ${transcriptionKey}` },
      body,
    })
    if (!transcriptionResponse.ok) return { transcript: '', status: 'failed', modelReference: transcriptionModel }
    const payload = await transcriptionResponse.json()
    const transcript = String(payload.text || '').trim()
    return { transcript, status: transcript ? 'completed' : 'failed', modelReference: transcriptionModel }
  } catch {
    return { transcript: '', status: 'failed', modelReference: transcriptionModel }
  }
}

const taskIdFor = (template, suppliedTaskId = '') => {
  const candidate = suppliedTaskId.trim() || template.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(candidate) ? candidate : null
}

const analyzeRecording = async (file, taskId, expectedSubtask) => {
  const inferenceUrl = process.env.ML_INFERENCE_API_URL
  const inferenceKey = process.env.ML_SERVICE_API_KEY
  if (!taskId || !inferenceUrl || !inferenceKey) {
    return { status: 'unavailable', predictedSubtask: null, confidence: null, latencyMs: null, modelVersion: null, workflowVersion: null, responseBlock: null, stateMatch: null, diarization: null }
  }
  try {
    const body = new FormData()
    body.append('audio', new Blob([file.buffer], { type: file.mimetype }), file.originalname || 'recording.webm')
    body.append('task_id', taskId)
    if (expectedSubtask) body.append('expected_state', expectedSubtask)
    const analysisResponse = await fetch(`${inferenceUrl.replace(/\/$/, '')}/infer`, {
      method: 'POST',
      signal: AbortSignal.timeout(60_000),
      headers: { 'X-API-Key': inferenceKey },
      body,
    })
    if (!analysisResponse.ok) return { status: analysisResponse.status === 503 ? 'unavailable' : 'failed', predictedSubtask: null, confidence: null, latencyMs: null, modelVersion: null, workflowVersion: null, responseBlock: null, stateMatch: null, diarization: null }
    const payload = await analysisResponse.json()
    return {
      status: 'completed',
      predictedSubtask: String(payload.label || ''),
      confidence: Number(payload.confidence),
      latencyMs: Number(payload.latencyMs),
      modelVersion: String(payload.modelVersion || ''),
      taskId: String(payload.workflow?.taskId || taskId),
      workflowVersion: String(payload.workflow?.workflowVersion || ''),
      responseBlock: String(payload.workflow?.responseBlock || ''),
      stateMatch: Boolean(payload.workflow?.matchesExpectedState),
      diarization: payload.diarization || null,
    }
  } catch {
    return { status: 'failed', predictedSubtask: null, confidence: null, latencyMs: null, modelVersion: null, workflowVersion: null, responseBlock: null, stateMatch: null, diarization: null }
  }
}

app.get('/api/model-metrics', async (request, response) => {
  const inferenceUrl = process.env.ML_INFERENCE_API_URL
  const inferenceKey = process.env.ML_SERVICE_API_KEY
  if (!inferenceUrl || !inferenceKey) return response.status(503).json({ error: 'The measured model is not configured.' })
  try {
    const taskId = taskIdFor(String(request.query.taskId || 'appointment-fixing')) || 'appointment-fixing'
    const metricsResponse = await fetch(`${inferenceUrl.replace(/\/$/, '')}/metrics?task_id=${encodeURIComponent(taskId)}`, {
      signal: AbortSignal.timeout(10_000),
      headers: { 'X-API-Key': inferenceKey },
    })
    if (!metricsResponse.ok) return response.status(metricsResponse.status).json({ error: 'No measured model evaluation is available.' })
    response.json(await metricsResponse.json())
  } catch {
    response.status(503).json({ error: 'The measured model service is unavailable.' })
  }
})

const presentRecording = (item) => ({
  ...item,
  mimeType: item.mime_type,
  storagePath: item.storage_path,
  sourceType: item.source_type,
  originalFilename: item.original_filename,
  referencePhrase: item.reference_phrase,
  expectedSubtask: item.expected_subtask,
  taskId: item.task_id,
  taskConfigVersion: item.task_config_version,
  modelTrainingConsent: item.model_training_consent,
  transcriptionStatus: item.transcription_status,
  transcriptionModelReference: item.transcription_model_reference,
  transcriptMatch: item.transcript_match,
  analysisStatus: item.analysis_status,
  predictedSubtask: item.predicted_subtask,
  predictionConfidence: item.prediction_confidence === null ? null : Number(item.prediction_confidence),
  inferenceLatencyMs: item.inference_latency_ms === null ? null : Number(item.inference_latency_ms),
  inferenceModelVersion: item.inference_model_version,
  workflowVersion: item.workflow_version,
  predictedResponseBlock: item.predicted_response_block,
  workflowStateMatch: item.workflow_state_match,
  diarization: item.diarization,
  createdAt: item.created_at,
})

app.post('/api/action-trial-guidance', async (request, response) => {
  const assistantUrl = process.env.AI_ASSISTANT_API_URL
  const assistantKey = process.env.AI_ASSISTANT_API_KEY
  const assistantModel = process.env.AI_ASSISTANT_MODEL
  const pathway = String(request.body.pathway || '')
  const scenario = String(request.body.scenario || '').trim()
  const firstApproach = String(request.body.firstApproach || '').trim()
  const learnerQuestion = String(request.body.learnerQuestion || '').trim()
  if (!['Lead Generation', 'Appointment Fixing', 'Follow-Up Management', 'Customer Service'].includes(pathway) || !scenario || !firstApproach || !learnerQuestion) {
    return response.status(400).json({ error: 'Pathway, scenario, first approach, and learner question are required.' })
  }
  if (scenario.length > 1000 || firstApproach.length > 4000 || learnerQuestion.length > 2000) {
    return response.status(400).json({ error: 'The trial context is too long for coaching guidance.' })
  }
  if (!assistantUrl || !assistantKey || !assistantModel) {
    return response.status(503).json({ error: 'The coaching assistant is not configured yet. You may still complete the trial with your own reflection.' })
  }
  try {
    const assistantResponse = await fetch(assistantUrl, {
      method: 'POST',
      signal: AbortSignal.timeout(20_000),
      headers: { Authorization: `Bearer ${assistantKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: assistantModel,
        temperature: 0.3,
        messages: [
          { role: 'system', content: 'You are an inclusion-first commercial workflow coach. Focus only on the submitted work, do not score or rank learners, and do not make hiring decisions. Respond with one concise observation about the approach, one accessible next experiment, and one clarifying question.' },
          { role: 'user', content: JSON.stringify({ pathway, scenario, firstApproach, learnerQuestion }) },
        ],
      }),
    })
    if (!assistantResponse.ok) return response.status(502).json({ error: 'The coaching assistant could not respond. You may continue with your own reflection.' })
    const payload = await assistantResponse.json()
    const guidance = String(payload.choices?.[0]?.message?.content || '').trim()
    if (!guidance) return response.status(502).json({ error: 'The coaching assistant returned no guidance.' })
    return response.json({ guidance, modelReference: assistantModel })
  } catch {
    return response.status(502).json({ error: 'The coaching assistant is temporarily unavailable. You may continue with your own reflection.' })
  }
})

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
  const { data, error } = await request.supabase.from('recordings').select(recordingFields).order('created_at', { ascending: false })
  if (error) return response.status(500).json({ error: error.message })
  response.json(data.map(presentRecording))
})

app.post('/api/recordings', upload.single('audio'), async (request, response) => {
  if (!request.file) return response.status(400).json({ error: 'Audio file is required.' })
  const id = crypto.randomUUID()
  const extension = request.file.mimetype.includes('mp4') ? '.m4a' : request.file.mimetype.includes('ogg') ? '.ogg' : '.webm'
  const storagePath = `${request.user.id}/${id}${extension}`
  const uploadResult = await request.supabase.storage.from('voice-recordings').upload(storagePath, request.file.buffer, { contentType: request.file.mimetype, upsert: false })
  if (uploadResult.error) return response.status(500).json({ error: uploadResult.error.message })
  const referencePhrase = String(request.body.referencePhrase || '')
  const transcription = await transcribeRecording(request.file)
  const template = String(request.body.template || 'General practice')
  const taskId = taskIdFor(template, String(request.body.taskId || ''))
  const expectedSubtask = String(request.body.expectedSubtask || '') || null
  const analysis = await analyzeRecording(request.file, taskId, expectedSubtask)
  const recording = {
    id,
    user_id: request.user.id,
    template,
    task_id: taskId,
    task_config_version: analysis.workflowVersion,
    duration: Number(request.body.duration || 0),
    size: request.file.size,
    mime_type: request.file.mimetype,
    storage_path: storagePath,
    source_type: request.body.sourceType === 'uploaded' ? 'uploaded' : 'recorded',
    original_filename: String(request.file.originalname || ''),
    reference_phrase: referencePhrase,
    expected_subtask: expectedSubtask,
    model_training_consent: request.body.modelTrainingConsent === 'true',
    transcript: transcription.transcript,
    transcription_status: transcription.status,
    transcription_model_reference: transcription.modelReference,
    transcript_match: transcriptMatch(referencePhrase, transcription.transcript),
    analysis_status: analysis.status,
    predicted_subtask: analysis.predictedSubtask,
    prediction_confidence: analysis.confidence,
    inference_latency_ms: analysis.latencyMs,
    inference_model_version: analysis.modelVersion,
    workflow_version: analysis.workflowVersion,
    predicted_response_block: analysis.responseBlock,
    workflow_state_match: analysis.stateMatch,
    diarization: analysis.diarization,
  }
  const { data, error } = await request.supabase.from('recordings').insert(recording).select(recordingFields).single()
  if (error) {
    await request.supabase.storage.from('voice-recordings').remove([storagePath])
    return response.status(500).json({ error: error.message })
  }
  response.status(201).json(presentRecording(data))
})

app.patch('/api/recordings/:id/transcript', async (request, response) => {
  const transcript = String(request.body.transcript || '').trim()
  if (!transcript) return response.status(400).json({ error: 'Transcript text is required.' })
  if (transcript.length > 20_000) return response.status(400).json({ error: 'Transcript is too long.' })
  const { data: recording, error: findError } = await request.supabase
    .from('recordings')
    .select('reference_phrase')
    .eq('id', request.params.id)
    .single()
  if (findError || !recording) return response.status(404).json({ error: 'Recording not found.' })
  const { data, error } = await request.supabase
    .from('recordings')
    .update({
      transcript,
      transcription_status: 'completed',
      transcription_model_reference: 'manual',
      transcript_match: transcriptMatch(recording.reference_phrase, transcript),
    })
    .eq('id', request.params.id)
    .select(recordingFields)
    .single()
  if (error) return response.status(500).json({ error: error.message })
  response.json(presentRecording(data))
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