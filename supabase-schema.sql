CREATE TABLE IF NOT EXISTS public.site_content (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(page, key)
);

CREATE TABLE IF NOT EXISTS public.job_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name TEXT NOT NULL,
  url TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL,
  approved BOOLEAN NOT NULL DEFAULT FALSE,
  is_admin BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create profiles for users that existed before the approval system was added.
INSERT INTO public.user_profiles (id, first_name, last_name, email, approved, is_admin)
SELECT id, COALESCE(raw_user_meta_data->>'first_name', ''), COALESCE(raw_user_meta_data->>'last_name', ''), email, FALSE, FALSE
FROM auth.users
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE id = auth.uid() AND is_admin = TRUE
  );
$$;

CREATE OR REPLACE FUNCTION public.is_approved_editor()
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE id = auth.uid() AND (approved = TRUE OR is_admin = TRUE)
  );
$$;

CREATE OR REPLACE FUNCTION public.create_user_profile()
RETURNS TRIGGER
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_profiles (id, first_name, last_name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'last_name', ''),
    NEW.email
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_profile ON auth.users;
CREATE TRIGGER on_auth_user_created_profile
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.create_user_profile();

ALTER TABLE public.site_content ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can write site content" ON public.site_content;
DROP POLICY IF EXISTS "Authenticated users can update site content" ON public.site_content;
DROP POLICY IF EXISTS "Authenticated users can delete site content" ON public.site_content;
DROP POLICY IF EXISTS "Anyone can read site content" ON public.site_content;
DROP POLICY IF EXISTS "Anyone can read job documents" ON public.job_documents;
DROP POLICY IF EXISTS "Authenticated users can write job documents" ON public.job_documents;
DROP POLICY IF EXISTS "Authenticated users can update job documents" ON public.job_documents;
DROP POLICY IF EXISTS "Authenticated users can delete job documents" ON public.job_documents;
DROP POLICY IF EXISTS "Users can create their own profile" ON public.user_profiles;
DROP POLICY IF EXISTS "Users can read their own profile" ON public.user_profiles;
DROP POLICY IF EXISTS "Admins can update profiles" ON public.user_profiles;
DROP POLICY IF EXISTS "Admins can delete profiles" ON public.user_profiles;

CREATE POLICY "Anyone can read site content"
ON public.site_content
FOR SELECT USING (true);

CREATE POLICY "Authenticated users can write site content"
ON public.site_content
FOR INSERT WITH CHECK (public.is_approved_editor());

CREATE POLICY "Authenticated users can update site content"
ON public.site_content
FOR UPDATE USING (public.is_approved_editor()) WITH CHECK (public.is_approved_editor());

CREATE POLICY "Authenticated users can delete site content"
ON public.site_content
FOR DELETE USING (public.is_approved_editor());

CREATE POLICY "Anyone can read job documents"
ON public.job_documents
FOR SELECT USING (true);

CREATE POLICY "Authenticated users can write job documents"
ON public.job_documents
FOR INSERT WITH CHECK (public.is_approved_editor());

CREATE POLICY "Authenticated users can update job documents"
ON public.job_documents
FOR UPDATE USING (public.is_approved_editor()) WITH CHECK (public.is_approved_editor());

CREATE POLICY "Authenticated users can delete job documents"
ON public.job_documents
FOR DELETE USING (public.is_approved_editor());

CREATE POLICY "Users can create their own profile"
ON public.user_profiles
FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can read their own profile"
ON public.user_profiles
FOR SELECT USING (auth.uid() = id OR public.is_admin());

CREATE POLICY "Admins can update profiles"
ON public.user_profiles
FOR UPDATE USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "Admins can delete profiles"
ON public.user_profiles
FOR DELETE USING (public.is_admin());

-- After registering the first admin account, run this once with its auth.users UUID:
-- UPDATE public.user_profiles SET approved = TRUE, is_admin = TRUE WHERE id = 'YOUR_ADMIN_USER_UUID';

-- Create a public Storage bucket named "kita-files" in Supabase Dashboard.
-- Then run:
-- 1) CREATE BUCKET "kita-files" PUBLIC;
-- 2) Set the bucket to public so the uploaded files can be opened by visitors.
-- 3) Use the same bucket name in the JavaScript editor.js file.
