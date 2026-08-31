import app from '../api/index.js'

const port = Number(process.env.API_PORT || 8787)
app.listen(port, '127.0.0.1', () => console.log(`CodeWithKris Supabase API listening on http://127.0.0.1:${port}`))
