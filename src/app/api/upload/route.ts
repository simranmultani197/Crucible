import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const formData = await req.formData()
  const file = formData.get('file') as File | null

  if (!file) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }

  // Validate file size (10MB max)
  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json(
      { error: 'File too large. Maximum size is 10MB.' },
      { status: 400 }
    )
  }

  // Upload to Supabase Storage
  const storagePath = `${user.id}/${Date.now()}_${file.name}`
  const { error: uploadError } = await supabase.storage
    .from('user-files')
    .upload(storagePath, file)

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 })
  }

  // Save file metadata to DB
  const { data: fileRecord, error: dbError } = await supabase
    .from('files')
    .insert({
      user_id: user.id,
      filename: file.name,
      mime_type: file.type,
      size_bytes: file.size,
      storage_path: storagePath,
      direction: 'upload',
    })
    .select()
    .single()

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 })
  }

  return NextResponse.json({
    id: fileRecord.id,
    filename: fileRecord.filename,
    size: fileRecord.size_bytes,
    mimeType: fileRecord.mime_type,
  })
}
