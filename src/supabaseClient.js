import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://bmjminovnhhbrthuqgkt.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJtam1pbm92bmhoYnJ0aHVxZ2t0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUwNDk5OTIsImV4cCI6MjA5MDYyNTk5Mn0.LeC3-lBnOiPkTV1TdObfMEjEaCAWkuPp0X4Ol12J-_4';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
