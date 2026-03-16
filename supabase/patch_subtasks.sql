ALTER TABLE public.tasks
ADD COLUMN IF NOT EXISTS subtasks JSONB DEFAULT '[]'::jsonb;