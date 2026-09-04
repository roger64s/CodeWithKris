import crypto from 'node:crypto'
import { Router } from 'express'

const SOURCES = new Set(['practice_session', 'mini_challenge', 'code_lesson'])

export function createLearningRouter() {
  const router = Router()

  router.get('/reframing/:track', async (request, response) => {
    const track = String(request.params.track || '')
    const language = String(request.query.language || '').toLowerCase()
    const query = request.supabase.from('learning_reframing_cues').select('*').eq('track', track).eq('active', true).order('language_key').order('cue_key')
    if (language) query.eq('language_key', language)
    const [{ data: cues, error: cueError }, { data: progress, error: progressError }] = await Promise.all([
      query,
      request.supabase.from('user_reframing_progress').select('*').eq('user_id', request.user.id),
    ])
    const error = cueError || progressError
    if (error) return response.status(400).json({ error: error.message })
    const progressByCue = new Map(progress.map((item) => [item.cue_id, item]))
    response.json(cues.map((cue) => ({ ...cue, progress: progressByCue.get(cue.id) || null })))
  })

  router.post('/reframing/:track/attempts', async (request, response) => {
    const track = String(request.params.track || '')
    const language = String(request.body.language || '').toLowerCase()
    const cueId = String(request.body.cueId || '')
    const selectedNewSyntax = request.body.selectedNewSyntax === true
    const attemptKey = String(request.body.attemptKey || crypto.randomUUID())
    if (!track || !language || !cueId || attemptKey.length > 150) return response.status(400).json({ error: 'Invalid reframing attempt.' })
    const { data: cue, error: cueError } = await request.supabase.from('learning_reframing_cues').select('id').eq('id', cueId).eq('track', track).eq('language_key', language).eq('active', true).maybeSingle()
    if (cueError) return response.status(400).json({ error: cueError.message })
    if (!cue) return response.status(400).json({ error: 'Cue does not belong to this learning track.' })
    const { data, error } = await request.supabase.rpc('record_reframing_attempt', {
      language_key_input: language,
      cue_id_input: cueId,
      selected_new_syntax_input: selectedNewSyntax,
      attempt_key_input: attemptKey,
    })
    if (error) return response.status(400).json({ error: error.message })
    response.status(201).json(data?.[0] || null)
  })

  router.get('/dictionary', async (request, response) => {
    const { data, error } = await request.supabase.from('learning_vocabulary_terms').select('language_key').eq('active', true)
    if (error) return response.status(400).json({ error: error.message })
    response.json([...new Set(data.map((item) => item.language_key))].sort())
  })

  router.get('/dictionary/:language', async (request, response) => {
    const language = String(request.params.language || '').toLowerCase()
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(language)) return response.status(400).json({ error: 'Invalid language key.' })
    const [{ data: terms, error: termError }, { data: progress, error: progressError }] = await Promise.all([
      request.supabase.from('learning_vocabulary_terms').select('*').eq('language_key', language).eq('active', true).order('difficulty').order('term'),
      request.supabase.from('user_vocabulary_progress').select('*').eq('user_id', request.user.id),
    ])
    const error = termError || progressError
    if (error) return response.status(400).json({ error: error.message })
    const progressByTerm = new Map(progress.map((item) => [item.term_id, item]))
    response.json(terms.map((term) => ({ ...term, progress: progressByTerm.get(term.id) || null })))
  })

  router.post('/dictionary/:language/attempts', async (request, response) => {
    const language = String(request.params.language || '').toLowerCase()
    const termId = String(request.body.termId || '')
    const selectedTermId = String(request.body.selectedTermId || '')
    const attemptKey = String(request.body.attemptKey || crypto.randomUUID())
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(language) || !termId || !selectedTermId || attemptKey.length > 150) {
      return response.status(400).json({ error: 'Invalid vocabulary attempt.' })
    }
    const { data, error } = await request.supabase.rpc('record_vocabulary_attempt', {
      language_key_input: language,
      term_id_input: termId,
      selected_term_id_input: selectedTermId,
      attempt_key_input: attemptKey,
    })
    if (error) return response.status(400).json({ error: error.message })
    response.status(201).json(data?.[0] || null)
  })

  router.get('/dashboard', async (request, response) => {
    const [{ data: nodes, error: nodeError }, { data: profile, error: profileError }, { data: completions, error: completionError }] = await Promise.all([
      request.supabase.from('learning_nodes').select('*').eq('active', true).order('track').order('position'),
      request.supabase.from('gamification_profiles').select('*').eq('user_id', request.user.id).maybeSingle(),
      request.supabase.from('user_learning_nodes').select('*').eq('user_id', request.user.id),
    ])
    const error = nodeError || profileError || completionError
    if (error) return response.status(400).json({ error: error.message })
    response.json({
      profile: profile || { total_xp: 0, current_streak: 0, longest_streak: 0, last_activity_date: null },
      nodes,
      completions,
    })
  })

  router.post('/completions', async (request, response) => {
    const nodeKey = String(request.body.nodeKey || '')
    const sourceType = String(request.body.sourceType || '')
    const eventKey = String(request.body.eventKey || `challenge:${crypto.randomUUID()}`)
    if (!SOURCES.has(sourceType)) return response.status(400).json({ error: 'Invalid completion source.' })
    if (!nodeKey || eventKey.length > 200) return response.status(400).json({ error: 'Invalid learning completion.' })
    const { data, error } = await request.supabase.rpc('record_learning_completion', {
      node_key_input: nodeKey,
      event_key_input: eventKey,
      source_type_input: sourceType,
    })
    if (error) return response.status(400).json({ error: error.message })
    response.status(201).json(data?.[0] || null)
  })

  return router
}