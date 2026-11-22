-- The apply robot keeps a screenshot of each form it fills, in the person's own folder of the
-- private "tailored" bucket (users can read their own folder; only the server writes there).
update storage.buckets
set allowed_mime_types = array['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'image/png'],
    file_size_limit = greatest(coalesce(file_size_limit, 0), 8 * 1024 * 1024)
where id = 'tailored';
