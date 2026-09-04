import crypto from 'node:crypto'
import { Router } from 'express'

const TYPES = new Set(['bug', 'feature', 'training', 'network', 'other'])
const STATUSES = new Set(['open', 'in_progress', 'resolved', 'closed'])
const AGENT_ROLES = new Set(['support-agent', 'administrator', 'security-admin'])
const ADMIN_ROLES = new Set(['administrator', 'security-admin'])

const jsonDocument = (value) => {
  const parsed = typeof value === 'string' ? JSON.parse(value) : value
  if (!parsed || parsed.type !== 'doc' || !Array.isArray(parsed.content)) throw new Error('Rich-text content is invalid.')
  return parsed
}

const fileName = (value) => value.replace(/[^a-zA-Z0-9._-]+/g, '-').slice(-120) || 'attachment'

const roleFor = async (request) => {
  const { data: assignment } = await request.supabase.from('user_rbac_assignments').select('role_id').eq('user_id', request.user.id).maybeSingle()
  if (!assignment) return 'unassigned'
  const { data: role } = await request.supabase.from('rbac_roles').select('slug').eq('id', assignment.role_id).maybeSingle()
  return role?.slug || 'unassigned'
}

const saveAttachments = async (request, ticketId, messageId = null) => {
  const saved = []
  for (const file of request.files || []) {
    const path = `${request.user.id}/${ticketId}/${crypto.randomUUID()}-${fileName(file.originalname)}`
    const { error: uploadError } = await request.supabase.storage.from('support-attachments').upload(path, file.buffer, { contentType: file.mimetype, upsert: false })
    if (uploadError) throw uploadError
    const { data, error } = await request.supabase.from('support_ticket_attachments').insert({
      ticket_id: ticketId,
      message_id: messageId,
      uploader_id: request.user.id,
      storage_path: path,
      file_name: file.originalname,
      mime_type: file.mimetype,
      size_bytes: file.size,
    }).select().single()
    if (error) {
      await request.supabase.storage.from('support-attachments').remove([path])
      throw error
    }
    saved.push(data)
  }
  return saved
}

