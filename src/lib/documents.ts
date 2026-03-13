import { getAuthedUser, requireSupabase } from '@/lib/supabaseDb';

export type DocumentRow = {
  id: string;
  user_id: string | null;
  client_id: string;
  case_id: string | null;
  task_id: string | null;
  kind: 'personal' | 'case' | 'template' | string;
  title: string;
  file_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
  is_public?: boolean;
};

export async function listClientDocuments(clientId: string) {
  const sb = requireSupabase();
  await getAuthedUser();

  const { data, error } = await sb
    .from('documents')
    .select('id,user_id,client_id,case_id,task_id,kind,title,file_path,mime_type,size_bytes,created_at,is_public')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return (data || []) as DocumentRow[];
}

export async function uploadClientDocument(args: {
  clientId: string;
  kind: 'personal' | 'case' | 'template';
  title: string;
  file: File | Blob;
  fileName?: string;
  caseId?: string | null;
  isPublic?: boolean;
}) {
  const sb = requireSupabase();
  const user = await getAuthedUser();

  const docId = crypto.randomUUID();
  const originalName = args.fileName || (args.file instanceof File ? args.file.name : 'documento.docx');
  const safeName = originalName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const prefix = args.kind === 'case' ? 'cases' : args.kind === 'template' ? 'templates' : 'personal';
  const casePart = args.kind === 'case' && args.caseId ? `/${args.caseId}` : '';

  const path = `clients/${args.clientId}/${prefix}${casePart}/${docId}_${safeName}`;

  const { error: upErr } = await sb.storage.from('documents').upload(path, args.file, {
    upsert: false,
    contentType: args.file.type || undefined,
  });
  if (upErr) throw new Error(upErr.message);

  const { error: insErr } = await sb.from('documents').insert({
    id: docId,
    user_id: user.id,
    client_id: args.clientId,
    case_id: args.kind === 'case' ? args.caseId || null : null,
    kind: args.kind,
    title: args.title.trim() || originalName,
    file_path: path,
    mime_type: args.file.type || null,
    size_bytes: args.file.size || null,
    is_public: args.isPublic || false,
  } as any);

  if (insErr) {
    // best-effort cleanup
    await sb.storage.from('documents').remove([path]).catch(() => null);
    throw new Error(insErr.message);
  }

  return { id: docId, file_path: path };
}

export async function toggleDocumentVisibility(docId: string, isPublic: boolean) {
  const sb = requireSupabase();
  await getAuthedUser();

  const { error } = await sb
    .from('documents')
    .update({ is_public: isPublic } as any)
    .eq('id', docId);

  if (error) throw new Error(error.message);
}

export async function getDocumentDownloadUrl(filePath: string) {
  const sb = requireSupabase();
  await getAuthedUser();

  const { data, error } = await sb.storage.from('documents').createSignedUrl(filePath, 60 * 10);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}

export async function listTaskDocuments(taskId: string) {
  const sb = requireSupabase();
  await getAuthedUser();

  const { data, error } = await sb
    .from('documents')
    .select('id,user_id,client_id,case_id,task_id,kind,title,file_path,mime_type,size_bytes,created_at')
    .eq('task_id', taskId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return (data || []) as DocumentRow[];
}

export async function uploadTaskDocument(args: {
  taskId: string;
  clientId: string;
  caseId?: string | null;
  title: string;
  file: File;
}) {
  const sb = requireSupabase();
  const user = await getAuthedUser();

  const docId = crypto.randomUUID();
  const safeName = (args.file.name || 'arquivo').replace(/[^a-zA-Z0-9._-]/g, '_');
  const casePart = args.caseId ? `/${args.caseId}` : '';

  const path = `clients/${args.clientId}/tasks/${args.taskId}${casePart}/${docId}_${safeName}`;

  const { error: upErr } = await sb.storage.from('documents').upload(path, args.file, {
    upsert: false,
    contentType: args.file.type || undefined,
  });
  if (upErr) throw new Error(upErr.message);

  const { error: insErr } = await sb.from('documents').insert({
    id: docId,
    user_id: user.id,
    client_id: args.clientId,
    case_id: args.caseId || null,
    task_id: args.taskId,
    kind: 'task',
    title: args.title.trim() || args.file.name,
    file_path: path,
    mime_type: args.file.type || null,
    size_bytes: args.file.size || null,
  } as any);

  if (insErr) {
    await sb.storage.from('documents').remove([path]).catch(() => null);
    throw new Error(insErr.message);
  }

  return { id: docId, file_path: path };
}

export async function deleteDocument(doc: { id: string; file_path: string }) {
  const sb = requireSupabase();
  await getAuthedUser();

  const { error: delDbErr } = await sb.from('documents').delete().eq('id', doc.id);
  if (delDbErr) throw new Error(delDbErr.message);

  const { error: delFileErr } = await sb.storage.from('documents').remove([doc.file_path]);
  if (delFileErr) {
    // Not fatal; file might already be gone.
    // eslint-disable-next-line no-console
    console.warn('Failed to delete file from storage:', delFileErr.message);
  }
}
