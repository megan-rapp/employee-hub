# Employee Hub

Employee Hub is a prototype workspace for a dental practice employee directory. It includes a searchable, sortable directory and employee profile tabs for contact details, employment milestones, assigned benefits, disciplinary notes, and a TDO audit-review request form.

## Run locally

```powershell
npm.cmd run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Supabase setup

The app runs with fictional demo data in local development until Supabase credentials are configured. Demo mode is disabled by default in production.

1. In Supabase **Authentication > Users**, invite/create the practice owner account.
2. The previously added time-tracking schema is in `supabase/time_tracking_schema.sql`. Run the app data migration `supabase/employee_hub_app.sql` in the same project's **SQL Editor**.
3. Use the Auth user's UUID from Supabase to create the practice and owner membership. Save the returned practice ID:

   ```sql
   with new_practice as (
     insert into public.practices (name, time_zone)
     values ('Your Practice', 'America/Los_Angeles')
     returning id
   )
   insert into public.practice_memberships (practice_id, user_id, role)
   select id, '<auth-user-uuid>', 'owner'
   from new_practice
   returning practice_id;
   ```

4. Create at least one location using the returned practice ID:

   ```sql
   insert into public.practice_locations (practice_id, name)
   values ('<practice-uuid>', 'Main office');
   ```

5. Copy `.env.example` to `.env.local` and set `NEXT_PUBLIC_SUPABASE_URL` plus `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` from the Supabase project's Connect dialog. Never use a secret/service-role key in these public variables.
6. Run `npm.cmd run dev`, then sign in with the invited owner's Supabase Auth account.

## Deploy to Vercel

1. Push this repository to GitHub and import `megan-rapp/employee-hub` from the Vercel dashboard. Use the Next.js preset and the default build command (`npm run build`).
2. Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` to the Vercel project's Production and Preview environment variables. Leave `NEXT_PUBLIC_DEMO_MODE` false or unset for any deployment containing employee data.
3. Add the deployed domain to Supabase **Authentication > URL Configuration** as the site URL/allowed redirect URL.
4. Deploy and sign in with the owner account created above. Keep real employee data out of Preview deployments unless they use a separate, access-controlled Supabase project.

## Prototype limitations

- When using demo mode, the directory is populated with fictional sample records and changes exist only in browser memory.
- The database-backed employee directory, profile edits, benefit assignments, practice settings, and sign-in use Supabase when credentials and owner membership are configured.
- The SQL schema stores TDO identity references and minimal activity timestamps, but deliberately provides no client write policies for imported TDO events, time drafts, break confirmations, segments, or audit events. Implement and review a trusted server-side integration or narrowly scoped RPCs before connecting it. Never expose the Supabase service-role key in a browser.
- Practice name, logo, locations, notification email, benefits, and screening preference are stored in the practice database. Email notifications are not configured.
- Full-time/part-time status, employee records, photos, and benefit assignments are stored in Supabase when connected.
- The Directory's time-tracking beta is a fictional interaction preview only. No TDO user matching or activity data is connected. Any future activity-based times should remain drafts for employee/manager review; activity logs alone do not establish hours worked, and payroll records are not created.
- TDO, background-screening, and review-reminder services are not connected. The audit form does not retrieve or analyze TDO data. Screening requires an approved provider integration, candidate authorization, and applicable compliance review.
- Complete a security/privacy review, set up backups/retention, and test role assignments before loading real employee data.
- TDO connectivity requires the exact TDO12 product/API and authorized credentials. Audit summaries should support human review, not make misconduct or employment decisions.

## Checks

```powershell
npm.cmd run lint
npm.cmd run build
```