export function createSupportRouter(upload) {
  const router = Router()
  const attachments = upload.array('attachments', 5)

  router.get('/capabilities', async (request, response) => {
    const role = await roleFor(request)
    response.json({ role, canManage: AGENT_ROLES.has(role), canViewAnalytics: ADMIN_ROLES.has(role) })
  })

  router.get('/', async (request, response) => {
    const role = await roleFor(request)
    let query = request.supabase.from('support_tickets').select('*').order('created_at', { ascending: false })
    if (!AGENT_ROLES.has(role)) query = query.eq('requester_id', request.user.id)
    if (request.query.type && TYPES.has(request.query.type)) query = query.eq('request_type', request.query.type)
    if (request.query.status && STATUSES.has(request.query.status)) query = query.eq('status', request.query.status)
    const { data, error } = await query
    if (error) return response.status(400).json({ error: error.message })
    response.json(data)
  })

  router.post('/', attachments, async (request, response) => {
    try {
      const requestType = String(request.body.requestType || '').toLowerCase()
      const title = String(request.body.title || '').trim()
      if (!TYPES.has(requestType)) return response.status(400).json({ error: 'Select a valid request type.' })
      if (title.length < 3 || title.length > 160) return response.status(400).json({ error: 'Title must be between 3 and 160 characters.' })
      const description = jsonDocument(request.body.description)
      const { data: ticket, error } = await request.supabase.from('support_tickets').insert({
        requester_id: request.user.id,
        requester_email: request.user.email || '',
        requester_display_name: request.user.user_metadata?.full_name || '',
        request_type: requestType,
        title,
        description,
      }).select().single()
      if (error) throw error
      const savedAttachments = await saveAttachments(request, ticket.id)
      response.status(201).json({ ...ticket, attachments: savedAttachments })
    } catch (error) {
      response.status(400).json({ error: error.message || 'Ticket submission failed.' })
    }
  })

  router.get('/analytics', async (request, response) => {
    const role = await roleFor(request)
    if (!ADMIN_ROLES.has(role)) return response.status(403).json({ error: 'Administrator access required.' })
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    const { data, error } = await request.supabase.from('support_tickets').select('request_type,status,created_at,first_response_at,resolved_at').gte('created_at', since)
    if (error) return response.status(400).json({ error: error.message })
    const byCategory = Object.fromEntries([...TYPES].map((type) => [type, 0]))
    let responseMinutes = 0
    let responseCount = 0
    let resolvedLast30Days = 0
    data.forEach((ticket) => {
      byCategory[ticket.request_type] += 1
      if (ticket.first_response_at) {
        responseMinutes += (new Date(ticket.first_response_at) - new Date(ticket.created_at)) / 60000
        responseCount += 1
      }
      if (ticket.resolved_at && ticket.resolved_at >= since) resolvedLast30Days += 1
    })
    const { count: totalOpen } = await request.supabase.from('support_tickets').select('id', { count: 'exact', head: true }).in('status', ['open', 'in_progress'])
    response.json({ totalOpen: totalOpen || 0, byCategory, averageResponseMinutes: responseCount ? Math.round(responseMinutes / responseCount) : null, resolvedLast30Days })
  })

  router.get('/:ticketId', async (request, response) => {
    const { data: ticket, error } = await request.supabase.from('support_tickets').select('*').eq('id', request.params.ticketId).single()
    if (error) return response.status(error.code === 'PGRST116' ? 404 : 400).json({ error: 'Ticket not found.' })
    const [{ data: messages, error: messageError }, { data: attachmentsData, error: attachmentError }] = await Promise.all([
      request.supabase.from('support_ticket_messages').select('*').eq('ticket_id', ticket.id).order('created_at'),
      request.supabase.from('support_ticket_attachments').select('*').eq('ticket_id', ticket.id).order('created_at'),
    ])
    if (messageError || attachmentError) return response.status(400).json({ error: messageError?.message || attachmentError?.message })
    const signedAttachments = await Promise.all(attachmentsData.map(async (attachment) => {
      const { data } = await request.supabase.storage.from('support-attachments').createSignedUrl(attachment.storage_path, 3600)
      return { ...attachment, url: data?.signedUrl || null }
    }))
    response.json({ ticket, messages, attachments: signedAttachments })
  })

  router.post('/:ticketId/messages', attachments, async (request, response) => {
    try {
      const role = await roleFor(request)
      const senderRole = AGENT_ROLES.has(role) ? 'support_agent' : 'user'
      const body = jsonDocument(request.body.body)
      const { data: message, error } = await request.supabase.from('support_ticket_messages').insert({
        ticket_id: request.params.ticketId,
        sender_id: request.user.id,
        sender_role: senderRole,
        body,
      }).select().single()
      if (error) throw error
      const savedAttachments = await saveAttachments(request, request.params.ticketId, message.id)
      if (senderRole === 'support_agent') {
        const { data: ticket } = await request.supabase.from('support_tickets').select('first_response_at').eq('id', request.params.ticketId).single()
        await request.supabase.from('support_tickets').update({
          assigned_agent_id: request.user.id,
          first_response_at: ticket?.first_response_at || new Date().toISOString(),
          status: 'in_progress',
          updated_at: new Date().toISOString(),
        }).eq('id', request.params.ticketId)
      }
      response.status(201).json({ ...message, attachments: savedAttachments })
    } catch (error) {
      response.status(400).json({ error: error.message || 'Reply failed.' })
    }
  })

  router.patch('/:ticketId/status', async (request, response) => {
    const role = await roleFor(request)
    if (!AGENT_ROLES.has(role)) return response.status(403).json({ error: 'Support Agent access required.' })
    const status = String(request.body.status || '')
    if (!STATUSES.has(status)) return response.status(400).json({ error: 'Invalid ticket status.' })
    const now = new Date().toISOString()
    const changes = { status, assigned_agent_id: request.user.id, updated_at: now }
    if (status === 'resolved') changes.resolved_at = now
    if (status === 'closed') changes.closed_at = now
    const { data, error } = await request.supabase.from('support_tickets').update(changes).eq('id', request.params.ticketId).select().single()
    if (error) return response.status(400).json({ error: error.message })
    response.json(data)
  })

  return router
}