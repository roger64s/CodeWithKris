import crypto from 'node:crypto'
import { Router } from 'express'

const pathways = new Set(['Lead Generation', 'Appointment Fixing', 'Follow-Up Management', 'Customer Service'])
const score = (value) => Number.isInteger(Number(value)) && Number(value) >= 1 && Number(value) <= 5 ? Number(value) : null

export function createPilotEvidenceRouter() {
  const router = Router()

  router.get('/onboarding', async (request, response) => {
    const { data, error } = await request.supabase.from('user_profiles')
      .select('has_completed_onboarding, onboarding_skill_level, onboarding_comprehension, onboarding_clarity, onboarding_pain_points, onboarding_notes, onboarding_completed_at')
      .eq('user_id', request.user.id).maybeSingle()
    if (error) return response.status(400).json({ error: error.message })
    response.json(data || { has_completed_onboarding: false })
  })

  router.post('/onboarding', async (request, response) => {
    const allowedLevels = new Set(['new', 'building', 'comfortable', 'prefer-not-to-say'])
    const painPoints = Array.isArray(request.body.painPoints) ? request.body.painPoints.map(String).filter(Boolean).slice(0, 12) : []
    const payload = {
      user_id: request.user.id,
      has_completed_onboarding: true,
      onboarding_skill_level: allowedLevels.has(String(request.body.skillLevel)) ? String(request.body.skillLevel) : 'prefer-not-to-say',
      onboarding_comprehension: allowedLevels.has(String(request.body.comprehension)) ? String(request.body.comprehension) : 'prefer-not-to-say',
      onboarding_clarity: allowedLevels.has(String(request.body.clarity)) ? String(request.body.clarity) : 'prefer-not-to-say',
      onboarding_pain_points: painPoints,
      onboarding_notes: String(request.body.notes || '').trim().slice(0, 2000),
      onboarding_completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    const { data, error } = await request.supabase.from('user_profiles').upsert(payload).select('has_completed_onboarding, onboarding_completed_at').single()
    if (error) return response.status(400).json({ error: error.message })
    response.status(201).json(data)
  })

  router.get('/scripts', async (request, response) => {
    const { data, error } = await request.supabase.from('participant_scripts').select('*').eq('participant_id', request.user.id).order('created_at', { ascending: false })
    if (error) return response.status(400).json({ error: error.message })
    response.json(data)
  })

  router.post('/scripts', async (request, response) => {
    const pathway = String(request.body.pathway || '')
    const title = String(request.body.title || '').trim()
    const prompt = String(request.body.prompt || '').trim()
    if (!pathways.has(pathway) || !title || !prompt) return response.status(400).json({ error: 'Pathway, title, and prompt are required.' })
    const script = { id: crypto.randomUUID(), participant_id: request.user.id, pathway, title, prompt, expected_outcome: String(request.body.expectedOutcome || '').trim(), rubric_version: 'communication-v1' }
    const { data, error } = await request.supabase.from('participant_scripts').insert(script).select('*').single()
    if (error) return response.status(400).json({ error: error.message })
    response.status(201).json(data)
  })

  router.get('/attempts', async (request, response) => {
    const { data, error } = await request.supabase.from('participant_attempts').select('*, participant_scripts(title, pathway), participant_metric_reviews(*)').eq('participant_id', request.user.id).order('created_at', { ascending: false })
    if (error) return response.status(400).json({ error: error.message })
    response.json(data)
  })

  router.post('/attempts', async (request, response) => {
    const scriptId = String(request.body.scriptId || '')
    const responseText = String(request.body.responseText || '').trim()
    if (!scriptId || responseText.length > 4000) return response.status(400).json({ error: 'A script and response of up to 4,000 characters are required.' })
    const attempt = { id: crypto.randomUUID(), participant_id: request.user.id, script_id: scriptId, recording_id: request.body.recordingId || null, practice_session_id: request.body.practiceSessionId || null, response_text: responseText, adaptation_context: String(request.body.adaptationContext || '').trim() }
    const { data, error } = await request.supabase.from('participant_attempts').insert(attempt).select('*, participant_scripts(title, pathway)').single()
    if (error) return response.status(400).json({ error: error.message })
    response.status(201).json(data)
  })

  router.post('/attempts/:attemptId/reviews', async (request, response) => {
    const clarity = score(request.body.clarity)
    const adaptability = score(request.body.adaptability)
    const engagement = score(request.body.engagement)
    const notes = String(request.body.notes || '').trim()
    const outcomes = new Set(['incomplete', 'progressing', 'complete'])
    const outcome = String(request.body.outcome || '')
    if ([clarity, adaptability, engagement].some((value) => value === null) || !outcomes.has(outcome) || !notes) return response.status(400).json({ error: 'All rubric scores, outcome, and evidence notes are required.' })
    const review = { id: crypto.randomUUID(), attempt_id: request.params.attemptId, reviewer_id: request.user.id, rubric_version: 'communication-v1', clarity_score: clarity, adaptability_score: adaptability, engagement_score: engagement, task_outcome: outcome, evidence_notes: notes }
    const { data, error } = await request.supabase.from('participant_metric_reviews').insert(review).select('*').single()
    if (error) return response.status(400).json({ error: error.message })
    await request.supabase.from('participant_attempts').update({ status: 'reviewed' }).eq('id', request.params.attemptId)
    response.status(201).json(data)
  })

  return router
}